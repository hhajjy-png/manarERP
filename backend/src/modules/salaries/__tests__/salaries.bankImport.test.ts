import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findMany: vi.fn() },
    salaryPayment: { findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import {
  salariesBankImportService,
  parseSheetMonth,
  formatSourceMonth,
  BankImportInputRow,
} from '../salaries.bankImport.service';

// ── helpers ───────────────────────────────────────────────────────────────────

function baseRow(overrides: Partial<BankImportInputRow> = {}): BankImportInputRow {
  return {
    transactionId: 'TXN-001',
    beneficiaryAccount: '1234567890',
    beneficiaryName: 'أحمد محمد',
    amount: 350.0,
    currency: 'KWD',
    paymentType: 'SALARY',
    status: 'PROCESSED',
    paymentDate: '2025-03-27T00:00:00.000Z',
    civilId: '284111222333',
    payrollMonth: 3,
    payrollYear: 2025,
    _sheetName: 'mar-2025',
    _rowIndex: 0,
    ...overrides,
  };
}

const EMPLOYEE_LIST = [
  { id: 1, fullName: 'أحمد محمد', civilId: '284111222333', bankAccount: '1234567890' },
  { id: 2, fullName: 'سارة خالد', civilId: '285222333444', bankAccount: '9876543210' },
];

// ── parseSheetMonth ───────────────────────────────────────────────────────────

describe('parseSheetMonth', () => {
  it('parses mar-2025', () => {
    expect(parseSheetMonth('mar-2025')).toEqual({ month: 3, year: 2025 });
  });

  it('parses april-2025', () => {
    expect(parseSheetMonth('april-2025')).toEqual({ month: 4, year: 2025 });
  });

  it('parses may-2026 (no dash variant)', () => {
    expect(parseSheetMonth('may-2026')).toEqual({ month: 5, year: 2026 });
  });

  it('parses MARCH-2025 (case-insensitive)', () => {
    expect(parseSheetMonth('MARCH-2025')).toEqual({ month: 3, year: 2025 });
  });

  it('returns null for unparseable names', () => {
    expect(parseSheetMonth('Sheet1')).toBeNull();
    expect(parseSheetMonth('2025-03')).toBeNull();
    expect(parseSheetMonth('foo-2025')).toBeNull();
  });

  it('returns null for years outside 2000-2100', () => {
    expect(parseSheetMonth('jan-1999')).toBeNull();
    expect(parseSheetMonth('jan-2101')).toBeNull();
  });
});

// ── formatSourceMonth ─────────────────────────────────────────────────────────

describe('formatSourceMonth', () => {
  it('formats month 3 year 2025 as Mar-25', () => {
    expect(formatSourceMonth(3, 2025)).toBe('Mar-25');
  });

  it('formats month 12 year 2026 as Dec-26', () => {
    expect(formatSourceMonth(12, 2026)).toBe('Dec-26');
  });
});

// ── preview ───────────────────────────────────────────────────────────────────

describe('salariesBankImportService.preview', () => {
  beforeEach(() => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue(EMPLOYEE_LIST as any);
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([]);
  });

  it('returns valid preview for a correct row matched by civilId', async () => {
    const result = await salariesBankImportService.preview([baseRow()]);
    expect(result.totalRows).toBe(1);
    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(0);
    expect(result.invalid).toBe(0);
    expect(result.canExecute).toBe(true);
    expect(result.rows[0].matchMethod).toBe('civilId');
    expect(result.rows[0].employeeName).toBe('أحمد محمد');
  });

  it('falls back to bankAccount matching when civilId is absent', async () => {
    const row = baseRow({ civilId: undefined });
    const result = await salariesBankImportService.preview([row]);
    expect(result.matched).toBe(1);
    expect(result.rows[0].matchMethod).toBe('bankAccount');
  });

  it('civilId matching takes priority over bankAccount', async () => {
    // Employee 1 has civilId 284111222333; employee 2 has bankAccount 9876543210
    // Row has civilId of employee 1 but bankAccount of employee 2
    const row = baseRow({ civilId: '284111222333', beneficiaryAccount: '9876543210' });
    const result = await salariesBankImportService.preview([row]);
    expect(result.rows[0].matchMethod).toBe('civilId');
    expect(result.rows[0].employeeId).toBe(1);
  });

  it('blocks when employee cannot be matched', async () => {
    const row = baseRow({ civilId: 'UNKNOWN_CID', beneficiaryAccount: 'UNKNOWN_ACCT' });
    const result = await salariesBankImportService.preview([row]);
    expect(result.unmatched).toBe(1);
    expect(result.canExecute).toBe(false);
    expect(result.rows[0].errors).toContain('لم يتم العثور على موظف مطابق (الرقم المدني أو رقم الحساب البنكي)');
  });

  it('rejects invalid currency', async () => {
    const result = await salariesBankImportService.preview([baseRow({ currency: 'USD' })]);
    expect(result.invalid).toBe(1);
    expect(result.rows[0].errors.some((e) => e.includes('العملة'))).toBe(true);
  });

  it('rejects invalid status', async () => {
    const result = await salariesBankImportService.preview([baseRow({ status: 'FAILED' })]);
    expect(result.invalid).toBe(1);
    expect(result.rows[0].errors.some((e) => e.includes('الحالة'))).toBe(true);
  });

  it('rejects duplicate transactionId within payload', async () => {
    const rows = [baseRow({ _rowIndex: 0 }), baseRow({ _rowIndex: 1 })];
    const result = await salariesBankImportService.preview(rows);
    expect(result.duplicate).toBe(2);
    expect(result.rows[0].isDuplicate).toBe(true);
    expect(result.rows[1].isDuplicate).toBe(true);
  });

  it('rejects already-imported transactionId', async () => {
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([{ transactionId: 'TXN-001' }] as any);
    const result = await salariesBankImportService.preview([baseRow()]);
    expect(result.rows[0].isDuplicate).toBe(true);
    expect(result.rows[0].errors.some((e) => e.includes('مستورد مسبقاً'))).toBe(true);
  });

  it('rejects invalid payment amount', async () => {
    const result = await salariesBankImportService.preview([baseRow({ amount: -50 })]);
    expect(result.invalid).toBe(1);
    expect(result.rows[0].errors.some((e) => e.includes('المبلغ'))).toBe(true);
  });

  it('rejects invalid payment date', async () => {
    const result = await salariesBankImportService.preview([baseRow({ paymentDate: 'not-a-date' })]);
    expect(result.invalid).toBe(1);
    expect(result.rows[0].errors.some((e) => e.includes('تاريخ الدفع'))).toBe(true);
  });

  it('rejects missing transactionId', async () => {
    const result = await salariesBankImportService.preview([baseRow({ transactionId: '' })]);
    expect(result.invalid).toBe(1);
    expect(result.rows[0].errors.some((e) => e.includes('رقم المعاملة'))).toBe(true);
  });

  it('payment date may differ from sheet month', async () => {
    // Sheet is mar-2025 but payment date is in April — should still be valid
    const row = baseRow({ paymentDate: '2025-04-10T00:00:00.000Z', payrollMonth: 3, payrollYear: 2025 });
    const result = await salariesBankImportService.preview([row]);
    expect(result.rows[0].isValid).toBe(true);
  });

  it('throws when rows array is empty', async () => {
    await expect(salariesBankImportService.preview([])).rejects.toThrow();
  });
});

