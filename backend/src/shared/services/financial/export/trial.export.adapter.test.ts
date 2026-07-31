import { describe, it, expect } from 'vitest';
import { toTrialBalanceReportInput } from './trial.export.adapter';
import type { FinancialResponse, TrialBalanceAsOfRow, TrialBalancePeriodRow } from '../financial.types';

function makeAsOfResponse(extras = {}): FinancialResponse<TrialBalanceAsOfRow> {
  return {
    reportType: 'trial-balance', generatedAt: '2025-06-01T00:00:00.000Z',
    filters: {}, summary: { totalDebit: 1000, totalCredit: 1000 },
    metadata: { mode: 'as-of', asOfDate: '2025-06-30T00:00:00.000Z', isBalanced: true, difference: 0 },
    rows: [
      {
        id: 'TB-1', accountId: 1, accountCode: '1100', accountName: 'الصندوق',
        accountType: 'ASSET', normalBalance: 'DEBIT',
        totalDebit: 1000, totalCredit: 0, balance: 1000, balanceType: 'DEBIT',
      },
      {
        id: 'TB-2', accountId: 2, accountCode: '4100', accountName: 'الإيرادات',
        accountType: 'REVENUE', normalBalance: 'CREDIT',
        totalDebit: 0, totalCredit: 1000, balance: -1000, balanceType: 'CREDIT',
      },
    ],
    ...extras,
  };
}

function makePeriodResponse(extras = {}): FinancialResponse<TrialBalancePeriodRow> {
  return {
    reportType: 'trial-balance', generatedAt: '2025-06-01T00:00:00.000Z',
    filters: {}, summary: { totalDebit: 500, totalCredit: 500 },
    metadata: { mode: 'period', fromDate: '2025-01-01', toDate: '2025-06-30', isBalanced: true, difference: 0 },
    rows: [
      {
        id: 'TB-1', accountId: 1, accountCode: '1100', accountName: 'الصندوق',
        accountType: 'ASSET', normalBalance: 'DEBIT',
        openingBalance: 300, periodDebit: 500, periodCredit: 100, closingBalance: 700,
      },
    ],
    ...extras,
  };
}

describe('toTrialBalanceReportInput — as-of mode', () => {
  it('title is ميزان المراجعة', () => {
    const input = toTrialBalanceReportInput(makeAsOfResponse());
    expect(input.title).toBe('ميزان المراجعة');
  });

  it('has 7 columns (code, name, type, total debit, total credit, balance, balance type)', () => {
    const input = toTrialBalanceReportInput(makeAsOfResponse());
    expect(input.columns).toHaveLength(7);
  });

  it('maps balanceType to Arabic', () => {
    const input = toTrialBalanceReportInput(makeAsOfResponse());
    expect(input.rows[0].balanceType).toBe('مدين');
    expect(input.rows[1].balanceType).toBe('دائن');
  });

  // «حتى تاريخ» صيغة **عرض** DD/MM/YYYY لا الصيغة القانونية السلكية.
  it('subtitle contains asOfDate, in display format', () => {
    const input = toTrialBalanceReportInput(makeAsOfResponse());
    expect(input.subtitle).toContain('30/06/2025');
    expect(input.subtitle).not.toContain('2025-06-30');
  });
});

describe('toTrialBalanceReportInput — period mode', () => {
  it('title is ميزان المراجعة (فترة)', () => {
    const input = toTrialBalanceReportInput(makePeriodResponse());
    expect(input.title).toContain('فترة');
  });

  it('has 6 columns for period mode', () => {
    const input = toTrialBalanceReportInput(makePeriodResponse());
    expect(input.columns).toHaveLength(6);
  });

  it('maps openingBalance and closingBalance', () => {
    const input = toTrialBalanceReportInput(makePeriodResponse());
    expect(input.rows[0].openingBalance).toBe(300);
    expect(input.rows[0].closingBalance).toBe(700);
  });
});
