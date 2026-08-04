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
import { type FontId } from '../../styles/fontRegistry';
import { getLetterFontPool } from '../../letters/fonts/fontIntegration';

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

/** Flow items for a document, with the reserved pair chained as the composer does. */
function flowItems(content: BlockDocument, heights: Record<string, number>): PaginationItem[] {
  return [
    { id: 'date', kind: 'date', heightMm: heights.date ?? 5 },
    { id: 'recipient', kind: 'recipient', heightMm: heights.recipient ?? 5 },
    { id: 'subject', kind: 'subject', heightMm: heights.subject ?? 5 },
    ...content.blocks.map((b) => ({ id: b.id, kind: 'content' as const, heightMm: heights[b.id] ?? 5 })),
    { id: 'signature', kind: 'signature' as const, heightMm: heights.signature ?? 10, keepWithNext: true },
    { id: 'barcode', kind: 'barcode' as const, heightMm: heights.barcode ?? 10 },
  ];
}

function context(overrides: Partial<LetterValidationContext> = {}): LetterValidationContext {
  const content = overrides.content ?? contentDoc('نص الخطاب');
  const heights = overrides.itemHeightsMm ?? {};
  const items = flowItems(content, heights as Record<string, number>);
  return {
    template: TEMPLATE,
    geometry: GEOMETRY,
    status: 'DRAFT',
    reference: 'OL-2026-000001',
    issueDate: '2026-08-03',
    subject: 'طلب تمديد مدة العقد',
    recipient: { name: 'وزارة الأشغال', title: '', organisation: '' },
    content,
    pagination: paginate(items, overrides.geometry ?? GEOMETRY),
    itemHeightsMm: Object.fromEntries(items.map((i) => [i.id, i.heightMm])),
    subjectLineCount: 1,
    signatureAssetId: null,
    stampAssetId: null,
    signatureResolved: false,
    stampResolved: false,
    barcodePayload: '',
    now: new Date('2026-08-03T00:00:00.000Z'),
    ...overrides,
  };
}

/** Run the real rule set over a context. */
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
    // P7 implemented E7 and W4 once the payload builder and branding registry existed.
    // E9 (needs a server round-trip this local engine may not make) and W7 (checks
    // manual page breaks, which do not exist) were DESELECTED from the template
    // instead — see the reasoning recorded beside the selection.
    //
    // This is the assertion that lets a document be certified at all: while any
    // selected rule lacks an implementation, `readyForPrinting` is refused for ever.
    const result = validate(context());
    expect([...result.unimplementedRuleIds]).toEqual([]);
  });

  it('every implemented rule is one the template actually selects', () => {
    const selected = new Set(TEMPLATE.validationRules.map((r) => r.ruleId));
    for (const rule of IMPLEMENTED_RULES) {
      expect(selected.has(rule.ruleId), `${rule.ruleId} is implemented but never selected`).toBe(true);
    }
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
    const ctx = context({ content, itemHeightsMm: { b0: MAX_BAND + 12 } as never });
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
    const ctx = context({ content: contentDoc('x'), itemHeightsMm: { b0: MAX_BAND + 5 } as never });
    const page = pageIndexOfItem(ctx.pagination, 'b0');
    const [, footer] = reservedZonesMm(GEOMETRY, page);
    expect(issuesFor(validate(ctx), 'E4_reservedZoneOverlap')[0].message).toContain(String(footer.startMm));
  });

  it('an item that merely outgrows the FIRST page just flows — no overlap', () => {
    // The continuation band is taller, so this is a normal page break rather than a
    // defect. Getting this wrong in either direction would make the rule useless.
    const result = validate(context({ content: contentDoc('x'), itemHeightsMm: { b0: FIRST_BAND + 2 } as never }));
    expect(issuesFor(result, 'E4_reservedZoneOverlap')).toEqual([]);
    expect(issuesFor(result, 'E14_oversizedParagraph')).toEqual([]);
  });
});

describe('E11 — content past the edge of the sheet', () => {
  it('stays silent for content merely inside the reserved band', () => {
    const result = validate(context({ content: contentDoc('x'), itemHeightsMm: { b0: MAX_BAND + 6 } as never }));
    expect(issuesFor(result, 'E11_contentOutsidePage')).toEqual([]);
    // …while the overlap rule DOES fire. That is the distinction being drawn: printing
    // on the letterhead is not the same as printing off the paper.
    expect(issuesFor(result, 'E4_reservedZoneOverlap')).toHaveLength(1);
  });

  it('fires when content passes the physical edge of the paper', () => {
    const sheetHeight = pageSizeOf(GEOMETRY).heightMm;
    const result = validate(
      context({ content: contentDoc('x'), itemHeightsMm: { b0: sheetHeight + 20 } as never }),
    );
    const issues = issuesFor(result, 'E11_contentOutsidePage');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('blocking');
  });
});

