import { describe, it, expect } from 'vitest';
import { buildEmployeeIndex, matchEmployee } from '../matcher';
import { validateRow, buildPayloadTxCount } from '../validators';
import { buildPreview } from '../previewBuilder';
import { runAssistant, type AssistantEmployee } from '../assistant';
import { computeVariance } from '../variance';
import { computeQuality } from '../quality';
import type { ParsedBankRow, PreviewSummary } from '../types';

function makeRow(overrides: Partial<ParsedBankRow> = {}): ParsedBankRow {
  return {
    employeeCode: 'EMP-01',
    civilId: '284010112345',
    iban: null,
    bankAccount: 'ACC-001',
    beneficiaryName: 'أحمد محمد',
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

const EMPLOYEES: AssistantEmployee[] = [
  { id: 1, code: 'EMP-01', fullName: 'أحمد محمد',   civilId: '284010112345', bankAccount: 'ACC-001', salary: 500,  status: 'ACTIVE' },
  { id: 2, code: 'EMP-02', fullName: 'خالد عبدالله', civilId: '285020254321', bankAccount: 'ACC-002', salary: 1000, status: 'ACTIVE' },
  { id: 3, code: 'EMP-03', fullName: 'سالم يوسف',    civilId: '286030367890', bankAccount: 'ACC-003', salary: 300,  status: 'ACTIVE' },
];

interface RunOpts {
  employees?: AssistantEmployee[];
  existingPayments?: { civilId: string | null; sourceMonth: string | null; amount: number }[];
  existingTxIds?: Set<string>;
}

function runFull(rows: ParsedBankRow[], opts: RunOpts = {}): PreviewSummary {
  const employees = opts.employees ?? EMPLOYEES;
  const existingPayments = opts.existingPayments ?? [];
  const existingTxIds = opts.existingTxIds ?? new Set<string>();
  const index = buildEmployeeIndex(employees);
  const matches = rows.map((r) => matchEmployee(r, index));
  const payloadTx = buildPayloadTxCount(rows);
  const validations = rows.map((r) => validateRow(r, existingTxIds, payloadTx));
  const summary = buildPreview({ templateName: 'NBK', rows, matches, validations, existingTxIds });
  return runAssistant(summary, { employees, existingPayments });
}

function codes(summary: PreviewSummary, rowIndex = 0): string[] {
  return summary.rows[rowIndex].assistantWarnings.map((w) => w.code);
}

describe('assistant — non-blocking guarantee', () => {
  it('never changes canExecute for a clean matched row even with warnings', () => {
    // amount 500 vs salary 300 → high anomaly warning, but row still executes.
    const summary = runFull([makeRow({ employeeCode: 'EMP-03', civilId: '286030367890', amount: 500 })]);
    expect(summary.canExecute).toBe(true);
    expect(summary.rows[0].status).toBe('warning'); // promoted for visibility
    expect(summary.rows[0].errors).toHaveLength(0);
  });
});

describe('assistant — IBAN validation', () => {
  it('warns on an invalid IBAN', () => {
    const summary = runFull([makeRow({ iban: 'KW00INVALID000000000000000000' })]);
    expect(codes(summary)).toContain('IBAN_INVALID');
    expect(summary.assistant?.ibanInvalid).toBe(1);
  });
  it('does not warn on a valid Kuwait IBAN', () => {
    const summary = runFull([makeRow({ iban: 'KW81CBKU0000000000001234560101' })]);
    expect(codes(summary)).not.toContain('IBAN_INVALID');
    expect(summary.assistant?.ibanValid).toBe(1);
  });
});

describe('assistant — weak / manual match', () => {
  it('warns when a row matches only by name', () => {
    const row = makeRow({ employeeCode: null, civilId: null, bankAccount: null, iban: null, beneficiaryName: 'أحمد محمد' });
    const summary = runFull([row]);
    expect(summary.rows[0].matchConfidence).toBe('MANUAL');
    expect(codes(summary)).toContain('WEAK_MATCH');
  });
});

describe('assistant — index collisions', () => {
  it('warns when two employees share a civil ID', () => {
    const employees: AssistantEmployee[] = [
      { id: 1, code: 'EMP-01', fullName: 'أحمد', civilId: 'DUP-CID', bankAccount: 'A1', salary: 500, status: 'ACTIVE' },
      { id: 2, code: 'EMP-02', fullName: 'خالد', civilId: 'DUP-CID', bankAccount: 'A2', salary: 500, status: 'ACTIVE' },
    ];
    const row = makeRow({ employeeCode: null, civilId: 'DUP-CID', bankAccount: null });
    const summary = runFull([row], { employees });
    expect(summary.assistant?.collisions.civilId).toContain('DUP-CID');
    expect(codes(summary)).toContain('INDEX_COLLISION_CIVILID');
  });

  it('warns on a duplicate IBAN within the file', () => {
    const iban = 'KW81CBKU0000000000001234560101';
    const rows = [
      makeRow({ _rowIndex: 0, transactionId: 'T1', iban }),
      makeRow({ _rowIndex: 1, transactionId: 'T2', iban, employeeCode: 'EMP-02', civilId: '285020254321' }),
    ];
    const summary = runFull(rows);
    expect(summary.assistant?.collisions.ibanInFile).toContain(iban);
    expect(codes(summary, 0)).toContain('DUP_IBAN_IN_FILE');
  });
});

describe('assistant — salary anomaly', () => {
  it('flags an unusually high payment (> +30%)', () => {
    const summary = runFull([makeRow({ employeeCode: 'EMP-03', civilId: '286030367890', amount: 500 })]); // salary 300
    expect(codes(summary)).toContain('SALARY_ANOMALY_HIGH');
  });
  it('flags an unusually low payment (< -30%)', () => {
    const summary = runFull([makeRow({ employeeCode: 'EMP-02', civilId: '285020254321', amount: 500 })]); // salary 1000
    expect(codes(summary)).toContain('SALARY_ANOMALY_LOW');
  });
  it('does not flag a payment within threshold', () => {
    const summary = runFull([makeRow({ employeeCode: 'EMP-01', civilId: '284010112345', amount: 520 })]); // salary 500
    expect(codes(summary)).not.toContain('SALARY_ANOMALY_HIGH');
    expect(codes(summary)).not.toContain('SALARY_ANOMALY_LOW');
  });
});

describe('assistant — duplicate payroll', () => {
  it('warns when the same employee already has a payment for the month (DB)', () => {
    const summary = runFull([makeRow()], {
      existingPayments: [{ civilId: '284010112345', sourceMonth: 'Mar-25', amount: 500 }],
    });
    expect(codes(summary)).toContain('DUP_PAYROLL_DB');
  });

  it('warns when the same employee is repeated for the same month in the file', () => {
    const rows = [
      makeRow({ _rowIndex: 0, transactionId: 'T1' }),
      makeRow({ _rowIndex: 1, transactionId: 'T2' }),
    ];
    const summary = runFull(rows);
    expect(codes(summary, 0)).toContain('DUP_EMPLOYEE_IN_FILE');
    expect(codes(summary, 1)).toContain('DUP_EMPLOYEE_IN_FILE');
  });

  it('counts a month re-import at the summary level', () => {
    const summary = runFull([makeRow()], {
      existingPayments: [{ civilId: 'OTHER', sourceMonth: 'Mar-25', amount: 100 }],
    });
    expect(summary.assistant?.warningCounts['MONTH_REIMPORT']).toBe(1);
  });
});

describe('variance report', () => {
  it('computes totals, previous period comparison, and missing employees', () => {
    const rows = [makeRow({ employeeCode: 'EMP-01', civilId: '284010112345', amount: 500 })];
    const summary = runFull(rows, {
      existingPayments: [
        { civilId: '284010112345', sourceMonth: 'Feb-25', amount: 480 },
        { civilId: '285020254321', sourceMonth: 'Feb-25', amount: 1000 }, // EMP-02 paid last month, absent now
      ],
    });
    const v = summary.assistant!.variance;
    expect(v.totalImported).toBeCloseTo(500, 3);
    expect(v.matchedCount).toBe(1);
    expect(v.previousPeriodLabel).toBe('Feb-25');
    expect(v.previousTotal).toBeCloseTo(1480, 3);
    expect(v.varianceAmount).toBeCloseTo(500 - 1480, 3);
    expect(v.missingEmployees.map((m) => m.code)).toContain('EMP-02');
  });

  it('reports no previous comparison when prior data is absent (no invented assumptions)', () => {
    const v = computeVariance({ rows: [], existingPayments: [], employees: EMPLOYEES });
    expect(v.previousPeriodLabel).toBeNull();
    expect(v.previousTotal).toBeNull();
    expect(v.missingEmployees).toHaveLength(0);
  });
});

describe('quality score', () => {
  it('returns a perfect score for a clean single valid row', () => {
    const q = computeQuality({
      totalRows: 1, matched: 1, invalid: 0, unmatched: 0, warningRows: 0,
      duplicates: 0, ibanChecked: 0, ibanInvalid: 0, anomalyCount: 0, missingCount: 0,
    });
    expect(q.score).toBe(100);
  });
  it('penalizes errors, unmatched, and anomalies', () => {
    const q = computeQuality({
      totalRows: 10, matched: 6, invalid: 2, unmatched: 4, warningRows: 3,
      duplicates: 1, ibanChecked: 5, ibanInvalid: 2, anomalyCount: 2, missingCount: 1,
    });
    expect(q.score).toBeLessThan(100);
    expect(q.score).toBeGreaterThanOrEqual(0);
    expect(q.errorPenalty).toBeGreaterThan(0);
    expect(q.unmatchedPenalty).toBeGreaterThan(0);
  });
  it('is exposed on the preview summary', () => {
    const summary = runFull([makeRow()]);
    expect(typeof summary.assistant?.quality.score).toBe('number');
  });
});
