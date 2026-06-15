import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { transactionsService } from '../transactions/transactions.service';
import { AddPaymentInput, CreateInvoiceInput, UpdateInvoiceInput } from './invoices.schema';
import { round3, computeTotals, nextStatus, overpaymentExceeds } from './invoices.calc';

const FULL_INCLUDE = {
  items: true,
  payments: { orderBy: { date: 'desc' as const } },
  customer: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  contract: { select: { id: true, asphaltPlant: true } },
};

export class InvoicesService {
  private async generateNumber(client: Prisma.TransactionClient, direction: string) {
    const year = new Date().getFullYear();
    const prefix = direction === 'SALES' ? `INV-${year}-` : `PINV-${year}-`;
    const count = await client.invoice.count({ where: { number: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  /** ترحيل القيد المحاسبي للفاتورة (داخل معاملة). */
  private async postJournal(
    client: Prisma.TransactionClient,
    invoice: { id: number; invoiceNumber: string; direction: string; total: number; issueDate: Date },
  ) {
    if (invoice.direction === 'SALES') {
      await transactionsService.postEntry(
        {
          date: invoice.issueDate,
          description: `إيراد فاتورة مبيعات ${invoice.invoiceNumber}`,
          type: 'REVENUE',
          credit: invoice.total,
          account: 'إيرادات المبيعات',
          referenceType: 'INVOICE',
          referenceId: invoice.id,
        },
        client,
      );
    } else {
      await transactionsService.postEntry(
        {
          date: invoice.issueDate,
          description: `مصروف فاتورة مشتريات ${invoice.invoiceNumber}`,
          type: 'EXPENSE',
          debit: invoice.total,
          account: 'المشتريات',
          referenceType: 'INVOICE',
          referenceId: invoice.id,
        },
        client,
      );
    }
  }

  async list(
    query: PaginationQuery & {
      direction?: string;
      invoiceType?: string;
      status?: string;
      customerId?: string;
      supplierId?: string;
      contractId?: string;
    },
  ) {
    const pagination = getPagination(query);
    const where: Prisma.InvoiceWhereInput = {};
    if (query.direction) where.direction = query.direction;
    if (query.invoiceType) where.invoiceType = query.invoiceType;
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = Number(query.customerId);
    if (query.supplierId) where.supplierId = Number(query.supplierId);
    if (query.contractId) where.contractId = Number(query.contractId);
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search } },
        { number: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { issueDate: 'desc' },
        include: { customer: { select: { name: true } }, supplier: { select: { name: true } } },
      }),
      prisma.invoice.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: FULL_INCLUDE });
    if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');
    return invoice;
  }

  async create(input: CreateInvoiceInput, req: Request) {
    const { lines, subtotal, taxAmount, total } = computeTotals(input.items, input.taxRate, input.discount);
    const invoiceNumber = input.invoiceNumber.trim();

    const invoice = await prisma.$transaction(async (tx) => {
      if (await tx.invoice.findUnique({ where: { invoiceNumber } })) {
        throw AppError.conflict('رقم الفاتورة مُستخدم من قبل');
      }

      const created = await tx.invoice.create({
        data: {
          number: invoiceNumber,
          invoiceNumber,
          direction: input.direction,
          invoiceType: input.invoiceType,
          customerId: input.customerId ?? null,
          supplierId: input.supplierId ?? null,
          contractId: input.contractId ?? null,
          issueDate: input.issueDate ?? new Date(),
          dueDate: input.dueDate ?? null,
          billingMonth: input.billingMonth ?? null,
          billingYear: input.billingYear ?? null,
          subtotal,
          taxRate: input.taxRate,
          taxAmount,
          discount: input.discount,
          total,
          paidAmount: 0,
          status: 'UNPAID',
          notes: input.notes ?? null,
          items: { create: lines },
        },
        include: FULL_INCLUDE,
      });

      await this.postJournal(tx, created);
      return created;
    });

    await recordAudit({ req, action: 'CREATE', module: 'invoices', entityId: invoice.id, newValue: { invoiceNumber: invoice.invoiceNumber, total } });
    return invoice;
  }

  async update(id: number, input: UpdateInvoiceInput, req: Request) {
    const current = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
    if (!current) throw AppError.notFound('الفاتورة غير موجودة');
    if (current.status === 'CANCELLED') throw AppError.badRequest('لا يمكن تعديل فاتورة ملغاة');

    if (current.paidAmount > 0) {
      const directionChanged = input.direction !== undefined && input.direction !== current.direction;
      const customerChanged = input.customerId !== undefined && input.customerId !== current.customerId;
      const supplierChanged = input.supplierId !== undefined && input.supplierId !== current.supplierId;
      if (directionChanged || customerChanged || supplierChanged) {
        throw AppError.badRequest('لا يمكن تغيير الجهة أو الاتجاه بعد تسجيل مدفوعات على الفاتورة');
      }
    }

    const items = input.items ?? current.items.map((i) => ({ description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice }));
    const taxRate = input.taxRate ?? current.taxRate;
    const discount = input.discount ?? current.discount;
    const invoiceNumber = input.invoiceNumber?.trim();
    const { lines, subtotal, taxAmount, total } = computeTotals(items, taxRate, discount);

    if (invoiceNumber && invoiceNumber !== current.invoiceNumber) {
      const dup = await prisma.invoice.findUnique({ where: { invoiceNumber } });
      if (dup && dup.id !== id) throw AppError.conflict('رقم الفاتورة مُستخدم من قبل');
    }

    if (total < current.paidAmount) {
      throw AppError.badRequest('إجمالي الفاتورة الجديد أقل من المبلغ المسدّد بالفعل');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // إعادة بناء البنود
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      // إعادة ترحيل القيد
      await transactionsService.clearByReference('INVOICE', id, tx);

      const inv = await tx.invoice.update({
        where: { id },
        data: {
          number: invoiceNumber ?? current.number,
          invoiceNumber: invoiceNumber ?? current.invoiceNumber,
          direction: input.direction ?? current.direction,
          customerId: input.customerId !== undefined ? input.customerId : current.customerId,
          supplierId: input.supplierId !== undefined ? input.supplierId : current.supplierId,
          contractId: input.contractId === undefined ? current.contractId : input.contractId,
          invoiceType: input.invoiceType ?? current.invoiceType,
          issueDate: input.issueDate ?? current.issueDate,
          dueDate: input.dueDate ?? current.dueDate,
          billingMonth: input.billingMonth !== undefined ? input.billingMonth : current.billingMonth,
          billingYear: input.billingYear !== undefined ? input.billingYear : current.billingYear,
          taxRate,
          discount,
          subtotal,
          taxAmount,
          total,
          notes: input.notes ?? current.notes,
          status: nextStatus(total, current.paidAmount),
          items: { create: lines },
        },
        include: FULL_INCLUDE,
      });

      await this.postJournal(tx, inv);
      return inv;
    });

    await recordAudit({ req, action: 'UPDATE', module: 'invoices', entityId: id, newValue: { total } });
    return updated;
  }

  /** تسجيل دفعة/تحصيل وتحديث حالة الفاتورة. */
  async addPayment(id: number, input: AddPaymentInput, req: Request) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');
    if (invoice.status === 'CANCELLED') throw AppError.badRequest('لا يمكن تحصيل فاتورة ملغاة');

    const newPaid = round3(invoice.paidAmount + input.amount);
    if (overpaymentExceeds(invoice.total, newPaid)) {
      throw AppError.badRequest('المبلغ يتجاوز المتبقي على الفاتورة');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          invoiceId: id,
          amount: input.amount,
          method: input.method,
          date: input.date ?? new Date(),
          reference: input.reference ?? null,
          notes: input.notes ?? null,
        },
      });
      return tx.invoice.update({
        where: { id },
        data: { paidAmount: newPaid, status: nextStatus(invoice.total, newPaid) },
        include: FULL_INCLUDE,
      });
    });

    await recordAudit({ req, action: 'PAYMENT', module: 'invoices', entityId: id, newValue: { amount: input.amount, method: input.method } });
    return updated;
  }

  /** إلغاء الفاتورة (يحفظ السجل) مع عكس القيد. */
  async cancel(id: number, req: Request) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');
    if (invoice.paidAmount > 0) throw AppError.badRequest('لا يمكن إلغاء فاتورة عليها تحصيلات — أنشئ مرتجعًا بدلًا من ذلك');

    const updated = await prisma.$transaction(async (tx) => {
      await transactionsService.clearByReference('INVOICE', id, tx);
      return tx.invoice.update({ where: { id }, data: { status: 'CANCELLED' }, include: FULL_INCLUDE });
    });

    await recordAudit({ req, action: 'CANCEL', module: 'invoices', entityId: id });
    return updated;
  }

  async forceRemovePreview(id: number) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { _count: { select: { items: true, payments: true } } },
    });
    if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');

    const transactionsCount = await prisma.transaction.count({
      where: { referenceType: 'INVOICE', referenceId: id },
    });

    const willBeDeleted: string[] = ['invoice'];
    if (invoice._count.items > 0) willBeDeleted.push(`${invoice._count.items} بند`);
    if (invoice._count.payments > 0) willBeDeleted.push(`${invoice._count.payments} دفعة`);
    if (transactionsCount > 0) willBeDeleted.push(`${transactionsCount} قيد محاسبي`);

    const warnings: string[] = [];
    if (invoice.paidAmount > 0) warnings.push('هذه الفاتورة تحتوي على مدفوعات وسيتم حذف سجل المدفوعات نهائياً');
    if (transactionsCount === 0) warnings.push('لا توجد قيود محاسبية مرتبطة بهذه الفاتورة (فاتورة مستوردة)');
    if (invoice.contractId) warnings.push('هذه الفاتورة مرتبطة بعقد');

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      direction: invoice.direction,
      status: invoice.status,
      total: invoice.total,
      paidAmount: invoice.paidAmount,
      itemsCount: invoice._count.items,
      paymentsCount: invoice._count.payments,
      transactionsCount,
      accountingImpact: {
        revenueReduced: invoice.direction === 'SALES' ? invoice.total : 0,
        expenseReduced: invoice.direction === 'PURCHASE' ? invoice.total : 0,
        journalEntriesToDelete: transactionsCount,
      },
      willBeDeleted,
      warnings,
    };
  }

  async forceRemove(id: number, confirmation: string, req: Request) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { _count: { select: { items: true, payments: true } } },
    });
    if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');

    if (confirmation !== invoice.invoiceNumber) {
      throw AppError.badRequest('يجب كتابة رقم الفاتورة بشكل مطابق للتأكيد');
    }

    const transactionsCount = await prisma.transaction.count({
      where: { referenceType: 'INVOICE', referenceId: id },
    });

    await prisma.$transaction(async (tx) => {
      await transactionsService.clearByReference('INVOICE', id, tx);
      await tx.invoice.delete({ where: { id } }); // البنود والمدفوعات تُحذف تلقائيًا (Cascade)
    });

    await recordAudit({
      req,
      action: 'DELETE',
      module: 'invoices',
      entityId: id,
      newValue: {
        forceDelete: true,
        invoiceNumber: invoice.invoiceNumber,
        direction: invoice.direction,
        status: invoice.status,
        total: invoice.total,
        paidAmount: invoice.paidAmount,
        hadPayments: invoice._count.payments > 0,
        paymentsCount: invoice._count.payments,
        itemsCount: invoice._count.items,
        transactionsCleared: transactionsCount,
      },
    });

    return { deleted: true };
  }

  async remove(id: number, req: Request) {
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { payments: true } });
    if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');
    if (invoice.payments.length > 0) throw AppError.conflict('لا يمكن حذف فاتورة عليها تحصيلات');

    await prisma.$transaction(async (tx) => {
      await transactionsService.clearByReference('INVOICE', id, tx);
      await tx.invoice.delete({ where: { id } }); // البنود تُحذف تلقائيًا (Cascade)
    });

    await recordAudit({ req, action: 'DELETE', module: 'invoices', entityId: id });
    return { deleted: true };
  }
}

export const invoicesService = new InvoicesService();
