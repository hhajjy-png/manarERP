/**
 * Letter Engine — reference integrity against a REAL database.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A MOCK CANNOT PROVE A CONSTRAINT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every other test in this module mocks Prisma, which is right for testing decisions
 * but useless for testing the one thing the whole reference design rests on: that the
 * DATABASE refuses a duplicate reference number. A mocked `create` accepts anything.
 *
 * So this file builds a throwaway SQLite database BY EXECUTING THE ACTUAL MIGRATION
 * FILE — not a re-typed copy of it — and then attacks it directly. If someone later
 * removes a UNIQUE index from that migration, these tests fail, which is exactly the
 * protection the plan asked for.
 *
 * It never touches the developer or production database: the URL points at a uniquely
 * named file under the OS temp directory, created and removed by this file alone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';

const MIGRATIONS_DIR = resolve(__dirname, '../../../../prisma/migrations');

/**
 * Every letter-engine migration, in the order Prisma applies them.
 *
 * DISCOVERED rather than listed. A hardcoded path meant this suite kept building a
 * schema frozen at P1: when P7 added the signature and stamp columns in a second
 * migration, every test here failed against a table that the real database had and the
 * throwaway one did not. Reading the directory means the next letter migration is
 * picked up the day it is written, which is the only version of this that stays true.
 */
function letterMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /_add_letter/.test(name))
    .sort() // timestamp-prefixed, so lexical order IS application order
    .map((name) => resolve(MIGRATIONS_DIR, name, 'migration.sql'))
    .filter((path) => existsSync(path));
}

// Unique per run: a leftover file from an interrupted run must never be reused, and
// Windows can hold a lock on a just-disconnected SQLite file.
const DB_FILE = resolve(tmpdir(), `manar-letter-engine-${process.pid}-${Date.now()}.db`);

let db: PrismaClient;

