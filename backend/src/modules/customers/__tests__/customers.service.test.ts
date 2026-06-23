import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../core/errors/AppError';

// Mock Prisma before importing service
vi.mock('../../../config/database', () => ({
  prisma: {
    customer: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../customers.repository', () => ({
  customersRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findWithRelations: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({
  recordAudit: vi.fn(),
}));

import { CustomersService } from '../customers.service';
import { prisma } from '../../../config/database';
import { customersRepository } from '../customers.repository';

const mockPrisma = prisma as unknown as {
  customer: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

const mockRepo = customersRepository as unknown as {
  create: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  findWithRelations: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const fakeReq = {} as import('express').Request;

describe('CustomersService.create', () => {
  let service: CustomersService;

  beforeEach(() => {
    service = new CustomersService();
    vi.clearAllMocks();
  });

  it('creates customer when code is unique', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    mockRepo.create.mockResolvedValue({ id: 1, code: 'C-001', name: 'شركة المنار', type: 'PRIVATE' });

    const result = await service.create({ code: 'C-001', name: 'شركة المنار', type: 'PRIVATE' }, fakeReq);

    expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith({ where: { code: 'C-001' } });
    expect(mockRepo.create).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ code: 'C-001' });
  });

  it('throws conflict error when code already exists (duplicate code on create)', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 99, code: 'C-001', name: 'عميل قديم' });

    await expect(
      service.create({ code: 'C-001', name: 'عميل جديد', type: 'PRIVATE' }, fakeReq),
    ).rejects.toThrow(AppError);

    await expect(
      service.create({ code: 'C-001', name: 'عميل جديد', type: 'PRIVATE' }, fakeReq),
    ).rejects.toThrow('رقم العميل «C-001» مستخدم بالفعل');
  });

  it('conflict error includes existing customer name', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 99, code: 'C-001', name: 'عميل قديم' });

    await expect(
      service.create({ code: 'C-001', name: 'عميل جديد', type: 'PRIVATE' }, fakeReq),
    ).rejects.toThrow('عميل قديم');
  });

  it('conflict error has statusCode 409', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 99, code: 'C-001', name: 'عميل قديم' });

    let caughtError: AppError | undefined;
    try {
      await service.create({ code: 'C-001', name: 'عميل جديد', type: 'PRIVATE' }, fakeReq);
    } catch (e) {
      caughtError = e as AppError;
    }
    expect(caughtError?.statusCode).toBe(409);
  });

  it('does not call repository.create when duplicate is found', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: 99, code: 'C-001', name: 'عميل قديم' });

    try {
      await service.create({ code: 'C-001', name: 'عميل جديد', type: 'PRIVATE' }, fakeReq);
    } catch {
      // expected
    }
    expect(mockRepo.create).not.toHaveBeenCalled();
  });
});

describe('CustomersService.update — duplicate code check', () => {
  let service: CustomersService;

  beforeEach(() => {
    service = new CustomersService();
    vi.clearAllMocks();
  });

  it('allows update when code is not changed', async () => {
    const existingCustomer = { id: 1, code: 'C-001', name: 'شركة المنار', type: 'PRIVATE' };
    mockRepo.findById.mockResolvedValue(existingCustomer);
    mockRepo.update.mockResolvedValue({ ...existingCustomer, name: 'اسم محدث' });

    const result = await service.update(1, { name: 'اسم محدث' }, fakeReq);

    expect(mockPrisma.customer.findUnique).not.toHaveBeenCalled();
    expect(result).toMatchObject({ name: 'اسم محدث' });
  });

  it('allows update when same code is passed (same customer, no conflict)', async () => {
    const existingCustomer = { id: 1, code: 'C-001', name: 'شركة المنار', type: 'PRIVATE' };
    mockRepo.findById.mockResolvedValue(existingCustomer);
    mockRepo.update.mockResolvedValue(existingCustomer);

    await service.update(1, { code: 'C-001', name: 'شركة المنار' }, fakeReq);

    // findUnique is NOT called because new code === existing code
    expect(mockPrisma.customer.findUnique).not.toHaveBeenCalled();
  });

  it('throws conflict when updating to a code used by another customer (edit duplicate)', async () => {
    const existingCustomer = { id: 1, code: 'C-001', name: 'شركة المنار', type: 'PRIVATE' };
    const conflictingCustomer = { id: 2, code: 'C-002', name: 'شركة أخرى', type: 'PRIVATE' };

    mockRepo.findById.mockResolvedValue(existingCustomer);
    mockPrisma.customer.findUnique.mockResolvedValue(conflictingCustomer);

    await expect(
      service.update(1, { code: 'C-002' }, fakeReq),
    ).rejects.toThrow(AppError);

    await expect(
      service.update(1, { code: 'C-002' }, fakeReq),
    ).rejects.toThrow('رقم العميل «C-002» مستخدم بالفعل');
  });

  it('allows update when new code is unique', async () => {
    const existingCustomer = { id: 1, code: 'C-001', name: 'شركة المنار', type: 'PRIVATE' };
    mockRepo.findById.mockResolvedValue(existingCustomer);
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    mockRepo.update.mockResolvedValue({ ...existingCustomer, code: 'C-999' });

    const result = await service.update(1, { code: 'C-999' }, fakeReq);

    expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith({ where: { code: 'C-999' } });
    expect(result).toMatchObject({ code: 'C-999' });
  });

  it('throws notFound when customer does not exist', async () => {
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      service.update(999, { name: 'لا يوجد' }, fakeReq),
    ).rejects.toThrow('العميل غير موجود');
  });
});

