// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AnalyticsTab } from '../pages/BankAccountExplorer';
import type { BankAccountDashboard, MonthlyEntry } from '../api/bankAccounts';

afterEach(cleanup);

function dash(over: Partial<BankAccountDashboard> = {}): BankAccountDashboard {
  return {
    accountKey: 'A', bankName: 'بنك', currentBalance: 0, openingBalance: 0, closingBalance: 0,
    totalDeposits: 0, totalWithdrawals: 0, netCashFlow: 0, largestDeposit: 0, largestWithdrawal: 0,
    avgDeposit: 0, avgWithdrawal: 0, depositCount: 0, withdrawalCount: 0, transactionCount: 0,
    importCount: 0, coverageStart: null, coverageEnd: null,
    monthly: [], topDeposits: [], topWithdrawals: [],
    ...over,
  };
}

function month(over: Partial<MonthlyEntry> = {}): MonthlyEntry {
  return {
    month: '2026-06', totalDeposits: 0, totalWithdrawals: 0, netFlow: 0,
    txCount: 0, largestDeposit: 0, largestWithdrawal: 0, ...over,
  };
}

describe('AnalyticsTab — crash safety', () => {
  it('renders a professional empty state (no crash) when there is no monthly data', () => {
    render(<AnalyticsTab dashboard={dash()} />);
    expect(screen.getByText('لا توجد بيانات كافية للتحليلات')).toBeInTheDocument();
  });

  it('does not crash when arrays are missing entirely (malformed payload)', () => {
    const bad = dash();
    // Simulate a backend payload that violated the type contract.
    (bad as unknown as Record<string, unknown>).monthly = undefined;
    (bad as unknown as Record<string, unknown>).topDeposits = undefined;
    (bad as unknown as Record<string, unknown>).topWithdrawals = undefined;
    expect(() => render(<AnalyticsTab dashboard={bad} />)).not.toThrow();
    expect(screen.getByText('لا توجد بيانات كافية للتحليلات')).toBeInTheDocument();
  });

  it('renders charts for sparse data with NaN/undefined values without throwing', () => {
    const bad = dash({
      totalDeposits: NaN as unknown as number,
      monthly: [month({
        month: '2026-06',
        totalDeposits: NaN as unknown as number,
        totalWithdrawals: undefined as unknown as number,
        netFlow: NaN as unknown as number,
        txCount: undefined as unknown as number,
      })],
    });
    expect(() => render(<AnalyticsTab dashboard={bad} />)).not.toThrow();
    // It should render the analytics layout, not the empty state.
    expect(screen.getByText('تفاصيل شهرية')).toBeInTheDocument();
    expect(screen.queryByText('لا توجد بيانات كافية للتحليلات')).not.toBeInTheDocument();
  });
});