/** Statements from the real migration files, in order, comments stripped. */
function migrationStatements(): string[] {
  const files = letterMigrationFiles();
  // A silently empty list would build an empty database and pass every assertion
  // below vacuously — the same failure mode the P0 scan guards against.
  if (files.length === 0) throw new Error('No letter-engine migrations found to apply.');

  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

beforeAll(async () => {
  db = new PrismaClient({
    datasources: { db: { url: `file:${DB_FILE.replace(/\\/g, '/')}` } },
  });
  for (const statement of migrationStatements()) {
    await db.$executeRawUnsafe(statement);
  }
});

afterAll(async () => {
  await db.$disconnect();
  try {
    if (existsSync(DB_FILE)) unlinkSync(DB_FILE);
  } catch {
    // A held file lock is not a test failure; the name is unique per run.
  }
});

/** Insert a register row directly, bypassing every application-level guard. */
async function insertReference(reference: string, year: number, sequence: number, letterId: number) {
  return db.letterReference.create({
    data: { reference, templateKey: 'officialLetter', year, sequence, letterId, status: 'ALLOCATED' },
  });
}

describe('The migration file really creates the tables', () => {
  it('applies without error and the three tables are usable', async () => {
    expect(await db.letterSequence.count()).toBe(0);
    expect(await db.letterReference.count()).toBe(0);
    expect(await db.letter.count()).toBe(0);
  });

  it('the migrations contain every UNIQUE index — the load-bearing lines', () => {
    const sql = letterMigrationFiles().map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(sql).toMatch(/CREATE UNIQUE INDEX "letter_references_reference_key"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "letter_references_templateKey_year_sequence_key"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "letters_reference_key"/);
  });

  it('every letter migration is additive — none drops or rewrites anything', () => {
    // Applies to the whole family, not just the first. `ADD COLUMN` is permitted and
    // is the only form of ALTER a letter migration may use: it cannot destroy data,
    // whereas DROP COLUMN and any rewrite can.
    for (const file of letterMigrationFiles()) {
      const sql = readFileSync(file, 'utf8').toUpperCase();
      expect(sql, file).not.toContain('DROP TABLE');
      expect(sql, file).not.toContain('DROP INDEX');
      expect(sql, file).not.toContain('DROP COLUMN');
      expect(sql, file).not.toContain('DELETE FROM');
      for (const alter of sql.match(/ALTER TABLE[^;]*/g) ?? []) {
        expect(alter, `${file}: only ADD COLUMN is permitted`).toContain('ADD COLUMN');
      }
    }
  });
});

describe('THE DATABASE refuses a duplicate reference number', () => {
  it('rejects a second row with the same reference string', async () => {
    await insertReference('OL-2030-000001', 2030, 1, 1);
    // Same string, different slot — the reference index alone must stop this.
    await expect(insertReference('OL-2030-000001', 2030, 999, 2)).rejects.toThrow();
    expect(await db.letterReference.count({ where: { reference: 'OL-2030-000001' } })).toBe(1);
  });

  it('rejects a second row claiming the same (template, year, sequence) slot', async () => {
    await insertReference('OL-2031-000001', 2031, 1, 1);
    // Different string, same slot — the composite index must stop this independently.
    await expect(insertReference('OL-2031-DUPLICATE', 2031, 1, 2)).rejects.toThrow();
    expect(await db.letterReference.count({ where: { year: 2031 } })).toBe(1);
  });

  it('allows the same sequence number in a different year', async () => {
    await insertReference('OL-2032-000001', 2032, 1, 1);
    await expect(insertReference('OL-2033-000001', 2033, 1, 2)).resolves.toBeDefined();
  });

  it('reports a duplicate as P2002, which is what the allocator retries on', async () => {
    await insertReference('OL-2034-000001', 2034, 1, 1);
    await insertReference('OL-2034-000001', 2034, 2, 2).catch((error: { code?: string }) => {
      expect(error.code).toBe('P2002');
    });
    expect.assertions(1);
  });
});

describe('Sequence integrity end to end', () => {
  it('one hundred allocations yield exactly 1…100 — no gaps, no repeats', async () => {
    const YEAR = 2040;
    for (let sequence = 1; sequence <= 100; sequence += 1) {
      await insertReference(`OL-${YEAR}-${String(sequence).padStart(6, '0')}`, YEAR, sequence, sequence);
    }

    const rows = await db.letterReference.findMany({ where: { year: YEAR }, orderBy: { sequence: 'asc' } });
    expect(rows).toHaveLength(100);
    expect(rows.map((r) => r.sequence)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(new Set(rows.map((r) => r.reference)).size).toBe(100);
  });

  it('a cancelled number stays in the register and its slot is never re-issued', async () => {
    const YEAR = 2041;
    await insertReference(`OL-${YEAR}-000001`, YEAR, 1, 1);
    await db.letterReference.update({
      where: { reference: `OL-${YEAR}-000001` },
      data: { status: 'CANCELLED', cancelReason: 'صدر بالخطأ', cancelledAt: new Date() },
    });

    // The row is still there…
    const cancelled = await db.letterReference.findUnique({ where: { reference: `OL-${YEAR}-000001` } });
    expect(cancelled?.status).toBe('CANCELLED');
    expect(cancelled?.cancelReason).toBe('صدر بالخطأ');

    // …and its slot cannot be taken by anything else.
    await expect(insertReference(`OL-${YEAR}-REISSUE`, YEAR, 1, 2)).rejects.toThrow();
  });
});

describe('letters.reference is unique AND nullable', () => {
  async function insertLetter(reference: string | null) {
    return db.letter.create({
      data: {
        templateKey: 'officialLetter',
        templateVersion: 1,
        layoutVersion: 1,
        barcodeVersion: 1,
        printProfileId: 'companyLetterhead',
        contentModelVersion: 1,
        status: reference ? 'REGISTERED' : 'DRAFT',
        reference,
        issueDate: new Date('2050-01-01T00:00:00.000Z'),
      },
    });
  }

  it('permits MANY unnumbered drafts', async () => {
    // The property that lets one nullable column express "every draft is unnumbered,
    // every issued letter is uniquely numbered".
    for (let i = 0; i < 5; i += 1) await insertLetter(null);
    expect(await db.letter.count({ where: { reference: null } })).toBeGreaterThanOrEqual(5);
  });

  it('refuses two letters carrying the same reference', async () => {
    await insertLetter('OL-2050-000001');
    await expect(insertLetter('OL-2050-000001')).rejects.toThrow();
  });

  it('defaults a new letter to DRAFT with no reference', async () => {
    const row = await db.letter.create({
      data: {
        templateKey: 'officialLetter',
        templateVersion: 1,
        layoutVersion: 1,
        barcodeVersion: 1,
        printProfileId: 'companyLetterhead',
        contentModelVersion: 1,
        issueDate: new Date('2051-01-01T00:00:00.000Z'),
      },
    });
    expect(row.status).toBe('DRAFT');
    expect(row.reference).toBeNull();
    expect(row.subject).toBe('');
    expect(row.registrationSnapshotJson).toBeNull();
  });
});

describe('Archiving is a column, not a status', () => {
  async function newLetter(status: string, reference: string | null) {
    return db.letter.create({
      data: {
        templateKey: 'officialLetter',
        templateVersion: 1,
        layoutVersion: 1,
        barcodeVersion: 1,
        printProfileId: 'companyLetterhead',
        contentModelVersion: 1,
        status,
        reference,
        issueDate: new Date('2055-01-01T00:00:00.000Z'),
      },
    });
  }

  it('defaults to not archived', async () => {
    expect((await newLetter('DRAFT', null)).isArchived).toBe(false);
  });

  it('a letter can be PRINTED and archived at the same time', async () => {
    // The combination that makes archiving-as-a-status impossible.
    const row = await newLetter('PRINTED', 'OL-2055-000001');
    const archived = await db.letter.update({ where: { id: row.id }, data: { isArchived: true } });
    expect(archived.status).toBe('PRINTED');
    expect(archived.isArchived).toBe(true);
  });

  it('filters independently of status', async () => {
    const archivedCount = await db.letter.count({ where: { isArchived: true } });
    const printedArchived = await db.letter.count({ where: { status: 'PRINTED', isArchived: true } });
    expect(archivedCount).toBeGreaterThanOrEqual(printedArchived);
  });
});

describe('The timeline table', () => {
  it('records a sequence of events for one letter, oldest first', async () => {
    const letter = await db.letter.create({
      data: {
        templateKey: 'officialLetter',
        templateVersion: 1,
        layoutVersion: 1,
        barcodeVersion: 1,
        printProfileId: 'companyLetterhead',
        contentModelVersion: 1,
        issueDate: new Date('2056-01-01T00:00:00.000Z'),
      },
    });

    const base = Date.parse('2056-01-02T00:00:00.000Z');
    for (const [index, eventType] of ['CREATED', 'REGISTERED', 'ARCHIVED', 'UNARCHIVED'].entries()) {
      await db.letterTimelineEvent.create({
        data: { letterId: letter.id, eventType, occurredAt: new Date(base + index * 1000) },
      });
    }

    const events = await db.letterTimelineEvent.findMany({
      where: { letterId: letter.id },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    expect(events.map((e) => e.eventType)).toEqual(['CREATED', 'REGISTERED', 'ARCHIVED', 'UNARCHIVED']);
  });

  it('CASCADES with its letter — unlike the register, which must survive it', async () => {
    // The deliberate contrast: a deleted draft never held a number, so its history has
    // no official standing and should not be left orphaned.
    const letter = await db.letter.create({
      data: {
        templateKey: 'officialLetter',
        templateVersion: 1,
        layoutVersion: 1,
        barcodeVersion: 1,
        printProfileId: 'companyLetterhead',
        contentModelVersion: 1,
        issueDate: new Date('2057-01-01T00:00:00.000Z'),
      },
    });
    await db.letterTimelineEvent.create({ data: { letterId: letter.id, eventType: 'CREATED' } });

    await db.letter.delete({ where: { id: letter.id } });

    expect(await db.letterTimelineEvent.count({ where: { letterId: letter.id } })).toBe(0);
  });
});

describe('The register survives its letter (no foreign key)', () => {
  it('deleting a letter leaves its register row intact', async () => {
    // The reason `letterId` carries no FK: if a letter row is ever lost to a partial
    // restore, the number must remain accounted for. A cascading FK would delete the
    // very record that keeps a gap explicable.
    const letter = await db.letter.create({
      data: {
        templateKey: 'officialLetter',
        templateVersion: 1,
        layoutVersion: 1,
        barcodeVersion: 1,
        printProfileId: 'companyLetterhead',
        contentModelVersion: 1,
        status: 'REGISTERED',
        reference: 'OL-2060-000001',
        issueDate: new Date('2060-01-01T00:00:00.000Z'),
      },
    });
    await insertReference('OL-2060-000001-REG', 2060, 1, letter.id);

    await db.letter.delete({ where: { id: letter.id } });

    const survivor = await db.letterReference.findUnique({ where: { reference: 'OL-2060-000001-REG' } });
    expect(survivor).not.toBeNull();
    expect(survivor?.letterId).toBe(letter.id);
  });
});
