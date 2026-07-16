import { randomUUID } from 'crypto';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { ARABIC_MONTHS } from '../../core/utils/arabicMonths';
import type { ReportInput } from '../../shared/services/reportEngine/excel.service';
import { transactionsService } from '../transactions/transactions.service';
import { approvalEngine } from '../../shared/services/approval.service';
import { GL_REFERENCE_TYPES } from '../../shared/services/gl.service';
import { AddPaymentInput, CreateInvoiceInput, UpdateInvoiceInput } from './invoices.schema';
import { round3, computeTotals, nextStatus, overpaymentExceeds, isImmediatelySettledPurchase } from './invoices.calc';
import { roundMoney } from '../../shared/utils/money';
import { postInvoiceToGL, postPurchaseInvoiceToGL, postPaymentToGL, postPurchasePaymentToGL, reversePurchasePaymentGL, reverseInvoiceFromGL, repostInvoiceToGL, reversePurchaseInvoiceGL } from './invoices.accounting';
import { assertPeriodOpen } from '../../shared/services/periodLock.service';
import { recordHistoricalEntry } from '../../shared/services/historicalEntry.service';
import { toLocalDateString, endOfDay } from '../../core/utils/dateWindows';

/**
 * يطبّق نطاق الفترة على تاريخ إصدار الفاتورة داخل شرط Prisma.
 * `to` يُمدَّد لنهاية اليوم حتى تُدرَج فواتير آخر يوم في الفترة.
 * لا يفعل شيئًا عند غياب الحدّين (كل الفترات).
 */
function applyIssueDateRange(where: Prisma.InvoiceWhereInput, from?: string, to?: string): void {
  if (!from && !to) return;
  const range: Prisma.DateTimeFilter = {};
  if (from) range.gte = new Date(`${from.slice(0, 10)}T00:00:00`);
  if (to) range.lte = endOfDay(new Date(`${to.slice(0, 10)}T00:00:00`));
  where.issueDate = range;
}

/**
 * مُعاد تصديرها من `gl.service.ts` — التنفيذ الفعلي (وحلقة إعادة المحاولة على تعارض
 * entryNumber) صار مركزيًا هناك داخل `createBalancedJournal` نفسها، فيرثه كل مستدعٍ
 * (فواتير، رواتب، مصروفات) تلقائيًا دون تكرار الحارس هنا. أُبقي على هذا التصدير
 * لتوافق مسار الاستيراد الحالي في اختبارات هذه الوحدة.
 */
