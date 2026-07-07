// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../api/bankStatementImport', () => ({
  getTimeline: vi.fn(),
  listImports: vi.fn(),
}));

import { TimelineTab } from '../pages/BankAccountExplorer';
import { getTimeline, type TimelineResult, type TimelineTransaction } from '../api/bankStatementImport';

const mockedGetTimeline = vi.mocked(getTimeline);

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

function result(transactions: TimelineTransaction[]): TimelineResult {
  return {
    accountKey: 'A', totalCount: transactions.length, fromDate: '2026-06-01', toDate: '2026-06-30',
    importCount: 1, transactions, page: 1, pageSize: 50,
  };
}

beforeEach(() => mockedGetTimeline.mockReset());
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
    expect(screen.getByText('مسح جميع الفلاتر')).toBeInTheDocument();
  });

  it('requests the correct type filter from the server when a type chip is clicked', async () => {
    mockedGetTimeline.mockResolvedValue(result([tx()]));
    render(<TimelineTab accountKey="A" bankName="بنك" />);
    await screen.findByRole('button', { name: /تفاصيل معاملة/ });

    const typeGroup = screen.getByRole('group', { name: 'نوع المعاملة' });
    fireEvent.click(within(typeGroup).getByText('إيداعات'));

    await waitFor(() => {
      expect(mockedGetTimeline).toHaveBeenLastCalledWith(
        'A', 1, 50, expect.objectContaining({ type: 'deposits' }),
      );
    });
  });
});
