import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Prisma + audit mocks ────────────────────────────────────────────────────────
const createSpy = vi.fn();

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findMany: vi.fn() },
    salaryPayment: { findMany: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) =>
      cb({ salaryPayment: { create: createSpy } }),
    ),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));
// GL posting of each salary payment is covered by its own tests; stub it here so this
// suite stays focused on import validation.
vi.mock('../salaryPayment.accounting', () => ({ postSalaryPaymentToGL: vi.fn() }));

import { prisma } from '../../../config/database';
import { payrollBankImportService } from '../service';
import type { ParsedBankRow } from '../types';

const EMPLOYEE = { id: 1, code: 'EMP-01', fullName: 'أحمد محمد', civilId: '284010112345', bankAccount: 'ACC-001', salary: 500, status: 'ACTIVE' };

function makeRow(overrides: Partial<ParsedBankRow> = {}): ParsedBankRow {
  return {
    employeeCode: 'EMP-01', civilId: '284010112345', iban: null, bankAccount: 'ACC-001',
    beneficiaryName: 'أحمد محمد', amount: 500, currency: 'KWD', transactionId: 'TXN-001',
    paymentDate: '2025-03-15', paymentStatus: 'PROCESSED', payrollMonth: 3, payrollYear: 2025,
    _rowIndex: 0, _sheetName: 'mar-2025', ...overrides,
  };
}

const mockReq = { user: { id: 1, username: 'tester' } } as never;

beforeEach(() => {
  createSpy.mockReset();
  createSpy.mockResolvedValue({ id: 1 }); // salaryPayment.create → created row (id fed to GL hook)
  vi.mocked(prisma.employee.findMany).mockResolvedValue([EMPLOYEE] as never);
  vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([] as never);
});

describe('preview — assistant is attached', () => {
  it('returns an assistant summary with variance + quality', async () => {
    const summary = await payrollBankImportService.preview({ templateName: 'NBK', rows: [makeRow()] });
    expect(summary.assistant).toBeDefined();
    expect(typeof summary.assistant?.quality.score).toBe('number');
    expect(summary.assistant?.variance.rowCount).toBe(1);
  });
});

describe('execute — re-runs server-side validation', () => {
  it('throws and writes nothing when a row is invalid at the server', async () => {
    // Server sees the transactionId as already imported → hard duplicate error → canExecute false.
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue(
      [{ transactionId: 'TXN-001', civilId: null, sourceMonth: null, amount: 0 }] as never,
    );
    await expect(
      payrollBankImportService.execute({ templateName: 'NBK', rows: [makeRow()] }, mockReq),
    ).rejects.toThrow();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('transactionId unique guard is unchanged — duplicate tx still blocks import', async () => {
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue(
      [{ transactionId: 'TXN-001', civilId: null, sourceMonth: null, amount: 0 }] as never,
    );
    const summary = await payrollBankImportService.preview({ templateName: 'NBK', rows: [makeRow()] });
    expect(summary.rows[0].errors.some((e) => e.includes('مستورد مسبقاً'))).toBe(true);
    expect(summary.canExecute).toBe(false);
  });

  it('imports a clean matched row (assistant warnings do not block)', async () => {
    // amount 500 == salary 500 → no anomaly; row is valid and executes.
    const report = await payrollBankImportService.execute({ templateName: 'NBK', rows: [makeRow()] }, mockReq);
    expect(report.imported).toBe(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});

describe('legacy salaries bank-import routes remain removed', () => {
  it('salaries.routes.ts exposes no /bank-import route', () => {
    const routesPath = join(__dirname, '..', '..', 'salaries', 'salaries.routes.ts');
    const src = readFileSync(routesPath, 'utf8');
    expect(src).not.toMatch(/['"]\/bank-import\/preview['"]/);
    expect(src).not.toMatch(/['"]\/bank-import\/execute['"]/);
    expect(src).not.toContain('salariesBankImportService');
  });
});
