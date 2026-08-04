// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../api/bankStatementImport', () => ({
  getTimeline: vi.fn(),
  listImports: vi.fn(),
  downloadTimelineExport: vi.fn(),
}));

import { TimelineTab } from '../pages/BankAccountExplorer';
import {
  getTimeline, downloadTimelineExport,
  type TimelineResult, type TimelineTransaction,
} from '../api/bankStatementImport';

const mockedGetTimeline = vi.mocked(getTimeline);
const mockedExport = vi.mocked(downloadTimelineExport);

function tx(over: Partial<TimelineTransaction> = {}): TimelineTransaction {
  return {
    id: 1, importId: 9, importBatchLabel: 'Import #9', fileName: 'jun.csv',
    importedAt: '2026-06-01T00:00:00.000Z', bankName: 'بنك', accountKey: 'A',
    statementDate: '2026-06-10', postingDate: null, description: 'راتب يونيو',
    reference: 'REF-1', debit: 0, credit: 1500, balance: 5000, currency: 'KWD',
    chequeNumber: null, reconcileStatus: 'UNMATCHED', matchedType: null, matchedRef: null,
    isDuplicate: false, isBankFee: false, bankFeeType: null, transactionFingerprint: 'abc123',
    ...over,
  };
}

function result(
  transactions: TimelineTransaction[],
  over: Partial<TimelineResult> = {},
): TimelineResult {
  const totalDebits  = transactions.reduce((n, t) => n + t.debit, 0);
  const totalCredits = transactions.reduce((n, t) => n + t.credit, 0);
  return {
    accountKey: 'A', totalCount: transactions.length,
    totalDebits, totalCredits,
    netMovement: totalCredits - totalDebits,
    turnover:    totalDebits + totalCredits,
    filteredFromDate: '2026-06-10', filteredToDate: '2026-06-10',
    fromDate: '2026-06-01', toDate: '2026-06-30',
    currencies: ['KWD'], duplicateCount: 0,
    importCount: 1, transactions, page: 1, pageSize: 50,
    ...over,
  };
}

beforeEach(() => { mockedGetTimeline.mockReset(); mockedExport.mockReset(); });
afterEach(cleanup);

