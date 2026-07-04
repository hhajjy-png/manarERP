// Payroll variance report — computed during preview only. Compares the uploaded
// file against the previous comparable payroll period (from existing
// salary_payments) and surfaces missing expected employees when a reliable prior
// period exists. Pure functions; no DB access here.

import type { PreviewRow, VarianceReport, PeriodSummary, MissingEmployee } from './types';
import { formatSourceMonth } from './excelParser';

export interface ExistingPayment {
  civilId: string | null;
  sourceMonth: string | null;
  amount: number;
}

export interface VarianceEmployee {
  id: number;
  code: string;
  fullName: string;
  civilId: string | null;
  status: string;
}

interface VarianceArgs {
  rows: PreviewRow[];
  existingPayments: ExistingPayment[];
  employees: VarianceEmployee[];
}

interface PeriodAggregate {
  total: number;
  count: number;
  civilIds: Set<string>;
  amountByCivilId: Map<string, number>;
}

/** The month/year immediately before the given one. */
export function previousMonth(month: number, year: number): { month: number; year: number } {
  return month <= 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

function aggregateExisting(payments: ExistingPayment[]): Map<string, PeriodAggregate> {
  const byMonth = new Map<string, PeriodAggregate>();
  for (const p of payments) {
    if (!p.sourceMonth) continue;
    let agg = byMonth.get(p.sourceMonth);
    if (!agg) {
      agg = { total: 0, count: 0, civilIds: new Set(), amountByCivilId: new Map() };
      byMonth.set(p.sourceMonth, agg);
    }
    agg.total += p.amount;
    agg.count += 1;
    if (p.civilId) {
      agg.civilIds.add(p.civilId);
      agg.amountByCivilId.set(p.civilId, p.amount);
    }
  }
  return byMonth;
}

export function computeVariance(args: VarianceArgs): VarianceReport {
  const { rows, existingPayments, employees } = args;
  const nonError = rows.filter((r) => r.status !== 'error');

  const totalImported = nonError.reduce((s, r) => s + r.amount, 0);
  const totalMatched = nonError.filter((r) => r.isMatched).reduce((s, r) => s + r.amount, 0);
  const totalUnmatched = rows.filter((r) => !r.isMatched).reduce((s, r) => s + r.amount, 0);

  const matchedRows = rows.filter((r) => r.isMatched);
  const employeesInFile = new Set(matchedRows.map((r) => r.matchedEmployeeId).filter((v): v is number => v != null)).size;
  const matchedCount = matchedRows.length;
  const unmatchedCount = rows.length - matchedCount;

  const existingByMonth = aggregateExisting(existingPayments);

  // Per-period grouping of the uploaded rows.
  const periodMap = new Map<string, PeriodSummary>();
  for (const r of rows) {
    const label = formatSourceMonth(r.payrollMonth, r.payrollYear);
    let period = periodMap.get(label);
    if (!period) {
      period = {
        label,
        month: r.payrollMonth,
        year: r.payrollYear,
        rowCount: 0,
        totalAmount: 0,
        existingInPeriod: existingByMonth.get(label)?.count ?? 0,
      };
      periodMap.set(label, period);
    }
    period.rowCount += 1;
    if (r.status !== 'error') period.totalAmount += r.amount;
  }
  const byPeriod = [...periodMap.values()].sort((a, b) =>
    a.year - b.year || a.month - b.month,
  );

  // Primary period = the one with the most rows; used to pick the comparable prior month.
  const primary = [...periodMap.values()].sort((a, b) => b.rowCount - a.rowCount)[0] ?? null;

  let previousPeriodLabel: string | null = null;
  let previousTotal: number | null = null;
  let varianceAmount: number | null = null;
  let variancePercent: number | null = null;
  const missingEmployees: MissingEmployee[] = [];

  if (primary) {
    const prev = previousMonth(primary.month, primary.year);
    const prevLabel = formatSourceMonth(prev.month, prev.year);
    const prevAgg = existingByMonth.get(prevLabel);
    // Only report a comparison / missing list when the prior period actually has data.
    if (prevAgg && prevAgg.count > 0) {
      previousPeriodLabel = prevLabel;
      previousTotal = prevAgg.total;
      varianceAmount = totalImported - prevAgg.total;
      variancePercent = prevAgg.total > 0 ? (varianceAmount / prevAgg.total) * 100 : null;

      const matchedCivilIds = new Set(
        matchedRows.map((r) => r.civilId).filter((v): v is string => !!v),
      );
      for (const emp of employees) {
        if (emp.status === 'TERMINATED') continue;
        if (!emp.civilId) continue;
        if (prevAgg.civilIds.has(emp.civilId) && !matchedCivilIds.has(emp.civilId)) {
          missingEmployees.push({
            employeeId: emp.id,
            code: emp.code,
            fullName: emp.fullName,
            lastAmount: prevAgg.amountByCivilId.get(emp.civilId) ?? null,
          });
        }
      }
    }
  }

  return {
    totalImported,
    totalMatched,
    totalUnmatched,
    employeesInFile,
    matchedCount,
    unmatchedCount,
    rowCount: rows.length,
    previousPeriodLabel,
    previousTotal,
    varianceAmount,
    variancePercent,
    byPeriod,
    missingEmployees,
  };
}