describe('E12 / E13 — impossible geometry', () => {
  /** A profile whose reserved bands swallow the sheet. */
  function brokenGeometry(patch: Partial<PageGeometry>): PageGeometry {
    return { ...GEOMETRY, ...patch };
  }

  it('passes for the real profile', () => {
    const result = validate(context());
    expect(issuesFor(result, 'E12_negativePosition')).toEqual([]);
    expect(issuesFor(result, 'E13_impossibleGeometry')).toEqual([]);
  });

  it('detects a negative computed offset', () => {
    // A content width wider than the sheet drives the side margin negative.
    const geometry = brokenGeometry({ contentWidthMm: pageSizeOf(GEOMETRY).widthMm + 40 });
    const issues = issuesFor(validate(context({ geometry })), 'E12_negativePosition');
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('blocking');
    expect(issues[0].message).toMatch(/الهامش الجانبي/);
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
});

/* ── Oversized paragraph ────────────────────────────────────────────────── */

describe('E14 — a paragraph taller than one page', () => {
  it('stays silent for ordinary paragraphs', () => {
    expect(issuesFor(validate(context()), 'E14_oversizedParagraph')).toEqual([]);
  });

  it('reports a blocking finding naming the paragraph', () => {
    const content = contentDoc('فقرة طويلة جدًا لا تتّسع لها صفحة كاملة');
    const result = validate(context({ content, itemHeightsMm: { b0: MAX_BAND + 100 } as never }));

    const issues = issuesFor(result, 'E14_oversizedParagraph');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('blocking');
    expect(issues[0].location?.blockId).toBe('b0');
    expect(issues[0].message).toContain('فقرة طويلة');
  });

  it('tells the user to split it and offers NO auto-fix', () => {
    // The engine does not decide where an official letter's sentence should break.
    const content = contentDoc('نص');
    const result = validate(context({ content, itemHeightsMm: { b0: MAX_BAND + 100 } as never }));
    const issue = issuesFor(result, 'E14_oversizedParagraph')[0];
    expect(issue.suggestion).toMatch(/قسّم/);
    expect(issue.suggestion).toMatch(/لا يقسّمها المحرّك/);
  });
});

/* ── Reserved elements ──────────────────────────────────────────────────── */

describe('E15 — the signature and barcode belong on the last page', () => {
  it('passes when both sit on the final sheet', () => {
    expect(issuesFor(validate(context()), 'E15_reservedElementPlacement')).toEqual([]);
  });

  it('passes across a multi-page letter, because they travel together', () => {
    // `keepWithNext` moves the pair as a unit, so a page break cannot separate them.
    const content = contentDoc('أ', 'ب');
    const result = validate(
      context({ content, itemHeightsMm: { b0: FIRST_BAND - 20, b1: 60 } as never }),
    );
    expect(result.issues.some((i) => i.ruleId === 'E15_reservedElementPlacement')).toBe(false);
    expect(issuesFor(result, 'I1_documentPageCount')[0].message).toMatch(/صفحات|صفحة/);
  });

  it('validates placement only — it renders nothing', () => {
    const rule = IMPLEMENTED_RULES.find((r) => r.ruleId === 'E15_reservedElementPlacement');
    expect(rule?.dependsOn).toEqual(['pagination']);
  });
});

/* ── Content rules ──────────────────────────────────────────────────────── */

describe('Content rules', () => {
  it('E1 — a missing subject is blocking, and points at the subject section', () => {
    const issues = issuesFor(validate(context({ subject: '   ' })), 'E1_subjectRequired');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('blocking');
    expect(issues[0].location?.sectionKind).toBe('subject');
    expect(issues[0].suggestion).toBeTruthy();
  });

  it('E2 — empty content is blocking', () => {
    const issues = issuesFor(validate(context({ content: createEmptyBlockDocument() })), 'E2_contentRequired');
    expect(issues).toHaveLength(1);
    expect(issues[0].location?.sectionKind).toBe('content');
  });

  it('E3 — a draft with no reference cannot be printed', () => {
    expect(issuesFor(validate(context({ reference: null })), 'E3_referenceRequiredForOutput')).toHaveLength(1);
    expect(issuesFor(validate(context({ reference: 'OL-2026-000001' })), 'E3_referenceRequiredForOutput')).toEqual([]);
  });

  it('E6 — a paragraph naming a font this build lacks is blocking', () => {
    const content: BlockDocument = {
      contentModelVersion: 1,
      blocks: [createBlock('b0', 'paragraph', [createSpan('x')], { ...BODY, fontId: 'ghostFont' as never })],
    };
    const issues = issuesFor(validate(context({ content })), 'E6_unknownFontId');
    expect(issues).toHaveLength(1);
    expect(issues[0].location?.blockId).toBe('b0');
  });

  it('E8 — a subject with a line break, or too many lines', () => {
    expect(issuesFor(validate(context({ subject: 'سطر\nآخر' })), 'E8_subjectLineCount').length).toBeGreaterThan(0);
    expect(issuesFor(validate(context({ subjectLineCount: 5 })), 'E8_subjectLineCount').length).toBeGreaterThan(0);
    expect(issuesFor(validate(context({ subjectLineCount: 1 })), 'E8_subjectLineCount')).toEqual([]);
  });

  it('W2 — a long subject is advisory, never blocking', () => {
    const issues = issuesFor(validate(context({ subject: 'م'.repeat(200) })), 'W2_subjectLengthAdvisory');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('W3 — silent for every font the letter pool currently contains', () => {
    // Font Picker — Dynamic Registry Hotfix v2 made the letter pool exactly
    // `getEnabledFonts()` (`fontIntegration.ts`) — no allow-list, no curation.
    // Looped over the pool's OWN members rather than a hardcoded id list, so this
    // keeps testing the right thing as the registry's enabled set evolves, instead
    // of silently drifting the way a copy-pasted id list would.
    for (const font of getLetterFontPool()) {
      const content: BlockDocument = {
        contentModelVersion: 1,
        blocks: [createBlock('b0', 'paragraph', [createSpan('x')], { ...BODY, fontId: font.id as FontId })],
      };
      const issues = issuesFor(validate(context({ content })), 'W3_nonOfficialFontUsed');
      expect(issues, `W3 fired for "${font.id}", which is in the pool`).toEqual([]);
    }
  });

  it('W3 — is dormant for real data under the current no-filter pool', () => {
    // The prior named allow-list revived this rule for `ibmPlexArabic`/`tajawal`
    // (genuine, enabled registry fonts outside that curated ten). This pack removes
    // the curation layer entirely, so every enabled font is back in the pool and W3
    // cannot currently be triggered by any real, enabled font id — only by a font id
    // the registry cannot resolve at all (see the next test). This is the honest,
    // expected shape of a rule guarding a boundary that no longer excludes anything.
    for (const fontId of ['ibmPlexArabic', 'tajawal'] as const) {
      const content: BlockDocument = {
        contentModelVersion: 1,
        blocks: [createBlock('b0', 'paragraph', [createSpan('x')], { ...BODY, fontId })],
      };
      const issues = issuesFor(validate(context({ content })), 'W3_nonOfficialFontUsed');
      expect(issues, fontId).toEqual([]);
    }
  });

  it('W3 — does not fire for a font the registry cannot resolve at all', () => {
    // The honest boundary of what W3 can and cannot catch: it guards "resolvable but
    // not approved", not "unresolvable". A saved letter naming a font id the registry
    // no longer has at all (`findFont` returns `undefined`) short-circuits the rule's
    // own condition (`findFont(...) && !pool.has(...)`) before the pool is even
    // consulted — this is a real, documented scenario `findFont` itself is written to
    // tolerate, not something this test invents.
    const content: BlockDocument = {
      contentModelVersion: 1,
      blocks: [
        // Cast deliberately: simulates a saved document referencing a font id the
        // registry has since removed — `FontId`'s type should not be able to express
        // this for NEW content, only for data arriving from storage.
        createBlock('b0', 'paragraph', [createSpan('x')], { ...BODY, fontId: 'doesNotExist' as BlockAttributes['fontId'] }),
      ],
    };
    const issues = issuesFor(validate(context({ content })), 'W3_nonOfficialFontUsed');
    expect(issues).toEqual([]);
  });

  it('W5 — typography deviation is reported once, not once per paragraph', () => {
    // Otherwise a deliberately larger letter produces a wall of identical warnings.
    const content: BlockDocument = {
      contentModelVersion: 1,
      blocks: ['a', 'b', 'c'].map((id) =>
        createBlock(id, 'paragraph', [createSpan('x')], { ...BODY, sizePt: 22 }),
      ),
    };
    const issues = issuesFor(validate(context({ content })), 'W5_typographyDeviation');
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('3');
  });

  it('W6 — a future date and a heavily backdated one are both advisory', () => {
    const future = validate(context({ issueDate: '2027-01-01' }));
    expect(issuesFor(future, 'W6_issueDateOutOfRange')[0].message).toMatch(/المستقبل/);

    const old = validate(context({ issueDate: '2025-01-01' }));
    expect(issuesFor(old, 'W6_issueDateOutOfRange')[0].severity).toBe('warning');

    expect(issuesFor(validate(context({ issueDate: '2026-08-01' })), 'W6_issueDateOutOfRange')).toEqual([]);
  });

  it('W6 — an unparseable date is reported rather than ignored', () => {
    expect(issuesFor(validate(context({ issueDate: 'not-a-date' })), 'W6_issueDateOutOfRange')).toHaveLength(1);
  });
});

/* ── Layout rules ───────────────────────────────────────────────────────── */

describe('Layout rules', () => {
  it('E10 — exceeding the template page cap is blocking', () => {
    const cap = getValidationRule('E10_pageCapExceeded');
    expect(cap.severity).toBe('blocking');

    // Enough oversized paragraphs to pass the template's ten-page cap.
    const content = contentDoc(...Array.from({ length: 12 }, (_, i) => `فقرة ${i}`));
    const heights = Object.fromEntries(content.blocks.map((b) => [b.id, FIRST_BAND]));
    const result = validate(context({ content, itemHeightsMm: heights as never }));
    expect(issuesFor(result, 'E10_pageCapExceeded')).toHaveLength(1);
  });

  it('W1 — a long letter is advisory', () => {
    const content = contentDoc(...Array.from({ length: 7 }, (_, i) => `فقرة ${i}`));
    const heights = Object.fromEntries(content.blocks.map((b) => [b.id, FIRST_BAND]));
    const result = validate(context({ content, itemHeightsMm: heights as never }));
    expect(issuesFor(result, 'W1_pageCountAdvisory')[0].severity).toBe('warning');
  });

  it('I1 — always reports the page count as information', () => {
    const issues = issuesFor(validate(context()), 'I1_documentPageCount');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('info');
    expect(issues[0].message).toMatch(/صفحة واحدة/);
  });

  it('W8 — a nearly-full last page warns about cross-machine fragility', () => {
    const content = contentDoc('نص');
    // Fill ~95% of the band: date+recipient+subject+signature+barcode already occupy 35.
    const result = validate(
      context({ content, itemHeightsMm: { b0: FIRST_BAND * 0.95 - 35 } as never }),
    );
    const issues = issuesFor(result, 'W8_lastPageNearlyFull');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });
});

/* ── Readiness ──────────────────────────────────────────────────────────── */

describe('Document readiness', () => {
  it('certifies a clean document now that every selected rule runs', () => {
    // The gate P6 built finally opens. A document with no blocking findings and
    // nothing left unchecked is printable — which was the whole point of refusing
    // until both were true.
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
    const withGap = summarise({ ...clean, unimplementedRuleIds: ['E9_referenceIntegrity'] });
    expect(withGap.unimplementedCount).toBe(1);
    expect(withGap.readyForPrinting).toBe(false);
  });

  it('counts blocking findings separately from advisory ones', () => {
    const summary = summarise(validate(context({ subject: '', reference: null })));
    expect(summary.blocking).toBeGreaterThanOrEqual(2);
    expect(summary.info).toBeGreaterThanOrEqual(1);
  });
});

/* ── Purity ─────────────────────────────────────────────────────────────── */

describe('Rules are pure', () => {
  it('produce the same findings for the same context', () => {
    const ctx = context({ subject: '' });
    expect(validate(ctx).issues).toEqual(validate(ctx).issues);
  });

  it('do not mutate the context they are given', () => {
    const ctx = context({ subject: '' });
    const snapshot = JSON.stringify({ ...ctx, now: ctx.now.toISOString(), template: null, geometry: ctx.geometry });
    validate(ctx);
    expect(JSON.stringify({ ...ctx, now: ctx.now.toISOString(), template: null, geometry: ctx.geometry })).toBe(snapshot);
  });
});
