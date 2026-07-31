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

/**
 * Date Display, Export & Import Consistency Pack v1 — corrective pass.
 *
 * `parseDateValue` (the P1/P2 monthly-sheet Payment Date parser) was
 * `new Date(String(v))`. The intended contract for this column is **day-first**,
 * proven in-repo three times over, not inferred from locale:
 *
 *   1. `backend/payrollBankImport/excelParser.ts` — the twin that parses the
 *      SAME column from the SAME `BANK_CONFIGS` templates — was already fixed
 *      away from `new Date(string)`, its comment naming `"05/03/2024"` and the
 *      American MM/DD misreading verbatim, routing it through the day-first
 *      `parseImportDate`.
 *   2. `parseFlexibleDate` — same file, same column, P3 layout — is day-first
 *      and already covered by the month-boundary test above.
 *   3. `shared/utils/dateParse.ts` `parseImportDate` — day-first, documented,
 *      separately tested.
 *
 * So `05/03/2024` on this column means **5 March 2024**.
 */
describe('payroll bank Payment Date — proven day-first contract (P1/P2 layouts)', () => {
  /** One NBK monthly sheet whose single row carries `paymentDate` verbatim. */
  const monthlyRowWithDate = (paymentDate: unknown) => {
    const wb = makeWorkbook([{
      name: 'mar-2025',
      aoa: [NBK_HEADER, ['TXN-D', '111', 'Ahmed', '100.000', 'KWD', paymentDate, 'PROCESSED', '299010112345']],
    }]);
    return parseWorkbook(wb).rows[0];
  };

  it('05/03/2024 is 5 March — the documented day-first reading, not 3 May', () => {
    expect(monthlyRowWithDate('05/03/2024').paymentDate).toBe('2024-03-05T00:00:00.000Z');
  });

  it('the reciprocal 03/05/2024 is 3 May — the two do not collapse onto each other', () => {
    expect(monthlyRowWithDate('03/05/2024').paymentDate).toBe('2024-05-03T00:00:00.000Z');
  });

  it('canonical ISO input is accepted unchanged', () => {
    expect(monthlyRowWithDate('2024-03-05').paymentDate).toBe('2024-03-05T00:00:00.000Z');
  });

  it('DD-MM-YYYY (dash variant of the same bank convention) is also day-first', () => {
    expect(monthlyRowWithDate('05-03-2024').paymentDate).toBe('2024-03-05T00:00:00.000Z');
  });

  it('an Excel-native date cell keeps its calendar day — no timezone roll-back', () => {
    // cellDates:true yields a LOCAL-midnight Date; the old bare toISOString()
    // rolled the 1st into the previous month on the UTC+3 Kuwait deployment,
    // and the payroll month is derived from this very value.
    const row = monthlyRowWithDate(new Date(2026, 6, 1, 0, 0, 0));
    expect(row.paymentDate).toBe('2026-07-01T00:00:00.000Z');
    expect(monthYearFromIso(row.paymentDate)).toEqual({ month: 7, year: 2026 });
  });

  it('an impossible date is rejected, never rolled over to a plausible wrong day', () => {
    // Date.UTC(2024, 1, 31) would silently become 2 March.
    expect(parseFlexibleDate('31/02/2024')).toBeNull();
    expect(parseFlexibleDate('2024-04-31')).toBeNull();
    expect(parseFlexibleDate('2024-13-01')).toBeNull();
    // ...and once the ambiguous d/d/yyyy shape matched, there is no fall-through
    // to `new Date(s)` that could re-guess it as MM/DD.
    expect(monthlyRowWithDate('31/02/2024').paymentDate).toBe('31/02/2024');
  });

  it('Excel serial numbers are supported (were stringified into the raw fallback)', () => {
    // 45356 = 2024-03-05 in the Excel 1900 calendar.
    expect(parseFlexibleDate(45356)).toBe('2024-03-05T00:00:00.000Z');
  });

  it('leap day 29/02/2028 is accepted; 29/02/2026 is not', () => {
    expect(parseFlexibleDate('29/02/2028')).toBe('2028-02-29T00:00:00.000Z');
    expect(parseFlexibleDate('29/02/2026')).toBeNull();
  });

  it('unparseable TEXT still falls back to the raw string (preview + validator warning)', () => {
    // Preserved deliberately — the backend twin documents the same behaviour.
    expect(monthlyRowWithDate('not a date').paymentDate).toBe('not a date');
  });

  it('an empty cell still yields null, exactly as before', () => {
    expect(monthlyRowWithDate('').paymentDate).toBeNull();
  });

  it('an invalid Date cell yields null — the raw-string fallback is text-only', () => {
    // Asserted on the parser directly: `XLSX.write` cannot serialise an Invalid
    // Date into a real .xlsx, so no uploaded file can carry one either.
    expect(parseFlexibleDate(new Date('nonsense'))).toBeNull();
  });

  it('no bare new Date(userString) heuristic remains on the ambiguous d/d/yyyy path', () => {
    // Every two-part-numeric ordering resolves through the explicit day-first
    // branch: a month >12 in the SECOND position is impossible and rejected,
    // rather than being re-read as MM/DD by the engine.
    expect(parseFlexibleDate('05/13/2024')).toBeNull();
    expect(parseFlexibleDate('13/05/2024')).toBe('2024-05-13T00:00:00.000Z');
  });
});
