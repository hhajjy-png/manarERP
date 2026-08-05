// @vitest-environment jsdom
/**
 * Regression tests for "Forms QR Human-Readable Formatting Fix v1".
 *
 * Root cause fixed: FormQRCode previously encoded `JSON.stringify(data)` — a phone
 * camera/QR reader surfaced the raw `{"formType":"...","formNumber":"...",...}` text
 * verbatim instead of anything a human could read. The fix only changes how that
 * SAME QRData is formatted before being handed to the `qrcode` encoder — no field
 * was added, removed, or renamed on the QRData contract, and no call site changed.
 *
 * These tests pin down exactly that: same data in, no-JSON human text out, same
 * rendered QR image contract (size, alt, caption) as before.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { flushAsyncUpdates } from './helpers/flush';

const toDataURL = vi.fn().mockResolvedValue('data:image/png;base64,fake');

vi.mock('qrcode', () => ({
  default: { toDataURL: (...args: unknown[]) => toDataURL(...args) },
}));

import FormQRCode, { QRData } from '../forms/shared/FormQRCode';

afterEach(() => {
  vi.clearAllMocks();
});

/** Every formType this fix must cover — one entry per FormQRCode consumer in the app. */
const ALL_FORM_TYPES: Array<{ formType: string; expectedArabicLabel: string }> = [
  { formType: 'salary-certificate', expectedArabicLabel: 'شهادة راتب' },
  { formType: 'to-whom-it-may-concern', expectedArabicLabel: 'إلى من يهمه الأمر' },
  { formType: 'leave-request', expectedArabicLabel: 'طلب إجازة' },
  { formType: 'return-to-work', expectedArabicLabel: 'إشعار العودة إلى العمل' },
  { formType: 'salary-advance', expectedArabicLabel: 'طلب سلفة راتب' },
  { formType: 'resignation', expectedArabicLabel: 'طلب استقالة' },
  { formType: 'employee-warning', expectedArabicLabel: 'إنذار موظف' },
  { formType: 'performance-evaluation', expectedArabicLabel: 'تقييم أداء الموظف' },
  { formType: 'employment-contract', expectedArabicLabel: 'عقد عمل' },
  { formType: 'quotation', expectedArabicLabel: 'عرض سعر' },
  { formType: 'purchase-request', expectedArabicLabel: 'طلب شراء' },
  { formType: 'receipt-voucher', expectedArabicLabel: 'سند قبض' },
  { formType: 'payment-voucher', expectedArabicLabel: 'سند صرف' },
];

async function renderAndCapture(data: QRData): Promise<string> {
  render(<FormQRCode data={data} size={80} />);
  await flushAsyncUpdates();
  const [encodedText] = toDataURL.mock.calls[0];
  return encodedText as string;
}

