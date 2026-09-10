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

const RECEIPTS = {
  title: 'تقرير المقبوضات',
  kpis: [{ label: 'الشيكات', value: 5050, format: 'currency' }],
  columns: [
    { header: 'المرجع', key: 'reference' },
    { header: 'المبلغ', key: 'amount', format: 'currency' },
    { header: 'قيمة الشيك الأصلية', key: 'originalChequeAmount', format: 'currency' },
  ],
  rows: [
    { reference: '001474', amount: 1135, originalChequeAmount: 5050 },
    { reference: '001474', amount: 3915, originalChequeAmount: 5050 },
    { reference: 'أحمد', amount: 750, originalChequeAmount: '—' },
  ],
  totalsRow: { reference: 'الإجمالي', amount: 5800 },
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

  it('تعرض العمود الجديد بقيمه، و«—» لغير الشيك، ولا توزيع', async () => {
    const { container } = renderPrint('receipts', RECEIPTS);
    await screen.findByText('تقرير المقبوضات');
    expect(screen.getByText('قيمة الشيك الأصلية (KWD)')).toBeTruthy();
    expect(screen.getAllByText('5,050.000')).toHaveLength(2);
    expect(screen.getByText('—')).toBeTruthy();
    expect(container.textContent).not.toContain('التوزيع حسب وسيلة القبض');
  });

  it('تقرير آخر بلا أقسام يبقى عموديًا كما كان', async () => {
    const { container } = renderPrint('expenses', { ...RECEIPTS, title: 'تقرير المصروفات' });
    await screen.findByText('تقرير المصروفات');
    const css = printCss(container);
    expect(css).toContain('@page { margin: 12mm;');
    expect(css).not.toContain('landscape');
  });
});
