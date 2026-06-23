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

interface ChildCounts {
  invoices: number;
  expenses: number;
  purchaseOrdersActive: number;
  purchaseOrdersCancelled: number;
  goodsReceiptsPosted: number;
  goodsReceiptsDraft: number;
}

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

    const invoiceCount = supplier._count.invoices;
    const expenseCount = supplier._count.expenses;

    if (invoiceCount > 0 || expenseCount > 0) {
      const [firstInvoice, firstExpense] = await Promise.all([
        invoiceCount > 0
          ? prisma.invoice.findFirst({ where: { supplierId: id }, select: { invoiceNumber: true } })
          : Promise.resolve(null),
        expenseCount > 0
          ? prisma.expense.findFirst({ where: { supplierId: id }, select: { code: true } })
          : Promise.resolve(null),
      ]);

      const parts: string[] = [];

      if (invoiceCount === 1 && firstInvoice) {
        parts.push(`الفاتورة ${firstInvoice.invoiceNumber}`);
      } else if (invoiceCount > 1 && firstInvoice) {
        parts.push(`الفاتورة ${firstInvoice.invoiceNumber}، و${invoiceCount - 1} فاتورة أخرى`);
      } else if (invoiceCount > 0) {
        parts.push(`${invoiceCount} فاتورة`);
      }

      if (expenseCount === 1 && firstExpense) {
        parts.push(`المصروف ${firstExpense.code}`);
      } else if (expenseCount > 1 && firstExpense) {
        parts.push(`المصروف ${firstExpense.code}، و${expenseCount - 1} مصروف آخر`);
      } else if (expenseCount > 0) {
        parts.push(`${expenseCount} مصروف`);
      }

      throw AppError.conflict(
        `لا يمكن حذف هذا المورّد لأنه مستخدم في ${parts.join('، و')} — يمكنك أرشفته`,
      );
    }

    await repo.delete(id);
    await recordAudit({ req, action: 'DELETE', module: 'suppliers', entityId: id });
    return { deleted: true };
  }

  private async getChildCounts(id: number): Promise<ChildCounts> {
    const [invoices, expenses, purchaseOrdersActive, purchaseOrdersCancelled, goodsReceiptsPosted, goodsReceiptsDraft] =
      await Promise.all([
        prisma.invoice.count({ where: { supplierId: id } }),
        prisma.expense.count({ where: { supplierId: id } }),
        prisma.purchaseOrder.count({ where: { supplierId: id, status: { not: 'CANCELLED' } } }),
        prisma.purchaseOrder.count({ where: { supplierId: id, status: 'CANCELLED' } }),
        prisma.goodsReceipt.count({ where: { supplierId: id, status: 'POSTED' } }),
        prisma.goodsReceipt.count({ where: { supplierId: id, status: 'DRAFT' } }),
      ]);
    return { invoices, expenses, purchaseOrdersActive, purchaseOrdersCancelled, goodsReceiptsPosted, goodsReceiptsDraft };
  }

  async forceRemovePreview(id: number) {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw AppError.notFound('المورّد غير موجود');

    const childCounts = await this.getChildCounts(id);
    const totalChildRecords = Object.values(childCounts).reduce((a, b) => a + b, 0);

    const willBeDeleted = ['supplier'];
    if (childCounts.purchaseOrdersCancelled > 0) willBeDeleted.push('purchaseOrdersCancelled');
    if (childCounts.goodsReceiptsDraft > 0) willBeDeleted.push('goodsReceiptsDraft');

    const willBeNullified: string[] = [];
    if (childCounts.expenses > 0) willBeNullified.push('expenses.supplierId');

    let blockedReason: string | undefined;
    if (childCounts.invoices > 0) {
      blockedReason = `لا يمكن حذف مورّد لديه فواتير مسجلة (${childCounts.invoices} فاتورة) — استخدم الأرشفة بدلاً من ذلك`;
    } else if (childCounts.goodsReceiptsPosted > 0) {
      blockedReason = `لا يمكن حذف مورّد لديه إيصالات استلام محاسبية مسجلة (${childCounts.goodsReceiptsPosted} إيصال) — استخدم الأرشفة بدلاً من ذلك`;
    } else if (childCounts.purchaseOrdersActive > 0) {
      blockedReason = `لا يمكن حذف مورّد لديه أوامر شراء نشطة (${childCounts.purchaseOrdersActive} أمر) — يرجى إلغاؤها أولاً`;
    }

    return {
      supplier,
      childCounts,
      totalChildRecords,
      willBeDeleted,
      willBeNullified,
      ...(blockedReason ? { blockedReason } : {}),
    };
  }

  async forceRemove(id: number, req: Request) {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw AppError.notFound('المورّد غير موجود');

    const childCounts = await this.getChildCounts(id);

    if (childCounts.invoices > 0) {
      throw AppError.conflict('لا يمكن حذف مورّد لديه فواتير مسجلة — استخدم الأرشفة بدلاً من ذلك');
    }
    if (childCounts.goodsReceiptsPosted > 0) {
      throw AppError.conflict('لا يمكن حذف مورّد لديه إيصالات استلام محاسبية مسجلة — استخدم الأرشفة بدلاً من ذلك');
    }
    if (childCounts.purchaseOrdersActive > 0) {
      throw AppError.conflict('لا يمكن حذف مورّد لديه أوامر شراء نشطة — يرجى إلغاؤها أولاً');
    }

    const totalChildRecords = Object.values(childCounts).reduce((a, b) => a + b, 0);

    const willBeDeleted = ['supplier'];
    if (childCounts.purchaseOrdersCancelled > 0) willBeDeleted.push('purchaseOrdersCancelled');
    if (childCounts.goodsReceiptsDraft > 0) willBeDeleted.push('goodsReceiptsDraft');

    const willBeNullified: string[] = [];
    if (childCounts.expenses > 0) willBeNullified.push('expenses.supplierId');

    await prisma.$transaction(async (tx) => {
      if (childCounts.expenses > 0) {
        await tx.expense.updateMany({ where: { supplierId: id }, data: { supplierId: null } });
      }
      if (childCounts.purchaseOrdersCancelled > 0) {
        await tx.purchaseOrder.deleteMany({ where: { supplierId: id, status: 'CANCELLED' } });
      }
      if (childCounts.goodsReceiptsDraft > 0) {
        await tx.goodsReceipt.deleteMany({ where: { supplierId: id, status: 'DRAFT' } });
      }
      await tx.supplier.delete({ where: { id } });
    });

    await recordAudit({
      req,
      action: 'DELETE',
      module: 'suppliers',
      entityId: id,
      oldValue: {
        forceDelete: true,
        deletedEntity: { id: supplier.id, code: supplier.code, name: supplier.name },
        childCounts,
        totalChildRecords,
        willBeDeleted,
        willBeNullified,
      },
    });

    return { deleted: true, impact: { childCounts, totalChildRecords } };
  }
}

export const suppliersService = new SuppliersService();
