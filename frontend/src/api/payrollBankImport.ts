import { api } from './client';

// ── Shared types (mirrors backend types.ts) ───────────────────────────────────

export type BankTemplate = 'KFH' | 'NBK' | 'Boubyan' | 'GulfBank' | 'Warba' | 'AhliUnited' | 'Unknown';
export type MatchConfidence = 'CODE_100' | 'CIVIL_ID_100' | 'BANK_ACCOUNT_90' | 'MANUAL';
export type PreviewRowStatus = 'valid' | 'warning' | 'error';

export interface ParsedBankRow {
  employeeCode: string | null;
  civilId: string | null;
  iban: string | null;
  bankAccount: string | null;
  beneficiaryName: string;
  amount: number;
  currency: string;
  transactionId: string | null;
  paymentDate: string | null;
  paymentStatus: string | null;
  payrollMonth: number;
  payrollYear: number;
  _rowIndex: number;
  _sheetName: string;
}

export interface PreviewRow {
  _rowIndex: number;
  _sheetName: string;
  payrollMonth: number;
  payrollYear: number;
  employeeCode: string | null;
  civilId: string | null;
  iban: string | null;
  bankAccount: string | null;
  beneficiaryName: string;
  amount: number;
  currency: string;
  transactionId: string | null;
  paymentDate: string | null;
  matchedEmployeeId: number | null;
  matchedEmployeeName: string | null;
  matchedEmployeeCode: string | null;
  matchConfidence: MatchConfidence | null;
  isMatched: boolean;
  errors: string[];
  warnings: string[];
  isValid: boolean;
  isDuplicate: boolean;
  status: PreviewRowStatus;
}

export interface PreviewSummary {
  templateName: string;
  totalRows: number;
  matched: number;
  unmatched: number;
  valid: number;
  withWarnings: number;
  invalid: number;
  duplicates: number;
  totalAmount: number;
  canExecute: boolean;
  rows: PreviewRow[];
}

export interface ImportReportRow {
  employeeCode: string | null;
  employeeName: string | null;
  civilId: string | null;
  amount: number;
  currency: string;
  transactionId: string | null;
  paymentDate: string | null;
  payrollMonth: number;
  payrollYear: number;
  status: 'imported' | 'skipped';
  reason?: string;
}

export interface ImportReport {
  templateName: string;
  importedAt: string;
  importedBy: string;
  imported: number;
  skipped: number;
  withWarnings: number;
  totalAmount: number;
  rows: ImportReportRow[];
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function previewImport(
  templateName: string,
  rows: ParsedBankRow[],
): Promise<PreviewSummary> {
  const res = await api.post<{ data: PreviewSummary }>('/payroll-bank-import/preview', {
    templateName,
    rows,
  });
  return res.data.data;
}

export async function executeImport(
  templateName: string,
  rows: ParsedBankRow[],
): Promise<ImportReport> {
  const res = await api.post<{ data: ImportReport }>('/payroll-bank-import/execute', {
    templateName,
    rows,
    confirm: true,
  });
  return res.data.data;
}

export async function exportReportExcel(report: ImportReport): Promise<Blob> {
  const res = await api.post(
    '/payroll-bank-import/report/excel',
    { format: 'excel', report },
    { responseType: 'blob' },
  );
  return res.data as Blob;
}

export async function exportReportPdf(report: ImportReport): Promise<Blob> {
  const res = await api.post(
    '/payroll-bank-import/report/pdf',
    { format: 'pdf', report },
    { responseType: 'blob' },
  );
  return res.data as Blob;
}
