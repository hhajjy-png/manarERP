// @vitest-environment jsdom
/**
 * طباعة تقرير المقبوضات (`#/print/receipts`) بعد إزالة قسم «التوزيع حسب وسيلة القبض».
 *
 * اتجاه `ReportPrint` كان مشتقًّا من وجود الأقسام التحليلية وحده، فإزالة القسم كانت
 * ستقلب التقرير إلى A4 عمودي بتسعة أعمدة. هذه المجموعة تثبت أنه يبقى أفقيًا، وأن
 * التقارير الأخرى بلا أقسام بقيت عمودية كما كانت.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ROUTER_FUTURE } from '../../__tests__/helpers/router';

const getMock = vi.fn();
vi.mock('../../api/client', () => ({
  api: { get: (...a: unknown[]) => getMock(...a) },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));
vi.mock('../../utils/print', () => ({ printCurrentView: vi.fn() }));

import ReportPrint from '../ReportPrint';

const K1474 = '3|2026-08-15|001474';
const K1527 = '5|2026-08-20|001527';

const RECEIPTS = {
  title: 'تقرير المقبوضات',
  kpis: [{ label: 'الشيكات', value: 7455, format: 'currency' }],
  columns: [
    { header: 'رقم الفاتورة', key: 'invoiceNumber' },
    { header: 'شهر الحساب', key: 'accountingMonth', align: 'center' },
    { header: 'المرجع', key: 'reference' },
    { header: 'المبلغ', key: 'amount', format: 'currency' },
    { header: 'قيمة الشيك الأصلية', key: 'originalChequeAmount', format: 'currency', mergeRowGroup: true },
  ],
  rowGroupKey: 'chequeGroup',
  rows: [
    { invoiceNumber: 'A1', accountingMonth: '7-2026', reference: '001474', amount: 1135, originalChequeAmount: 5050, chequeGroup: K1474 },
    { invoiceNumber: 'A2', accountingMonth: '7-2026', reference: '001474', amount: 2080, originalChequeAmount: 5050, chequeGroup: K1474 },
    { invoiceNumber: 'A3', accountingMonth: '8-2026', reference: '001474', amount: 405, originalChequeAmount: 5050, chequeGroup: K1474 },
    { invoiceNumber: 'A4', accountingMonth: '8-2026', reference: '001474', amount: 1430, originalChequeAmount: 5050, chequeGroup: K1474 },
    { invoiceNumber: 'B1', accountingMonth: '8-2026', reference: '001527', amount: 1200, originalChequeAmount: 2405, chequeGroup: K1527 },
    { invoiceNumber: 'B2', accountingMonth: '8-2026', reference: '001527', amount: 1205, originalChequeAmount: 2405, chequeGroup: K1527 },
    { invoiceNumber: 'C1', accountingMonth: '9-2026', reference: 'أحمد', amount: 750, originalChequeAmount: '—', chequeGroup: null },
  ],
  totalsRow: { invoiceNumber: 'الإجمالي', amount: 8205 },
};

function renderPrint(type: string, report: unknown) {
  getMock.mockResolvedValue({ data: { data: report } });
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[`/print/${type}`]}>
      <Routes>
        <Route path="/print/:type" element={<ReportPrint />} />
      </Routes>
    </MemoryRouter>,
  );
}

const printCss = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('style')).map((s) => s.textContent ?? '').join('\n');

beforeEach(() => getMock.mockReset());

describe('طباعة تقرير المقبوضات', () => {
  it('تبقى A4 أفقيًا رغم خلوّ التقرير من الأقسام', async () => {
    const { container } = renderPrint('receipts', RECEIPTS);
    await screen.findByText('تقرير المقبوضات');
    expect(printCss(container)).toContain('@page { size: A4 landscape; margin: 10mm;');
  });

  it('I) الدمج يصل مستند الطباعة: خليّة واحدة لكل شيك بـ rowspan حقيقي', async () => {
    const { container } = renderPrint('receipts', RECEIPTS);
    await screen.findByText('تقرير المقبوضات');
    expect(screen.getByText('قيمة الشيك الأصلية (KWD)')).toBeTruthy();

    const c5050 = screen.getByText('5,050.000');
    const c2405 = screen.getByText('2,405.000');
    expect(c5050.getAttribute('rowspan')).toBe('4');
    expect(c2405.getAttribute('rowspan')).toBe('2');
    expect(screen.getByText('—')).toBeTruthy();

    const bodyRows = Array.from(container.querySelectorAll('tbody tr')).slice(0, 7);
    expect(bodyRows.map((tr) => tr.querySelectorAll('td').length)).toEqual([5, 4, 4, 4, 5, 4, 5]);
    // مبالغ التحصيل في أسطرها.
    ['1,135.000', '2,080.000', '405.000', '1,430.000', '1,200.000', '1,205.000'].forEach((v) => expect(screen.getByText(v)).toBeTruthy());
    expect(container.textContent).not.toContain('التوزيع حسب وسيلة القبض');
    expect(container.textContent).not.toContain('حالة سداد الفاتورة');
  });

  it('لون المجموعة على أسطر الشيكات وحدها، ومفروض في الطباعة', async () => {
    const { container } = renderPrint('receipts', RECEIPTS);
    await screen.findByText('تقرير المقبوضات');
    const bodyRows = Array.from(container.querySelectorAll('tbody tr')).slice(0, 7) as HTMLElement[];
    expect(bodyRows.map((tr) => tr.classList.contains('row-group'))).toEqual([true, true, true, true, true, true, false]);
    expect(bodyRows[0].style.background).toBe('rgb(232, 241, 250)');
    expect(bodyRows[0].getAttribute('style')).toContain('print-color-adjust: exact');
    expect(bodyRows[6].getAttribute('style')).not.toContain('print-color-adjust');
  });

  it('تقرير بلا `rowGroupKey` يبقى بلا دمج ولا لون مجموعة', async () => {
    const { container } = renderPrint('expenses', { ...RECEIPTS, title: 'تقرير المصروفات', rowGroupKey: undefined });
    await screen.findByText('تقرير المصروفات');
    expect(container.querySelector('td[rowspan]')).toBeNull();
    expect(container.querySelector('tr.row-group')).toBeNull();
    expect(screen.getAllByText('5,050.000')).toHaveLength(4);
  });

  it('تقرير آخر بلا أقسام يبقى عموديًا كما كان', async () => {
    const { container } = renderPrint('expenses', { ...RECEIPTS, title: 'تقرير المصروفات' });
    await screen.findByText('تقرير المصروفات');
    const css = printCss(container);
    expect(css).toContain('@page { margin: 12mm;');
    expect(css).not.toContain('landscape');
  });
});