describe('TimelineTab — drawer & filters', () => {
  it('opens the details drawer on row click and closes it on Escape', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()]));
    render(<TimelineTab accountKey="A" bankName="بنك" />);

    const row = await screen.findByRole('button', { name: /تفاصيل معاملة راتب يونيو/ });
    expect(screen.queryByText('تفاصيل العملية')).not.toBeInTheDocument();

    fireEvent.click(row);
    expect(await screen.findByText('تفاصيل العملية')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    // Provenance field (fingerprint) lives on the Audit tab of the Information Hub.
    fireEvent.click(screen.getByRole('tab', { name: /التدقيق/ }));
    expect(screen.getByText('abc123')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('تفاصيل العملية')).not.toBeInTheDocument());
  });

  it('opens the drawer via keyboard (Enter) on a focused row', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()]));
    render(<TimelineTab accountKey="A" bankName="بنك" />);
    const row = await screen.findByRole('button', { name: /تفاصيل معاملة/ });
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(await screen.findByText('تفاصيل العملية')).toBeInTheDocument();
  });

  it('shows an active filter chip when a quick range is applied, and clears it', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()]));
    render(<TimelineTab accountKey="A" bankName="بنك" />);
    await screen.findByRole('button', { name: /تفاصيل معاملة/ });

    fireEvent.click(screen.getByText('هذا الشهر'));

    // A chip + "مسح الكل" link appear.
    const status = await screen.findByText('مسح الكل');
    expect(status).toBeInTheDocument();

    fireEvent.click(status);
    await waitFor(() => expect(screen.queryByText('مسح الكل')).not.toBeInTheDocument());
  });

  it('renders the filtered empty state with a clear-filters button', async () => {
    // Initial load empty (no filters) → unfiltered empty; after a quick range → filtered empty.
    mockedGetTimeline.mockResolvedValue(result([]));
    render(<TimelineTab accountKey="A" bankName="بنك" />);

    expect(await screen.findByText('لا توجد معاملات في هذا الحساب')).toBeInTheDocument();

    fireEvent.click(screen.getByText('هذا الشهر'));
    expect(await screen.findByText('لا توجد معاملات مطابقة')).toBeInTheDocument();
    // زر الحالة الفارغة (نص كامل) بجانب زر الشريط المختصر «مسح الفلاتر».
    expect(screen.getByRole('button', { name: /مسح جميع الفلاتر/ })).toBeInTheDocument();
  });

  it('shows the financial summary bar: debits, credits and net — each label matching its maths', async () => {
    mockedGetTimeline.mockResolvedValue(result([
      tx(),                                            // credit 1500
      tx({ id: 2, debit: 500, credit: 0 }),            // debit 500
    ]));
    const { container } = render(<TimelineTab accountKey="A" bankName="بنك" />);

    await waitFor(() => expect(container.querySelector('.bae-totals-bar')).toBeInTheDocument());
    const bar = container.querySelector('.bae-totals-bar')!;
    expect(bar.textContent).toContain('إجمالي المدين');
    expect(bar.textContent).toContain('500.000');
    expect(bar.textContent).toContain('إجمالي الدائن');
    expect(bar.textContent).toContain('1,500.000');
    expect(bar.textContent).toContain('صافي الحركة');
    expect(bar.textContent).toContain('1,000.000');  // 1500 − 500
    expect(bar.textContent).toContain('حجم التداول');
    expect(bar.textContent).toContain('2,000.000');  // 1500 + 500
  });

  it('shows the FILTERED period beside the result count, not the account-wide coverage', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()], {
      filteredFromDate: '2026-06-10', filteredToDate: '2026-06-10',
      fromDate: '2020-01-01', toDate: '2026-12-31',
    }));
    const { container } = render(<TimelineTab accountKey="A" bankName="بنك" />);

    await waitFor(() => expect(container.querySelector('.bae-result-count')).toBeInTheDocument());
    const count = container.querySelector('.bae-result-count')!.textContent ?? '';
    expect(count).toContain('2026');
    expect(count).not.toContain('2020');
  });

  it('sends the direction dimension (never a mixed type) when a direction chip is clicked', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()]));
    render(<TimelineTab accountKey="A" bankName="بنك" />);
    await screen.findByRole('button', { name: /تفاصيل معاملة/ });

    const group = screen.getByRole('group', { name: 'اتجاه الحركة' });
    fireEvent.click(within(group).getByText('سحب'));

    await waitFor(() => {
      expect(mockedGetTimeline).toHaveBeenLastCalledWith(
        'A', 1, 50, expect.objectContaining({ direction: 'withdrawal' }),
      );
    });
  });

  it('supports multi-select on the category dimension, independently of direction', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()]));
    render(<TimelineTab accountKey="A" bankName="بنك" />);
    await screen.findByRole('button', { name: /تفاصيل معاملة/ });

    const dir = screen.getByRole('group', { name: 'اتجاه الحركة' });
    fireEvent.click(within(dir).getByText('سحب'));
    const cat = screen.getByRole('group', { name: 'تصنيف المستند' });
    fireEvent.click(within(cat).getByText('شيك'));
    fireEvent.click(within(cat).getByText('حوالة'));

    await waitFor(() => {
      expect(mockedGetTimeline).toHaveBeenLastCalledWith(
        'A', 1, 50,
        expect.objectContaining({ direction: 'withdrawal', categories: ['cheque', 'transfer'] }),
      );
    });
  });

  it('toggling the same direction chip twice clears that dimension', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()]));
    render(<TimelineTab accountKey="A" bankName="بنك" />);
    await screen.findByRole('button', { name: /تفاصيل معاملة/ });

    const group = screen.getByRole('group', { name: 'اتجاه الحركة' });
    fireEvent.click(within(group).getByText('إيداع'));
    fireEvent.click(within(group).getByText('إيداع'));

    await waitFor(() => {
      const last = mockedGetTimeline.mock.calls.at(-1)!;
      expect((last[3] as { direction?: string }).direction).toBeUndefined();
    });
  });

  it('counts the active filters in the clear-all control', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()]));
    const { container } = render(<TimelineTab accountKey="A" bankName="بنك" />);
    await screen.findByRole('button', { name: /تفاصيل معاملة/ });

    fireEvent.click(screen.getByText('هذا الشهر'));
    fireEvent.click(within(screen.getByRole('group', { name: 'اتجاه الحركة' })).getByText('سحب'));

    await waitFor(() => {
      expect(container.querySelector('.bae-filter-count')!.textContent).toBe('2');
    });
  });

  it('rejects an inverted date range with an explicit message instead of an empty result', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()]));
    render(<TimelineTab accountKey="A" bankName="بنك" />);
    await screen.findByRole('button', { name: /تفاصيل معاملة/ });

    // DateInput يلتزم القيمة عند مغادرة الحقل وبصيغة dd/mm/yyyy المعروضة.
    const from = screen.getByLabelText('من تاريخ') as HTMLInputElement;
    const to   = screen.getByLabelText('إلى تاريخ') as HTMLInputElement;
    fireEvent.change(from, { target: { value: '30/06/2026' } });
    fireEvent.blur(from);
    fireEvent.change(to, { target: { value: '01/06/2026' } });
    fireEvent.blur(to);

    expect(await screen.findByRole('alert')).toHaveTextContent('تاريخ «من» يجب أن يسبق');
  });

  it('rejects an inverted amount range with an explicit message', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()]));
    render(<TimelineTab accountKey="A" bankName="بنك" />);
    await screen.findByRole('button', { name: /تفاصيل معاملة/ });

    fireEvent.change(screen.getByLabelText('من مبلغ'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('إلى مبلغ'), { target: { value: '100' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('الحد الأدنى للمبلغ');
  });

  it('exports ALL filtered results (not the current page) and states the scope', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()], { totalCount: 3200 }));
    mockedExport.mockResolvedValue(undefined);
    render(<TimelineTab accountKey="A" bankName="بنك" />);
    await screen.findByRole('button', { name: /تفاصيل معاملة/ });

    fireEvent.click(within(screen.getByRole('group', { name: 'اتجاه الحركة' })).getByText('سحب'));
    fireEvent.click(screen.getByRole('button', { name: /تصدير/ }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText(/3,200/)).toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Excel/ }));

    await waitFor(() => {
      expect(mockedExport).toHaveBeenCalledWith(
        'A', expect.objectContaining({ direction: 'withdrawal' }), 'xlsx',
      );
    });
  });

  it('warns when the filtered set mixes currencies', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()], { currencies: ['KWD', 'USD'] }));
    render(<TimelineTab accountKey="A" bankName="بنك" />);
    expect(await screen.findByRole('status')).toHaveTextContent('أكثر من عملة');
  });

  it('offers to exclude duplicate rows from the totals when any are present', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()], { duplicateCount: 4 }));
    render(<TimelineTab accountKey="A" bankName="بنك" />);

    const warn = await screen.findByRole('button', { name: /مكرّرة/ });
    fireEvent.click(warn);

    await waitFor(() => {
      expect(mockedGetTimeline).toHaveBeenLastCalledWith(
        'A', 1, 50, expect.objectContaining({ excludeDuplicates: true }),
      );
    });
  });
});
