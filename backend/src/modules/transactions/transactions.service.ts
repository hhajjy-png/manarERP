import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';

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
  /** توليد رقم قيد فريد بصيغة JE-<السنة>-<تسلسل>. */
  async generateEntryNumber(client: Client = prisma): Promise<string> {
    const year = new Date().getFullYear();
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
   * تسجيل قيد محاسبي. يقبل عميل معاملة ليُستخدم ذرّيًا مع الفواتير/المصروفات.
   */
  async postEntry(input: JournalEntryInput, client: Client = prisma) {
    const entryNumber = await this.generateEntryNumber(client);
    return client.transaction.create({
      data: {
        entryNumber,
        date: input.date ?? new Date(),
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
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }
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
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    const rows = await prisma.transaction.findMany({ where, orderBy: { date: 'asc' } });
    let balance = 0;
    const lines = rows.map((r) => {
      balance += r.debit - r.credit;
      return { ...r, balance };
    });
    return { account, lines, balance };
  }

  /** ملخص الأرباح والخسائر خلال فترة. */
  async profitAndLoss(from?: string, to?: string) {
    const where: Prisma.TransactionWhereInput = {};
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }
    const [revenue, expense] = await Promise.all([
      prisma.transaction.aggregate({ where: { ...where, type: 'REVENUE' }, _sum: { credit: true } }),
      prisma.transaction.aggregate({ where: { ...where, type: 'EXPENSE' }, _sum: { debit: true } }),
    ]);
    const totalRevenue = revenue._sum.credit ?? 0;
    const totalExpense = expense._sum.debit ?? 0;
    return { totalRevenue, totalExpense, netProfit: totalRevenue - totalExpense };
  }

  /** قيد يدوي من واجهة المحاسبة. */
  async createManual(input: JournalEntryInput, req: Request) {
    const entry = await this.postEntry({ ...input, referenceType: 'MANUAL' });
    await recordAudit({ req, action: 'CREATE', module: 'transactions', entityId: entry.id, newValue: input });
    return entry;
  }
}

export const transactionsService = new TransactionsService();
