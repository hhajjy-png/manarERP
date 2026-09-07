// @vitest-environment jsdom
/**
 * Administrative Receipt Voucher — Company Letterhead Template v1.
 *
 * يتبع نفس النمط المعتمد في Payment Voucher Print Fix & Letterhead Template v1:
 * مبدّل «عادي / ورق الشركة» + ملف تعريف مستقل يقود `@page` + ورقة «محتوى فقط».
 *
 * ما تحرسه هذه الاختبارات:
 *   • القالب الجديد **إضافة لا استبدال**: «عادي» يبقى الافتراضي وبكامل عناصره.
 *   • ورق الشركة يُسقط ترويسة النموذج (الشعار واسم الشركة) وتذييله (الاعتماد +
 *     QR + خطّه) — ويُبقي عنوان السند وبياناته وتوقيع المُستلِم، فتلك محتوى السند
 *     لا أثاث الورقة.
 *   • ملف التعريف الجديد 50mm أعلى / 20mm أسفل / 15mm جانبيًا.
 *   • **لا انحدار على سند الصرف**: `payment-voucher-letterhead` كما هو (45/20/15/15)،
 *     و`contentOnly` ما تزال مطفأة افتراضيًا، ولا ملف تعريف قائم تغيّر.
 *
 * ما **لا** تدّعيه: عدد الصفحات وهندسة الصفحة الفعلية. قيست بـChromium نفسه
 * (`printToPDF` على A4 بهوامش كل ملف تعريف) لا في jsdom — فلا محرّك تخطيط هنا.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../api/client', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: { data: {} } }), post: vi.fn().mockResolvedValue({ data: { data: {} } }) },
  errorMessage: (e: unknown) => String(e),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../utils/print', () => ({ printCurrentView: vi.fn() }));
vi.mock('../printing', () => ({
  createPrintJob: vi.fn(),
  composeFromNode: vi.fn(() => '<html></html>'),
  isFlagEnabled: () => false,
  submitPrintJob: vi.fn(() => Promise.resolve()),
  PRINT_CENTER_FOUNDATION_V1: 'flag',
  RECEIPT_VOUCHER_PAGE_SPEC: {
    id: 'a4-portrait', labelAr: '', labelEn: '', paper: 'A4', orientation: 'portrait',
    margins: { top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' },
  },
  useAccurateFormPreview: () => ({ dialog: null, button: null }),
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1: 'flag2',
}));
vi.mock('../print-templates/hooks/useCompanyBranding', () => ({ useCompanyBranding: () => ({ ready: true, assets: [] }) }));
// تُستبدل الخطّافات وحدها؛ بقية صادرات كل وحدة تبقى أصلية لأن مكوّنات أخرى
// (ApprovalSection ← DesignableBrandingImage) تستوردها.
vi.mock('../print-templates/hooks/useBrandingSelection', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useBrandingSelection: () => ({ ready: false, showSignature: false, showStamp: false, signatureUrl: undefined, stampUrl: undefined }),
}));
vi.mock('../print-templates/hooks/useBrandingDesigner', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useBrandingDesigner: () => ({ isActive: false, activate: vi.fn(), deactivate: vi.fn() }),
}));
vi.mock('../print-templates/components/BrandingAssetPicker', () => ({ default: () => null }));
vi.mock('../print-templates/components/BrandingDesignerPanel', () => ({ default: () => null }));
// رمز QR يُولَّد من مكتبة خارجية غير مجدية هنا — المحروس وجوده من عدمه.
vi.mock('../forms/shared/FormQRCode', () => ({
  default: () => <img alt="QR Code" data-testid="qr-code" src="" />,
}));

import { PRINT_PROFILES, SELECTABLE_PROFILE_IDS } from '../forms/shared/printProfiles';
import FormPage from '../forms/shared/FormPage';
import ReceiptVoucher from '../pages/ReceiptVoucher';

afterEach(cleanup);

/** الجذر المطبوع لسند القبض — نفس العقدة التي تذهب إلى الطباعة و PDF. */
function sheet(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.rcv-preview');
  if (!el) throw new Error('.rcv-preview not found');
  return el as HTMLElement;
}
function sheetText(container: HTMLElement): string {
  return (sheet(container).textContent ?? '').replace(/\s+/g, ' ');
}
function toolbar(): ReturnType<typeof within> {
  return within(screen.getByRole('group', { name: 'الورقة' }));
}
function clickSheet(label: string) {
  fireEvent.click(toolbar().getByRole('button', { name: label }));
}
function switchToEnglish() {
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
}

// ── ١. ملف تعريف ورق الشركة لسند القبض ───────────────────────────────────────

