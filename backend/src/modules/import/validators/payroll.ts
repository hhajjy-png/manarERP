// Payroll summary import — imports headline figures only (no PayrollLine rows).
import { roundMoney } from '../../../shared/utils/money';
// Duplicate key: employeeCode|month|year (matches Payroll @@unique constraint).
// All employees (including terminated) are accepted for historical imports.

const VALID_STATUSES = ['DRAFT'] as const;
const VALID_PAYMENT_METHODS = ['CASH', 'BANK', 'CHEQUE', 'TRANSFER'] as const;
type PayrollStatus = (typeof VALID_STATUSES)[number];

export interface PayrollFKMaps {
  employeeCodeToId: Map<string, number>;
}

export interface NormalizedPayroll {
  employeeId: number;
  month: number;
  year: number;
  baseSalary: number;
  snapshotBaseSalary: number;
  totalAllowances: number;
  overtimeAmount: number;
  totalBonus: number;
  totalDeduction: number;
  totalDeductions: number;
  totalAdvances: number;
  grossSalary: number;
  netSalary: number;
  status: PayrollStatus;
  notes?: string;
  paymentMethod?: string;
}

export const payrollCompositeKey = (employeeCode: string, month: number, year: number): string =>
  `${employeeCode}|${month}|${year}`;

function str(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  if (v == null || v === '') return undefined;
  return String(v).trim();
}

function parseNonNegativeFloat(v: unknown): number | null {
  if (v == null || v === '') return null;
  const raw = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(/,/g, ''));
  if (isNaN(raw) || raw < 0) return null;
  return raw;
}

function parseInt10(v: unknown): number | null {
  if (v == null || v === '') return null;
  const raw = typeof v === 'number' ? Math.round(v) : parseInt(String(v).trim(), 10);
  if (isNaN(raw)) return null;
  return raw;
}

/** مُعاد تصديرها من وحدة النقود القانونية (`shared/utils/money`) — سياسة واحدة، لا تعريف ثانٍ. */
const round3 = roundMoney;

export function validatePayrollRow(
  row: Record<string, unknown>,
  fkMaps: PayrollFKMaps,
): { valid: boolean; errors: string[]; normalized: NormalizedPayroll | null } {
  const errors: string[] = [];

  // employeeCode — required FK
  const employeeCode = str(row, 'employeeCode');
  if (!employeeCode) {
    errors.push('رمز الموظف (employeeCode) مطلوب');
  }
  let employeeId: number | undefined;
  if (employeeCode) {
    const id = fkMaps.employeeCodeToId.get(employeeCode);
    if (id === undefined) errors.push(`رمز الموظف "${employeeCode}" غير موجود`);
    else employeeId = id;
  }

  // month — required, 1–12
  const rawMonth = parseInt10(row['month']);
  if (rawMonth === null || rawMonth < 1 || rawMonth > 12)
    errors.push('الشهر (month) مطلوب ويجب أن يكون بين 1 و 12');

  // year — required
  const rawYear = parseInt10(row['year']);
  if (rawYear === null || rawYear < 2000 || rawYear > 2100)
    errors.push('السنة (year) مطلوبة ويجب أن تكون بين 2000 و 2100');

  // baseSalary — required, non-negative
  const baseSalary = parseNonNegativeFloat(row['baseSalary']);
  if (baseSalary === null) errors.push('الراتب الأساسي (baseSalary) مطلوب ويجب أن يكون رقماً غير سالب');

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  // optional financial fields — default 0
  const totalAllowances = round3(parseNonNegativeFloat(row['totalAllowances']) ?? 0);
  const overtimeAmount  = round3(parseNonNegativeFloat(row['overtimeAmount'])  ?? 0);
  const totalDeductions = round3(parseNonNegativeFloat(row['totalDeductions']) ?? 0);
  const totalAdvances   = round3(parseNonNegativeFloat(row['totalAdvances'])   ?? 0);

  // grossSalary — default = baseSalary + allowances + overtime
  const grossRaw = parseNonNegativeFloat(row['grossSalary']);
  const grossSalary = round3(grossRaw ?? (baseSalary! + totalAllowances + overtimeAmount));

  // netSalary — default = gross - deductions - advances
  const netRaw = row['netSalary'];
  let netSalary: number;
  if (netRaw != null && netRaw !== '') {
    const parsed = typeof netRaw === 'number' ? netRaw : parseFloat(String(netRaw).trim().replace(/,/g, ''));
    netSalary = isNaN(parsed) ? round3(grossSalary - totalDeductions - totalAdvances) : round3(parsed);
  } else {
    netSalary = round3(grossSalary - totalDeductions - totalAdvances);
  }

  // status — always imported as DRAFT regardless of file value; accounting is not posted on import

  // paymentMethod — optional
  const rawPaymentMethod = str(row, 'paymentMethod');
  if (rawPaymentMethod && !(VALID_PAYMENT_METHODS as readonly string[]).includes(rawPaymentMethod))
    errors.push(`طريقة الدفع (paymentMethod) يجب أن تكون: ${VALID_PAYMENT_METHODS.join(' / ')}`);

  const notes = str(row, 'notes');

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  return {
    valid: true,
    errors: [],
    normalized: {
      employeeId: employeeId!,
      month: rawMonth!,
      year: rawYear!,
      baseSalary: round3(baseSalary!),
      snapshotBaseSalary: round3(baseSalary!),
      totalAllowances,
      overtimeAmount,
      totalBonus: totalAllowances,
      totalDeduction: totalDeductions,
      totalDeductions,
      totalAdvances,
      grossSalary,
      netSalary,
      status: 'DRAFT',
      notes,
      paymentMethod: rawPaymentMethod,
    },
  };
}
