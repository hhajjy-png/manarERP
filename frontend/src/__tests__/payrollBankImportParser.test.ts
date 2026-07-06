import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook, parseFlexibleDate, monthYearFromIso } from '../pages/payrollBankImportParser';

/**
 * Build a workbook from named array-of-arrays sheets, round-tripped through
 * XLSX.write/read with cellDates:true — identical to the production upload path
 * (FileReader → XLSX.read(..., { cellDates: true })). This preserves Date cells
 * as Date objects and text cells (e.g. "15/06/2025") as strings.
 */
function makeWorkbook(sheets: { name: string; aoa: unknown[][] }[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const { name, aoa } of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), name);
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });
  return XLSX.read(buf, { type: 'buffer', cellDates: true });
}

const NBK_HEADER = [
  'Transaction ID', 'Beneficiary Account Number', 'Beneficiary Account Name',
  'Payment Amount', 'Currency', 'Payment Date', 'status', 'Civil ID',
];

describe('payrollBankImportParser — existing formats (regression)', () => {
  it('Priority 1: monthly sheet name "mar-2025" still imports, month from sheet name', () => {
    const wb = makeWorkbook([{
      name: 'mar-2025',
      aoa: [NBK_HEADER, ['TXN1', '111', 'Ahmed', '250.500', 'KWD', new Date(Date.UTC(2025, 2, 20)), 'PROCESSED', '299010112345']],
    }]);
    const { rows, templateName } = parseWorkbook(wb);
    expect(templateName).toBe('NBK');
    expect(rows).toHaveLength(1);
    expect(rows[0].payrollMonth).toBe(3);
    expect(rows[0].payrollYear).toBe(2025);
    expect(rows[0].transactionId).toBe('TXN1');
    expect(rows[0].amount).toBeCloseTo(250.5, 3);
  });

  it('Priority 2: "All_Transactions" sheet still imports, month from Month column', () => {
    const wb = makeWorkbook([{
      name: 'All_Transactions',
      aoa: [
        [...NBK_HEADER, 'Month'],
        ['TXN2', '222', 'Sara', '100.000', 'KWD', new Date(Date.UTC(2025, 5, 10)), 'PROCESSED', '290050154321', 'Jun-25'],
      ],
    }]);
    const { rows, templateName } = parseWorkbook(wb);
    expect(templateName).toBe('NBK');
    expect(rows).toHaveLength(1);
    expect(rows[0].payrollMonth).toBe(6);
    expect(rows[0].payrollYear).toBe(2025);
  });
});

