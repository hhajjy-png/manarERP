import type { ParsedBankRow, MatchResult } from './types';

// ── Employee index ─────────────────────────────────────────────────────────────

interface EmployeeRecord {
  id: number;
  code: string;
  fullName: string;
  civilId: string | null;
  bankAccount: string | null;
  status: string;
}

export interface EmployeeIndex {
  byCode:        Map<string, EmployeeRecord>;
  byCivilId:     Map<string, EmployeeRecord>;
  byBankAccount: Map<string, EmployeeRecord>;
  byNameLower:   Map<string, EmployeeRecord>;
}

export function buildEmployeeIndex(employees: EmployeeRecord[]): EmployeeIndex {
  const byCode        = new Map<string, EmployeeRecord>();
  const byCivilId     = new Map<string, EmployeeRecord>();
  const byBankAccount = new Map<string, EmployeeRecord>();
  const byNameLower   = new Map<string, EmployeeRecord>();

  for (const emp of employees) {
    byCode.set(emp.code.trim(), emp);
    if (emp.civilId?.trim())     byCivilId.set(emp.civilId.trim(), emp);
    if (emp.bankAccount?.trim()) byBankAccount.set(emp.bankAccount.trim(), emp);
    byNameLower.set(emp.fullName.trim().toLowerCase(), emp);
  }
  return { byCode, byCivilId, byBankAccount, byNameLower };
}

// ── Match a single row ─────────────────────────────────────────────────────────

/**
 * Priority: Code (100%) → Civil ID (100%) → Bank Account (90%) → IBAN as bank account (90%) → Name (Manual).
 * Returns the best match found.
 */
export function matchEmployee(row: ParsedBankRow, index: EmployeeIndex): MatchResult {
  let emp: EmployeeRecord | undefined;

  // 1. Employee code — 100%
  if (row.employeeCode) {
    emp = index.byCode.get(row.employeeCode.trim());
    if (emp) return makeResult(emp, 'CODE_100');
  }

  // 2. Civil ID — 100%
  if (row.civilId) {
    emp = index.byCivilId.get(row.civilId.trim());
    if (emp) return makeResult(emp, 'CIVIL_ID_100');
  }

  // 3. Bank Account — 90%
  if (row.bankAccount) {
    emp = index.byBankAccount.get(row.bankAccount.trim());
    if (emp) return makeResult(emp, 'BANK_ACCOUNT_90');
  }

  // 4. IBAN — treat last 16 chars as account number for 90% match
  if (row.iban) {
    const ibanClean = row.iban.replace(/\s/g, '');
    emp = index.byBankAccount.get(ibanClean);
    if (!emp) {
      // Try suffix match: last 12 digits of IBAN vs stored bankAccount
      const suffix = ibanClean.slice(-12);
      for (const [stored, e] of index.byBankAccount) {
        if (stored.endsWith(suffix) || suffix.endsWith(stored.slice(-12))) {
          emp = e;
          break;
        }
      }
    }
    if (emp) return makeResult(emp, 'BANK_ACCOUNT_90');
  }

  // 5. Beneficiary name — Manual confidence
  if (row.beneficiaryName) {
    const nameLower = row.beneficiaryName.trim().toLowerCase();
    // Exact name match
    emp = index.byNameLower.get(nameLower);
    if (!emp) {
      // Partial name match — first candidate whose stored name is contained or vice versa
      for (const [stored, e] of index.byNameLower) {
        if (stored.includes(nameLower) || nameLower.includes(stored)) {
          emp = e;
          break;
        }
      }
    }
    if (emp) return makeResult(emp, 'MANUAL');
  }

  return { employeeId: null, employeeName: null, employeeCode: null, employeeStatus: null, confidence: null, isMatched: false };
}

function makeResult(emp: EmployeeRecord, confidence: MatchResult['confidence']): MatchResult {
  return {
    employeeId:     emp.id,
    employeeName:   emp.fullName,
    employeeCode:   emp.code,
    employeeStatus: emp.status,
    confidence,
    isMatched: true,
  };
}

/** Human-readable Arabic label for a confidence level. */
export function confidenceLabel(c: MatchResult['confidence']): string {
  switch (c) {
    case 'CODE_100':        return 'رقم الموظف — 100%';
    case 'CIVIL_ID_100':    return 'الرقم المدني — 100%';
    case 'BANK_ACCOUNT_90': return 'رقم الحساب — 90%';
    case 'MANUAL':          return 'مطابقة يدوية';
    default:                return '—';
  }
}
