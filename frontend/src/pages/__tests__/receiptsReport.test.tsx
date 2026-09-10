// @vitest-environment jsdom
/**
 * تقرير المقبوضات داخل «التقارير الشاملة» — عقود الواجهة.
 *
 * ما تحرسه هذه المجموعة هو اندماج التقرير في المركز القائم لا مظهره: أنه مسجَّل
 * ويُفتح كبقيّة التقارير، وأن فلاتره تصل الطلب بأسمائها الصحيحة، وأن اختصارات
 * الفترة تستعمل نفس المساعد المشترك مع صفحة المقبوضات، وأن الجدول يعرض التسميات
 * العربية لا الرموز الداخلية.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from '../../__tests__/helpers/router';

const getMock = vi.fn();
vi.mock('../../api/client', () => ({
  api: {
    get: (...a: unknown[]) => getMock(...a),
    post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('../../stores/authStore', () => ({
  useAuth: () => ({ hasPermission: () => true, isSystemAdmin: () => true, user: { id: 1, username: 'tester', fullName: 'tester' } }),
}));

import Reports from '../Reports';
import { FinancialPeriodProvider } from '../../context/FinancialPeriodContext';
import { presetRange } from '../../lib/receiptPeriods';

/* ── استجابة تقرير واقعية (نفس عقد `ReportInput`) ────────────────────────── */

const REPORT = {
  title: 'تقرير المقبوضات',
  subtitle: 'من 01/09/2026 إلى 30/09/2026 · عدد العمليات: 3 · إجمالي المقبوضات: 26,500.000 KWD',
  kpis: [
    { label: 'إجمالي المقبوضات', value: 26500, format: 'currency', color: 'blue' },
    { label: 'عدد عمليات القبض', value: 3 },
    { label: 'النقدي', value: 3000, format: 'currency', hint: '1 عملية' },
    { label: 'الشيكات', value: 15000, format: 'currency', hint: '1 عملية' },
    { label: 'التحويلات البنكية', value: 8500, format: 'currency', hint: '1 عملية' },
  ],
  columns: [
    { header: 'م', key: 'seq', align: 'center' },
    { header: 'تاريخ القبض', key: 'date', align: 'center' },
    { header: 'العميل', key: 'customer' },
    { header: 'رقم الفاتورة', key: 'invoiceNumber' },
    { header: 'وسيلة القبض', key: 'method', align: 'center' },
    { header: 'المرجع', key: 'reference' },
    { header: 'حالة سداد الفاتورة', key: 'invoiceStatus', align: 'center' },
    { header: 'المبلغ', key: 'amount', format: 'currency' },
    { header: 'قيمة الشيك الأصلية', key: 'originalChequeAmount', format: 'currency' },
  ],
  rows: [
    // الشيك 004212 مسجَّل تحصيلين (15,000 هنا + 5,000 خارج الفلتر) ⇒ قيمته الأصلية 20,000.
    { seq: 1, date: '09/09/2026', customer: 'وزارة الأشغال', invoiceNumber: 'MN-INV-2026-0220', method: 'شيك', reference: '004212', invoiceStatus: 'مسددة بالكامل', amount: 15000, originalChequeAmount: 20000 },
    { seq: 2, date: '07/09/2026', customer: 'بلدية الكويت', invoiceNumber: 'MN-INV-2026-0148', method: 'حوالة بنكية', reference: '0409TR8821', invoiceStatus: 'عليها رصيد', amount: 8500, originalChequeAmount: '—' },
    { seq: 3, date: '02/09/2026', customer: 'وزارة الأشغال', invoiceNumber: 'MN-INV-2026-0178', method: 'نقدي', reference: 'أحمد المطيري', invoiceStatus: 'عليها رصيد', amount: 3000, originalChequeAmount: '—' },
  ],
  totalsRow: { date: 'الإجمالي', amount: 26500 },
};

function route(opts: { report?: unknown; fail?: boolean } = {}) {
  getMock.mockImplementation(async (url: string) => {
    if (url.startsWith('/reports/')) {
      if (opts.fail) throw new Error('تعذّر تحميل التقرير');
      return { data: { data: opts.report ?? REPORT } };
    }
    if (url === '/customers') return { data: { data: { data: [{ id: 3, name: 'وزارة الأشغال' }, { id: 4, name: 'بلدية الكويت' }] } } };
    if (url === '/employees') return { data: { data: { data: [] } } };
    return { data: { data: { data: [] } } };
  });
}

