import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../core/errors/AppError';

vi.mock('../../../config/database', () => ({
  prisma: {
    equipment: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    maintenanceRecord: { count: vi.fn() },
    fuelLog: { count: vi.fn() },
    breakdown: { count: vi.fn() },
    sparePartUsage: { count: vi.fn() },
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { EquipmentService } from '../equipment.service';
import { prisma } from '../../../config/database';

type MockPrisma = {
  equipment: {
    findUnique: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  maintenanceRecord: { count: ReturnType<typeof vi.fn> };
  fuelLog: { count: ReturnType<typeof vi.fn> };
  breakdown: { count: ReturnType<typeof vi.fn> };
  sparePartUsage: { count: ReturnType<typeof vi.fn> };
};

const mock = prisma as unknown as MockPrisma;
const fakeReq = {} as import('express').Request;

function stubCounts(m: number, b: number, f: number, sp: number) {
  mock.maintenanceRecord.count.mockResolvedValue(m);
  mock.breakdown.count.mockResolvedValue(b);
  mock.fuelLog.count.mockResolvedValue(f);
  mock.sparePartUsage.count.mockResolvedValue(sp);
}

const existingEquipment = { id: 1, code: 'EQ-001', name: 'حفارة', registrationExpiry: null };

describe('EquipmentService.remove — rich conflict messages', () => {
  let service: EquipmentService;

  beforeEach(() => {
    service = new EquipmentService();
    vi.clearAllMocks();
  });

  it('throws notFound when equipment does not exist', async () => {
    mock.equipment.findUnique.mockResolvedValue(null);
    stubCounts(0, 0, 0, 0);
    await expect(service.remove(999, fakeReq)).rejects.toThrow('المعدة غير موجودة');
  });

  it('mentions maintenance record count in conflict message', async () => {
    mock.equipment.findUnique.mockResolvedValue(existingEquipment);
    stubCounts(3, 0, 0, 0);
    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('3 سجل صيانة');
  });

  it('uses singular form for single maintenance record', async () => {
    mock.equipment.findUnique.mockResolvedValue(existingEquipment);
    stubCounts(1, 0, 0, 0);
    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('سجل صيانة واحد');
  });

  it('mentions breakdown count in conflict message', async () => {
    mock.equipment.findUnique.mockResolvedValue(existingEquipment);
    stubCounts(0, 2, 0, 0);
    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('2 بلاغ عطل');
  });

  it('mentions all categories when multiple are non-zero', async () => {
    mock.equipment.findUnique.mockResolvedValue(existingEquipment);
    stubCounts(2, 1, 5, 3);
    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('2 سجل صيانة');
    expect((err as Error).message).toContain('بلاغ عطل واحد');
    expect((err as Error).message).toContain('5 سجل وقود');
    expect((err as Error).message).toContain('3 سجل قطع غيار');
  });

  it('returns { deleted: true } when equipment has no linked records', async () => {
    mock.equipment.findUnique.mockResolvedValue(existingEquipment);
    mock.equipment.delete.mockResolvedValue(existingEquipment);
    stubCounts(0, 0, 0, 0);
    const result = await service.remove(1, fakeReq);
    expect(result).toEqual({ deleted: true });
  });

  it('conflict error has statusCode 409', async () => {
    mock.equipment.findUnique.mockResolvedValue(existingEquipment);
    stubCounts(1, 0, 0, 0);
    let err: AppError | undefined;
    try { await service.remove(1, fakeReq); } catch (e) { err = e as AppError; }
    expect(err?.statusCode).toBe(409);
  });
});
