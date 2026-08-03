/**
 * Letter Engine — the registration snapshot.
 *
 * The snapshot is the fidelity guarantee: a reprint years from now must reproduce the
 * issued page exactly. Two properties carry that, and both are tested here.
 *
 *  · STRICT VALIDATION. A snapshot missing a field is worse than no snapshot at all —
 *    it looks like a guarantee and is not one. So every field is required and an
 *    unknown extra key is rejected rather than silently dropped, because an extra key
 *    is nearly always a renamed field whose real value is now absent.
 *
 *  · STABLE SERIALISATION. The same content must always produce the same bytes.
 *    Without that, an incidental key reordering makes an unchanged snapshot look
 *    modified to any future integrity check.
 */
import { describe, it, expect } from 'vitest';
import {
  type RegistrationSnapshot,
  parseStoredSnapshot,
  registrationSnapshotSchema,
  serialiseSnapshot,
  withAllocatedReference,
  PENDING_REFERENCE_TOKEN,
} from '../snapshot';

const VALID: RegistrationSnapshot = {
  blockTypography: {
    b1: { fontId: 'traditionalArabic', sizePt: 16, weight: 400, lineHeight: 1.35 },
    b2: { fontId: 'amiri', sizePt: 18, weight: 700, lineHeight: 1.35 },
  },
  issueDate: '2026-08-03',
  subject: 'طلب تمديد مدة العقد',
  barcodePayload: 'خطاب رسمي\nالتاريخ: 2026-08-03\nالموضوع: طلب تمديد مدة العقد\nرقم المرجع: OL-2026-000001',
  geometryMm: { reservedTopMm: 40, reservedBottomMm: 20, contentTopMm: 55, contentWidthMm: 160 },
  pageCount: 2,
  signature: { assetId: 'sig-1', name: 'المدير العام', imageUrl: 'data:image/png;base64,AAAA' },
  stamp: { assetId: 'stamp-1', name: 'ختم الشركة', imageUrl: 'data:image/png;base64,BBBB' },
};

