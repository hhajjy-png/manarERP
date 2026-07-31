import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { assertPeriodOpen } from '../../shared/services/periodLock.service';
import { recordHistoricalEntry } from '../../shared/services/historicalEntry.service';
import { glProfitAndLoss } from '../../shared/services/gl.reporting';
import { resolvePeriod } from '../../core/utils/periodFilter';
import { localDateRange } from '../../core/utils/dateWindows';

/** عميل Prisma سواء الأساسي أو داخل معاملة ($transaction). */
type Client = Prisma.TransactionClient | typeof prisma;

export interface JournalEntryInput {
  date?: Date;
  description: string;
  type: string; // REVENUE | EXPENSE | TRANSFER | ADJUSTMENT
  debit?: number; // مدين
  credit?: number; // دائن
  account: string; // اسم/رمز الحساب
  referenceType?: string; // INVOICE | EXPENSE | PAYROLL | MANUAL
  referenceId?: number;
}

export class TransactionsService {
  /**
   * توليد رقم قيد فريد بصيغة JE-<سنة القيد>-<تسلسل>.
   * السنة من تاريخ القيد لا من ساعة الجهاز — انظر `gl.service.generateEntryNumber`.
   */
  async generateEntryNumber(client: Client = prisma, entryDate: Date = new Date()): Promise<string> {
    const year = entryDate.getFullYear();
    const prefix = `JE-${year}-`;
    // استخدام id desc بدلاً من COUNT لتجنّب التعارض عند وجود فجوات في التسلسل (حذف أو استيراد).
    const last = await client.transaction.findFirst({
      where: { entryNumber: { startsWith: prefix } },
      orderBy: { id: 'desc' },
      select: { entryNumber: true },
    });
    const lastSeq = last ? parseInt(last.entryNumber.slice(prefix.length), 10) : 0;
    const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
    return `${prefix}${String(nextSeq).padStart(5, '0')}`;
  }

  /**
   * تسجيل قيد محاسبي في الدفتر القديم (Transaction).
   * يقبل عميل معاملة ليُستخدم ذرّيًا مع الفواتير/المصروفات.
   *
   * نقطة حراسة قفل الفترة للدفتر القديم — نظير `createBalancedJournal` في GL.
   */
  async postEntry(input: JournalEntryInput, client: Client = prisma) {
    const date = input.date ?? new Date();
    await assertPeriodOpen(client, date, {
      operation: 'ترحيل قيد محاسبي',
      module: 'transactions',
      entityId: input.referenceId != null ? `${input.referenceType}#${input.referenceId}` : undefined,
    });
    const entryNumber = await this.generateEntryNumber(client, date);
    return client.transaction.create({
      data: {
        entryNumber,
        date,
        description: input.description,
        type: input.type,
        debit: input.debit ?? 0,
        credit: input.credit ?? 0,
        account: input.account,
        referenceType: input.referenceType ?? 'MANUAL',
        referenceId: input.referenceId ?? null,
      },
    });
  }

  /** حذف قيود مرتبطة بمستند (يُستخدم عند تعديل/إلغاء فاتورة قبل إعادة الترحيل). */
  async clearByReference(referenceType: string, referenceId: number, client: Client = prisma) {
    await client.transaction.deleteMany({ where: { referenceType, referenceId } });
  }

  /** دفتر اليومية مع تصفية بالتاريخ/النوع/الحساب. */
  async list(query: PaginationQuery & { type?: string; account?: string; from?: string; to?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.TransactionWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.account) where.account = { contains: query.account };
    const dateRange = localDateRange(query.from, query.to);
    if (dateRange) where.date = dateRange;
    if (query.search) where.description = { contains: query.search };

    const [data, total] = await Promise.all([
      prisma.transaction.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy: { date: 'desc' } }),
      prisma.transaction.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  /** الأستاذ العام لحساب معيّن مع رصيد تراكمي. */
  async ledger(account: string, from?: string, to?: string) {
    const where: Prisma.TransactionWhereInput = { account };
    const dateRange = localDateRange(from, to);
    if (dateRange) where.date = dateRange;
    const rows = await prisma.transaction.findMany({ where, orderBy: { date: 'asc' } });
    let balance = 0;
    const lines = rows.map((r) => {
      balance += r.debit - r.credit;
      return { ...r, balance };
    });
    return { account, lines, balance };
  }

  /**
   * ملخص الأرباح والخسائر خلال فترة.
   *
   * المصدر المحاسبي الوحيد: الأستاذ العام (القيد المزدوج). كان يُحسب من الدفتر
   * القديم (Transaction) فيُنتج رقمًا موازيًا يخالف ميزان المراجعة ولوحة القيادة/الملخص
   * المالي. الآن مصدر واحد عبر glProfitAndLoss — نفس دالة الملخص المالي وتقرير الأرباح والخسائر.
   */
  async profitAndLoss(from?: string, to?: string) {
    // نفس دلالة حدود الفترة في financialSummary/decisionCenter (resolvePeriod): تحليل
    // محلي مع endOfDay على تاريخ النهاية، فلا يُسقط اليوم الأخير — يتطابق رقم بطاقة
    // الأرباح والخسائر في لوحة المحاسبة مع الملخص المالي وبقية الشاشات لنفس الفترة.
    const period = resolvePeriod({ fromDate: from, toDate: to });
    const pl = await glProfitAndLoss({ from: period.flow?.gte, to: period.flow?.lte });
    return { totalRevenue: pl.revenue, totalExpense: pl.expenses, netProfit: pl.netProfit };
  }

  /** قيد يدوي من واجهة المحاسبة. */
  async createManual(input: JournalEntryInput & { lateEntryReason?: string }, req: Request) {
    const entry = await this.postEntry({ ...input, referenceType: 'MANUAL' });
    await recordAudit({ req, action: 'CREATE', module: 'transactions', entityId: entry.id, newValue: input });
    await recordHistoricalEntry({
      req,
      module: 'transactions',
      recordType: 'قيد يدوي',
      entityId: entry.id,
      documentNumber: entry.entryNumber,
      transactionDate: entry.date,
      lateEntryReason: input.lateEntryReason,
    });
    return entry;
  }
}

export const transactionsService = new TransactionsService();