describe('payrollBankImportParser — Transaction Details report (new format)', () => {
  function txnDetailsSheet(dataRows: unknown[][], headerOffset = 5): unknown[][] {
    const preamble: unknown[][] = [
      ['File Upload - Transactions Details'],
      ['Generated: 2025-06-30'],
      [],
      ['Company: Al Manar International'],
      [],
    ].slice(0, headerOffset);
    const header = [
      'Transaction ID', 'Beneficiary Account Number', 'Beneficiary Account Name',
      'Payment Amount', 'Currency', 'Payment Type', 'Payment Date', 'status',
      'Error Description', 'Civil ID',
    ];
    return [...preamble, header, ...dataRows];
  }

  it('detects header below row 1, maps NBK columns, derives month/year from Payment Date', () => {
    const wb = makeWorkbook([{
      name: 'Sheet0',
      aoa: txnDetailsSheet([
        ['TXN001', '1234567890', 'Ahmed Ali', '250.500', 'KWD', 'SALARY', new Date(Date.UTC(2025, 5, 25)), 'PROCESSED', '', '299010112345'],
      ]),
    }]);
    const { rows, templateName } = parseWorkbook(wb);
    expect(templateName).toBe('NBK');
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.transactionId).toBe('TXN001');
    expect(r.bankAccount).toBe('1234567890');
    expect(r.beneficiaryName).toBe('Ahmed Ali');
    expect(r.amount).toBeCloseTo(250.5, 3);
    expect(r.currency).toBe('KWD');
    expect(r.paymentStatus).toBe('PROCESSED');
    expect(r.civilId).toBe('299010112345');
    expect(r.payrollMonth).toBe(6);
    expect(r.payrollYear).toBe(2025);
    expect(r.paymentDate).toContain('2025-06-25');
  });

  it('parses comma amounts and day-first DD/MM/YYYY text dates', () => {
    const wb = makeWorkbook([{
      name: 'Sheet0',
      aoa: txnDetailsSheet([
        ['TXN002', '9876543210', 'Sara Noor', '1,250.750', 'KWD', 'SALARY', '15/06/2025', 'PROCESSED', '', '290050154321'],
      ]),
    }]);
    const { rows } = parseWorkbook(wb);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBeCloseTo(1250.75, 3);
    expect(rows[0].payrollMonth).toBe(6);
    expect(rows[0].payrollYear).toBe(2025);
    expect(rows[0].paymentDate).toBe('2025-06-15T00:00:00.000Z');
  });

  it('ignores empty rows and rows without any identifier', () => {
    const wb = makeWorkbook([{
      name: 'Sheet0',
      aoa: txnDetailsSheet([
        ['TXN003', '111', 'A', '100.000', 'KWD', 'SALARY', new Date(Date.UTC(2025, 4, 5)), 'PROCESSED', '', '111'],
        [],                                                             // fully blank
        ['', '', '', '50.000', 'KWD', 'SALARY', '', '', '', ''],        // no identifier
      ]),
    }]);
    const { rows } = parseWorkbook(wb);
    expect(rows).toHaveLength(1);
    expect(rows[0].transactionId).toBe('TXN003');
  });

  it('works when the header is on the first row (no preamble)', () => {
    const wb = makeWorkbook([{
      name: 'Sheet0',
      aoa: txnDetailsSheet([
        ['TXN004', '222', 'B', '75.250', 'KWD', 'SALARY', new Date(Date.UTC(2026, 0, 12)), 'PROCESSED', '', '222'],
      ], 0),
    }]);
    const { rows, templateName } = parseWorkbook(wb);
    expect(templateName).toBe('NBK');
    expect(rows).toHaveLength(1);
    expect(rows[0].payrollMonth).toBe(1);
    expect(rows[0].payrollYear).toBe(2026);
  });

  it('derives the correct payroll month from a Date-typed Payment Date on a month boundary (timezone-safe)', () => {
    // XLSX cellDates:true produces a LOCAL-midnight Date for date cells. A naive
    // toISOString()+getUTCMonth() would roll July 1st back to June on a UTC+ host
    // (the Kuwait deployment is UTC+3). parseFlexibleDate must re-anchor via the
    // local calendar fields so the result is correct regardless of the host TZ.
    const localFirstOfJuly = new Date(2026, 6, 1, 0, 0, 0);
    const iso = parseFlexibleDate(localFirstOfJuly);
    expect(iso).toBe('2026-07-01T00:00:00.000Z');
    expect(monthYearFromIso(iso)).toEqual({ month: 7, year: 2026 });
    // day-first string path must also yield the month, not the day
    expect(monthYearFromIso(parseFlexibleDate('01/07/2026'))).toEqual({ month: 7, year: 2026 });
  });

  it('cumulative file: every row carries a Transaction ID (DB dedup key) so re-import is safe', () => {
    // The importer itself does not dedup against the DB (that is the backend's
    // existingTxIds guard); this asserts the new format always yields the
    // transactionId that makes cumulative re-import produce zero duplicates.
    const wb = makeWorkbook([{
      name: 'Sheet0',
      aoa: txnDetailsSheet([
        ['JAN-1', '111', 'A', '100.000', 'KWD', 'SALARY', new Date(Date.UTC(2025, 0, 25)), 'PROCESSED', '', '111'],
        ['FEB-1', '111', 'A', '100.000', 'KWD', 'SALARY', new Date(Date.UTC(2025, 1, 25)), 'PROCESSED', '', '111'],
        ['JUN-1', '111', 'A', '100.000', 'KWD', 'SALARY', new Date(Date.UTC(2025, 5, 25)), 'PROCESSED', '', '111'],
      ]),
    }]);
    const { rows } = parseWorkbook(wb);
    expect(rows.map((r) => r.transactionId)).toEqual(['JAN-1', 'FEB-1', 'JUN-1']);
    expect(rows.every((r) => r.transactionId && r.transactionId.length > 0)).toBe(true);
  });
});
