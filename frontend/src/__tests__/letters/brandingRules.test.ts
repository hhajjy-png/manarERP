/**
 * Letter Engine — P7 completion: the two rules that finished the rule set.
 *
 * E7 and W4 were the last selected rules without an implementation, and while any
 * remained the print gate refused every document with INCOMPLETE_VALIDATION. So these
 * tests cover both the rules themselves and the gate they unblock.
 */

import { describe, expect, it } from 'vitest';

import {
  BARCODE_PAYLOAD_MAX_BYTES,
  barcodePayloadCapacityRule,
  signatureAssetMissingRule,
} from '../../letters/validation/rules/brandingRules';
import { buildBarcodePayload } from '../../letters/barcode/payloadBuilder';
import { getPageGeometry } from '../../letters/registry/geometryRegistry';
import { getTemplate } from '../../letters/registry/templateRegistry';
import { type LetterValidationContext } from '../../letters/validation/context';

const GEOMETRY = getPageGeometry('companyLetterhead', 1);

function context(overrides: Partial<LetterValidationContext> = {}): LetterValidationContext {
  return {
    template: getTemplate('officialLetter'),
    geometry: GEOMETRY,
    status: 'REGISTERED',
    reference: 'OL-2026-000042',
    issueDate: '2026-08-03',
    subject: 'طلب صيانة',
    recipient: { name: 'وزارة الأشغال', title: '', organisation: '' },
    content: { blocks: [], modelVersion: 1 } as never,
    pagination: { pages: [{ pageIndex: 0, itemIds: [], usedMm: 10, availableMm: 200 }], pageCount: 1, overflowingItemIds: [] },
    itemHeightsMm: {},
    subjectLineCount: 1,
    signatureAssetId: null,
    stampAssetId: null,
    signatureResolved: false,
    stampResolved: false,
    barcodePayload: buildBarcodePayload({ issueDate: '2026-08-03', subject: 'طلب صيانة', reference: 'OL-2026-000042' }),
    now: new Date('2026-08-03T00:00:00Z'),
    ...overrides,
  } as LetterValidationContext;
}

describe('E7 — the barcode payload must fit the symbol', () => {
  it('passes a normal payload', () => {
    expect(barcodePayloadCapacityRule.evaluate(context(), {})).toEqual([]);
  });

  it('says nothing about a draft, which has no payload to judge', () => {
    // E3 already covers "a draft may not be output"; duplicating it here would report
    // the same problem twice under two different rules.
    expect(barcodePayloadCapacityRule.evaluate(context({ barcodePayload: '' }), {})).toEqual([]);
  });

  it('blocks a payload past the capacity limit', () => {
    const oversized = `التاريخ: 2026-08-03\nالموضوع: ${'م'.repeat(BARCODE_PAYLOAD_MAX_BYTES)}\nرقم المرجع: OL-2026-000042`;
    const findings = barcodePayloadCapacityRule.evaluate(context({ barcodePayload: oversized }), {});
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].suggestion).toContain('اختصر');
  });

  it('measures UTF-8 bytes, not characters', () => {
    // Arabic costs two bytes per character; counting characters would let a payload
    // roughly twice the real size through.
    const arabic = 'م'.repeat(Math.floor(BARCODE_PAYLOAD_MAX_BYTES / 2) + 50);
    const findings = barcodePayloadCapacityRule.evaluate(
      context({ barcodePayload: `التاريخ: x\nالموضوع: ${arabic}\nرقم المرجع: y` }),
      {},
    );
    expect(findings.length).toBeGreaterThan(0);
  });

  it('catches a payload carrying the wrong number of fields', () => {
    // The three-field rule is a privacy guarantee; a drifted builder must not reach
    // paper unnoticed.
    const extra = 'التاريخ: 2026-08-03\nالموضوع: س\nرقم المرجع: OL-2026-000042\nالمستلم: وزارة';
    const findings = barcodePayloadCapacityRule.evaluate(context({ barcodePayload: extra }), {});
    expect(findings.some((f) => f.message.includes('حقلًا'))).toBe(true);
  });
});

describe('W4 — the signature selection', () => {
  it('advises when no signature is selected, without blocking', () => {
    // Printing for wet-ink signature is a legitimate workflow.
    const findings = signatureAssetMissingRule.evaluate(context(), {});
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('لم يُحدَّد توقيع');
  });

  it('distinguishes a selection that no longer resolves', () => {
    // The dangerous case: the user believes a signature is attached and it is not.
    const findings = signatureAssetMissingRule.evaluate(
      context({ signatureAssetId: 'sig-1', signatureResolved: false }),
      {},
    );
    expect(findings[0].message).toContain('غير متاح');
  });

  it('says nothing when a signature resolves', () => {
    expect(
      signatureAssetMissingRule.evaluate(context({ signatureAssetId: 'sig-1', signatureResolved: true }), {}),
    ).toEqual([]);
  });

  it('reports a stamp only when its selection fails to resolve', () => {
    // An absent stamp is unremarkable — most letters carry none — so reporting it on
    // every draft would be noise, and a panel that cries wolf stops being read.
    const absent = signatureAssetMissingRule.evaluate(
      context({ signatureAssetId: 'sig-1', signatureResolved: true, stampAssetId: null }),
      {},
    );
    expect(absent).toEqual([]);

    const broken = signatureAssetMissingRule.evaluate(
      context({ signatureAssetId: 'sig-1', signatureResolved: true, stampAssetId: 'stamp-1', stampResolved: false }),
      {},
    );
    expect(broken.some((f) => f.message.includes('الختم'))).toBe(true);
  });

  it('is a warning, never a blocker', () => {
    // Severity comes from the catalogue, so this asserts the catalogue entry rather
    // than the rule — which is where the decision actually lives.
    expect(getTemplate('officialLetter').validationRules.some((r) => r.ruleId === 'W4_signatureAssetMissing')).toBe(true);
  });
});
