import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Enterprise Data Grid Foundation — شبكة الرواتب الموحّدة: المسار الأساسي
 * (شهر+سنة) يُبنى في الذاكرة (محسوب + مستورد) ثم يُقتطع صفحةً — الفرز يجب أن
 * يقع قبل الاقتطاع عبر sortRowsInMemory وإلا فُرزت الصفحة الظاهرة وحدها.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    payroll: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock('../payrollMonth.readModel', () => ({
  buildUnifiedMonthRows: vi.fn(),
  toUnifiedComputed: vi.fn((x: unknown) => x),
}));

import { buildUnifiedMonthRows } from '../payrollMonth.readModel';
import { PayrollService } from '../payroll.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRows = (rows: any[]) => (buildUnifiedMonthRows as any).mockResolvedValue(rows);

const ROWS = [
  { id: 1, employeeName: 'باسم', netSalary: 300, grossSalary: 350, snapshotBaseSalary: 300, baseSalary: 300, totalDeductions: 20, totalAdvances: 30, month: 6, year: 2026, status: 'PAID' },
  { id: 'imported:9', employeeName: 'أحمد', netSalary: 500, grossSalary: null, snapshotBaseSalary: null, baseSalary: null, totalDeductions: null, totalAdvances: null, month: 6, year: 2026, status: 'PAID' },
  { id: 2, employeeName: 'جاسم', netSalary: 100, grossSalary: 120, snapshotBaseSalary: 100, baseSalary: 100, totalDeductions: 5, totalAdvances: 0, month: 6, year: 2026, status: 'DRAFT' },
];

const service = new PayrollService();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('payroll unified grid — in-memory sorting', () => {
  it('no sort params → read-model order preserved, slice unchanged', async () => {
    mockRows(ROWS);
    const result = await service.list({ month: '6', year: '2026' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.data as any[]).map((r) => r.id)).toEqual([1, 'imported:9', 2]);
  });

  it('net desc sorts the WHOLE month before pagination slice', async () => {
    mockRows(ROWS);
    const result = await service.list({ month: '6', year: '2026', sortBy: 'net', sortDir: 'desc', page: 1, pageSize: 2 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.data as any[]).map((r) => r.netSalary)).toEqual([500, 300]);
    expect(result.meta.total).toBe(3);
  });

  it('imported rows (null breakdown) sink last when sorting by gross', async () => {
    mockRows(ROWS);
    const result = await service.list({ month: '6', year: '2026', sortBy: 'gross', sortDir: 'asc' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.data as any[]).map((r) => r.grossSalary)).toEqual([120, 350, null]);
  });

  it('employee name sorts with Arabic collation', async () => {
    mockRows(ROWS);
    const result = await service.list({ month: '6', year: '2026', sortBy: 'employee', sortDir: 'asc' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.data as any[]).map((r) => r.employeeName)).toEqual(['أحمد', 'باسم', 'جاسم']);
  });

  it('non-whitelisted key → read-model order untouched', async () => {
    mockRows(ROWS);
    const result = await service.list({ month: '6', year: '2026', sortBy: 'id', sortDir: 'asc' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.data as any[]).map((r) => r.id)).toEqual([1, 'imported:9', 2]);
  });
});
