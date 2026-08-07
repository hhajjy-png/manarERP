/**
 * Letter Engine — the validation rules.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY EXPECTED DIMENSION IS DERIVED FROM THE GEOMETRY REGISTRY.
 * ══════════════════════════════════════════════════════════════════════════
 * Not one band height or reserved-zone offset is typed into this file. Fixtures are
 * built from `usableBandMm`, `reservedZonesMm` and `pageSizeOf`, so a registry change
 * moves the rules and their tests together instead of pinning the rules to numbers
 * that have drifted.
 *
 * Rules are pure, so this suite is their specification.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FORM EDITOR UX REBUILD v2 — THREE RULES, DOWN FROM TWENTY-FIVE.
 * ══════════════════════════════════════════════════════════════════════════
 * Every rule that protected an editorial convention rather than the pre-printed paper
 * — content requirements, subject/date checks, layout-object placement advisories,
 * automation checks, page-count caps — was DELETED along with its specification here.
 * What remains is `E4_reservedZoneOverlap`, `E16_objectInReservedZone` (its own file,
 * `layoutDesigner.test.ts`, since it needs the layout-object fixtures already built
 * there) and `E13_impossibleGeometry`.
 */
import { describe, it, expect } from 'vitest';
import {
  getPageGeometry,
  pageSizeOf,
  reservedZonesMm,
  usableBandMm,
  type PageGeometry,
} from '../../letters/registry/geometryRegistry';
import { getTemplate } from '../../letters/registry/templateRegistry';
import { pageIndexOfItem, paginate, type PaginationItem } from '../../letters/pagination/paginate';
import {
  createBlock,
  createEmptyBlockDocument,
  createSpan,
  type BlockAttributes,
  type BlockDocument,
} from '../../letters/model/blockTypes';
import { type LetterValidationContext } from '../../letters/validation/context';
import { createLetterValidationRegistry, IMPLEMENTED_RULES } from '../../letters/validation/rules';
import { createValidationRunner, summarise, type ValidationResult } from '../../letters/validation/framework';
import { getValidationRule } from '../../letters/registry/validationRuleCatalog';

const GEOMETRY = getPageGeometry('companyLetterhead', 1);
const FIRST_BAND = usableBandMm(GEOMETRY, 0);
/**
 * The LARGEST band any page offers.
 *
 * A continuation sheet is taller than the first (it carries no date block), so an item
 * merely bigger than the first page's band simply flows onto page two and fits. To
 * force a genuine overlap a fixture has to exceed the largest band there is — which is
 * exactly the condition the paginator itself cannot solve.
 */
const MAX_BAND = Math.max(FIRST_BAND, usableBandMm(GEOMETRY, 1));
const TEMPLATE = getTemplate('officialLetter');

const BODY: BlockAttributes = {
  fontId: 'traditionalArabic',
  sizePt: 16,
  alignment: 'justify',
  indentLevel: 0,
};

function contentDoc(...texts: string[]): BlockDocument {
  return {
    contentModelVersion: 1,
    blocks: texts.map((text, i) => createBlock(`b${i}`, 'paragraph', [createSpan(text)], BODY)),
  };
}

/** Flow items for a document — just the content blocks, since the sections that used
 *  to bracket them (date, recipient, subject) went with the letter assumptions. */
function flowItems(content: BlockDocument, heights: Record<string, number>): PaginationItem[] {
  return content.blocks.map((b) => ({ id: b.id, kind: 'content' as const, heightMm: heights[b.id] ?? 5 }));
}

function context(overrides: Partial<LetterValidationContext> = {}): LetterValidationContext {
  const content = overrides.content ?? contentDoc('نص المستند');
  const items = flowItems(content, {});
  return {
    geometry: GEOMETRY,
    content,
    pagination: paginate(items, overrides.geometry ?? GEOMETRY),
    ...overrides,
  };
}

/**
 * Run the rules THE SHIPPED TEMPLATE SELECTS — which, after the rebuild, is every
 * implemented rule. There is no longer a meaningful distinction between "implemented"
 * and "selected"; both functions are kept because the assertions below still read more
 * clearly naming which one they mean.
 */
function validate(ctx: LetterValidationContext): ValidationResult {
  const runner = createValidationRunner(createLetterValidationRegistry());
  return runner.run(TEMPLATE.validationRules, ctx, 'all');
}