const renderPage = () =>
  render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <FinancialPeriodProvider>
        <Reports />
      </FinancialPeriodProvider>
    </MemoryRouter>,
  );

/** نداءات نقطة التقرير مع معطياتها. */
const reportCalls = () =>
  getMock.mock.calls
    .filter((c) => typeof c[0] === 'string' && (c[0] as string).startsWith('/reports/'))
    .map((c) => ({ url: c[0] as string, params: ((c[1] as { params?: Record<string, unknown> })?.params) ?? {} }));

const lastReportCall = () => reportCalls().at(-1)!;

/** يفتح لوحة تقرير المقبوضات ثم يشغّله. */
async function openReceiptsReport() {
  const card = await screen.findByText('المقبوضات');
  fireEvent.click(card);
  const run = await screen.findByText('تشغيل التقرير');
  fireEvent.click(run);
  await waitFor(() => expect(reportCalls().length).toBeGreaterThan(0));
}

beforeEach(() => {
  getMock.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  route();
});

/* ── ١) التسجيل والفتح ──────────────────────────────────────────────────── */

describe('التسجيل في مركز التقارير', () => {
  it('التقرير مُدرَج باسم «المقبوضات»', async () => {
    renderPage();
    expect(await screen.findByText('المقبوضات')).toBeTruthy();
  });

  it('يُفتح كبقيّة التقارير — لوحة فيها الوصف والفلاتر وزرّ التشغيل', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('المقبوضات'));
    expect(await screen.findByText('تشغيل التقرير')).toBeTruthy();
    // الوصف يظهر على البطاقة وداخل اللوحة معًا — كلاهما مقصود.
    expect(screen.getAllByText(/كشف تفصيلي بكل ما قُبض من العملاء/).length).toBeGreaterThan(0);
  });

  it('يستدعي نقطة `/reports/receipts/preview` القياسية — لا نقطة خاصة', async () => {
    renderPage();
    await openReceiptsReport();
    expect(lastReportCall().url).toBe('/reports/receipts/preview');
  });

  it('لا يُنشئ عنصرًا في الشريط الجانبي — التقارير تُفتح من المركز وحده', async () => {
    const modules = await import('../../config/modules');
    const navKeys = modules.NAV.flatMap((g) => g.items.map((i) => i.key));
    expect(navKeys).not.toContain('receipts-report');
    expect(navKeys.filter((k) => k === 'receipts')).toHaveLength(1); // صفحة المقبوضات وحدها
  });
});

/* ── ٢) الفلاتر ─────────────────────────────────────────────────────────── */

