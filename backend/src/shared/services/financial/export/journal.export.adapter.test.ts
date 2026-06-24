import { describe, it, expect } from 'vitest';
import { toJournalBookReportInput } from './journal.export.adapter';
import type { FinancialResponse, JournalBookRow } from '../financial.types';

function makeJournalResponse(extras = {}): FinancialResponse<JournalBookRow> {
  return {
    reportType:  'journal-book',
    generatedAt: '2025-06-01T00:00:00.000Z',
    filters:     {},
    summary:     { totalDebit: 1000, totalCredit: 1000, transactionCount: 1 },
    metadata:    { fromDate: '2025-01-01', toDate: '2025-06-30' },
    rows: [
      {
        id: 'JE-1', entryNumber: 'JRN-2025-00001',
        date: '2025-03-01T00:00:00.000Z', description: 'قيد اليومية',
        referenceType: 'INVOICE', referenceId: 5, status: 'POSTED',
        totalDebit: 1000, totalCredit: 1000, lineCount: 2,
        lines: [
          { accountCode: '1100', accountName: 'الصندوق',  description: 'قبض', debit: 1000, credit: 0 },
          { accountCode: '4100', accountName: 'الإيرادات', description: undefined,  debit: 0,    credit: 1000 },
        ],
      },
    ],
    ...extras,
  };
}

describe('toJournalBookReportInput', () => {
  it('title is دفتر اليومية', () => {
    expect(toJournalBookReportInput(makeJournalResponse()).title).toBe('دفتر اليومية');
  });

  it('has 10 columns', () => {
    const input = toJournalBookReportInput(makeJournalResponse());
    expect(input.columns).toHaveLength(10);
  });

  it('flattens header + 2 lines = 3 rows', () => {
    const input = toJournalBookReportInput(makeJournalResponse());
    expect(input.rows).toHaveLength(3); // 1 entry header + 2 lines
  });

  it('header row has entryNumber and translated referenceType', () => {
    const input  = toJournalBookReportInput(makeJournalResponse());
    const header = input.rows[0];
    expect(header.entryNumber).toBe('JRN-2025-00001');
    expect(header.referenceType).toBe('فاتورة'); // INVOICE → فاتورة
  });

  it('line rows have empty entryNumber and accountCode', () => {
    const input  = toJournalBookReportInput(makeJournalResponse());
    const line1  = input.rows[1];
    expect(line1.entryNumber).toBe('');
    expect(line1.accountCode).toBe('1100');
    expect(line1.debit).toBe(1000);
  });

  it('zero credit on line row is empty string', () => {
    const input = toJournalBookReportInput(makeJournalResponse());
    const line1 = input.rows[1];
    expect(line1.credit).toBe('');
  });

  it('subtitle includes date range', () => {
    const input = toJournalBookReportInput(makeJournalResponse());
    expect(input.subtitle).toContain('2025-01-01');
    expect(input.subtitle).toContain('2025-06-30');
  });
});
