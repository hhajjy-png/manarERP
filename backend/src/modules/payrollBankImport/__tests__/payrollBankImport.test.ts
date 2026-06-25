import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectTemplate, normalizeHeader, extractValue, escapeCell, isSafeValue,
  parseSheetMonth, parseMonthColumn, formatSourceMonth, normalizeRow, BANK_CONFIGS,
} from '../excelParser';
import { validateRow, buildPayloadTxCount } from '../validators';
import { buildEmployeeIndex, matchEmployee, confidenceLabel } from '../matcher';
import { buildPreview } from '../previewBuilder';
import type { ParsedBankRow } from '../types';

// ── excelParser ───────────────────────────────────────────────────────────────

describe('normalizeHeader', () => {
  it('trims and lowercases', () => {
    expect(normalizeHeader('  Civil ID  ')).toBe('civil id');
  });
  it('collapses multiple spaces', () => {
    expect(normalizeHeader('Payment  Amount')).toBe('payment amount');
  });
});

describe('detectTemplate', () => {
  it('detects NBK by transaction id + beneficiary account number', () => {
    expect(detectTemplate(['Transaction ID', 'Beneficiary Account Number', 'Civil ID'])).toBe('NBK');
  });
  it('detects KFH by civil number + transaction reference', () => {
    expect(detectTemplate(['Civil Number', 'Transaction Reference', 'Amount'])).toBe('KFH');
  });
  it('detects GulfBank by employee code + civil id + bank account', () => {
    expect(detectTemplate(['Employee Code', 'Civil ID', 'Bank Account'])).toBe('GulfBank');
  });
  it('detects Boubyan by civil id + iban (no bank account col)', () => {
    const headers = ['Civil ID', 'IBAN', 'Amount'];
    // Boubyan sig: ['civil id', 'iban'] — both present
    expect(detectTemplate(headers)).toBe('Boubyan');
  });
  it('detects Warba by reference number + civil number', () => {
    expect(detectTemplate(['Reference Number', 'Civil Number', 'Amount'])).toBe('Warba');
  });
  it('detects AhliUnited by employee id + national id', () => {
    expect(detectTemplate(['Employee ID', 'National ID', 'Amount'])).toBe('AhliUnited');
  });
  it('falls back to Unknown when no signature matches', () => {
    expect(detectTemplate(['Col A', 'Col B'])).toBe('Unknown');
  });
});

describe('escapeCell', () => {
  it('returns empty string for formula starting with =', () => {
    expect(escapeCell('=SUM(A1)')).toBe('');
  });
  it('returns empty string for formula starting with +', () => {
    expect(escapeCell('+cmd')).toBe('');
  });
  it('returns trimmed value for safe input', () => {
    expect(escapeCell('  Hello  ')).toBe('Hello');
  });
  it('allows plain numbers as strings', () => {
    expect(escapeCell('123.456')).toBe('123.456');
  });
});

describe('isSafeValue', () => {
  it('rejects = prefix', () => { expect(isSafeValue('=A1')).toBe(false); });
  it('rejects @ prefix', () => { expect(isSafeValue('@SUM')).toBe(false); });
  it('accepts normal string', () => { expect(isSafeValue('Ahmad')).toBe(true); });
  it('accepts empty string', () => { expect(isSafeValue('')).toBe(true); });
});

describe('extractValue', () => {
  const row = { 'civil id': 'C123', 'amount': '500' };
  it('finds first matching key', () => {
    expect(extractValue(row, ['civil id', 'civil number'])).toBe('C123');
  });
  it('tries second key when first missing', () => {
    expect(extractValue(row, ['civil number', 'civil id'])).toBe('C123');
  });
  it('returns empty string when no key matches', () => {
    expect(extractValue(row, ['iban'])).toBe('');
  });
});

describe('parseSheetMonth', () => {
  it('parses mar-2025', () => { expect(parseSheetMonth('mar-2025')).toEqual({ month: 3, year: 2025 }); });
  it('parses january-2026', () => { expect(parseSheetMonth('january-2026')).toEqual({ month: 1, year: 2026 }); });
  it('returns null for bad format', () => { expect(parseSheetMonth('2025-03')).toBeNull(); });
  it('returns null for out-of-range year', () => { expect(parseSheetMonth('mar-1999')).toBeNull(); });
});