describe('الفلاتر', () => {
  it('تعرض التاريخ والعميل ووسيلة القبض وحالة سداد الفاتورة', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('المقبوضات'));
    await screen.findByText('تشغيل التقرير');

    expect(screen.getByLabelText('من تاريخ')).toBeTruthy();
    expect(screen.getByLabelText('إلى تاريخ')).toBeTruthy();
    expect(screen.getByLabelText('العميل')).toBeTruthy();
    expect(screen.getByLabelText('وسيلة القبض')).toBeTruthy();
    expect(screen.getByLabelText('حالة سداد الفاتورة')).toBeTruthy();
  });

  it('قائمة الوسائل تحمل القيم المخزَّنة الأربع وحدها — لا KNET ولا POS', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('المقبوضات'));
    const select = await screen.findByLabelText('وسيلة القبض');
    const values = Array.from(select.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['', 'CASH', 'BANK', 'CHEQUE', 'TRANSFER']);
    const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(labels).toContain('نقدي');
    expect(labels).toContain('شيك');
    expect(labels).toContain('تحويل بنكي');
    expect(labels).toContain('حوالة بنكية');
    expect(labels.join(' ')).not.toContain('KNET');
  });

  it('قائمة الحالة هي حالة **سداد الفاتورة** — لا حالة شيك', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('المقبوضات'));
    const select = await screen.findByLabelText('حالة سداد الفاتورة');
    const values = Array.from(select.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['', 'PAID', 'PARTIAL']);
    expect(screen.queryByLabelText('حالة الشيك')).toBeNull();
    const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent ?? '');
    expect(labels.some((l) => /مرتجع|مودع|محصَّل/.test(l))).toBe(false);
  });

  it('وسيلة القبض تصل الطلب بالرمز المخزَّن لا بالنص العربي', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('المقبوضات'));
    fireEvent.change(await screen.findByLabelText('وسيلة القبض'), { target: { value: 'CHEQUE' } });
    fireEvent.click(screen.getByText('تشغيل التقرير'));
    await waitFor(() => expect(lastReportCall().params.method).toBe('CHEQUE'));
  });

  it('حالة سداد الفاتورة تصل الطلب باسم `status` (اتفاقية مركز التقارير)', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('المقبوضات'));
    fireEvent.change(await screen.findByLabelText('حالة سداد الفاتورة'), { target: { value: 'PARTIAL' } });
    fireEvent.click(screen.getByText('تشغيل التقرير'));
    await waitFor(() => expect(lastReportCall().params.status).toBe('PARTIAL'));
  });

  it('فلتر العميل يصل الطلب بالمعرّف', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('المقبوضات'));
    fireEvent.change(await screen.findByLabelText('العميل'), { target: { value: '3' } });
    fireEvent.click(screen.getByText('تشغيل التقرير'));
    await waitFor(() => expect(lastReportCall().params.customerId).toBe('3'));
  });

  it('اختصارات الفترة تستعمل **نفس** المساعد المشترك مع صفحة المقبوضات', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('المقبوضات'));
    fireEvent.click(await screen.findByText('الشهر السابق'));
    fireEvent.click(screen.getByText('تشغيل التقرير'));

    const expected = presetRange('previous-month');
    await waitFor(() => {
      const p = lastReportCall().params;
      expect(p.from).toBe(expected.from);
      expect(p.to).toBe(expected.to);
    });
  });

  it('«هذا الشهر» في التقرير يطابق «هذا الشهر» في الصفحة حرفيًا', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('المقبوضات'));
    fireEvent.click(await screen.findByText('هذا الشهر'));
    fireEvent.click(screen.getByText('تشغيل التقرير'));

    const expected = presetRange('this-month');
    await waitFor(() => {
      const p = lastReportCall().params;
      expect(p.from).toBe(expected.from);
      expect(p.to).toBe(expected.to);
    });
  });

  it('إعادة الضبط تمسح وسيلة القبض والحالة والتاريخ', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('المقبوضات'));
    fireEvent.change(await screen.findByLabelText('وسيلة القبض'), { target: { value: 'CASH' } });
    fireEvent.click(screen.getByText('تشغيل التقرير'));
    await waitFor(() => expect(lastReportCall().params.method).toBe('CASH'));

    // تشغيل التقرير يُغلق اللوحة، وشريط النتائج يحمل زرّ إعادة الضبط.
    fireEvent.click(await screen.findByText('مسح التصفية'));
    fireEvent.click(screen.getAllByText(/عرض التقرير/)[0]);
    await waitFor(() => {
      const p = lastReportCall().params;
      expect(p.method).toBeUndefined();
      expect(p.status).toBeUndefined();
      expect(p.from).toBeUndefined();
    });
  });
});

/* ── ٣) النتائج ─────────────────────────────────────────────────────────── */

