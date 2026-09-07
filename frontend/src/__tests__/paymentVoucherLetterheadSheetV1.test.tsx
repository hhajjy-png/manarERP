// @vitest-environment jsdom
/**
 * Payment Voucher — Print Fix + Letterhead Template v1.
 *
 * ما تحرسه هذه الاختبارات:
 *   • القالب الجديد خيار **مستقل** إلى جانب القالب القائم — لا بديل عنه: الافتراضي
 *     يبقى الورقة العادية بملف تعريفها `payment-voucher` وترويستها.
 *   • ملف تعريف ورق الشركة يحمل نطاق المحتوى المطلوب حرفيًا (45mm من الأعلى،
 *     20mm من الأسفل، وهامشان جانبيان 15mm كما هما)، وغير قابل للاختيار من أي
 *     نموذج آخر.
 *   • `contentOnly` يُسقط كتلة العنوان والتذييل (الاعتماد + QR) — ومطفأة افتراضيًا
 *     فلا يتأثر أي نموذج قائم.
 *   • أي ملف تعريف قائم لم يتغيّر (حارس انحدار على `PRINT_PROFILES`).
 *
 * ما **لا** تدّعيه: عدد الصفحات المطبوعة. ذاك قيس بـChromium نفسه
 * (`printToPDF` على A4 بهوامش كل ملف تعريف) لا في jsdom — فلا محرّك تخطيط هنا.
 */
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));

/** آخر الخصائص التي وصلت إلى `FormLayout` — هي عقد الصفحة مع طبقة الطباعة. */
let captured: Record<string, unknown> = {};
vi.mock('../forms/shared/FormLayout', () => ({
  default: (props: { children?: ReactNode; toolbarExtra?: ReactNode }) => {
    captured = props as Record<string, unknown>;
    return (
      <div data-testid="form-layout-stub">
        <div data-testid="toolbar">{props.toolbarExtra}</div>
        {props.children}
      </div>
    );
  },
}));

// رمز QR يرسم على canvas — لا قيمة له هنا، والمحروس هو وجوده من عدمه.
vi.mock('../forms/shared/FormQRCode', () => ({
  default: () => <div data-testid="qr-code" />,
}));

import { PRINT_PROFILES, SELECTABLE_PROFILE_IDS } from '../forms/shared/printProfiles';
import FormPage from '../forms/shared/FormPage';
import AdminPaymentVoucher from '../pages/AdminPaymentVoucher';

afterEach(cleanup);