describe('ملف تعريف «سند قبض — ورق الشركة الرسمي»', () => {
  const P = PRINT_PROFILES['receipt-voucher-letterhead'];

  it('(٩) يستعمل 50mm من الأعلى', () => {
    expect(P).toBeTruthy();
    expect(P.margins.top).toBe('50mm');
  });

  it('(١٠) يستعمل 20mm من الأسفل', () => {
    expect(P.margins.bottom).toBe('20mm');
  });

  it('(١١) الهوامش الجانبية بقيت 15mm — نفس قيمة سند القبض القائمة', () => {
    // قاعدة سند القبض القائمة: `@page { size: A4; margin: 12mm 15mm }` ⇒ جانبيًا 15mm.
    expect(P.margins.left).toBe('15mm');
    expect(P.margins.right).toBe('15mm');
    expect(P.margins.left).toBe(PRINT_PROFILES['receipt-voucher'].margins.left);
  });

  it('A4 عمودي، ومنطقة المحتوى الناتجة 227mm ارتفاعًا', () => {
    expect(P.page).toEqual({ size: 'A4', orientation: 'portrait' });
    const mm = (v: string) => Number(v.replace('mm', ''));
    expect(297 - mm(P.margins.top) - mm(P.margins.bottom)).toBe(227);
    expect(210 - mm(P.margins.left) - mm(P.margins.right)).toBe(180);
  });

  it('ورقة مطبوعة مسبقًا وغير قابلة للاختيار من أي نموذج آخر', () => {
    expect(P.blankHeader).toBe(true);
    expect(P.logoHeader).toBe(false);
    expect(P.selectable).toBe(false);
    expect(SELECTABLE_PROFILE_IDS).not.toContain('receipt-voucher-letterhead');
  });
});

// ── ٢. حماية سند الصرف وملفات التعريف القائمة ────────────────────────────────

