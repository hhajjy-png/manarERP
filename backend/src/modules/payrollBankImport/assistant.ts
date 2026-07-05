// Payroll Bank Import Assistant (v1) — preview-only, non-blocking analysis layer.
//
// Enriches an already-built PreviewSummary with:
//   • Kuwait IBAN validity (mod-97)              • salary anomaly detection (±30%)
//   • match-confidence + weak-match warnings     • duplicate-payroll detection
//   • employee-index / in-file collisions        • payroll variance report
//   • an informational quality score             • missing expected employees
//
// HARD RULE: this NEVER changes `canExecute`, which stays a pure function of
// blocking errors + unmatched rows computed by buildPreview. Assistant findings
// may only flip a row's display status from 'valid' → 'warning' and populate
// `row.assistantWarnings` / `summary.assistant`. All of it is advisory.
//
// It imports ONLY from this module (payrollBankImport/*) — no generic
// import/warnings business rules are pulled in.

import type { PreviewSummary, PreviewRow, AssistantSummary } from './types';
import { validateKuwaitIban, ibanReasonAr, normalizeIban } from './ibanValidator';
import { computeVariance, type ExistingPayment } from './variance';
import { computeQuality } from './quality';
import { formatSourceMonth } from './excelParser';
import { formatCurrency } from '../../shared/utils/currency';

export interface AssistantEmployee {
  id: number;
  code: string;
  fullName: string;
  civilId: string | null;
  bankAccount: string | null;
  salary: number;
  status: string;
}

export interface AssistantContext {
  employees: AssistantEmployee[];
  existingPayments: ExistingPayment[];
}

/** Salary-anomaly threshold: deviation beyond ±30% of the baseline is flagged. */
export const SALARY_ANOMALY_THRESHOLD = 0.30;

interface CollisionSets {
  civilId: string[];
  bankAccount: string[];
  employeeCode: string[];
  ibanInFile: string[];
  ibanCounts: Map<string, number>;
}

function detectCollisions(employees: AssistantEmployee[], rows: PreviewRow[]): CollisionSets {
  const civil = new Map<string, number>();
  const acct = new Map<string, number>();
  const code = new Map<string, number>();
  for (const e of employees) {
    const c = e.civilId?.trim();
    if (c) civil.set(c, (civil.get(c) ?? 0) + 1);
    const a = e.bankAccount?.trim();
    if (a) acct.set(a, (acct.get(a) ?? 0) + 1);
    const k = e.code?.trim();
    if (k) code.set(k, (code.get(k) ?? 0) + 1);
  }
  const ibanCounts = new Map<string, number>();
  for (const r of rows) {
    if (!r.iban) continue;
    const n = normalizeIban(r.iban);
    if (n) ibanCounts.set(n, (ibanCounts.get(n) ?? 0) + 1);
  }
  const dupKeys = (m: Map<string, number>): string[] =>
    [...m.entries()].filter(([, n]) => n > 1).map(([k]) => k);

  return {
    civilId: dupKeys(civil),
    bankAccount: dupKeys(acct),
    employeeCode: dupKeys(code),
    ibanInFile: dupKeys(ibanCounts),
    ibanCounts,
  };
}

/** Stable per-(employee, month) key for in-file duplicate detection. */
function empMonthKey(r: PreviewRow): string | null {
  const id = r.matchedEmployeeId != null ? `E${r.matchedEmployeeId}` : (r.civilId ? `C${r.civilId.trim()}` : null);
  if (!id) return null;
  return `${id}|${formatSourceMonth(r.payrollMonth, r.payrollYear)}`;
}

/**
 * Run the assistant over a built preview summary and return the same (now
 * enriched) summary. Mutates rows' `assistantWarnings`/`status` and sets
 * `summary.assistant`; leaves `canExecute` and blocking errors untouched.
 */
