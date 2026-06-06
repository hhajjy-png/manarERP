import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { BaseRepository } from '../../shared/repositories/BaseRepository';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { CreateSupplierInput, UpdateSupplierInput } from './suppliers.schema';

class SuppliersRepository extends BaseRepository<{ id: number }> {
  protected readonly model = 'supplier';
  findWithCounts(id: number) {
    return prisma.supplier.findUnique({
      where: { id },
      include: { _count: { select: { invoices: true, expenses: true } } },
    });
  }
}
const repo = new SuppliersRepository();

export class SuppliersService {
  async list(query: PaginationQuery & { archived?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.SupplierWhereInput = {
      isArchived: query.archived === 'true' ? true : query.archived === 'all' ? undefined : false,
    };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { code: { contains: query.search } },
        { phone: { contains: query.search } },
      ];
    }
    const { data, total } = await repo.findMany({ where, pagination });
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const supplier = await repo.findWithCounts(id);
    if (!supplier) throw AppError.notFound('المورّد غير موجود');
    return supplier;
  }

  async create(input: CreateSupplierInput, req: Request) {
    if (await repo.exists({ code: input.code })) throw AppError.conflict('رقم المورّد مُستخدم من قبل');
    const supplier = await repo.create({ ...input, email: input.email || null });
    await recordAudit({ req, action: 'CREATE', module: 'suppliers', entityId: supplier.id, newValue: input });
    return supplier;
  }

  async update(id: number, input: UpdateSupplierInput, req: Request) {
    const current = await repo.findById(id);
    if (!current) throw AppError.notFound('المورّد غير موجود');
    const data = { ...input } as Record<string, unknown>;
    if (input.email !== undefined) data.email = input.email || null;
    const supplier = await repo.update(id, data);
    await recordAudit({ req, action: 'UPDATE', module: 'suppliers', entityId: id, oldValue: current, newValue: input });
    return supplier;
  }

  async setArchived(id: number, archived: boolean, req: Request) {
    await this.getById(id);
    const supplier = await repo.update(id, { isArchived: archived });
    await recordAudit({ req, action: archived ? 'ARCHIVE' : 'UNARCHIVE', module: 'suppliers', entityId: id });
    return supplier;
  }

  async remove(id: number, req: Request) {
    const supplier = await repo.findWithCounts(id);
    if (!supplier) throw AppError.notFound('المورّد غير موجود');
    if (supplier._count.invoices > 0 || supplier._count.expenses > 0) {
      throw AppError.conflict('لا يمكن حذف مورّد مرتبط بفواتير أو مصروفات — يمكنك أرشفته');
    }
    await repo.delete(id);
    await recordAudit({ req, action: 'DELETE', module: 'suppliers', entityId: id });
    return { deleted: true };
  }
}

export const suppliersService = new SuppliersService();