describe('Snapshot validation — accepts a complete snapshot', () => {
  it('accepts the full shape', () => {
    expect(registrationSnapshotSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts an empty block map and a zero page count', () => {
    // A document with no blocks is structurally valid; refusing it here would make the
    // snapshot stricter than the model it describes.
    const empty = { ...VALID, blockTypography: {}, pageCount: 0 };
    expect(registrationSnapshotSchema.safeParse(empty).success).toBe(true);
  });

  it('accepts an empty subject and an empty barcode payload', () => {
    expect(registrationSnapshotSchema.safeParse({ ...VALID, subject: '', barcodePayload: '' }).success).toBe(true);
  });
});

describe('Snapshot validation — rejects an incomplete or unrecognised snapshot', () => {
  const REQUIRED_FIELDS: (keyof RegistrationSnapshot)[] = [
    'blockTypography',
    'issueDate',
    'subject',
    'barcodePayload',
    'geometryMm',
    'pageCount',
  ];

  for (const field of REQUIRED_FIELDS) {
    it(`rejects a snapshot missing \`${field}\``, () => {
      const partial = { ...VALID };
      delete (partial as Record<string, unknown>)[field];
      expect(registrationSnapshotSchema.safeParse(partial).success).toBe(false);
    });
  }

  it('rejects an unknown extra key rather than dropping it', () => {
    const extra = { ...VALID, pageCoubt: 2 };
    expect(registrationSnapshotSchema.safeParse(extra).success).toBe(false);
  });

  it('rejects an unknown key inside a block typography entry', () => {
    const extra = {
      ...VALID,
      blockTypography: { b1: { ...VALID.blockTypography.b1, colour: '#000' } },
    };
    expect(registrationSnapshotSchema.safeParse(extra).success).toBe(false);
  });

  it('rejects wrong types and impossible values', () => {
    expect(registrationSnapshotSchema.safeParse({ ...VALID, pageCount: -1 }).success).toBe(false);
    expect(registrationSnapshotSchema.safeParse({ ...VALID, pageCount: 1.5 }).success).toBe(false);
    expect(registrationSnapshotSchema.safeParse({ ...VALID, issueDate: '' }).success).toBe(false);
    expect(registrationSnapshotSchema.safeParse({ ...VALID, geometryMm: { a: 'x' } }).success).toBe(false);
    expect(
      registrationSnapshotSchema.safeParse({
        ...VALID,
        blockTypography: { b1: { fontId: '', sizePt: 16, weight: 400, lineHeight: 1.35 } },
      }).success,
    ).toBe(false);
  });

  it('rejects non-objects outright', () => {
    for (const value of [null, undefined, 'snapshot', 42, []]) {
      expect(registrationSnapshotSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('Serialisation is stable', () => {
  it('produces identical bytes for identical content regardless of key order', () => {
    const reordered: RegistrationSnapshot = {
      pageCount: VALID.pageCount,
      geometryMm: {
        contentWidthMm: 160,
        contentTopMm: 55,
        reservedBottomMm: 20,
        reservedTopMm: 40,
      },
      barcodePayload: VALID.barcodePayload,
      subject: VALID.subject,
      issueDate: VALID.issueDate,
      blockTypography: {
        b2: VALID.blockTypography.b2,
        b1: VALID.blockTypography.b1,
      },
      signature: VALID.signature,
      stamp: VALID.stamp,
    };
    expect(serialiseSnapshot(reordered)).toBe(serialiseSnapshot(VALID));
  });

  it('round-trips through storage without loss', () => {
    const parsed = parseStoredSnapshot(serialiseSnapshot(VALID));
    expect(parsed).toEqual(VALID);
  });

  it('preserves Arabic text and newlines in the barcode payload exactly', () => {
    // The payload must reproduce byte-for-byte on reprint; any normalisation here
    // would silently change what a scanned code says.
    const parsed = parseStoredSnapshot(serialiseSnapshot(VALID));
    expect(parsed?.barcodePayload).toBe(VALID.barcodePayload);
    expect(parsed?.barcodePayload.split('\n')).toHaveLength(4);
  });
});

describe('Parsing stored snapshots is forgiving where reading a letter is concerned', () => {
  it('returns null for absent data rather than throwing', () => {
    // A draft has no snapshot, and reading a draft must not fail because of it.
    expect(parseStoredSnapshot(null)).toBeNull();
    expect(parseStoredSnapshot(undefined)).toBeNull();
    expect(parseStoredSnapshot('')).toBeNull();
  });

  it('returns null for malformed or non-conforming stored data', () => {
    expect(parseStoredSnapshot('{not json')).toBeNull();
    expect(parseStoredSnapshot('{"pageCount":1}')).toBeNull();
    expect(parseStoredSnapshot('null')).toBeNull();
  });
});

describe('The server completes the one field the client cannot know', () => {
  it('substitutes the allocated reference into the payload', () => {
    // The number does not exist until registration creates it, so the client writes a
    // token and the server fills it in inside the same transaction.
    const pending: RegistrationSnapshot = {
      ...VALID,
      barcodePayload: `التاريخ: 2026-08-03\nالموضوع: س\nرقم المرجع: ${PENDING_REFERENCE_TOKEN}`,
    };
    const filled = withAllocatedReference(pending, 'OL-2026-000042');
    expect(filled.barcodePayload).toContain('رقم المرجع: OL-2026-000042');
    expect(filled.barcodePayload).not.toContain(PENDING_REFERENCE_TOKEN);
  });

  it('leaves every other field untouched', () => {
    // This is the ONLY value the backend may complete; everything else is the
    // renderer's and is stored verbatim.
    const pending: RegistrationSnapshot = { ...VALID, barcodePayload: PENDING_REFERENCE_TOKEN };
    const filled = withAllocatedReference(pending, 'OL-2026-000042');
    expect({ ...filled, barcodePayload: '' }).toEqual({ ...pending, barcodePayload: '' });
  });

  it('leaves a payload with no token exactly as it arrived', () => {
    expect(withAllocatedReference(VALID, 'OL-2026-000099')).toBe(VALID);
  });
});
