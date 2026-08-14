import * as XLSX from 'xlsx';
import type { PayrollBankExportResult, ExportSheet } from '../api/payrollBankExport';
import { NBK_SALARY_TEMPLATE_BASE64 } from '../assets/nbkSalaryTemplateBase64';

// ─────────────────────────────────────────────────────────────────────────
//  Generates the NBK salary transfer file by loading the OFFICIAL template
//  (docs/exelform/Salary_File.xls) as the base workbook — its sample data rows
//  pre-cleared, but its sheets, headers, column widths, cell formats, merges,
//  and the entire "Bank Codes" sheet preserved verbatim — and inserting ONLY the
//  approved payroll rows into "Salary Details". Nothing else is touched:
//    • no added/removed/reordered columns, no added/removed/renamed sheets,
//      no header changes, no merged-cell changes, no Bank-Codes changes.
//    • numeric cells keep the template's formats (amount = General → "150" stays
//      "150", never "150.000"; Civil Id = '0'); IBANs stay text.
//  Output is a true legacy .xls (BIFF8/OLE2), not .xlsx renamed. SheetJS is
//  already a frontend dependency; ExcelJS cannot write .xls. Pure + testable.
// ─────────────────────────────────────────────────────────────────────────

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return arr;
}

/** Replace the Salary Details data rows with the approved payroll rows. Header (row 1),
 *  column widths, formats, and the Bank Codes sheet are inherited from the template base. */
function insertSalaryRows(ws: XLSX.WorkSheet, details: ExportSheet): void {
  const cols = details.columns; // order matches the template header exactly
  const nCols = cols.length;

  // Defensively clear any residual data rows below the header (the base already has none).
  const cur = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } };
  for (let R = 1; R <= cur.e.r; R += 1) {
    for (let C = 0; C < nCols; C += 1) delete ws[XLSX.utils.encode_cell({ r: R, c: C })];
  }

  // Insert approved payroll rows starting at Excel row 2 (0-indexed R=1). Header (R=0) untouched.
  details.rows.forEach((row, i) => {
    const R = i + 1;
    cols.forEach((col, C) => {
      const v = row[col.key];
      const ref = XLSX.utils.encode_cell({ r: R, c: C });
      if (typeof v === 'number') {
        // Numeric cell; apply the column's number format only when the profile declares one
        // (Civil Id → '0'). Amount has no numFmt → General, exactly like the template.
        const cell: XLSX.CellObject = { t: 'n', v };
        if (col.numFmt) cell.z = col.numFmt;
        ws[ref] = cell;
      } else {
        ws[ref] = { t: 's', v: String(v ?? '') };
      }
    });
  });

  // Used range = header + N rows, same column count as the template.
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: details.rows.length, c: nCols - 1 } });
  // '!cols' (widths) and '!merges' are inherited from the template base — never modified here.
}

/** Build the NBK salary workbook as a legacy .xls (BIFF8/OLE2) byte array. Pure — unit-testable. */
export function buildBankExportXlsArray(result: PayrollBankExportResult): Uint8Array {
  const wb = XLSX.read(base64ToUint8(NBK_SALARY_TEMPLATE_BASE64), { type: 'array', cellStyles: true, cellNF: true });
  const details = result.sheets.find((s) => s.name === 'Salary Details');
  const ws = wb.Sheets['Salary Details'];
  if (details && ws) insertSalaryRows(ws, details);
  // "Bank Codes" sheet is left exactly as in the template — never touched.
  return new Uint8Array(XLSX.write(wb, { bookType: 'xls', type: 'array' }) as ArrayBuffer);
}

/**
 * Deterministic file name: <prefix>_<year>_<MM>.xls — `NBK_Salary_2026_08.xls` by default.
 *
 * The prefix is the ONLY thing that distinguishes the salary file from the monthly
 * entitlements file: both workbooks are intentionally identical in layout (the bank
 * accepts exactly one), so the operator must be able to tell them apart in the file
 * picker and the bank portal without opening them.
 */
export function bankExportFileName(result: PayrollBankExportResult, prefix = 'NBK_Salary'): string {
  const mm = String(result.month).padStart(2, '0');
  return `${prefix}_${result.year}_${mm}.${result.fileExtension}`;
}

/** Generate the .xls and trigger a browser download. */
export function downloadBankExportXls(result: PayrollBankExportResult, prefix = 'NBK_Salary'): void {
  const data = buildBankExportXlsArray(result);
  const blob = new Blob([data as unknown as BlobPart], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = bankExportFileName(result, prefix);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