function issuesFor(result: ValidationResult, ruleId: string) {
  return result.issues.filter((i) => i.ruleId === ruleId);
}

/* ── Registration ───────────────────────────────────────────────────────── */

describe('The rule set', () => {
  it('registers every implemented rule without collision', () => {
    const registry = createLetterValidationRegistry();
    expect(registry.registeredRuleIds()).toHaveLength(IMPLEMENTED_RULES.length);
  });

  it('every implementation declares the inputs it reads', () => {
    // `dependsOn` is what makes incremental re-validation possible; a rule without it
    // would silently re-run on every keystroke.
    for (const rule of IMPLEMENTED_RULES) {
      expect(Array.isArray(rule.dependsOn), `${rule.ruleId} has no dependsOn`).toBe(true);
    }
  });

  it('leaves NO selected rule unimplemented', () => {
    // This is the assertion that lets a document be certified at all: while any
    // selected rule lacks an implementation, `readyForPrinting` is refused for ever.
    const result = validate(context());
    expect([...result.unimplementedRuleIds]).toEqual([]);
  });

  it('the template selects exactly the three rules this build implements', () => {
    // Post-rebuild there is nothing left to deselect — implemented and selected are
    // the same three ids.
    expect([...IMPLEMENTED_RULES.map((r) => r.ruleId)].sort()).toEqual(
      [...TEMPLATE.validationRules.map((s) => s.ruleId)].sort(),
    );
  });
});

describe('The shipped rule selection — the editor assists, it does not refuse', () => {
  it('leaves EXACTLY THREE rules, and all three block an output', () => {
    // Two protect the pre-printed paper; the third catches geometry that describes no
    // usable page. Nothing else exists to gate an output — that is the rebuild's
    // central promise, and this is the assertion that keeps it honest.
    const ids = TEMPLATE.validationRules.map((s) => s.ruleId);
    expect([...ids].sort()).toEqual(
      ['E4_reservedZoneOverlap', 'E13_impossibleGeometry', 'E16_objectInReservedZone'].sort(),
    );
    for (const id of ids) expect(getValidationRule(id).severity).toBe('blocking');
  });

  it('does NOT block an empty document with no positioned objects', () => {
    // Every content requirement — subject, body, registration — used to refuse the
    // press. All of that is now the author's business; only geometry is judged.
    const summary = summarise(validate(context({ content: createEmptyBlockDocument() })));
    expect(summary.blocking).toBe(0);
    expect(summary.readyForPrinting).toBe(true);
  });

  it('keeps the reserved-zone rules blocking, with no way for a template to soften them', () => {
    // INV-2 / INV-3. Severity is a catalogue fact, unreachable from template metadata.
    expect(getValidationRule('E4_reservedZoneOverlap').severity).toBe('blocking');
    expect(getValidationRule('E16_objectInReservedZone').severity).toBe('blocking');
  });
});

/* ── Safe zones ─────────────────────────────────────────────────────────── */

describe('E4 — no content may enter a reserved zone', () => {
  it('passes when every page fits its band', () => {
    expect(issuesFor(validate(context()), 'E4_reservedZoneOverlap')).toEqual([]);
  });

  it('reports the page and the overshoot in millimetres', () => {
    // Only an item taller than a whole band can defeat the flow, so that is what
    // produces an overlap.
    const content = contentDoc('فقرة ضخمة');
    const ctx = context({ content, pagination: paginate([{ id: 'b0', kind: 'content', heightMm: MAX_BAND + 12 }], GEOMETRY) });
    const expectedPage = pageIndexOfItem(ctx.pagination, 'b0');

    const issues = issuesFor(validate(ctx), 'E4_reservedZoneOverlap');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('blocking');
    // Derived, not assumed: the finding must name the page the item actually landed on.
    expect(issues[0].location?.pageIndex).toBe(expectedPage);
    expect(issues[0].location?.overshootMm).toBeGreaterThan(0);
    // Actionable: names the page and the amount, not "content overlaps the safe zone".
    expect(issues[0].message).toMatch(new RegExp(`الصفحة ${expectedPage + 1}`));
    expect(issues[0].message).toMatch(/مم/);
    expect(issues[0].suggestion).toBeTruthy();
  });

  it('reads the reserved band from the registry, not from a constant', () => {
    const ctx = context({
      content: contentDoc('x'),
      pagination: paginate([{ id: 'b0', kind: 'content', heightMm: MAX_BAND + 5 }], GEOMETRY),
    });
    const page = pageIndexOfItem(ctx.pagination, 'b0');
    const [, footer] = reservedZonesMm(GEOMETRY, page);
    expect(issuesFor(validate(ctx), 'E4_reservedZoneOverlap')[0].message).toContain(String(footer.startMm));
  });

  it('an item that merely outgrows the FIRST page just flows — no overlap', () => {
    // The continuation band is taller, so this is a normal page break rather than a
    // defect. Getting this wrong in either direction would make the rule useless.
    //
    // A small PRIMER block occupies page 0 first — otherwise the item would be the
    // first thing the paginator considers on an empty page, and an item taller than the
    // whole band is placed anyway rather than deferred (there is nowhere else for it to
    // go). Only once something else has already used part of the band does an
    // over-height item genuinely overflow onto the next, taller, page.
    const content = contentDoc('صغير', 'x');
    const result = validate(
      context({
        content,
        pagination: paginate(
          [
            { id: 'b0', kind: 'content', heightMm: 10 },
            { id: 'b1', kind: 'content', heightMm: FIRST_BAND + 2 - 10 },
          ],
          GEOMETRY,
        ),
      }),
    );
    expect(issuesFor(result, 'E4_reservedZoneOverlap')).toEqual([]);
  });
});

