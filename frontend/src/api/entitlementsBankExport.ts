import { api } from './client';
import type { ExportProfileInfo, PayrollBankExportResult } from './payrollBankExport';

// ─────────────────────────────────────────────────────────────────────────────
//  Monthly Entitlements Bank Statement — client API.
//
//  Fully independent of the salary bank export: different endpoints, different
//  statement, different file. It deliberately REUSES the salary result types because
//  the produced bank workbook is the same format (same engine on the backend) — only
//  the amount's origin and the file name differ.
// ─────────────────────────────────────────────────────────────────────────────

export type EntitlementEligibility =
  | 'READY'
  | 'NO_CALCULATION'
  | 'NOT_APPROVED'
  | 'NO_AMOUNT'
  | 'BANK_DATA_INCOMPLETE';

export interface EntitlementCandidateRow {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  employeeNameEn: string | null;
  civilId: string | null;
  bankAccount: string | null;
  employeeStatus: string;
  calculationId: number | null;
  calculationStatus: string | null;
  netAmount: number | null;
  basicSalary: number | null;
  transferAmount: number | null;
  eligibility: EntitlementEligibility;
  blockers: string[];
}

/** A line of the APPROVED statement — frozen values, not live compensation data. */
export interface EntitlementStatementLine {
  employeeId: number;
  calculationId: number | null;
  employeeCode: string;
  employeeName: string;
  employeeNameEn: string | null;
  civilId: string | null;
  bankAccount: string | null;
  netAmount: number;
  basicSalary: number;
  transferAmount: number;
}

export interface EntitlementStatement {
  id: number;
  year: number;
  month: number;
  profileId: string;
  currency: string;
  status: string;
  employeeCount: number;
  totalAmount: number;
  approvedAt: string;
  approvedByName: string | null;
}

export interface EntitlementsMonth {
  year: number;
  month: number;
  rows: EntitlementCandidateRow[];
  statement: EntitlementStatement | null;
  statementLines: EntitlementStatementLine[];
}

// ── API ──────────────────────────────────────────────────────────────────────

export async function getEntitlementsProfiles(): Promise<ExportProfileInfo[]> {
  const res = await api.get<{ data: ExportProfileInfo[] }>('/entitlements-bank-export/profiles');
  return res.data.data;
}

export async function getEntitlementsMonth(month: number, year: number): Promise<EntitlementsMonth> {
  const res = await api.get<{ data: EntitlementsMonth }>('/entitlements-bank-export/month', {
    params: { month, year },
  });
  return res.data.data;
}

/** Bank file rows — built server-side from the APPROVED statement snapshot only. */
export async function getEntitlementsPreview(
  profile: string,
  month: number,
  year: number,
): Promise<PayrollBankExportResult> {
  const res = await api.get<{ data: PayrollBankExportResult }>('/entitlements-bank-export/preview', {
    params: { profile, month, year },
  });
  return res.data.data;
}

export async function approveEntitlementsStatement(
  month: number,
  year: number,
  employeeIds: number[],
  profileId: string,
): Promise<EntitlementStatement> {
  const res = await api.post<{ data: EntitlementStatement }>('/entitlements-bank-export/approve', {
    month, year, employeeIds, profileId,
  });
  return res.data.data;
}

export async function unapproveEntitlementsStatement(month: number, year: number): Promise<void> {
  await api.post('/entitlements-bank-export/unapprove', { month, year });
}