describe('عرض النتائج', () => {
  it('يعرض السطر الوصفي للتقرير بنطاقه وإجماليه', async () => {
    // العنوان («تقرير المقبوضات») يخصّ الطباعة و PDF و Excel؛ صفحة المركز تعرض
    // السطر الوصفي وبطاقة التقرير — وهو سلوك المركز القائم لكل التقارير.
    renderPage();
    await openReceiptsReport();
    expect(await screen.findByText(/من 01\/09\/2026 إلى 30\/09\/2026/)).toBeTruthy();
    expect(screen.getByText(/إجمالي المقبوضات: 26,500.000/)).toBeTruthy();
  });

  it('يعرض صفًّا لكل عملية قبض بتسمياتها العربية', async () => {
    renderPage();
    await openReceiptsReport();
    const table = (await screen.findAllByRole('table'))[0];
    expect(within(table).getByText('MN-INV-2026-0220')).toBeTruthy();
    expect(within(table).getAllByText('شيك').length).toBeGreaterThan(0);
    expect(within(table).getByText('أحمد المطيري')).toBeTruthy();
    // لا رموز داخلية في المعروض.
    expect(within(table).queryByText('CHEQUE')).toBeNull();
  });

  it('يعرض بطاقات الملخّص بما فيها التحويلات البنكية المجمَّعة', async () => {
    renderPage();
    await openReceiptsReport();
    expect(await screen.findByText('التحويلات البنكية')).toBeTruthy();
    expect(screen.getByText('النقدي')).toBeTruthy();
    expect(screen.getByText('الشيكات')).toBeTruthy();
  });

  it('لا قسم «التوزيع حسب وسيلة القبض» ولا بطاقة «متوسط قيمة العملية»', async () => {
    renderPage();
    await openReceiptsReport();
    await screen.findByText('التحويلات البنكية');
    expect(screen.queryByText('التوزيع حسب وسيلة القبض')).toBeNull();
    expect(screen.queryByText('متوسط قيمة العملية')).toBeNull();
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });

  it('عمود «قيمة الشيك الأصلية» بالدينار، و«—» لغير الشيك', async () => {
    renderPage();
    await openReceiptsReport();
    const table = (await screen.findAllByRole('table'))[0];
    // نصّ الرأس وحده — دون أيقونة الفرز المجاورة.
    const headers = Array.from(table.querySelectorAll('thead th .rcx-sort-btn > span:first-child')).map((s) => s.textContent);
    expect(headers.at(-1)).toBe('قيمة الشيك الأصلية (KWD)');

    const lastCells = Array.from(table.querySelectorAll('tbody tr:not(.rcx-totals-row) td:last-child')).map((td) => td.textContent);
    expect(lastCells).toEqual(['20,000.000', '—', '—']);
    // المرجع لم يتغيّر.
    expect(within(table).getByText('004212')).toBeTruthy();
  });

  it('صفّ المجاميع لا يجمع «قيمة الشيك الأصلية» — ولا أثناء البحث السريع', async () => {
    renderPage();
    await openReceiptsReport();
    const table = (await screen.findAllByRole('table'))[0];
    const totalsLast = () => table.querySelector('tr.rcx-totals-row td:last-child')!.textContent;
    expect(totalsLast()).toBe('');

    fireEvent.change(screen.getByPlaceholderText('بحث سريع داخل النتائج…'), { target: { value: 'وزارة' } });
    await screen.findByText('إجمالي نتائج البحث');
    expect(totalsLast()).toBe('');
    // عمود «المبلغ» ما زال يُعاد جمعه من الصفوف الظاهرة: 15,000 + 3,000.
    const totalsCells = Array.from(table.querySelectorAll('tr.rcx-totals-row td')).map((td) => td.textContent);
    expect(totalsCells.at(-2)).toBe('18,000.000');
  });

  it('حالة فارغة عند غياب النتائج', async () => {
    route({ report: { ...REPORT, rows: [], totalsRow: undefined } });
    renderPage();
    await openReceiptsReport();
    await waitFor(() => expect(reportCalls().length).toBeGreaterThan(0));
    expect(screen.queryByText('MN-INV-2026-0220')).toBeNull();
  });

  it('حالة خطأ برسالة عربية', async () => {
    route({ fail: true });
    renderPage();
    await openReceiptsReport();
    expect(await screen.findByText(/تعذّر تحميل التقرير/)).toBeTruthy();
  });
});

/* ── ٤) التصدير والطباعة ────────────────────────────────────────────────── */

describe('التصدير والطباعة يرثان بنية المركز', () => {
  it('تظهر أزرار Excel والطباعة في قائمة التصدير بعد التشغيل', async () => {
    renderPage();
    await openReceiptsReport();
    fireEvent.click(await screen.findByText('تصدير'));
    expect(await screen.findByText('Excel')).toBeTruthy();
    expect(screen.getByText('طباعة')).toBeTruthy();
  });

  it('التصدير يحمل **نفس** فلاتر العرض — لا صفحة ولا حدّ', async () => {
    renderPage();
    fireEvent.click(await screen.findByText('المقبوضات'));
    fireEvent.change(await screen.findByLabelText('وسيلة القبض'), { target: { value: 'CHEQUE' } });
    fireEvent.click(screen.getByText('تشغيل التقرير'));
    await waitFor(() => expect(lastReportCall().params.method).toBe('CHEQUE'));

    fireEvent.click(await screen.findByText('تصدير'));
    fireEvent.click(await screen.findByText('Excel'));
    await waitFor(() => {
      const exportCall = reportCalls().find((c) => c.url.includes('/export'));
      expect(exportCall).toBeTruthy();
      expect(exportCall!.params.method).toBe('CHEQUE');
      expect(exportCall!.params.format).toBe('excel');
      // لا معطى ترقيم إطلاقًا — مركز التقارير يُصدّر المجموعة كاملة.
      expect(exportCall!.params.page).toBeUndefined();
      expect(exportCall!.params.pageSize).toBeUndefined();
    });
  });
});