describe('(١٦–١٨) لا انحدار على سند الصرف ولا على أي ملف تعريف قائم', () => {
  it('`payment-voucher-letterhead` ما زال 45mm أعلى / 20mm أسفل / 15mm جانبيًا', () => {
    expect(PRINT_PROFILES['payment-voucher-letterhead'].margins).toEqual({
      top: '45mm', right: '15mm', bottom: '20mm', left: '15mm',
    });
    expect(PRINT_PROFILES['payment-voucher-letterhead'].selectable).toBe(false);
    expect(PRINT_PROFILES['payment-voucher-letterhead'].blankHeader).toBe(true);
  });

  it('كل ملف تعريف قائم بهوامشه الأصلية حرفًا بحرف', () => {
    expect(PRINT_PROFILES['plain-a4'].margins).toEqual({ top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' });
    expect(PRINT_PROFILES['letterhead'].margins).toEqual({ top: '40mm', right: '10mm', bottom: '20mm', left: '10mm' });
    expect(PRINT_PROFILES['ready-paper'].margins).toEqual({ top: '40mm', right: '10mm', bottom: '20mm', left: '10mm' });
    expect(PRINT_PROFILES['payment-voucher'].margins).toEqual({ top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' });
    expect(PRINT_PROFILES['receipt-voucher'].margins).toEqual({ top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' });
  });

  it('قائمة القابل للاختيار لم تتّسع بالإضافتين', () => {
    expect(SELECTABLE_PROFILE_IDS).toEqual(['plain-a4', 'letterhead', 'ready-paper']);
  });

  it('`contentOnly` في FormPage ما تزال مطفأة افتراضيًا — سند الصرف بلا مساس', () => {
    const { container } = render(
      <FormPage
        lang="ar" padding="18px 32px" docFontStack="Cairo"
        formNumber="PV-2026-0001" title="" titleFontSize={22}
        qrData={{ formType: 'payment-voucher', formNumber: 'PV-2026-0001', entityName: 'x' }}
        header={<div data-testid="hdr" />}
      >
        <div data-testid="body" />
      </FormPage>,
    );
    expect(screen.getByText('PV-2026-0001')).toBeInTheDocument();
    expect(container.querySelector('.form-page-footer')).not.toBeNull();
    expect(screen.getByTestId('hdr')).toBeInTheDocument();
  });
});

// ── ٣. المبدّل والقالب العادي ────────────────────────────────────────────────

describe('سند القبض — مبدّل الورقة', () => {
  it('(١) يعرض خيار «ورق الشركة» إلى جانب «عادي»', () => {
    render(<ReceiptVoucher />);
    expect(toolbar().getByRole('button', { name: 'عادي' })).toBeInTheDocument();
    expect(toolbar().getByRole('button', { name: 'ورق الشركة' })).toBeInTheDocument();
  });

  it('(٢) «عادي» هو الافتراضي عند فتح الصفحة', () => {
    render(<ReceiptVoucher />);
    expect(toolbar().getByRole('button', { name: 'عادي' })).toHaveAttribute('aria-pressed', 'true');
    expect(toolbar().getByRole('button', { name: 'ورق الشركة' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('(٣) القالب العادي كما هو: ترويسة الشعار + كتلة رقم السند + التذييل + QR', () => {
    const { container } = render(<ReceiptVoucher />);
    const s = sheet(container);
    expect(s.querySelector('img[alt="QR Code"]')).not.toBeNull();
    // ترويسة الشركة: صورة الشعار داخل الجذر المطبوع.
    expect(s.querySelectorAll('img').length).toBeGreaterThan(1);
    // كتلة الاعتماد في التذييل.
    expect(sheetText(container)).toContain('اعتماد');
  });
});

// ── ٤. قالب ورق الشركة ───────────────────────────────────────────────────────

describe('سند القبض — قالب ورق الشركة', () => {
  it('(٤) لا يعرض ترويسة النموذج: لا شعار ولا اسم شركة داخل الجذر المطبوع', () => {
    const { container } = render(<ReceiptVoucher />);
    clickSheet('ورق الشركة');
    const s = sheet(container);
    expect(s.querySelector('img[alt="QR Code"]')).toBeNull();
    // لا صورة إطلاقًا داخل الورقة ⇒ لا شعار.
    expect(s.querySelectorAll('img').length).toBe(0);
    expect(sheetText(container)).not.toContain('ALAMANAR');
  });

  it('(٥) لا يعرض التذييل: لا كتلة اعتماد ولا خطّها', () => {
    const { container } = render(<ReceiptVoucher />);
    clickSheet('ورق الشركة');
    expect(sheetText(container)).not.toContain('اعتماد');
  });

  it('(٦) رمز QR الخاص بالتذييل غير موجود', () => {
    const { container } = render(<ReceiptVoucher />);
    clickSheet('ورق الشركة');
    expect(within(sheet(container)).queryByTestId('qr-code')).toBeNull();
  });

  it('(٧) محتوى سند القبض موجود كاملًا: الحقول والمبالغ وطريقة الدفع والبيان', () => {
    const { container } = render(<ReceiptVoucher />);
    clickSheet('ورق الشركة');
    const txt = sheetText(container);
    // ألفاظ الحقول كما هي في `ReceiptVoucherTemplate` حرفيًا.
    for (const field of [
      'رقم السند', 'التاريخ', 'استلمنا من السيد', 'المبلغ ( رقماً )', 'المبلغ ( كتابةً )',
      'وذلك عن', 'نقداً', 'شيك', 'تحويل', 'رقم الشيك / البنك:',
    ]) {
      expect(txt).toContain(field);
    }
  });

  it('(٨) عنوان سند القبض نفسه باقٍ — بالعربية والإنجليزية', () => {
    const { container } = render(<ReceiptVoucher />);
    clickSheet('ورق الشركة');
    const txt = sheetText(container);
    expect(txt).toContain('سند قبض');
    expect(txt).toContain('RECEIPT VOUCHER');
  });

  it('توقيع المُستلِم باقٍ — جزء من محتوى السند لا من تذييل الورقة', () => {
    const { container } = render(<ReceiptVoucher />);
    clickSheet('ورق الشركة');
    expect(sheetText(container)).toContain('المُستلِم');
  });

  it('(١٣) يعمل بالعربية', () => {
    const { container } = render(<ReceiptVoucher />);
    clickSheet('ورق الشركة');
    expect(sheet(container)).toBeInTheDocument();
    expect(sheetText(container)).toContain('سند قبض');
    expect(sheet(container).querySelectorAll('img').length).toBe(0);
  });

  it('(١٤) يعمل بالإنجليزية — الترويسة والتذييل غائبان في اللغتين', () => {
    const { container } = render(<ReceiptVoucher />);
    switchToEnglish();
    clickSheet('ورق الشركة');
    const s = sheet(container);
    expect(s.querySelectorAll('img').length).toBe(0);
    expect(within(s).queryByTestId('qr-code')).toBeNull();
    expect(sheetText(container)).toContain('RECEIPT VOUCHER');
  });

  it('(١٥) الرجوع إلى «عادي» يعيد القالب الأصلي بالكامل', () => {
    const { container } = render(<ReceiptVoucher />);
    clickSheet('ورق الشركة');
    expect(sheet(container).querySelectorAll('img').length).toBe(0);

    clickSheet('عادي');
    const s = sheet(container);
    expect(s.querySelector('img[alt="QR Code"]')).not.toBeNull();
    expect(s.querySelectorAll('img').length).toBeGreaterThan(1);
    expect(sheetText(container)).toContain('اعتماد');
    expect(toolbar().getByRole('button', { name: 'عادي' })).toHaveAttribute('aria-pressed', 'true');
  });
});