describe('parseMonthColumn', () => {
  it('parses Mar-25 string', () => { expect(parseMonthColumn('Mar-25')).toEqual({ month: 3, year: 2025 }); });
  it('parses Date object', () => {
    expect(parseMonthColumn(new Date('2025-06-15'))).toEqual({ month: 6, year: 2025 });
  });
  it('returns null for invalid Date', () => {
    expect(parseMonthColumn(new Date('invalid'))).toBeNull();
  });
  it('returns null for null', () => { expect(parseMonthColumn(null)).toBeNull(); });
});

describe('formatSourceMonth', () => {
  it('formats month 3, year 2025 → Mar-25', () => {
    expect(formatSourceMonth(3, 2025)).toBe('Mar-25');
  });
  it('formats month 12, year 2026 → Dec-26', () => {
    expect(formatSourceMonth(12, 2026)).toBe('Dec-26');
  });
});

describe('normalizeRow', () => {
  it('maps NBK columns correctly', () => {
    const raw = {
      'Transaction ID': 'TXN-001',
      'Civil ID': '123456789',
      'Beneficiary Account Number': 'ACC-100',
      'Beneficiary Account Name': 'أحمد',
      'Payment Amount': '500.000',
      'Currency': 'KWD',
      'Payment Date': '2025-03-15',
      'Status': 'PROCESSED',
    };
    const result = normalizeRow(raw, 'NBK', 'Sheet1', 3, 2025, 0);
    expect(result.transactionId).toBe('TXN-001');
    expect(result.civilId).toBe('123456789');
    expect(result.amount).toBe(500);
    expect(result.currency).toBe('KWD');
    expect(result.beneficiaryName).toBe('أحمد');
  });

  it('rejects formula in beneficiary name', () => {
    const raw = { 'Beneficiary Account Name': '=HYPERLINK("evil")', 'Payment Amount': '100', 'Currency': 'KWD' };
    const result = normalizeRow(raw, 'NBK', 'Sheet1', 3, 2025, 0);
    expect(result.beneficiaryName).toBe('');
  });

  it('maps GulfBank employee code', () => {
    const raw = {
      'Employee Code': 'EMP-42',
      'Civil ID': '987654321',
      'Bank Account': 'BNK-999',
      'Employee Name': 'خالد',
      'Salary': '1200.500',
      'Currency': 'KWD',
    };
    const result = normalizeRow(raw, 'GulfBank', 'Sheet1', 5, 2025, 1);
    expect(result.employeeCode).toBe('EMP-42');
    expect(result.amount).toBe(1200.5);
  });
});

// ── validators ────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ParsedBankRow> = {}): ParsedBankRow {
  return {
    employeeCode: 'EMP-01',
    civilId: '123456789',
    iban: null,
    bankAccount: 'ACC-001',
    beneficiaryName: 'موظف تجريبي',
    amount: 500,
    currency: 'KWD',
    transactionId: 'TXN-001',
    paymentDate: '2025-03-15',
    paymentStatus: 'PROCESSED',
    payrollMonth: 3,
    payrollYear: 2025,
    _rowIndex: 0,
    _sheetName: 'mar-2025',
    ...overrides,
  };
}

describe('validateRow', () => {
  const noExisting = new Set<string>();
  const singleTx = new Map([['TXN-001', 1]]);

  it('valid row has no errors or warnings', () => {
    const { errors, warnings } = validateRow(makeRow(), noExisting, singleTx);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('missing transactionId → error', () => {
    const { errors } = validateRow(makeRow({ transactionId: null }), noExisting, singleTx);
    expect(errors).toContain('رقم المعاملة مفقود');
  });

  it('zero amount → error', () => {
    const { errors } = validateRow(makeRow({ amount: 0 }), noExisting, singleTx);
    expect(errors.some((e) => e.includes('صفر'))).toBe(true);
  });

  it('negative amount → error', () => {
    const { errors } = validateRow(makeRow({ amount: -100 }), noExisting, singleTx);
    expect(errors.some((e) => e.includes('سالب'))).toBe(true);
  });

  it('unsupported currency → error', () => {
    const { errors } = validateRow(makeRow({ currency: 'JPY' }), noExisting, singleTx);
    expect(errors.some((e) => e.includes('غير مدعومة'))).toBe(true);
  });

  it('duplicate in existing DB → error', () => {
    const existing = new Set(['TXN-001']);
    const { errors } = validateRow(makeRow(), existing, singleTx);
    expect(errors.some((e) => e.includes('مستورد مسبقاً'))).toBe(true);
  });

  it('duplicate in payload → error', () => {
    const dupMap = new Map([['TXN-001', 2]]);
    const { errors } = validateRow(makeRow(), noExisting, dupMap);
    expect(errors.some((e) => e.includes('مكرر'))).toBe(true);
  });

  it('non-KWD currency → warning not error', () => {
    const { errors, warnings } = validateRow(makeRow({ currency: 'USD' }), noExisting, singleTx);
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes('USD'))).toBe(true);
  });

  it('missing paymentDate → warning', () => {
    const { warnings } = validateRow(makeRow({ paymentDate: null }), noExisting, singleTx);
    expect(warnings.some((w) => w.includes('تاريخ الدفع'))).toBe(true);
  });

  it('no identifier fields → error', () => {
    const row = makeRow({ employeeCode: null, civilId: null, bankAccount: null, iban: null });
    const { errors } = validateRow(row, noExisting, singleTx);
    expect(errors.some((e) => e.includes('معرّف'))).toBe(true);
  });

  it('invalid payroll month → error', () => {
    const { errors } = validateRow(makeRow({ payrollMonth: 13 }), noExisting, singleTx);
    expect(errors.some((e) => e.includes('شهر'))).toBe(true);
  });

  it('invalid payroll year → error', () => {
    const { errors } = validateRow(makeRow({ payrollYear: 1990 }), noExisting, singleTx);
    expect(errors.some((e) => e.includes('سنة'))).toBe(true);
  });
});

