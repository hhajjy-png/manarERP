// ─────────────────────────────────────────────────────────────────────────────
//  Payroll Month Read Model
//  ------------------------------------------------------------------------------
//  Composes a single month's Payroll view from its TWO purpose-built sources of
//  truth, WITHOUT copying data between them:
//
//    • `payroll`         — computed payroll for periods processed inside manarERP.
//    • `salary_payments` — imported bank salary-transfer register (historical).
//
//  Precedence: a non-cancelled computed `payroll` row for an employee+period wins;
//  the matching imported transfer is suppressed so no employee appears twice.
//  Imported transfers are net-amount-only records — they carry NO earnings
//  breakdown and are surfaced as structurally read-only rows.
//
//  This layer keeps ALL source-selection logic in the backend; the frontend only
//  renders the shaped rows and honours `source` / `isReadOnly`.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { formatSourceMonth } from '../salaries/salaries.dateHelpers';
import { round3 } from './payroll.calc';

export type PayrollSource = 'COMPUTED' | 'IMPORTED_TRANSFER';

/** Honest presentation status for an imported bank salary transfer. It is NOT a
 *  payroll workflow state — no DRAFT/APPROVED/PAID lifecycle ran for these rows. */
export const IMPORTED_TRANSFER_STATUS = 'IMPORTED_TRANSFER';
const IMPORTED_ID_PREFIX = 'imported:';

/**
 * Unified shape returned for BOTH sources. Computed rows populate the full
 * breakdown; imported rows set breakdown fields to `null` (never fake zeros) and
 * expose only the transferred net amount plus bank metadata.
 */
export interface UnifiedPayrollRow {
  /** Number for computed rows (the real Payroll PK); `imported:<id>` string for
   *  imported rows so a synthetic id can never collide with a payroll PK. */
  id: number | string;
  source: PayrollSource;
  isReadOnly: boolean;
  breakdownAvailable: boolean;

  employeeId: number | null;
  employeeCode: string | null;
  employeeName: string;
  /** Kept for the existing grid/drawer which read `employee.fullName` etc. */
  employee: { id: number | null; code: string | null; fullName: string; department: string | null } | null;

  month: number;
  year: number;

  // Breakdown — null on imported rows (unavailable, not zero).
  baseSalary: number | null;
  snapshotBaseSalary: number | null;
  grossSalary: number | null;
  totalAllowances: number | null;
  totalDeductions: number | null;
  totalAdvances: number | null;
  overtimeHours: number | null;
  overtimeAmount: number | null;

  netSalary: number;
  status: string;

  paidAt: string | null;
  paymentMethod: string | null;
  paymentDate: string | null;
  bankName: string | null;
  transactionId: string | null;

  lines: Array<{ id: number; type: string; label: string; amount: number }>;
}

export interface MonthFilters {
  employeeId?: number;
  status?: string;
}

// ── Route-id safety ──────────────────────────────────────────────────────────

export function isImportedRowId(raw: string): boolean {
  return typeof raw === 'string' && raw.startsWith(IMPORTED_ID_PREFIX);
}

/**
 * Parse a `/payroll/:id` route param into a numeric Payroll primary key.
 *
 * Rejects imported read-model ids (`imported:<n>`) and any non-positive-integer
 * id, so a synthetic historical transfer can NEVER be routed into a payroll
 * mutation (approve/pay/update/delete/lines) as though it were a real record.
 * This is a structural backend guarantee — it does not depend on the frontend
 * hiding buttons.
 */
export function parsePayrollRouteId(raw: string): number {
  const id = Number(raw);
  if (!raw || isImportedRowId(raw) || !Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest('معرّف كشف راتب غير صالح');
  }
  return id;
}

// ── Computed source ──────────────────────────────────────────────────────────

const computedInclude = {
  employee: { select: { id: true, code: true, fullName: true, department: true } },
  lines: { orderBy: { id: 'asc' } },
} satisfies Prisma.PayrollInclude;

type ComputedPayroll = Prisma.PayrollGetPayload<{ include: typeof computedInclude }>;

export function toUnifiedComputed(p: ComputedPayroll): UnifiedPayrollRow {
  const paidAtIso = p.paidAt ? p.paidAt.toISOString() : null;
  return {
    id: p.id,
    source: 'COMPUTED',
    isReadOnly: false,
    breakdownAvailable: true,
    employeeId: p.employeeId,
    employeeCode: p.employee?.code ?? null,
    employeeName: p.employee?.fullName ?? '',
    employee: p.employee
      ? { id: p.employee.id, code: p.employee.code, fullName: p.employee.fullName, department: p.employee.department ?? null }
      : null,
    month: p.month,
    year: p.year,
    baseSalary: p.baseSalary,
    snapshotBaseSalary: p.snapshotBaseSalary,
    grossSalary: p.grossSalary,
    totalAllowances: p.totalAllowances,
    totalDeductions: p.totalDeductions,
    totalAdvances: p.totalAdvances,
    overtimeHours: p.overtimeHours,
    overtimeAmount: p.overtimeAmount,
    netSalary: p.netSalary,
    status: p.status,
    paidAt: paidAtIso,
    paymentMethod: p.paymentMethod ?? null,
    paymentDate: paidAtIso,
    bankName: null,
    transactionId: null,
    lines: p.lines.map((l) => ({ id: l.id, type: l.type, label: l.label, amount: l.amount })),
  };
}