/* ── Impossible geometry ────────────────────────────────────────────────── */

describe('E13 — geometry that leaves no usable page', () => {
  /** A profile whose reserved bands swallow the sheet. */
  function brokenGeometry(patch: Partial<PageGeometry>): PageGeometry {
    return { ...GEOMETRY, ...patch };
  }

  it('passes for the real profile', () => {
    expect(issuesFor(validate(context()), 'E13_impossibleGeometry')).toEqual([]);
  });

  it('detects a band with no usable height', () => {
    const geometry = brokenGeometry({ contentTopMm: 280, continuationContentTopMm: 280 });
    const issues = issuesFor(validate(context({ geometry })), 'E13_impossibleGeometry');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('blocking');
  });

  it('detects a content width that cannot fit the sheet', () => {
    const geometry = brokenGeometry({ contentWidthMm: 0 });
    expect(issuesFor(validate(context({ geometry })), 'E13_impossibleGeometry').length).toBeGreaterThan(0);
  });

  it('detects a content width wider than the sheet itself', () => {
    const geometry = brokenGeometry({ contentWidthMm: pageSizeOf(GEOMETRY).widthMm + 40 });
    expect(issuesFor(validate(context({ geometry })), 'E13_impossibleGeometry').length).toBeGreaterThan(0);
  });
});

/* ── Readiness ──────────────────────────────────────────────────────────── */

describe('Document readiness', () => {
  it('certifies a clean document once every selected rule runs', () => {
    const summary = summarise(validate(context()));
    expect(summary.unimplementedCount).toBe(0);
    expect(summary.blocking).toBe(0);
    expect(summary.readyForPrinting).toBe(true);
  });

  it('still refuses readiness if a rule ever loses its implementation', () => {
    // The mechanism is the guarantee, not today's rule count: "we checked and found
    // nothing" must never be confused with "we never checked". Proven directly by
    // summarising a result that reports an unimplemented rule.
    const clean = validate(context());
    const withGap = summarise({ ...clean, unimplementedRuleIds: ['E13_impossibleGeometry'] });
    expect(withGap.unimplementedCount).toBe(1);
    expect(withGap.readyForPrinting).toBe(false);
  });

  it('counts a reserved-zone overlap as blocking', () => {
    const summary = summarise(
      validate(
        context({
          content: contentDoc('x'),
          pagination: paginate([{ id: 'b0', kind: 'content', heightMm: MAX_BAND + 12 }], GEOMETRY),
        }),
      ),
    );
    expect(summary.blocking).toBeGreaterThanOrEqual(1);
  });
});

/* ── Purity ─────────────────────────────────────────────────────────────── */

describe('Rules are pure', () => {
  it('produce the same findings for the same context', () => {
    const ctx = context();
    expect(validate(ctx).issues).toEqual(validate(ctx).issues);
  });

  it('do not mutate the context they are given', () => {
    const ctx = context();
    const snapshot = JSON.stringify({ ...ctx, geometry: ctx.geometry });
    validate(ctx);
    expect(JSON.stringify({ ...ctx, geometry: ctx.geometry })).toBe(snapshot);
  });
});