function renderPage() {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/forms/payment-voucher']}>
      <Routes>
        <Route path="/forms/payment-voucher" element={<AdminPaymentVoucher />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── ١. ملف تعريف ورق الشركة ──────────────────────────────────────────────────

describe('ملف تعريف «سند صرف — ورق الشركة الرسمي»', () => {
  const P = PRINT_PROFILES['payment-voucher-letterhead'];

  it('موجود بنطاق المحتوى المطلوب: 45mm أعلى و20mm أسفل', () => {
    expect(P).toBeTruthy();
    expect(P.margins.top).toBe('45mm');
    expect(P.margins.bottom).toBe('20mm');
  });

  it('يبقي الهامشين الجانبيين كما هما في سند الصرف القائم (15mm)', () => {
    expect(P.margins.left).toBe(PRINT_PROFILES['payment-voucher'].margins.left);
    expect(P.margins.right).toBe(PRINT_PROFILES['payment-voucher'].margins.right);
    expect(P.margins.left).toBe('15mm');
  });

  it('يخفي ترويسة الشركة — الورقة الفعلية تحملها مطبوعة', () => {
    expect(P.blankHeader).toBe(true);
    expect(P.logoHeader).toBe(false); // لا شعار مرسوم فوق شعار مطبوع
  });

  it('غير قابل للاختيار — لا يظهر في مبدّل ملفات التعريف لأي نموذج آخر', () => {
    expect(P.selectable).toBe(false);
    expect(SELECTABLE_PROFILE_IDS).not.toContain('payment-voucher-letterhead');
  });

  it('A4 عمودي، ونطاق المحتوى الناتج 232mm ارتفاعًا', () => {
    expect(P.page).toEqual({ size: 'A4', orientation: 'portrait' });
    const mm = (v: string) => Number(v.replace('mm', ''));
    expect(297 - mm(P.margins.top) - mm(P.margins.bottom)).toBe(232);
  });
});

describe('حارس انحدار: ملفات التعريف القائمة لم تتغيّر', () => {
  it('سند الصرف العادي وملفات الشركة العامة بهوامشها الأصلية', () => {
    expect(PRINT_PROFILES['payment-voucher'].margins).toEqual({ top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' });
    expect(PRINT_PROFILES['receipt-voucher'].margins).toEqual({ top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' });
    expect(PRINT_PROFILES['plain-a4'].margins).toEqual({ top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' });
    expect(PRINT_PROFILES['letterhead'].margins).toEqual({ top: '40mm', right: '10mm', bottom: '20mm', left: '10mm' });
    expect(PRINT_PROFILES['ready-paper'].margins).toEqual({ top: '40mm', right: '10mm', bottom: '20mm', left: '10mm' });
  });

  it('قائمة القابل للاختيار كما كانت — الإضافة لم تُوسّعها', () => {
    expect(SELECTABLE_PROFILE_IDS).toEqual(['plain-a4', 'letterhead', 'ready-paper']);
  });
});

// ── ٢. ورقة «محتوى فقط» ──────────────────────────────────────────────────────

describe('FormPage — contentOnly', () => {
  const base = {
    lang: 'ar' as const,
    padding: '18px 32px',
    docFontStack: 'Cairo',
    formNumber: 'PV-2026-0001',
    title: '',
    titleFontSize: 22,
    qrData: { formType: 'payment-voucher', formNumber: 'PV-2026-0001', entityName: 'اختبار' },
  };

  it('مطفأة افتراضيًا: كتلة رقم النموذج والتذييل ورمز QR كما هي — لا نموذج قائم يتأثر', () => {
    const { container } = render(
      <FormPage {...base} header={<div data-testid="hdr" />}>
        <div data-testid="body" />
      </FormPage>,
    );
    expect(screen.getByText('PV-2026-0001')).toBeInTheDocument();
    expect(container.querySelector('.form-page-footer')).not.toBeNull();
    expect(screen.getByTestId('qr-code')).toBeInTheDocument();
    expect(screen.getByTestId('hdr')).toBeInTheDocument();
  });

  it('مفعّلة: لا كتلة عنوان ولا تذييل ولا رمز QR — يبقى محتوى النموذج وحده', () => {
    const { container } = render(
      <FormPage {...base} contentOnly header={<div data-testid="hdr" />}>
        <div data-testid="body" />
      </FormPage>,
    );
    expect(screen.queryByText('PV-2026-0001')).toBeNull();
    expect(container.querySelector('.form-page-footer')).toBeNull();
    expect(screen.queryByTestId('qr-code')).toBeNull();
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });
});

// ── ٣. المبدّل في صفحة سند الصرف ─────────────────────────────────────────────

describe('AdminPaymentVoucher — اختيار الورقة', () => {
  it('يعرض الخيارين معًا: العادي وورق الشركة', () => {
    renderPage();
    const toolbar = within(screen.getByTestId('toolbar'));
    expect(toolbar.getByRole('button', { name: 'عادي' })).toBeInTheDocument();
    expect(toolbar.getByRole('button', { name: 'ورق الشركة' })).toBeInTheDocument();
  });

  it('الافتراضي هو القالب القائم — بملفه وترويسته ومحتواه الكامل', () => {
    renderPage();
    expect(captured.profile).toBe('payment-voucher');
    expect(captured.useLogoHeader).toBe(true);
    expect(captured.contentOnly).toBe(false);
    expect(captured.compactTopMargin).toBe(true);
  });

  it('الفاصل العلوي للورقة العادية 1cm — إصلاح فيضان الصفحة الثانية', () => {
    renderPage();
    // كان 2cm: قياسٌ فعليّ عبر Chromium أعطى 283.94mm بالإنجليزية مقابل 280mm
    // متاحة (فيضان 3.94mm ⇒ صفحتان). 1cm يعيده إلى 273.93mm ⇒ صفحة واحدة.
    expect(captured.contentTopOffset).toBe('1cm');
  });

  it('اختيار ورق الشركة يبدّل الملف ويُسقط الترويسة والتذييل والفاصل العلوي', () => {
    renderPage();
    fireEvent.click(within(screen.getByTestId('toolbar')).getByRole('button', { name: 'ورق الشركة' }));

    expect(captured.profile).toBe('payment-voucher-letterhead');
    expect(captured.contentOnly).toBe(true);
    expect(captured.useLogoHeader).toBe(false);
    // هامش الصفحة (45mm) وحده يحدّد بداية المحتوى — أي فاصل هنا يزيحها عن الرقم.
    expect(captured.contentTopOffset).toBeUndefined();
    expect(captured.compactTopMargin).toBe(false);
  });

  it('العودة إلى العادي تستعيد القالب القائم بالكامل — الجديد إضافة لا استبدال', () => {
    renderPage();
    const toolbar = within(screen.getByTestId('toolbar'));
    fireEvent.click(toolbar.getByRole('button', { name: 'ورق الشركة' }));
    fireEvent.click(toolbar.getByRole('button', { name: 'عادي' }));

    expect(captured.profile).toBe('payment-voucher');
    expect(captured.useLogoHeader).toBe(true);
    expect(captured.contentOnly).toBe(false);
    expect(captured.contentTopOffset).toBe('1cm');
  });

  it('لا يمسّ بيانات السند ولا منطقه: لا نداء شبكة من الصفحة', async () => {
    const { api } = await import('../api/client');
    renderPage();
    fireEvent.click(within(screen.getByTestId('toolbar')).getByRole('button', { name: 'ورق الشركة' }));
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
