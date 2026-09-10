/* ════════════════════════════════════════════════════════════════════════════
   صفحة المقبوضات — خدمة الاستعلام (ReceiptsQueryService).

   **المصدر الوحيد** لكل رقم تعرضه الصفحة: القائمة والملخّص والتفصيل والتصدير
   كلّها تمرّ من هنا، وكلّها تبني شرطها بـ`buildReceiptWhere` نفسها. لا نسخة
   ثانية من منطق الفلترة أو التجميع أو تسمية الوسائل في أي مكان آخر.

   ═══ حماية بنيوية من الاحتساب المزدوج ═══
   الخدمة تلمس جدولًا واحدًا فقط: `prisma.payment`. لا `journalEntry`، ولا
   `invoice.paidAmount` كمصدر مبلغ، ولا `bankStatementTransaction` — وكلّها
   تحمل انعكاسًا لنفس المبلغ. صفّ الجدول هو وحدة القبض، والمجموع هو
   `_sum.amount` على **نفس** الشرط الذي يجلب الصفوف؛ فتطابق الإجمالي مع مجموع
   الصفوف بنيويّ لا مصادفة. يثبت ذلك اختبار صريح في `__tests__`.

   ═══ لماذا استعلامان لا واحد ═══
   `list` (صفوف + عدّها) تتغيّر مع كل صفحة وكل فرز. `summary` (إجماليات + تفصيل
   الوسائل + مقارنة الشهرين) لا تتغيّر إلا بتغيّر الفلاتر. فصلهما يعني أن تقليب
   الصفحات لا يُعيد حساب أي تجميع — الواجهة تُعيد جلب الملخّص عند تغيّر الفلاتر
   وحده.
   ════════════════════════════════════════════════════════════════════════════ */

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { toLocalDateString } from '../../core/utils/dateWindows';
import { buildPaginatedResult, getPagination } from '../../core/utils/pagination';
import { buildOrderBy } from '../../core/utils/sort';
import { roundMoney } from '../../shared/utils/money';
import {
  buildMethodBreakdown,
  buildMonthComparison,
  buildReceiptWhere,
  buildReceiptWhereIgnoringDates,
  mapReceiptRow,
  monthComparisonRanges,
  RECEIPT_DEFAULT_ORDER,
  RECEIPT_SORT_WHITELIST,
  RECEIPT_TIEBREAKER,
  type MethodBreakdownRow,
  type MethodGroupRow,
  type MonthComparison,
  type RawReceipt,
  type ReceiptFilters,
  type ReceiptRow,
} from './receipts.calc';
import type { ReceiptFiltersQuery, ReceiptListQuery } from './receipts.schema';

/**
 * الأعمدة المحمَّلة لكل قبض.
 *
 * `select` صريح لا `include`: الصفحة تشغيلية وتُقلَّب كثيرًا، فجلب أعمدة لا
 * تُعرض هدرٌ متكرّر. ويطابق هذا الشكل `RawReceipt` في الطبقة النقيّة حرفيًا —
 * أي انحراف بينهما يكشفه المدقّق فورًا.
 */
const RECEIPT_ROW_SELECT = {
  id: true,
  date: true,
  amount: true,
  method: true,
  reference: true,
  notes: true,
  createdAt: true,
  invoice: {
    select: {
      id: true,
      invoiceNumber: true,
      number: true,
      issueDate: true,
      total: true,
      paidAmount: true,
      status: true,
      customerId: true,
      customer: { select: { id: true, name: true } },
      contractId: true,
      contract: { select: { id: true, code: true } },
    },
  },
} satisfies Prisma.PaymentSelect;

export interface ReceiptsSummary {
  /** الإجماليات على الفلاتر النشطة كاملةً (بما فيها النطاق الزمني). */
  totals: {
    total: number;
    count: number;
    /** متوسط قيمة عملية القبض — `0` حين لا عمليات (لا قسمة على صفر). */
    average: number;
  };
  /** أكبر عملية قبض داخل الفلاتر، أو `null` حين لا نتائج. */
  largest: {
    id: number;
    amount: number;
    date: Date;
    method: string;
    customerName: string | null;
    invoiceNumber: string | null;
  } | null;
  /** الوسائل الأربع دائمًا — بما فيها ذات الصفر. */
  byMethod: MethodBreakdownRow[];
  /**
   * الشهر الحالي مقابل السابق. يتجاهلان النطاق الزمني المختار عمدًا (الشهر
   * التقويمي يعني نفسه دائمًا) ويحترمان بقيّة الفلاتر.
   */
  months: MonthComparison;
}

