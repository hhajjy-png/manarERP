import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormsService } from '../forms.service';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findUnique: vi.fn() },
    payroll: { findFirst: vi.fn() },
    leave: { findFirst: vi.fn() },
    payrollAdvance: { findFirst: vi.fn() },
    performanceReview: { findFirst: vi.fn() },
    setting: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from '../../../config/database';

const MOCK_EMPLOYEE = {
  id: 1,
  code: 'EMP001',
  fullName: 'محمد أحمد',
  fullNameEn: 'Mohammad Ahmad',
  civilId: '123456789',
  jobTitle: 'سائق شاحنة',
  nationality: 'هندي',
  passportNumber: 'A1234567',
  passportExpiry: null,
  residencyExpiry: null,
  licenseExpiry: null,
  vehiclePlate: null,
  vehicleLicenseExpiry: null,
  birthDate: null,
  company: null,
  department: null,
  salary: 150,
  hireDate: new Date('2024-01-01'),
  phone: null,
  email: null,
  address: null,
  photoPath: null,
  status: 'ACTIVE',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('FormsService — getEmploymentContractData', () => {
  const service = new FormsService();

  beforeEach(() => vi.clearAllMocks());

  it('returns employee data for a valid employee ID', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(MOCK_EMPLOYEE as any);

    const result = await service.getEmploymentContractData(1);

    expect(prisma.employee.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(result.employee.id).toBe(1);
    expect(result.employee.fullName).toBe('محمد أحمد');
    expect(result.employee.salary).toBe(150);
  });

  it('throws AppError with Arabic message when employee not found', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);

    await expect(service.getEmploymentContractData(99)).rejects.toMatchObject({
      message: 'الموظف غير موجود',
    });
  });
});

// ── RCV sequence generator ─────────────────────────────────────────────────────

describe('FormsService — generateReceiptVoucherNumber', () => {
  const service = new FormsService();

  function makeTx(existingSeq: string | null) {
    return {
      setting: {
        findUnique: vi.fn().mockResolvedValue(existingSeq ? { value: existingSeq } : null),
        upsert: vi.fn().mockResolvedValue({}),
      },
    } as any;
  }

  beforeEach(() => vi.clearAllMocks());

  it('generates RCV-000001 when no counter exists', async () => {
    const tx = makeTx(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const result = await service.generateReceiptVoucherNumber();

    expect(result).toBe('RCV-000001');
    expect(tx.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: '1' }, create: expect.objectContaining({ value: '1' }) }),
    );
  });

  it('increments existing counter correctly (5 → RCV-000006)', async () => {
    const tx = makeTx('5');
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const result = await service.generateReceiptVoucherNumber();

    expect(result).toBe('RCV-000006');
    expect(tx.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: '6' } }),
    );
  });

  it('treats a corrupted counter (NaN) as 0 and generates RCV-000001', async () => {
    const tx = makeTx('bad-value');
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const result = await service.generateReceiptVoucherNumber();

    expect(result).toBe('RCV-000001');
  });

  it('uses $transaction for atomic read-increment-write (no direct prisma.setting call)', async () => {
    const tx = makeTx('0');
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await service.generateReceiptVoucherNumber();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Direct prisma.setting should never be called — only tx.setting inside the callback
    expect(prisma.setting.findUnique).not.toHaveBeenCalled();
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  it('each call produces a unique number (sequence never reused)', async () => {
    let seq = 10;
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const tx = makeTx(String(seq));
      const result = await fn(tx);
      seq++;
      return result;
    });

    const first  = await service.generateReceiptVoucherNumber();
    const second = await service.generateReceiptVoucherNumber();

    expect(first).toBe('RCV-000011');
    expect(second).toBe('RCV-000012');
    expect(first).not.toBe(second);
  });

  it('second print in same session: each API call generates a new unique number regardless of state', async () => {
    // The frontend resets rcvNumber to '' before calling the API on a second print.
    // The service always generates a fresh number — this test confirms no stale number is returned.
    let seq = 0;
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      seq++;
      const tx = makeTx(String(seq - 1)); // seq was 0 before first call, 1 before second
      return fn(tx);
    });

    const firstPrint  = await service.generateReceiptVoucherNumber();
    const secondPrint = await service.generateReceiptVoucherNumber();

    expect(firstPrint).toBe('RCV-000001');
    expect(secondPrint).toBe('RCV-000002');
    expect(firstPrint).not.toBe(secondPrint);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });
});
