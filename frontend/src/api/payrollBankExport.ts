import { api } from './client';

// ── Types (mirror backend payrollBankExport/types.ts) ─────────────────────────

export interface ExportColumn { header: string; key: string; numFmt?: string; }

export interface ExportSheet {
  name: string;
  columns: ExportColumn[];
  rows: Array<Record<string, string | number>>;
  /** Column widths (Excel `wch`) from the bank template, preserved in the generated file. */
  widthsWch?: number[];
}

export interface ExportValidationError {
  serial: number | null;
  employeeCode: string | null;
  employeeName: string | null;
  field: string;
  message: string;
}

export interface PayrollBankExportSummary {
  employeeCount: number;
  totalAmount: number;
  currency: string;
}

export interface PayrollBankExportResult {
  profileId: string;
  profileLabel: string;
  fileExtension: 'xls';
  currency: string;
  amountDecimals: number;
  month: number;
  year: number;
  sheets: ExportSheet[];
  summary: PayrollBankExportSummary;
  valid: boolean;
  errors: ExportValidationError[];
}

export interface ExportProfileInfo {
  id: string;
  label: string;
  fileExtension: 'xls';
  currency: string;
}

// ── API ───────────────────────────────────────────────────────────────────────

export async function getExportProfiles(): Promise<ExportProfileInfo[]> {
  const res = await api.get<{ data: ExportProfileInfo[] }>('/payroll-bank-export/profiles');
  return res.data.data;
}

export async function getExportPreview(
  profile: string,
  month: number,
  year: number,
): Promise<PayrollBankExportResult> {
  const res = await api.get<{ data: PayrollBankExportResult }>('/payroll-bank-export/preview', {
    params: { profile, month, year },
  });
  return res.data.data;
}
