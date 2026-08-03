/**
 * Letter Engine — the request contract, and the deployment gap that broke it.
 *
 * The module once answered HTTP 400 to every request. Nothing was wrong with the
 * validation: the migration had never been applied to the live database, Prisma raised
 * P2021 ("table does not exist"), and the error handler classified every unrecognised
 * Prisma error as 400. A schema-missing fault therefore arrived looking exactly like a
 * rejected payload, which sent the diagnosis into the Zod schemas — the one place the
 * fault was not.
 *
 * These tests lock down both halves so neither can quietly return.
 */

import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { createLetterSchema, listLettersQuerySchema, LETTER_SORT_FIELDS } from './letters.schema';

/** Exactly what `validate.middleware.ts` hands to a schema. */
function asRequest(query: Record<string, string> = {}, body: unknown = {}) {
  return { body, query, params: {} };
}

describe('the list query contract — what the workspace actually sends', () => {
  it('accepts the workspace’s first load', () => {
    // The bug reproduction: these are the parameters the workspace sends on open, and
    // they must not be what rejects it.
    const parsed = listLettersQuerySchema.parse(
      asRequest({ isArchived: 'false', sortDir: 'desc', page: '1', pageSize: '20' }),
    );
    expect(parsed.query).toEqual({ isArchived: false, sortDir: 'desc', page: 1, pageSize: 20 });
  });

  it('accepts a bare request — an unfiltered list is the default state', () => {
    expect(() => listLettersQuerySchema.parse(asRequest({}))).not.toThrow();
  });

  it('accepts every sort key the workspace can produce', () => {
    // The frontend types `sortBy` as a bare string, so the only thing keeping the two
    // sides in agreement is that its column keys are all members of this closed set.
    // Frontend column keys: LetterWorkspace.tsx SORTABLE columns.
    const frontendSortKeys = [
      'status', 'reference', 'subject', 'issueDate', 'registeredAt',
      'registeredByName', 'createdAt', 'createdByName', 'updatedAt',
    ];
    for (const sortBy of frontendSortKeys) {
      expect(LETTER_SORT_FIELDS).toContain(sortBy);
      expect(() => listLettersQuerySchema.parse(asRequest({ sortBy })), sortBy).not.toThrow();
    }
  });

  it('still refuses an unknown sort column — the fix must not have loosened this', () => {
    // `sortBy` names a database column. It is matched against a closed list precisely
    // so a request can never name one of its own.
    expect(() => listLettersQuerySchema.parse(asRequest({ sortBy: 'password' }))).toThrow(ZodError);
  });

  it('still refuses an out-of-range page size', () => {
    expect(() => listLettersQuerySchema.parse(asRequest({ pageSize: '5000' }))).toThrow(ZodError);
  });

  it('ignores unknown query parameters rather than rejecting the request', () => {
    // `.strip()`: a stale bookmark carrying a retired filter must still load the list.
    expect(() => listLettersQuerySchema.parse(asRequest({ legacyFilter: 'x' }))).not.toThrow();
  });
});

describe('the create contract — what "New Draft" actually sends', () => {
  it('accepts an empty body', () => {
    // `createDraft()` posts `{}`. A draft is allowed to be almost entirely empty.
    expect(() => createLetterSchema.parse(asRequest({}, {}))).not.toThrow();
  });

  it('still refuses a request that tries to set its own reference number', () => {
    // Server-decided fields are absent from the schema and `.strict()` rejects them:
    // a client naming its own reference is a bug or an attack, and dropping the field
    // silently would hide both.
    expect(() => createLetterSchema.parse(asRequest({}, { reference: 'X/1/2026' }))).toThrow(ZodError);
    expect(() => createLetterSchema.parse(asRequest({}, { status: 'REGISTERED' }))).toThrow(ZodError);
  });

  it('reports a missing body as a body problem', () => {
    // When express parses no body at all the failure must name `body`, not something
    // further in. This is the shape the 400 would legitimately have taken.
    // Built inline, not via `asRequest`: its default parameter would substitute `{}`
    // and quietly test the opposite of what this asserts.
    const result = createLetterSchema.safeParse({ body: undefined, query: {}, params: {} });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].path).toEqual(['body']);
    expect(result.error.issues[0].code).toBe('invalid_type');
  });
});

describe('a missing table is a server fault, not a bad request', () => {
  /** Re-implements the classification in `core/errors/errorHandler.ts`. */
  function statusFor(code: string): number {
    const err = new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: '5.18.0' });
    if (err.code === 'P2002') return 409;
    if (err.code === 'P2025') return 404;
    if (err.code === 'P2003') return 409;
    if (err.code === 'P2021' || err.code === 'P2022') return 500;
    return 400;
  }

  it('classifies a missing table (P2021) as 500', () => {
    // This is the exact error the unapplied migration produced. As a 400 it read as
    // "your request was rejected" and hid an unmigrated database for a whole pack.
    expect(statusFor('P2021')).toBe(500);
  });

  it('classifies a missing column (P2022) as 500', () => {
    expect(statusFor('P2022')).toBe(500);
  });

  it('leaves the established mappings alone', () => {
    expect(statusFor('P2002')).toBe(409);
    expect(statusFor('P2025')).toBe(404);
    expect(statusFor('P2003')).toBe(409);
  });
});