export { isEntryNumberCollision } from '../../shared/services/gl.service';

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

  /**
   * يقترح رقم الفاتورة التالي بصيغة MN-INV-<السنة>-NNNNN — للقراءة فقط.
   * آمن ضد التعارض: يعتمد على أعلى لاحقة رقمية موجودة (MAX) لا على COUNT
   * (الذي يتعارض عند وجود فجوات/حذف). اللواحق غير الرقمية (إدخال يدوي) تُتجاهل
   * عند حساب الاقتراح — يبقى المستخدم قادرًا على كتابة أي رقم صالح يدويًا.
   */
  async getNextInvoiceNumber(year: number): Promise<string> {
    const prefix = `MN-INV-${year}-`;
    const rows = await prisma.invoice.findMany({
      where: { number: { startsWith: prefix } },
      select: { number: true },
    });
    let max = 0;
    for (const r of rows) {
      const suffix = r.number.slice(prefix.length);
      if (/^\d+$/.test(suffix)) {
        const n = parseInt(suffix, 10);
        if (n > max) max = n;
      }
    }
    return `${prefix}${String(max + 1).padStart(5, '0')}`;
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
      from?: string;
      to?: string;
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
    applyIssueDateRange(where, query.from, query.to);
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
        // مفتاح ثانوي id لثبات الترقيم عند تساوي تواريخ الإصدار.
        orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
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
    from?: string;
    to?: string;
  }) {
    const where: Prisma.InvoiceWhereInput = {};
    if (query.direction) where.direction = query.direction;
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = Number(query.customerId);
    if (query.billingMonth) where.billingMonth = Number(query.billingMonth);
    if (query.billingYear) where.billingYear = Number(query.billingYear);
    applyIssueDateRange(where, query.from, query.to);
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

  /** نفس بيانات التقرير الشهري JSON، لكن مُعاد تشكيلها كـ ReportInput جاهز لتصدير Excel احترافي (نفس أعمدة الواجهة). */
  async monthlyReportExcelInput(query: {
    direction?: string;
    status?: string;
    customerId?: string;
    billingYear?: string;
  }): Promise<ReportInput> {
    const data = await this.monthlyReport(query);
    const rows = data.map((r) => ({
      period: r.month && r.year ? `${ARABIC_MONTHS[r.month - 1]} ${r.year}` : '—',
      count: r.count,
      totalSales: r.totalSales,
      totalCollected: r.totalCollected,
      totalRemaining: r.totalRemaining,
    }));
    return {
      title: 'التقرير الشهري للفواتير',
      subtitle: `عدد الفترات: ${rows.length}`,
      columns: [
        { header: 'الفترة', key: 'period', width: 20 },
        { header: 'عدد الفواتير', key: 'count', width: 14, type: 'number' },
        { header: 'إجمالي المبالغ', key: 'totalSales', width: 18, type: 'currency' },
        { header: 'إجمالي المحصل', key: 'totalCollected', width: 18, type: 'currency' },
        { header: 'إجمالي المتبقي', key: 'totalRemaining', width: 18, type: 'currency' },
      ],
      rows,
    };
  }

  async getById(id: number) {
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: FULL_INCLUDE });
    if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');
    return invoice;
  }

  async create(input: CreateInvoiceInput, req: Request) {
    const { lines, subtotal, taxAmount, total } = computeTotals(input.items, input.taxRate, input.discount);
    const invoiceNumber = input.invoiceNumber.trim();

    // فاتورة شراء نقدية/بنكية تُسدَّد لحظة الإنشاء (القيد يُدائن الصندوق/البنك مباشرة)،
    // لذا تُحفظ مدفوعة بالكامل لمنع تسجيل دفعة تسوية ثانية تُدائن النقد مرتين (خطأ C1).
    const settled = isImmediatelySettledPurchase(input.direction, input.paymentMethod);

    // تعارض ترقيم القيد (entryNumber) لم يعد يُعالَج هنا — الحارس وإعادة المحاولة صارا
    // مركزيين داخل `createBalancedJournal` نفسها (انظر gl.service.ts)، فيُطبَّقان تلقائيًا
    // ضمن نفس المعاملة المفتوحة دون إعادة تشغيل هذه المعاملة بأكملها.
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
          paymentMethod: input.paymentMethod ?? null,
          subtotal,
          taxRate: input.taxRate,
          taxAmount,
          discount: input.discount,
          total,
          paidAmount: settled ? total : 0,
          status: settled ? 'PAID' : 'UNPAID',
          notes: input.notes ?? null,
          verificationUuid: randomUUID(),
          items: { create: lines },
        },
        include: FULL_INCLUDE,
      });

      await this.postJournal(tx, created);
      await postInvoiceToGL(tx, created.id);
      return created;
    });

    await recordAudit({ req, action: 'CREATE', module: 'invoices', entityId: invoice.id, newValue: { invoiceNumber: invoice.invoiceNumber, total } });
    await recordHistoricalEntry({
      req,
      module: 'invoices',
      recordType: input.direction === 'PURCHASE' ? 'فاتورة مشتريات' : 'فاتورة مبيعات',
      entityId: invoice.id,
      documentNumber: invoice.invoiceNumber,
      transactionDate: invoice.issueDate,
      lateEntryReason: input.lateEntryReason,
    });
    return invoice;
  }

  async update(id: number, input: UpdateInvoiceInput, req: Request) {
    const current = await prisma.invoice.findUnique({ where: { id }, include: { items: true } });
    if (!current) throw AppError.notFound('الفاتورة غير موجودة');
    if (current.status === 'CANCELLED') throw AppError.badRequest('لا يمكن تعديل فاتورة ملغاة');
    // حوكمة الفواتير المسددة: الفاتورة المسددة بالكامل (PAID) للعرض فقط عبر مسار التعديل العادي.
    // لتصحيح تاريخ التحصيل استخدم أداة تصحيح تاريخ التحصيل المخصّصة (مدير النظام فقط) — لا عبر تعديل
    // الفاتورة. حارس خادمي حقيقي (لا يكفي إخفاء زر التعديل في الواجهة).
    if (current.status === 'PAID') {
      throw AppError.badRequest('لا يمكن تعديل فاتورة مسددة بالكامل — الفاتورة للعرض فقط');
    }

    if (current.paidAmount > 0) {
      const directionChanged = input.direction !== undefined && input.direction !== current.direction;
      const customerChanged = input.customerId !== undefined && input.customerId !== current.customerId;
      const supplierChanged = input.supplierId !== undefined && input.supplierId !== current.supplierId;
      if (directionChanged || customerChanged || supplierChanged) {
        throw AppError.badRequest('لا يمكن تغيير الجهة أو الاتجاه بعد تسجيل مدفوعات على الفاتورة');
      }
    }

    // التعديل يُعيد ترحيل القيد (repostInvoiceToGL) — احرس الفترة القديمة والجديدة معًا.
    await assertPeriodOpen(prisma, current.issueDate, { operation: 'تعديل فاتورة', module: 'invoices', entityId: id });
    if (input.issueDate && input.issueDate.getTime() !== current.issueDate.getTime()) {
      await assertPeriodOpen(prisma, input.issueDate, { operation: 'نقل فاتورة إلى فترة مقفلة', module: 'invoices', entityId: id });
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
          paymentMethod: input.paymentMethod !== undefined ? input.paymentMethod : (current as Record<string, unknown>)['paymentMethod'] as string ?? null,
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

    // لا رصيد مستحق (فاتورة مسددة بالكامل — بما فيها الشراء النقدي/البنكي المُسوّى فورًا).
    // يمنع تسجيل دفعة زائدة تُنشئ قيدًا محاسبيًا مكررًا (خطأ C1).
    const remainingDue = round3(invoice.total - invoice.paidAmount);
    if (remainingDue <= 0) {
      throw AppError.badRequest('الفاتورة مسددة بالكامل — لا يوجد مبلغ مستحق');
    }

    // نفس المبلغ المطبَّع الذي سيُخزَّن — لا مصدرين بدقّتين مختلفتين.
    const newPaid = round3(invoice.paidAmount + roundMoney(input.amount));
    if (overpaymentExceeds(invoice.total, newPaid)) {
      throw AppError.badRequest('المبلغ يتجاوز المتبقي على الفاتورة');
    }

    // تاريخ التحصيل — official collection date (drives the GL entry date + all collection
    // reports). Defaults to now() when the user keeps today's date. Resolved once so the
    // persisted value and the audit record can never diverge. `createdAt` is set
    // automatically by the DB as the system-entry audit stamp.
    const collectionDate = input.date ?? new Date();

    // تحصيل قبل تاريخ إصدار الفاتورة: حالة مشروعة (دفعة مقدّمة أو إدخال تاريخي)،
    // لكنها قد تكون خطأ مطبعيًا في التاريخ. لا نرفض — نسجّل تحذيرًا في التدقيق
    // ونُعيده في نتيجة العملية. (لا واجهة إقرار حاليًا، فالرفض كان مسارًا مسدودًا.)
    const paymentBeforeIssue = !!invoice.issueDate && collectionDate < invoice.issueDate;

    /**
     * تطبيع عند حدود التخزين.
     *
     * كان `amount` يُخزَّن **خامًا** كما وصل، بينما `paidAmount` على الفاتورة يُخزَّن
     * مقرَّبًا (`newPaid`). فمصدران بدقّتين مختلفتين لنفس الحقيقة: `Σ payments.amount`
     * (وهو ما تقرؤه الأعمار والكشوف) قد ينحرف عن `invoice.paidAmount` (وهو ما تقرؤه
     * الفاتورة). الخادم هو المرجع — تقريب الواجهة ليس حجّة.
     */
    const paymentAmount = roundMoney(input.amount);

    const updated = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId: id,
          amount: paymentAmount,
          method: input.method,
          date: collectionDate,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
        },
      });
      // ترحيل قيد اليومية المزدوج للدفعة:
      //   مبيعات  → Dr Cash/Bank,  Cr AR   (تحصيل من عميل)
      //   مشتريات → Dr AP,          Cr Cash/Bank (سداد لمورد)
      await postPaymentToGL(tx, payment.id);
      await postPurchasePaymentToGL(tx, payment.id);
      return tx.invoice.update({
        where: { id },
        data: { paidAmount: newPaid, status: nextStatus(invoice.total, newPaid) },
        include: FULL_INCLUDE,
      });
    });

    // التدقيق يسجّل المبلغ **كما خُزّن** لا كما وصل — وإلا روى السجلّ رقمًا لا وجود له.
    await recordAudit({ req, action: 'PAYMENT', module: 'invoices', entityId: id, newValue: { amount: paymentAmount, method: input.method, collectionDate } });
    await recordHistoricalEntry({
      req,
      module: 'payments',
      recordType: 'تحصيل/سداد',
      entityId: id,
      documentNumber: invoice.invoiceNumber,
      transactionDate: collectionDate,
      lateEntryReason: input.lateEntryReason,
    });

    const warnings: string[] = [];
    if (paymentBeforeIssue) {
      const msg =
        `تاريخ التحصيل (${toLocalDateString(collectionDate)}) يسبق تاريخ إصدار الفاتورة ` +
        `(${toLocalDateString(invoice.issueDate!)}). سُجِّل كدفعة مقدّمة — تأكّد من صحة التاريخ.`;
      warnings.push(msg);
      await recordAudit({
        req, action: 'PAYMENT_BEFORE_ISSUE', module: 'invoices', entityId: id,
        newValue: { collectionDate, issueDate: invoice.issueDate, amount: input.amount },
      });
    }

    return { ...updated, warnings };
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
      await reversePurchaseInvoiceGL(tx, id);
      return tx.invoice.update({ where: { id }, data: { status: 'CANCELLED' }, include: FULL_INCLUDE });
    });

    await recordAudit({ req, action: 'CANCEL', module: 'invoices', entityId: id });
    return updated;
  }

  /**
   * اعتماد فاتورة مشتريات للترحيل المحاسبي.
   * الإجراء idempotent — لا يُنشئ قيدًا مكررًا إذا كانت الفاتورة مُرحَّلة مسبقًا.
   * يُستخدم لإعادة تأكيد الاعتماد أو لترحيل فاتورة أُنشئت بدون ترحيل تلقائي.
   */
  async approve(id: number, req: Request) {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw AppError.notFound('الفاتورة غير موجودة');
    if (invoice.direction !== 'PURCHASE') throw AppError.badRequest('الاعتماد متاح لفواتير المشتريات فقط');
    if (invoice.status === 'CANCELLED') throw AppError.badRequest('لا يمكن اعتماد فاتورة ملغاة');

    // تعارض ترقيم القيد يُعالَج مركزيًا داخل createBalancedJournal (انظر gl.service.ts) —
    // لا حاجة لإعادة محاولة هذه المعاملة بأكملها.
    await prisma.$transaction(async (tx) => {
      // الاعتماد مُتماثل: إعادته على فاتورة مُرحَّلة لا تُنشئ قيدًا ثانيًا. فلا تُنشئ
      // سطر سجلّ ثانيًا أيضًا — وإلا صار السجلّ يروي اعتمادات لم تقع.
      const alreadyPosted = await tx.journalEntry.findFirst({
        where: { referenceType: GL_REFERENCE_TYPES.PURCHASE_INVOICE, referenceId: id },
        select: { id: true },
      });
      await postPurchaseInvoiceToGL(tx, id);
      if (alreadyPosted) return;
      // الحالة لا تتحرّك هنا — الاعتماد ترحيل محاسبي — فالسجلّ يوثّق ذلك بأمانة:
      // fromStatus === toStatus. لا كتابة حالة ولا تدقيق ثانٍ.
      await approvalEngine.recordTransition(
        {
          entityType: 'invoice',
          entityId:   id,
          action:     'approve',
          fromStatus: invoice.status,
          toStatus:   invoice.status,
          userId:     req.user?.userId ?? null,
          metadata:   { invoiceNumber: invoice.invoiceNumber, total: invoice.total, posted: true },
        },
        tx,
      );
    });

    await recordAudit({ req, action: 'APPROVE', module: 'invoices', entityId: id, newValue: { invoiceNumber: invoice.invoiceNumber, total: invoice.total } });
    return { approved: true, invoiceNumber: invoice.invoiceNumber };
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
      // الحذف النهائي يمحو قيودًا مُرحَّلة بـ deleteMany مباشرةً، فلا يمرّ بالحارس المركزي
      // (createBalancedJournal). الحذف من فترة مقفلة انتهاك لها كالإضافة تمامًا. المسار
      // SYSTEM_ADMIN أصلًا ⇒ التجاوز مسموح، لكنه الآن **يُسجَّل** كـ PERIOD_LOCK_OVERRIDE.
      await assertPeriodOpen(tx, invoice.issueDate, {
        operation: 'حذف نهائي لفاتورة',
        module: 'invoices',
        entityId: id,
      });
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

    // الحذف يمسح قيود اليومية مباشرةً (لا يمرّ بـ createBalancedJournal) — الحارس صريح هنا.
    await assertPeriodOpen(prisma, invoice.issueDate, { operation: 'حذف فاتورة', module: 'invoices', entityId: id });

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
          {
            referenceType: {
              in: [
                'INVOICE', 'INVOICE_REVERSAL',
                'PURCHASE_INVOICE', 'PURCHASE_INVOICE_REVERSAL',
              ],
            },
            referenceId: invoiceId,
          },
          ...(paymentIds.length > 0
            ? [{
                referenceType: {
                  in: ['PAYMENT', 'PURCHASE_PAYMENT', 'PURCHASE_PAYMENT_REVERSAL'],
                },
                referenceId: { in: paymentIds },
              }]
            : []),
        ],
      },
    });
  }
}

export const invoicesService = new InvoicesService();
