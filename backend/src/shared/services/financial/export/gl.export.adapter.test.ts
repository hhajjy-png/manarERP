import { describe, it, expect } from 'vitest';
import { toGlStatementReportInput, toGlReportInput } from './gl.export.adapter';
import type { FinancialResponse, GlStatementRow, GlReportResponse } from '../financial.types';

function makeGlStatementResponse(extras: Partial<FinancialResponse<GlStatementRow>> = {}): FinancialResponse<GlStatementRow> {
  return {
    reportType:  'gl-statement',
    generatedAt: '2025-06-01T00:00:00.000Z',
    filters:     {},
    summary:     { totalDebit: 500, totalCredit: 200, openingBalance: 300, closingBalance: 600 },
    metadata: {
      accountCode: '1100', accountName: 'الصندوق', accountType: 'ASSET',
      normalBalance: 'DEBIT', fromDate: '2025-01-01', toDate: '2025-06-30',
    },
    rows: [
      {
        id: 'JEL-1', date: '2025-03-15T00:00:00.000Z',
        journalNumber: 'JRN-2025-00001', journalEntryId: 1,
        referenceType: 'MANUAL', description: 'قيد مبدئي',
        debit: 500, credit: 0, runningBalance: 800, status: 'POSTED',
      },
    ],
    ...extras,
  };
}

describe('toGlStatementReportInput', () => {
  it('sets correct title with account code and name', () => {
    const input = toGlStatementReportInput(makeGlStatementResponse());
    expect(input.title).toContain('1100');
    expect(input.title).toContain('الصندوق');
  });

  it('has 7 columns', () => {
    const input = toGlStatementReportInput(makeGlStatementResponse());
    expect(input.columns).toHaveLength(7);
  });

  it('maps rows with formatted date and translated ref type', () => {
    const input = toGlStatementReportInput(makeGlStatementResponse());
    expect(input.rows[0].date).toBe('2025-03-15');
    expect(input.rows[0].referenceType).toBe('يدوي'); // MANUAL → يدوي
  });

  it('omits zero debit cells (empty string)', () => {
    const response = makeGlStatementResponse({
      rows: [{
        id: 'JEL-2', date: '2025-04-01T00:00:00.000Z',
        journalNumber: 'JRN-2025-00002', journalEntryId: 2,
        referenceType: 'MANUAL', description: 'قيد',
        debit: 0, credit: 100, runningBalance: 700, status: 'POSTED',
      }],
    });
    const input = toGlStatementReportInput(response);
    expect(input.rows[0].debit).toBe('');
    expect(input.rows[0].credit).toBe(100);
  });

  it('includes totalsRow with totalDebit and totalCredit', () => {
    const input = toGlStatementReportInput(makeGlStatementResponse());
    expect(input.totalsRow?.debit).toBe(500);
    expect(input.totalsRow?.credit).toBe(200);
  });
});

describe('toGlReportInput', () => {
  const makeGlReportResponse = (): GlReportResponse => ({
    generatedAt: '2025-06-01T00:00:00.000Z',
    filters:     { fromDate: '2025-01-01', toDate: '2025-06-30' },
    accounts: [
      {
        accountId: 1, accountCode: '1100', accountName: 'الصندوق', accountType: 'ASSET',
        normalBalance: 'DEBIT', openingBalance: 0, totalDebit: 1000, totalCredit: 200, closingBalance: 800, rows: [],
      },
    ],
    summary:    { totalAccounts: 1 },
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  });

  it('has title دفتر الأستاذ العام', () => {
    const input = toGlReportInput(makeGlReportResponse());
    expect(input.title).toBe('دفتر الأستاذ العام');
  });

  it('has 7 columns', () => {
    const input = toGlReportInput(makeGlReportResponse());
    expect(input.columns).toHaveLength(7);
  });

  it('maps account rows correctly', () => {
    const input = toGlReportInput(makeGlReportResponse());
    expect(input.rows[0].accountCode).toBe('1100');
    expect(input.rows[0].closingBalance).toBe(800);
  });
});
