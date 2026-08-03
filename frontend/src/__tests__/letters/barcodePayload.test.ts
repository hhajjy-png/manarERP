/**
 * Letter Engine — P7: the barcode payload.
 *
 * The rule under test is a privacy rule, not a formatting one: the barcode carries the
 * date, the subject and the reference, and NOTHING else. A barcode travels wherever the
 * paper travels, so every extra field is a disclosure to everyone who ever photographs
 * the letter.
 *
 * These tests read the produced STRING rather than trusting the builder's intent —
 * which is the only version of this check worth having.
 */

import { describe, expect, it } from 'vitest';

import {
  buildBarcodePayload,
  capSubject,
  readPayloadLabels,
} from '../../letters/barcode/payloadBuilder';
import {
  BARCODE_PAYLOAD_FIELD_IDS,
  getBarcodePayloadSpec,
} from '../../letters/registry/barcodeSpecs';

const INPUT = {
  issueDate: '2026-08-03',
  subject: 'طلب صيانة أرصفة شارع الخليج',
  reference: 'OL-2026-000042',
};

const SPEC = getBarcodePayloadSpec(1);

describe('the payload carries exactly three fields', () => {
  it('emits one line per approved field, in the spec’s order', () => {
    expect(buildBarcodePayload(INPUT)).toBe(
      'التاريخ: 2026-08-03\n' +
        'الموضوع: طلب صيانة أرصفة شارع الخليج\n' +
        'رقم المرجع: OL-2026-000042',
    );
  });

  it('emits three lines and no more', () => {
    expect(buildBarcodePayload(INPUT).split('\n')).toHaveLength(3);
    expect(readPayloadLabels(buildBarcodePayload(INPUT))).toEqual([
      'التاريخ',
      'الموضوع',
      'رقم المرجع',
    ]);
  });

  it('carries no document-type line', () => {
    // The ERP's form payloads open with a type label. This one must not: the approved
    // rule is three fields, and a type label is a fourth.
    expect(buildBarcodePayload(INPUT)).not.toContain('خطاب رسمي');
    expect(buildBarcodePayload(INPUT).startsWith('التاريخ:')).toBe(true);
  });

  it('discloses nothing about the recipient, the body, or the people involved', () => {
    // The forbidden list, checked against real values that would appear if any of
    // these ever leaked into the builder.
    const forbidden = [
      'أحمد', 'المستلم', 'recipient', 'body', 'محتوى',
      'signature', 'توقيع', 'stamp', 'ختم',
      'author', 'user', 'createdBy', 'id',
    ];
    const payload = buildBarcodePayload(INPUT);
    for (const term of forbidden) {
      expect(payload.toLowerCase(), term).not.toContain(term.toLowerCase());
    }
  });

  it('matches the registry’s declared field set exactly', () => {
    // The builder must not drift from the spec that governs it.
    expect([...SPEC.fields]).toEqual([...BARCODE_PAYLOAD_FIELD_IDS]);
    expect(SPEC.fields).toHaveLength(3);
  });
});

describe('the payload is stable and machine-safe', () => {
  it('is pure — identical input produces byte-identical output', () => {
    // What makes a reprint years later reproduce the code that was printed.
    expect(buildBarcodePayload(INPUT)).toBe(buildBarcodePayload({ ...INPUT }));
  });

  it('collapses a multi-line subject so it cannot split into two fields', () => {
    // A newline inside a value would silently become an extra line on decode.
    const payload = buildBarcodePayload({ ...INPUT, subject: 'طلب\nصيانة\t أرصفة' });
    expect(payload.split('\n')).toHaveLength(3);
    expect(payload).toContain('الموضوع: طلب صيانة أرصفة');
  });

  it('is human-readable Arabic, never JSON', () => {
    // Scanning used to surface raw `{"formType":...}` elsewhere in the ERP; repeating
    // that here would be a regression the user sees on their phone.
    const payload = buildBarcodePayload(INPUT);
    expect(payload.trimStart().startsWith('{')).toBe(false);
    expect(SPEC.humanReadable).toBe(true);
  });
});

describe('the subject is capped in the code, never on the page', () => {
  it('leaves a subject within the cap untouched', () => {
    expect(capSubject('طلب قصير', SPEC.subjectMaxChars)).toBe('طلب قصير');
  });

  it('truncates at the declared limit and marks the truncation', () => {
    const long = 'ط'.repeat(SPEC.subjectMaxChars + 40);
    const capped = capSubject(long, SPEC.subjectMaxChars);
    expect(capped.length).toBeLessThanOrEqual(SPEC.subjectMaxChars);
    // The ellipsis tells a reader the encoded subject is abridged rather than short.
    expect(capped.endsWith('…')).toBe(true);
  });

  it('caps the payload’s copy without the page ever being consulted', () => {
    const long = 'م'.repeat(200);
    const payload = buildBarcodePayload({ ...INPUT, subject: long });
    const subjectLine = payload.split('\n')[1];
    expect(subjectLine.length).toBeLessThan(long.length);
    expect(payload.split('\n')).toHaveLength(3);
  });
});

describe('versioning', () => {
  it('refuses an unknown barcode version rather than substituting one', () => {
    // A historical letter encoded under another version's rules would produce a code
    // that disagrees with the paper (INV-9).
    expect(() => buildBarcodePayload(INPUT, 99 as never)).toThrow(/Refusing to substitute/);
  });
});
