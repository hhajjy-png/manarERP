/**
 * Letter Engine — rules about the barcode payload and the branding selection.
 *
 * Both depend on machinery that did not exist before P7: the payload builder and the
 * company branding registry. Neither rule rebuilds either — they judge what the
 * renderer will actually produce, which is the only thing worth judging.
 */

import { getBarcodePayloadSpec } from '../../registry/barcodeSpecs';
import { readPayloadLabels } from '../../barcode/payloadBuilder';
import { type ValidationFinding, type ValidationRuleImplementation } from '../framework';

/**
 * The payload ceiling.
 *
 * A QR symbol's capacity depends on its version, the error-correction level and the
 * encoding mode. Arabic text encodes as UTF-8 byte mode, where a symbol printed at the
 * registry's size stops being reliably scannable well before the format's theoretical
 * maximum — the modules get too small for a phone camera at arm's length.
 *
 * So this is a PRACTICAL limit, not the spec's: comfortably inside what a mid-version
 * symbol carries at the error correction the engine uses, chosen so a code that passes
 * validation is a code that actually scans off paper. The subject is already capped by
 * the payload spec; this catches the case where date and reference push a
 * near-limit subject over the edge.
 */
export const BARCODE_PAYLOAD_MAX_BYTES = 900;

/** UTF-8 byte length — Arabic characters cost two to three bytes each, not one. */
function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * E7 — the barcode payload must fit the symbol.
 *
 * Blocking, because a payload that overflows produces either an unscannable code or no
 * code at all, and an official letter carrying an unreadable barcode is worse than one
 * carrying none: it looks verifiable and is not.
 *
 * A letter with no reference yet has nothing to encode and is not judged here — E3
 * already covers "this may not be output while it is a draft".
 */
export const barcodePayloadCapacityRule: ValidationRuleImplementation = {
  ruleId: 'E7_barcodePayloadCapacity',
  dependsOn: ['status', 'subject', 'issueDate'],
  evaluate: (context) => {
    const payload = context.barcodePayload;
    if (!payload) return [];

    const findings: ValidationFinding[] = [];
    const bytes = utf8Bytes(payload);

    if (bytes > BARCODE_PAYLOAD_MAX_BYTES) {
      findings.push({
        ruleId: 'E7_barcodePayloadCapacity',
        message: `محتوى الباركود أطول من سعة الرمز (${bytes} بايت مقابل ${BARCODE_PAYLOAD_MAX_BYTES} متاحة).`,
        suggestion: 'اختصر موضوع الخطاب — يُختصر الموضوع داخل الرمز فقط ويبقى كاملًا على الصفحة.',
        location: { sectionKind: 'barcode' },
      });
    }

    // The payload must carry exactly the approved fields. A drifted builder that
    // silently dropped or added a line would otherwise reach paper unnoticed — and the
    // three-field rule is a privacy guarantee, not a formatting preference.
    const spec = getBarcodePayloadSpec();
    const labels = readPayloadLabels(payload);
    if (labels.length !== spec.fields.length) {
      findings.push({
        ruleId: 'E7_barcodePayloadCapacity',
        message: `محتوى الباركود يحمل ${labels.length} حقلًا بدل ${spec.fields.length} — يجب أن يحمل التاريخ والموضوع والرقم المرجعي فقط.`,
        suggestion: 'هذا خلل في المحرّك لا في المستند — أبلغ عنه قبل الطباعة.',
        location: { sectionKind: 'barcode' },
      });
    }

    return findings;
  },
};

/**
 * W4 — the signature section is enabled but carries no usable asset.
 *
 * DELIBERATELY A WARNING, NEVER BLOCKING. Printing a letter for wet-ink signature is a
 * legitimate and common workflow, and an engine that refused to print an unsigned
 * letter would be wrong about how official correspondence is actually produced.
 *
 * Two distinct situations are reported separately, because they call for different
 * actions from the user:
 *
 *   · nothing selected      — informational; they may have meant to sign by hand.
 *   · selected but missing  — they believe a signature is attached and it is NOT.
 *                             This is the one that would otherwise reach paper as a
 *                             silently blank space.
 */
export const signatureAssetMissingRule: ValidationRuleImplementation = {
  ruleId: 'W4_signatureAssetMissing',
  dependsOn: ['status'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];

    if (context.signatureAssetId && !context.signatureResolved) {
      findings.push({
        ruleId: 'W4_signatureAssetMissing',
        message: 'التوقيع المحدَّد لهذا الخطاب غير متاح — قد يكون حُذف أو أُخفي من إعدادات هوية الشركة.',
        suggestion: 'اختر توقيعًا آخر، أو أزل التحديد إن كان التوقيع سيُوضع بخط اليد.',
        location: { sectionKind: 'signature' },
      });
    } else if (!context.signatureAssetId) {
      findings.push({
        ruleId: 'W4_signatureAssetMissing',
        message: 'لم يُحدَّد توقيع لهذا الخطاب.',
        suggestion: 'حدّد توقيعًا من هوية الشركة، أو اطبع الخطاب للتوقيع عليه بخط اليد.',
        location: { sectionKind: 'signature' },
      });
    }

    // The stamp is reported only when a selection fails to resolve. An absent stamp is
    // not remarkable — most letters carry none — so saying so on every draft would be
    // noise, and a panel that cries wolf stops being read.
    if (context.stampAssetId && !context.stampResolved) {
      findings.push({
        ruleId: 'W4_signatureAssetMissing',
        message: 'الختم المحدَّد لهذا الخطاب غير متاح — قد يكون حُذف أو أُخفي من إعدادات هوية الشركة.',
        suggestion: 'اختر ختمًا آخر أو أزل التحديد.',
        location: { sectionKind: 'signature' },
      });
    }

    return findings;
  },
};

export const BRANDING_RULES = [barcodePayloadCapacityRule, signatureAssetMissingRule] as const;