export function runAssistant(summary: PreviewSummary, ctx: AssistantContext): PreviewSummary {
  const { employees, existingPayments } = ctx;
  const rows = summary.rows;

  const collisions = detectCollisions(employees, rows);
  const civilDup = new Set(collisions.civilId);
  const acctDup = new Set(collisions.bankAccount);
  const empById = new Map(employees.map((e) => [e.id, e]));

  // Baselines from existing payments.
  const prevAmountByCivilId = new Map<string, number>();
  const existingCivilMonth = new Set<string>();
  for (const p of existingPayments) {
    if (p.civilId) prevAmountByCivilId.set(p.civilId, p.amount);
    if (p.civilId && p.sourceMonth) existingCivilMonth.add(`${p.civilId}|${p.sourceMonth}`);
  }

  // Same employee repeated for the same month within this file.
  const fileEmpMonthCount = new Map<string, number>();
  for (const r of rows) {
    const key = empMonthKey(r);
    if (key) fileEmpMonthCount.set(key, (fileEmpMonthCount.get(key) ?? 0) + 1);
  }

  const warningCounts: Record<string, number> = {};
  const bump = (c: string): void => { warningCounts[c] = (warningCounts[c] ?? 0) + 1; };
  let ibanChecked = 0, ibanValid = 0, ibanInvalid = 0, anomalyCount = 0;

  for (const row of rows) {
    const w = row.assistantWarnings;
    const sourceMonth = formatSourceMonth(row.payrollMonth, row.payrollYear);

    // 1) IBAN validity (capture the normalized form for the dup check below)
    let ibanNorm: string | null = null;
    if (row.iban) {
      ibanChecked++;
      const check = validateKuwaitIban(row.iban);
      ibanNorm = check.normalized;
      if (check.valid) {
        ibanValid++;
      } else {
        ibanInvalid++;
        w.push({
          code: 'IBAN_INVALID', severity: 'warning', field: 'iban',
          messageAr: `IBAN غير صالح: ${check.reasons.map(ibanReasonAr).join('، ')}`,
        });
        bump('IBAN_INVALID');
      }
    }

    // 2) Weak / manual (name-only) match
    if (row.isMatched && row.matchConfidence === 'MANUAL') {
      w.push({ code: 'WEAK_MATCH', severity: 'warning', messageAr: 'مطابقة بالاسم فقط — تحقّق من الموظف قبل الاعتماد' });
      bump('WEAK_MATCH');
    }

    // 3) Employee-index / in-file collisions
    if (row.matchConfidence === 'CIVIL_ID_100' && row.civilId && civilDup.has(row.civilId.trim())) {
      w.push({ code: 'INDEX_COLLISION_CIVILID', severity: 'warning', field: 'civilId', messageAr: 'الرقم المدني مكرر لأكثر من موظف — قد تكون المطابقة غير دقيقة' });
      bump('INDEX_COLLISION_CIVILID');
    }
    if (row.matchConfidence === 'BANK_ACCOUNT_90' && row.bankAccount && acctDup.has(row.bankAccount.trim())) {
      w.push({ code: 'INDEX_COLLISION_ACCOUNT', severity: 'warning', field: 'bankAccount', messageAr: 'رقم الحساب مكرر لأكثر من موظف — قد تكون المطابقة غير دقيقة' });
      bump('INDEX_COLLISION_ACCOUNT');
    }
    if (ibanNorm && (collisions.ibanCounts.get(ibanNorm) ?? 0) > 1) {
      w.push({ code: 'DUP_IBAN_IN_FILE', severity: 'warning', field: 'iban', messageAr: 'رقم IBAN مكرر في الملف' });
      bump('DUP_IBAN_IN_FILE');
    }

    // 4) Salary anomaly (matched, non-error rows with a usable baseline)
    if (row.isMatched && row.status !== 'error') {
      const emp = row.matchedEmployeeId != null ? empById.get(row.matchedEmployeeId) : undefined;
      const baseline = emp && emp.salary > 0
        ? emp.salary
        : (row.civilId ? prevAmountByCivilId.get(row.civilId) ?? 0 : 0);

      // Note: amount === 0 is already a blocking error (validators.ts), so such rows
      // never reach here — the existing hard error owns the "salary is zero" case.
      if (baseline > 0) {
        const dev = (row.amount - baseline) / baseline;
        if (dev > SALARY_ANOMALY_THRESHOLD) {
          w.push({ code: 'SALARY_ANOMALY_HIGH', severity: 'warning', field: 'amount', messageAr: `المبلغ أعلى من المتوقع بنسبة ${Math.round(dev * 100)}% (المرجع ${formatCurrency(baseline)})` });
          bump('SALARY_ANOMALY_HIGH'); anomalyCount++;
        } else if (dev < -SALARY_ANOMALY_THRESHOLD) {
          w.push({ code: 'SALARY_ANOMALY_LOW', severity: 'warning', field: 'amount', messageAr: `المبلغ أقل من المتوقع بنسبة ${Math.round(Math.abs(dev) * 100)}% (المرجع ${formatCurrency(baseline)})` });
          bump('SALARY_ANOMALY_LOW'); anomalyCount++;
        }
      }
    }

    // 5) Duplicate payroll
    if (row.civilId && existingCivilMonth.has(`${row.civilId}|${sourceMonth}`)) {
      w.push({ code: 'DUP_PAYROLL_DB', severity: 'danger', field: 'payrollMonth', messageAr: `يوجد راتب مسجّل لهذا الموظف لنفس الشهر (${sourceMonth})` });
      bump('DUP_PAYROLL_DB');
    }
    const emKey = empMonthKey(row);
    if (emKey && (fileEmpMonthCount.get(emKey) ?? 0) > 1) {
      w.push({ code: 'DUP_EMPLOYEE_IN_FILE', severity: 'warning', field: 'payrollMonth', messageAr: 'الموظف مكرّر لنفس الشهر داخل الملف' });
      bump('DUP_EMPLOYEE_IN_FILE');
    }

    // Non-blocking: surface findings by promoting a clean row to 'warning'.
    if (row.status === 'valid' && w.length > 0) row.status = 'warning';
  }

  // Variance + quality (variance also feeds the reimport/missing signals).
  const variance = computeVariance({ rows, existingPayments, employees });
  const monthReimportPeriods = variance.byPeriod.filter((p) => p.existingInPeriod > 0).length;
  if (monthReimportPeriods > 0) warningCounts['MONTH_REIMPORT'] = monthReimportPeriods;

  const warningRows = rows.filter((r) => r.status === 'warning').length;
  const quality = computeQuality({
    totalRows: summary.totalRows,
    matched: summary.matched,
    invalid: summary.invalid,
    unmatched: summary.unmatched,
    warningRows,
    duplicates: summary.duplicates,
    ibanChecked,
    ibanInvalid,
    anomalyCount,
    missingCount: variance.missingEmployees.length,
  });

  // Recompute only the counts affected by valid→warning promotions. canExecute,
  // matched, unmatched, invalid and duplicates are all left exactly as built.
  summary.withWarnings = warningRows;
  summary.valid = rows.filter((r) => r.status === 'valid').length;

  const assistant: AssistantSummary = {
    variance,
    quality,
    collisions: {
      civilId: collisions.civilId,
      bankAccount: collisions.bankAccount,
      employeeCode: collisions.employeeCode,
      ibanInFile: collisions.ibanInFile,
    },
    warningCounts,
    ibanChecked,
    ibanValid,
    ibanInvalid,
  };
  summary.assistant = assistant;
  return summary;
}