export class ReceiptsQueryService {
  /** يُقصي معطيات الترقيم/الفرز فيبقى ما يُعرّف **مجموعة** المقبوضات وحده. */
  private filtersOf(query: ReceiptFiltersQuery): ReceiptFilters {
    return {
      from: query.from,
      to: query.to,
      customerId: query.customerId,
      method: query.method,
      invoiceStatus: query.invoiceStatus,
      search: query.search,
      minAmount: query.minAmount,
      maxAmount: query.maxAmount,
    };
  }

  /** صفحة واحدة من المقبوضات + `meta` قياسية (نفس عقد كل قوائم النظام). */
  async list(query: ReceiptListQuery): Promise<{ data: ReceiptRow[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
    const where = buildReceiptWhere(this.filtersOf(query));
    const pagination = getPagination({ page: query.page, pageSize: query.pageSize ?? 15 });
    const orderBy = buildOrderBy(
      query,
      RECEIPT_SORT_WHITELIST,
      RECEIPT_DEFAULT_ORDER,
      RECEIPT_TIEBREAKER,
    ) as Prisma.PaymentOrderByWithRelationInput[];

    const [rows, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        select: RECEIPT_ROW_SELECT,
        orderBy,
        skip: pagination.skip,
        take: pagination.take,
      }),
      prisma.payment.count({ where }),
    ]);

    return buildPaginatedResult((rows as unknown as RawReceipt[]).map(mapReceiptRow), total, pagination);
  }

  /**
   * الملخّص الكامل — خمسة تجميعات على **نفس** الشرط، بلا جلب أي صفّ كامل عدا
   * أكبر عملية واحدة (`take: 1`).
   */
  async summary(query: ReceiptFiltersQuery, now: Date = new Date()): Promise<ReceiptsSummary> {
    const filters = this.filtersOf(query);
    const where = buildReceiptWhere(filters);
    const whereNoDates = buildReceiptWhereIgnoringDates(filters);
    const ranges = monthComparisonRanges(now);

    const [agg, methodRows, largestRow, currentAgg, previousAgg] = await Promise.all([
      prisma.payment.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
      prisma.payment.groupBy({
        by: ['method'],
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.findMany({
        where,
        select: RECEIPT_ROW_SELECT,
        orderBy: [{ amount: 'desc' }, { id: 'desc' }],
        take: 1,
      }),
      prisma.payment.aggregate({
        where: { ...whereNoDates, date: { gte: ranges.current.from, lte: ranges.current.to } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.payment.aggregate({
        where: { ...whereNoDates, date: { gte: ranges.previous.from, lte: ranges.previous.to } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const total = roundMoney(agg._sum.amount ?? 0);
    const count = agg._count._all ?? 0;
    const largest = largestRow.length
      ? mapReceiptRow(largestRow[0] as unknown as RawReceipt)
      : null;

    return {
      totals: {
        total,
        count,
        average: count > 0 ? roundMoney(total / count) : 0,
      },
      largest: largest
        ? {
            id: largest.id,
            amount: largest.amount,
            date: largest.date,
            method: largest.method,
            customerName: largest.customerName,
            invoiceNumber: largest.invoiceNumber,
          }
        : null,
      byMethod: buildMethodBreakdown(methodRows as unknown as MethodGroupRow[], total),
      months: buildMonthComparison(
        ranges,
        { total: currentAgg._sum.amount ?? 0, count: currentAgg._count._all ?? 0 },
        { total: previousAgg._sum.amount ?? 0, count: previousAgg._count._all ?? 0 },
        toLocalDateString,
      ),
    };
  }
}

export const receiptsQueryService = new ReceiptsQueryService();