describe('FormQRCode — human-readable formatting fix', () => {
  it.each(ALL_FORM_TYPES)(
    'encodes $formType as human-readable Arabic text, not JSON',
    async ({ formType, expectedArabicLabel }) => {
      const data: QRData = {
        formType,
        formNumber: 'F-2026-00123',
        entityName: 'محمد أحمد العتيبي',
        entityId: 184,
      };

      const encoded = await renderAndCapture(data);

      // No longer raw JSON — the exact complaint this fix resolves.
      expect(encoded.trim().startsWith('{')).toBe(false);
      expect(encoded).not.toMatch(/"formType"\s*:/);
      expect(encoded).not.toMatch(/"formNumber"\s*:/);
      expect(encoded).not.toMatch(/"entityName"\s*:/);

      // Same data, human-formatted: the approved Arabic label for this exact
      // formType (sourced from the form's own existing title text) appears,
      // and every field value survives byte-for-byte.
      expect(encoded).toContain(expectedArabicLabel);
      expect(encoded).toContain('F-2026-00123');
      expect(encoded).toContain('محمد أحمد العتيبي');
      expect(encoded).toContain('184');
    },
  );

  it('omits the reference-number line entirely when entityId is not provided (no field invented)', async () => {
    const data: QRData = {
      formType: 'quotation',
      formNumber: 'Q-2026-00099',
      entityName: 'شركة الخليج للمقاولات',
    };

    const encoded = await renderAndCapture(data);

    expect(encoded).toContain('عرض سعر');
    expect(encoded).toContain('Q-2026-00099');
    expect(encoded).toContain('شركة الخليج للمقاولات');
    expect(encoded).not.toMatch(/الرقم المرجعي/);
  });

  it('falls back to the raw formType string for an unmapped formType instead of dropping data', async () => {
    const data: QRData = {
      formType: 'future-form-type-not-yet-labeled',
      formNumber: 'X-1',
      entityName: 'اختبار',
    };

    const encoded = await renderAndCapture(data);

    expect(encoded).toContain('future-form-type-not-yet-labeled');
    expect(encoded).toContain('X-1');
    expect(encoded).toContain('اختبار');
  });

  it('preserves Arabic text as valid UTF-8 (no mojibake/escaping) in the encoded string', async () => {
    const data: QRData = {
      formType: 'salary-certificate',
      formNumber: 'F-2026-00456',
      entityName: 'عبدالله بن سعيد الرشيدي',
      entityId: 7,
    };

    const encoded = await renderAndCapture(data);

    // JSON.stringify would leave Arabic as literal UTF-8 too, so the real risk is
    // an encoding step (e.g. accidental \uXXXX escaping or Base64 wrapping) being
    // introduced by the formatting fix. Assert the raw Arabic codepoints are
    // present verbatim and no escape/encoding artifacts were added.
    expect(encoded).toContain('عبدالله بن سعيد الرشيدي');
    expect(encoded).not.toMatch(/\\u[0-9a-fA-F]{4}/);
    expect(encoded).not.toMatch(/^[A-Za-z0-9+/=]+$/); // not accidentally Base64-only
  });

  it('keeps the rendered QR image contract unchanged: same size, alt text, and formNumber caption', async () => {
    const data: QRData = {
      formType: 'employee-warning',
      formNumber: 'W-2026-00007',
      entityName: 'سالم فهد',
      entityId: 55,
    };

    render(<FormQRCode data={data} size={80} />);
    await flushAsyncUpdates();

    const img = await screen.findByAltText('QR Code');
    expect(img).toHaveAttribute('src', 'data:image/png;base64,fake');
    expect(img.style.width).toBe('80px');
    expect(img.style.height).toBe('80px');
    expect(screen.getByText('W-2026-00007')).toBeInTheDocument();
  });

  /**
   * Barcode Content Settings v1 — the two new optional fields, and the empty-reference
   * rule. The whole point of these is that they are ADDITIVE: the thirteen forms above
   * pass neither field and must encode exactly what they encoded before.
   */
  describe('operator-authored content (subject / details / empty reference)', () => {
    it('adds nothing at all when the new fields are absent — the existing forms are untouched', async () => {
      const base: QRData = {
        formType: 'salary-certificate',
        formNumber: 'F-2026-00123',
        entityName: 'محمد أحمد العتيبي',
        entityId: 184,
      };

      const encoded = await renderAndCapture(base);

      expect(encoded).toBe(
        ['شهادة راتب', 'رقم المستند: F-2026-00123', 'الاسم: محمد أحمد العتيبي', 'الرقم المرجعي: 184'].join('\n'),
      );
      expect(encoded).not.toMatch(/الموضوع/);
      expect(encoded).not.toMatch(/البيانات/);
    });

    it('encodes the subject and the free-text details when the operator typed them', async () => {
      const encoded = await renderAndCapture({
        formType: 'blank-a4-print',
        formNumber: 'MN-2026-00125',
        entityName: 'شركة المنار الدولية',
        subject: 'طلب تجديد إقامة',
        details: 'الإدارة المالية\nخاص وسري',
      });

      expect(encoded).toContain('MN-2026-00125');
      expect(encoded).toContain('الموضوع: طلب تجديد إقامة');
      // Multi-line detail text survives verbatim — what is scanned is what was typed.
      expect(encoded).toContain('البيانات:\nالإدارة المالية\nخاص وسري');
    });

    it('skips a label whose value is blank rather than printing a dangling one', async () => {
      const encoded = await renderAndCapture({
        formType: 'blank-a4-print',
        formNumber: '   ',
        entityName: 'شركة المنار الدولية',
        subject: '  ',
        details: '',
      });

      expect(encoded).not.toMatch(/رقم المستند/);
      expect(encoded).not.toMatch(/الموضوع/);
      expect(encoded).not.toMatch(/البيانات/);
      expect(encoded).toContain('الاسم: شركة المنار الدولية');
    });

    it('prints NO caption beneath the code when there is no reference — and invents none', async () => {
      render(
        <FormQRCode
          data={{ formType: 'blank-a4-print', formNumber: '', entityName: 'شركة المنار الدولية' }}
          size={80}
        />,
      );
      await flushAsyncUpdates();

      const img = await screen.findByAltText('QR Code');
      // The code itself still renders; only the caption line is absent.
      expect(img).toBeInTheDocument();
      expect(img.parentElement?.querySelector('span')).toBeNull();
      expect(img.parentElement?.textContent).toBe('');
    });

    it('prints the reference verbatim as the caption when there is one', async () => {
      render(
        <FormQRCode
          data={{ formType: 'blank-a4-print', formNumber: 'كتاب رقم 154/2026', entityName: 'شركة المنار الدولية' }}
          size={80}
        />,
      );
      await flushAsyncUpdates();

      expect(screen.getByText('كتاب رقم 154/2026')).toBeInTheDocument();
    });
  });

  it('passes the same qrcode.toDataURL rendering options as before (size*2 width, margin, colors)', async () => {
    const data: QRData = {
      formType: 'receipt-voucher',
      formNumber: 'RCV-2026-00001',
      entityName: 'أحمد يوسف',
    };

    render(<FormQRCode data={data} size={80} />);
    await flushAsyncUpdates();

    const [, options] = toDataURL.mock.calls[0];
    expect(options).toEqual({
      width: 160,
      margin: 1,
      color: { dark: '#1d4e6f', light: '#ffffff' },
    });
  });
});