describe('buildPayloadTxCount', () => {
  it('counts single occurrence as 1', () => {
    const rows = [makeRow({ transactionId: 'TXN-A' })];
    const m = buildPayloadTxCount(rows);
    expect(m.get('TXN-A')).toBe(1);
  });
  it('counts duplicate as 2', () => {
    const rows = [makeRow({ transactionId: 'TXN-A' }), makeRow({ transactionId: 'TXN-A' })];
    expect(buildPayloadTxCount(rows).get('TXN-A')).toBe(2);
  });
  it('skips null transactionId', () => {
    const rows = [makeRow({ transactionId: null })];
    expect(buildPayloadTxCount(rows).size).toBe(0);
  });
});

// ── matcher ────────────────────────────────────────────────────────────────────

const employees = [
  { id: 1, code: 'EMP-01', fullName: 'أحمد محمد', civilId: 'CID-001', bankAccount: 'ACC-001', status: 'ACTIVE' },
  { id: 2, code: 'EMP-02', fullName: 'خالد عبدالله', civilId: 'CID-002', bankAccount: 'ACC-002', status: 'ACTIVE' },
  { id: 3, code: 'EMP-03', fullName: 'سالم يوسف', civilId: 'CID-003', bankAccount: null, status: 'TERMINATED' },
];

describe('matchEmployee', () => {
  const index = buildEmployeeIndex(employees);

  it('matches by employee code at 100%', () => {
    const result = matchEmployee(makeRow({ employeeCode: 'EMP-01' }), index);
    expect(result.isMatched).toBe(true);
    expect(result.confidence).toBe('CODE_100');
    expect(result.employeeId).toBe(1);
  });

  it('matches by civil ID at 100% when no code present', () => {
    const result = matchEmployee(makeRow({ employeeCode: null, civilId: 'CID-002' }), index);
    expect(result.isMatched).toBe(true);
    expect(result.confidence).toBe('CIVIL_ID_100');
    expect(result.employeeId).toBe(2);
  });

  it('matches by bank account at 90%', () => {
    const result = matchEmployee(makeRow({ employeeCode: null, civilId: null, bankAccount: 'ACC-001' }), index);
    expect(result.isMatched).toBe(true);
    expect(result.confidence).toBe('BANK_ACCOUNT_90');
  });

  it('matches by name at MANUAL confidence', () => {
    const result = matchEmployee(makeRow({ employeeCode: null, civilId: null, bankAccount: null, beneficiaryName: 'أحمد محمد' }), index);
    expect(result.isMatched).toBe(true);
    expect(result.confidence).toBe('MANUAL');
  });

  it('returns unmatched when no field matches', () => {
    const result = matchEmployee(makeRow({ employeeCode: 'UNKNOWN', civilId: 'UNKNOWN', bankAccount: 'UNKNOWN', beneficiaryName: 'مجهول' }), index);
    expect(result.isMatched).toBe(false);
    expect(result.employeeId).toBeNull();
  });

  it('code match takes priority over civil ID', () => {
    // row has both code and civilId but code belongs to emp 1, civilId belongs to emp 2
    const result = matchEmployee(makeRow({ employeeCode: 'EMP-01', civilId: 'CID-002' }), index);
    expect(result.employeeId).toBe(1); // code wins
    expect(result.confidence).toBe('CODE_100');
  });

  it('exposes employee status for TERMINATED check', () => {
    const result = matchEmployee(makeRow({ employeeCode: 'EMP-03' }), index);
    expect(result.isMatched).toBe(true);
    expect(result.employeeStatus).toBe('TERMINATED');
  });
});