// ── execute ───────────────────────────────────────────────────────────────────

describe('salariesBankImportService.execute', () => {
  const mockReq = { user: { userId: 1 }, ip: '127.0.0.1' } as any;

  beforeEach(() => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue(EMPLOYEE_LIST as any);
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as any);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const mockTx = {
        salaryPayment: { create: vi.fn().mockResolvedValue({ id: 1, transactionId: 'TXN-001' }) },
      };
      return fn(mockTx);
    });
  });

  it('successfully imports valid rows', async () => {
    const result = await salariesBankImportService.execute([baseRow()], mockReq);
    expect(result.imported).toBe(1);
    expect(result.totalAmount).toBeGreaterThan(0);
  });

  it('blocks execute when unmatched employee exists', async () => {
    const row = baseRow({ civilId: 'UNKNOWN', beneficiaryAccount: 'UNKNOWN' });
    await expect(salariesBankImportService.execute([row], mockReq)).rejects.toThrow();
  });

  it('blocks execute when any row has invalid currency', async () => {
    const row = baseRow({ currency: 'USD' });
    await expect(salariesBankImportService.execute([row], mockReq)).rejects.toThrow();
  });

  it('blocks execute when already-imported transactionId is in payload', async () => {
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([{ transactionId: 'TXN-001' }] as any);
    await expect(salariesBankImportService.execute([baseRow()], mockReq)).rejects.toThrow();
  });
});