export async function fetchComputedRowsForMonth(month: number, year: number, filters: MonthFilters): Promise<UnifiedPayrollRow[]> {
  const where: Prisma.PayrollWhereInput = { month, year };
  if (filters.status) where.status = filters.status;
  if (filters.employeeId != null) where.employeeId = filters.employeeId;

  const rows = await prisma.payroll.findMany({ where, orderBy: [{ id: 'desc' }], include: computedInclude });
  return rows.map(toUnifiedComputed);
}

// ── Imported source ──────────────────────────────────────────────────────────

function norm(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s.length ? s : null;
}

/**
 * Map key → employee, EXCLUDING any key shared by more than one employee. An
 * ambiguous civilId/bankAccount is dropped from the map so it resolves to "no
 * match" rather than silently merging two different people.
 */
function uniqueKeyMap<T>(rows: T[], keyOf: (r: T) => string | null): Map<string, T> {
  const counts = new Map<string, number>();
  const map = new Map<string, T>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    map.set(k, r);
  }
  for (const [k, c] of counts) if (c > 1) map.delete(k);
  return map;
}

/**
 * Imported salary-transfer rows for the selected period, with precedence and
 * identity resolution applied. Returns [] fast when the register has nothing for
 * the period (the common current-month case), so no employee/payroll lookups run.
 *
 * Identity sequence (safe, exact — no fuzzy matching):
 *   1. civilId (unique)  →  2. bank account (unique)  →  else unmatched (kept visible).
 */
export async function resolveImportedRowsForMonth(month: number, year: number, filters: MonthFilters = {}): Promise<UnifiedPayrollRow[]> {
  const sourceMonth = formatSourceMonth(month, year);
  const payments = await prisma.salaryPayment.findMany({
    where: { sourceMonth },
    orderBy: [{ beneficiaryName: 'asc' }, { id: 'asc' }],
  });
  if (payments.length === 0) return [];

  // Precedence: a non-cancelled computed payroll row for the employee+period wins.
  const computed = await prisma.payroll.findMany({ where: { month, year }, select: { employeeId: true, status: true } });
  const superseded = new Set<number>();
  for (const c of computed) if (c.status !== 'CANCELLED') superseded.add(c.employeeId);

  const employees = await prisma.employee.findMany({
    select: { id: true, code: true, fullName: true, department: true, civilId: true, bankAccount: true },
  });
  const byCivilId = uniqueKeyMap(employees, (e) => norm(e.civilId));
  const byBankAccount = uniqueKeyMap(employees, (e) => norm(e.bankAccount));

  const rows: UnifiedPayrollRow[] = [];
  for (const p of payments) {
    const civ = norm(p.civilId);
    const acct = norm(p.beneficiaryAccount);

    let emp: (typeof employees)[number] | null = null;
    if (civ) emp = byCivilId.get(civ) ?? null;
    if (!emp && acct) emp = byBankAccount.get(acct) ?? null;

    // Computed payroll takes precedence — drop the duplicate imported transfer.
    if (emp && superseded.has(emp.id)) continue;

    // Employee filter (from the grid dropdown) applies to resolved identity only;
    // an unmatched imported row cannot satisfy a specific-employee filter.
    if (filters.employeeId != null && (!emp || emp.id !== filters.employeeId)) continue;

    const beneficiary = p.beneficiaryName?.trim() || 'غير محدد';
    rows.push({
      id: `${IMPORTED_ID_PREFIX}${p.id}`,
      source: 'IMPORTED_TRANSFER',
      isReadOnly: true,
      breakdownAvailable: false,
      employeeId: emp?.id ?? null,
      employeeCode: emp?.code ?? null,
      employeeName: emp?.fullName ?? beneficiary,
      employee: {
        id: emp?.id ?? null,
        code: emp?.code ?? null,
        fullName: emp?.fullName ?? beneficiary,
        department: emp?.department ?? null,
      },
      month,
      year,
      baseSalary: null,
      snapshotBaseSalary: null,
      grossSalary: null,
      totalAllowances: null,
      totalDeductions: null,
      totalAdvances: null,
      overtimeHours: null,
      overtimeAmount: null,
      netSalary: round3(p.amount),
      status: IMPORTED_TRANSFER_STATUS,
      paidAt: null,
      paymentMethod: null,
      paymentDate: p.paymentDate ? p.paymentDate.toISOString() : null,
      bankName: p.bankName ?? null,
      transactionId: p.transactionId ?? null,
      lines: [],
    });
  }
  return rows;
}

/**
 * Full unified row set for a month (unpaginated). Computed rows first (DB order),
 * then imported transfers (beneficiary order). Imported rows are surfaced only
 * when no workflow-status filter is applied — imported transfers have no
 * in-system workflow status to match against.
 */
export async function buildUnifiedMonthRows(month: number, year: number, filters: MonthFilters): Promise<UnifiedPayrollRow[]> {
  const computed = await fetchComputedRowsForMonth(month, year, filters);
  const imported = filters.status ? [] : await resolveImportedRowsForMonth(month, year, { employeeId: filters.employeeId });
  return [...computed, ...imported];
}
