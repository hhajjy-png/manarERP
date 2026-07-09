import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildBankExportXlsArray, bankExportFileName } from '../utils/payrollBankExportXls';
import type { PayrollBankExportResult } from '../api/payrollBankExport';

const SALARY_COLUMNS = [
  { header: 'Payment Serial Number', key: 'serial' },
  { header: 'Beneficiary Name', key: 'name' },
  { header: 'Beneficiary Civil Id', key: 'civilId', numFmt: '0' },
  { header: 'Account # for NBK A/C & IBAN for other Bank', key: 'account' },
  { header: "Beneficiary Bank (Refer next sheet 'Bank Codes' for list of Banks)", key: 'bank' },
  { header: 'Payment Currency (only KWD)', key: 'currency' },
  { header: 'Payment Amount', key: 'amount' },
];

// Approved-payroll rows (NOT the template's sample data). Note: amount 150 must stay 150.
function result(): PayrollBankExportResult {
  return {
    profileId: 'nbk_salary_xls', profileLabel: 'NBK', fileExtension: 'xls',
    currency: 'KWD', amountDecimals: 3, month: 5, year: 2026,
    sheets: [
      {
        name: 'Salary Details',
        columns: SALARY_COLUMNS,
        widthsWch: [14.5, 44.21, 20.07, 35.07, 24.93, 17.79, 16.21],
        rows: [
          { serial: 1, name: 'TEST EMP ONE', civilId: 290010112345, account: 2041584763, bank: 'NBK', currency: 'KWD', amount: 150 },
          { serial: 2, name: 'TEST EMP TWO', civilId: 290010254321, account: 'KW00GULB0000000000001234561000', bank: 'GBK', currency: 'KWD', amount: 250.75 },
        ],
      },
      // Ignored by the generator — Bank Codes come from the template base.
      { name: 'Bank Codes', columns: [{ header: 'Bank Code', key: 'code' }, { header: 'Bank Name', key: 'name' }], rows: [] },
    ],
    summary: { employeeCount: 2, totalAmount: 400.75, currency: 'KWD' },
    valid: true, errors: [],
  };
}

function read() {
  return XLSX.read(buildBankExportXlsArray(result()), { type: 'array', cellStyles: true, cellNF: true });
}

describe('payrollBankExportXls — template-preserving legacy .xls generation', () => {
  it('file name uses the .xls extension (not .xlsx)', () => {
    expect(bankExportFileName(result())).toBe('NBK_Salary_2026_05.xls');
  });

  it('generates a LEGACY .xls (BIFF8/OLE2), not a zip-based .xlsx', () => {
    const data = buildBankExportXlsArray(result());
    expect([data[0], data[1], data[2], data[3]]).toEqual([0xd0, 0xcf, 0x11, 0xe0]);
  });

  it('keeps exactly the template sheets, in order — no added/removed/renamed sheets', () => {
    expect(read().SheetNames).toEqual(['Salary Details', 'Bank Codes']);
  });

  it('preserves the template header row exactly — no header/column changes, 7 columns only', () => {
    const rows = XLSX.utils.sheet_to_json<string[]>(read().Sheets['Salary Details'], { header: 1 });
    expect(rows[0]).toEqual([
      'Payment Serial Number', 'Beneficiary Name', 'Beneficiary Civil Id',
      'Account # for NBK A/C & IBAN for other Bank',
      "Beneficiary Bank (Refer next sheet 'Bank Codes' for list of Banks)",
      'Payment Currency (only KWD)', 'Payment Amount',
    ]);
    expect(rows[0]).toHaveLength(7);
  });

  it('contains ONLY the header + the exported payroll rows (no leftover template sample rows)', () => {
    const rows = XLSX.utils.sheet_to_json<string[]>(read().Sheets['Salary Details'], { header: 1, blankrows: false });
    expect(rows).toHaveLength(1 + 2); // header + 2 approved rows
    expect(rows[1][1]).toBe('TEST EMP ONE');
    // none of the template's sample beneficiaries survive
    const names = rows.slice(1).map((r) => r[1]);
    expect(names).not.toContain('RAJA KUMAR CHOWDARY KASTURI');
  });

  it('preserves the template column widths (!cols) unchanged', () => {
    const cols = read().Sheets['Salary Details']['!cols'];
    expect(cols?.length).toBe(7);
  });

  it('makes no merged-cell changes (template has none)', () => {
    const wb = read();
    expect(wb.Sheets['Salary Details']['!merges'] ?? []).toEqual([]);
    expect(wb.Sheets['Bank Codes']['!merges'] ?? []).toEqual([]);
  });

  it('preserves the Bank Codes sheet from the template verbatim (25 data rows, NBK first)', () => {
    const rows = XLSX.utils.sheet_to_json<string[]>(read().Sheets['Bank Codes'], { header: 1, blankrows: false });
    expect(rows[0]).toEqual(['Bank Code', 'Bank Name']);
    expect(rows).toHaveLength(1 + 25);
    expect(rows[1]).toEqual(['NBK', 'NBK-National Bank of Kuwait ']);
  });

  it('keeps Payment Amount as General numeric — 150 stays 150 (no forced 3-decimal zeros)', () => {
    const ws = read().Sheets['Salary Details'];
    const amt1 = ws.G2; // first payroll row amount
    const amt2 = ws.G3;
    expect(amt1.t).toBe('n');
    expect(amt1.v).toBe(150);
    expect(amt1.z === undefined || amt1.z === 'General').toBe(true); // NOT '0.000'
    expect(amt2.v).toBe(250.75); // a fractional amount is preserved as-is
  });

  it('Civil Id is numeric with the template integer format; IBAN account stays text', () => {
    const ws = read().Sheets['Salary Details'];
    expect(ws.C2.t).toBe('n');
    expect(ws.C2.z).toBe('0');
    expect(ws.C2.v).toBe(290010112345);
    expect(ws.D2.t).toBe('n'); // NBK numeric account
    expect(ws.D3.t).toBe('s'); // IBAN → text
    expect(ws.D3.v).toBe('KW00GULB0000000000001234561000');
  });

  it('exported Beneficiary Name equals the (English) name from the result rows — same as the preview', () => {
    const r = result();
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      XLSX.read(buildBankExportXlsArray(r), { type: 'array' }).Sheets['Salary Details'],
    );
    // The preview table renders result.sheets[0].rows[].name; the generator writes the same value.
    const previewNames = r.sheets[0].rows.map((row) => row.name);
    const exportedNames = rows.map((row) => row['Beneficiary Name']);
    expect(exportedNames).toEqual(previewNames);
    expect(exportedNames).toEqual(['TEST EMP ONE', 'TEST EMP TWO']);
    // No Arabic characters in any exported name.
    for (const n of exportedNames) expect(/[؀-ۿ]/.test(String(n))).toBe(false);
  });

  it('currency column is KWD; exported total equals summary total', () => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(read().Sheets['Salary Details']);
    expect(rows[0]['Payment Currency (only KWD)']).toBe('KWD');
    const total = rows.reduce((s, r) => s + Number(r['Payment Amount']), 0);
    expect(Math.round(total * 1000) / 1000).toBe(result().summary.totalAmount);
  });
});