describe('confidenceLabel', () => {
  it('returns Arabic label for CODE_100', () => {
    expect(confidenceLabel('CODE_100')).toContain('100%');
  });
  it('returns Manual label', () => {
    expect(confidenceLabel('MANUAL')).toContain('يدوية');
  });
  it('returns dash for null', () => {
    expect(confidenceLabel(null)).toBe('—');
  });
});

// ── previewBuilder ─────────────────────────────────────────────────────────────

describe('buildPreview', () => {
  const row1 = makeRow({ transactionId: 'TXN-A', amount: 500 });
  const row2 = makeRow({ transactionId: 'TXN-B', amount: 300, employeeCode: 'EMP-02', civilId: 'CID-002' });

  const index = buildEmployeeIndex(employees);
  const rows = [row1, row2];
  const matches = rows.map((r) => matchEmployee(r, index));
  const validations = rows.map((r) => validateRow(r, new Set(), buildPayloadTxCount(rows)));

  it('aggregates matched/unmatched counts', () => {
    const summary = buildPreview({ templateName: 'NBK', rows, matches, validations, existingTxIds: new Set() });
    expect(summary.matched).toBe(2);
    expect(summary.unmatched).toBe(0);
  });

  it('sums total amount for valid rows', () => {
    const summary = buildPreview({ templateName: 'NBK', rows, matches, validations, existingTxIds: new Set() });
    expect(summary.totalAmount).toBeCloseTo(800, 2);
  });

  it('canExecute is true when all valid and matched', () => {
    const summary = buildPreview({ templateName: 'NBK', rows, matches, validations, existingTxIds: new Set() });
    expect(summary.canExecute).toBe(true);
  });

  it('canExecute is false when unmatched row exists', () => {
    const unmatchedRow = makeRow({ transactionId: 'TXN-C', employeeCode: 'NOBODY', civilId: 'NOBODY', bankAccount: 'NOBODY' });
    const unmatchedMatch = matchEmployee(unmatchedRow, index);
    const unmatchedVal = validateRow(unmatchedRow, new Set(), new Map([['TXN-C', 1]]));
    const summary = buildPreview({
      templateName: 'NBK',
      rows: [unmatchedRow],
      matches: [unmatchedMatch],
      validations: [unmatchedVal],
      existingTxIds: new Set(),
    });
    expect(summary.canExecute).toBe(false);
    expect(summary.unmatched).toBe(1);
  });

  it('marks TERMINATED employee row as error', () => {
    const terminatedRow = makeRow({ transactionId: 'TXN-D', employeeCode: 'EMP-03' });
    const match = matchEmployee(terminatedRow, index);
    const val = validateRow(terminatedRow, new Set(), new Map([['TXN-D', 1]]));
    const summary = buildPreview({ templateName: 'NBK', rows: [terminatedRow], matches: [match], validations: [val], existingTxIds: new Set() });
    expect(summary.rows[0].errors.some((e) => e.includes('TERMINATED'))).toBe(true);
    expect(summary.canExecute).toBe(false);
  });

  it('sets templateName in summary', () => {
    const summary = buildPreview({ templateName: 'KFH', rows, matches, validations, existingTxIds: new Set() });
    expect(summary.templateName).toBe('KFH');
  });
});

// ── BANK_CONFIGS completeness ─────────────────────────────────────────────────

describe('BANK_CONFIGS', () => {
  const expected: string[] = ['KFH', 'NBK', 'Boubyan', 'GulfBank', 'Warba', 'AhliUnited', 'Unknown'];

  it('has all 7 bank entries', () => {
    expect(Object.keys(BANK_CONFIGS)).toHaveLength(7);
    for (const bank of expected) {
      expect(BANK_CONFIGS).toHaveProperty(bank);
    }
  });

  it('every config has required column keys', () => {
    for (const [, cfg] of Object.entries(BANK_CONFIGS)) {
      expect(cfg.columns.beneficiaryName.length).toBeGreaterThan(0);
      expect(cfg.columns.amount.length).toBeGreaterThan(0);
    }
  });

  it('every config has Arabic nameAr', () => {
    for (const [, cfg] of Object.entries(BANK_CONFIGS)) {
      expect(cfg.nameAr).toBeTruthy();
    }
  });
});
