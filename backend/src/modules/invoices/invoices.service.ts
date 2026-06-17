import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { transactionsService } from '../transactions/transactions.service';
import { AddPaymentInput, CreateInvoiceInput, UpdateInvoiceInput } from './invoices.schema';
import { round3, computeTotals, nextStatus, overpaymentExceeds } from './invoices.calc';
import { postInvoiceToGL, postPaymentToGL, reverseInvoiceFromGL, repostInvoiceToGL } from './invoices.accounting';

/**
 * يُميّز خطأ P2002 على حقل entryNumber في journal_entries عن بقية أخطاء التعارض.
 * يُستخدم لإعادة المحاولة عند تعارض ترقيم القيود المحاسبية (race condition على رقم تسلسلي)
 * دون إعادة المحاولة على تعارض رقم الفاتورة أو أي حقل آخر.
 */
export function isEntryNumberCollision(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  const target = err.meta?.target;
  if (!target) return false;
  const t = Array.isArray(target) ? target.join(',') : String(target);
  // يُعيد true فقط عند تعارض entryNumber في journal_entries (النظام الجديد).
  // transactions_entryNumber_key (النظام القديم) لا يستحق retry — مشكلته في generateEntryNumber.
  if (t.includes('invoiceNumber')) return false;
  if (t.includes('transactions')) return false;
  return t.includes('entryNumber');
}

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
      billingMonth?: string;
      billingYear?: string;
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
    if (query.billingMonth) where.billingMonth = Number(query.billingMonth);
    if (query.billingYear) where.billingYear = Number(query.billingYear);
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

  async stats(query: {
    direction?: string;
    status?: string;
    customerId?: string;
    billingMonth?: string;
    billingYear?: string;
    search?: string;
  }) {
    const where: Prisma.InvoiceWhereInput = {};
    if (query.direction) where.direction = query.direction;
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = Number(query.customerId);
    if (query.billingMonth) where.billingMonth = Number(query.billingMonth);
    if (query.billingYear) where.billingYear = Number(query.billingYear);
    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search } },
        { number: { contains: query.search } },
      ];
    }

    const [count, agg] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({ where, _sum: { total: true, paidAmount: true } }),
    ]);

    const totalSales = Number(agg._sum.total ?? 0);
    const totalCollected = Number(agg._sum.paidAmount ?? 0);

    return {
      count,
      totalSales,
      totalCollected,
      totalRemaining: totalSales - totalCollected,
      average: count > 0 ? totalSales / count : 0,
    };
  }

  async monthlyReport(query: {
    direction?: string;
    status?: string;
    customerId?: string;
    billingYear?: string;
  }) {
    const where: Prisma.InvoiceWhereInput = {};
    if (query.direction) where.direction = query.direction;
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = Number(query.customerId);
    if (query.billingYear) where.billingYear = Number(query.billingYear);

    const invoices = await prisma.invoice.findMany({
      where,
      select: { billingMonth: true, billingYear: true, total: true, paidAmount: true },
    });

    const groups = new Map<string, { count: number; totalSales: number; totalCollected: number }>();
    for (const inv of invoices) {
      const key = `${inv.billingYear ?? 0}-${String(inv.billingMonth ?? 0).padStart(2, '0')}`;
      const g = groups.get(key) ?? { count: 0, totalSales: 0, totalCollected: 0 };
      g.count++;
      g.totalSales += Number(inv.total);
      g.totalCollected += Number(inv.paidAmount);
      groups.set(key, g);
    }

    return Array.from(groups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, g]) => {
        const [year, month] = key.split('-');
        return {
          year: Number(year) || null,
          month: Number(month) || null,
          count: g.count,
          totalSales: g.totalSales,
          totalCollected: g.totalCollected,
          totalRemaining: g.totalSales - g.totalCollected,
        };
      });
  }

  async getById(id: number) {
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: FULL_INCLUDE });
    if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');
    return invoice;
  }

  async create(input: CreateInvoiceInput, req: Request) {
    const { lines, subtotal, taxAmount, total } = computeTotals(input.items, input.taxRate, input.discount);
    const invoiceNumber = input.invoiceNumber.trim();

    // تُعاد المحاولة حتى مرتين عند تعارض entryNumber فقط (race condition على رقم القيد).
    // أي خطأ آخر (تعارض invoiceNumber، AppError، إلخ) يُرمى مباشرةً دون إعادة محاولة.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const invoice = await prisma.$transaction(async (tx) => {
          const existing = await tx.invoice.findUnique({
            where: { invoiceNumber },
            select: { invoiceNumber: true, issueDate: true, status: true, customer: { select: { name: true } }, supplier: { select: { name: true } } },
          });
          if (existing) {
            throw AppError.conflict('رقم الفاتورة مُستخدم من قبل', {
              code: 'DUPLICATE_INVOICE_NUMBER',
              field: 'invoiceNumber',
              value: invoiceNumber,
              conflictingRecord: {
                invoiceNumber: existing.invoiceNumber,
                partyName: existing.customer?.name ?? existing.supplier?.name ?? null,
                issueDate: existing.issueDate,
                status: existing.status,
              },
            });
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
              deliveryDate: input.deliveryDate ?? null,
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
          await postInvoiceToGL(tx, created.id);
          return created;
        });

        await recordAudit({ req, action: 'CREATE', module: 'invoices', entityId: invoice.id, newValue: { invoiceNumber: invoice.invoiceNumber, total } });
        return invoice;
      } catch (err) {
        if (attempt < 2 && isEntryNumberCollision(err)) {
          console.warn(`[GL] entryNumber collision on attempt ${attempt + 1} — retrying`);
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr!; // يُصل هنا فقط إذا استُنفدت المحاولات الثلاث على تعارض entryNumber
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

    const items = input.items ?? current.items.map((i) => ({
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      unitPrice: i.unitPrice,
      priceId: i.priceId ?? null,
    }));
    const taxRate = input.taxRate ?? current.taxRate;
    const discount = input.discount ?? current.discount;
    const invoiceNumber = input.invoiceNumber?.trim();
    const { lines, subtotal, taxAmount, total } = computeTotals(items, taxRate, discount);

    if (invoiceNumber && invoiceNumber !== current.invoiceNumber) {
      const dup = await prisma.invoice.findUnique({
        where: { invoiceNumber },
        select: { id: true, invoiceNumber: true, issueDate: true, status: true, customer: { select: { name: true } }, supplier: { select: { name: true } } },
      });
      if (dup && dup.id !== id) {
        throw AppError.conflict('رقم الفاتورة مُستخدم من قبل', {
          code: 'DUPLICATE_INVOICE_NUMBER',
          field: 'invoiceNumber',
          value: invoiceNumber,
          conflictingRecord: {
            invoiceNumber: dup.invoiceNumber,
            partyName: dup.customer?.name ?? dup.supplier?.name ?? null,
            issueDate: dup.issueDate,
            status: dup.status,
          },
        });
      }
    }

    if (total < current.paidAmount) {
      throw AppError.badRequest('إجمالي الفاتورة الجديد أقل من المبلغ المسدّد بالفعل');
    }

    const updated = await prisma.$transaction(async (tx) => {
      // إعادة بناء البنود
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      // إعادة ترحيل القيد (النظام القديم: حذف القيد المفرد)
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
          deliveryDate: input.deliveryDate !== undefined ? input.deliveryDate : current.deliveryDate,
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
      // النظام المزدوج: إعادة ترحيل قيد اليومية بالقيمة الجديدة
      await repostInvoiceToGL(tx, id);
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
      const payment = await tx.payment.create({
        data: {
          invoiceId: id,
          amount: input.amount,
          method: input.method,
          date: input.date ?? new Date(),
          reference: input.reference ?? null,
          notes: input.notes ?? null,
        },
      });
      // ترحيل قيد اليومية المزدوج للتحصيل (Phase 1 — تحصيلات فواتير المبيعات)
      await postPaymentToGL(tx, payment.id);
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
      // النظام المزدوج: عكس قيد اليومية بدلًا من حذفه (للحفاظ على أثر التدقيق)
      await reverseInvoiceFromGL(tx, id);
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
      // النظام المزدوج: حذف قيود اليومية المرتبطة بالفاتورة ومدفوعاتها (لا FK يربطها)
      await this.clearGLForInvoice(tx, id);
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
      // النظام المزدوج: حذف قيود اليومية المرتبطة بالفاتورة (لا FK يربطها)
      await this.clearGLForInvoice(tx, id);
      await tx.invoice.delete({ where: { id } }); // البنود تُحذف تلقائيًا (Cascade)
    });

    await recordAudit({ req, action: 'DELETE', module: 'invoices', entityId: id });
    return { deleted: true };
  }

  /**
   * حذف جميع قيود اليومية المزدوجة المرتبطة بفاتورة عند الحذف النهائي.
   * يشمل قيد الفاتورة وقيد العكس وقيود التحصيل لمدفوعاتها (لا FK تلقائي).
   */
  private async clearGLForInvoice(tx: Prisma.TransactionClient, invoiceId: number) {
    const payments = await tx.payment.findMany({ where: { invoiceId }, select: { id: true } });
    const paymentIds = payments.map((p) => p.id);
    await tx.journalEntry.deleteMany({
      where: {
        OR: [
          { referenceType: { in: ['INVOICE', 'INVOICE_REVERSAL'] }, referenceId: invoiceId },
          ...(paymentIds.length > 0 ? [{ referenceType: 'PAYMENT', referenceId: { in: paymentIds } }] : []),
        ],
      },
    });
  }
}

export const invoicesService = new InvoicesService();