// ── remove() — rich FK conflict guard ──────────────────────────────────────

describe('CustomersService.remove — rich conflict messages', () => {
  let service: CustomersService;

  beforeEach(() => {
    service = new CustomersService();
    vi.clearAllMocks();
  });

  it('throws notFound when customer does not exist', async () => {
    mockRepo.findWithRelations.mockResolvedValue(null);
    await expect(service.remove(999, fakeReq)).rejects.toThrow('العميل غير موجود');
  });

  it('mentions single contract code when exactly one contract', async () => {
    mockRepo.findWithRelations.mockResolvedValue({
      id: 1,
      contracts: [{ id: 10, code: 'KW-2025-001', asphaltPlant: 'مصنع أ', status: 'ACTIVE', monthlyTransportValue: 0 }],
      _count: { contracts: 1, invoices: 0 },
    });
    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('KW-2025-001');
    expect((err as Error).message).not.toContain('عقود أخرى');
  });

  it('mentions first contract code and remaining count when multiple contracts', async () => {
    mockRepo.findWithRelations.mockResolvedValue({
      id: 1,
      contracts: [{ id: 10, code: 'KW-2025-001', asphaltPlant: 'مصنع أ', status: 'ACTIVE', monthlyTransportValue: 0 }],
      _count: { contracts: 3, invoices: 2 },
    });
    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('KW-2025-001');
    expect((err as Error).message).toContain('2 عقود أخرى');
    expect((err as Error).message).toContain('2 فواتير');
  });

  it('mentions only invoices when customer has no contracts', async () => {
    mockRepo.findWithRelations.mockResolvedValue({
      id: 1,
      contracts: [],
      _count: { contracts: 0, invoices: 5 },
    });
    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('5 فواتير');
    expect((err as Error).message).not.toContain('عقد');
  });

  it('returns { deleted: true } when customer has no linked records', async () => {
    mockRepo.findWithRelations.mockResolvedValue({
      id: 1,
      contracts: [],
      _count: { contracts: 0, invoices: 0 },
    });
    mockRepo.delete.mockResolvedValue({ id: 1 });

    const result = await service.remove(1, fakeReq);
    expect(result).toEqual({ deleted: true });
    expect(mockRepo.delete).toHaveBeenCalledWith(1);
  });

  it('error has statusCode 409', async () => {
    mockRepo.findWithRelations.mockResolvedValue({
      id: 1,
      contracts: [{ id: 10, code: 'KW-2025-001', asphaltPlant: 'مصنع أ', status: 'ACTIVE', monthlyTransportValue: 0 }],
      _count: { contracts: 1, invoices: 0 },
    });
    let err: AppError | undefined;
    try { await service.remove(1, fakeReq); } catch (e) { err = e as AppError; }
    expect(err?.statusCode).toBe(409);
  });
});
