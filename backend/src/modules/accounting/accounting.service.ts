import { Request } from 'express';
import { roundMoney } from '../../shared/utils/money';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { buildOrderBy, SortWhitelist } from '../../core/utils/sort';

// القوائم البيضاء للفرز (Enterprise Data Grid Foundation) — ثلاث قوائم محاسبية
// مرقّمة خادميًا. «إجمالي المدين» في قائمة القيود محسوب من الأسطر → غير قابل
// للفرز عمدًا (لا حقل خلفي). أسطر القيد داخل الـ Drawer مستند ثابت الترتيب.
const ACCOUNTS_SORTABLE: SortWhitelist = {
  code: 'code',
  name: 'name',
  type: 'type',
  normalBalance: 'normalBalance',
  isActive: 'isActive',
};
const JOURNAL_SORTABLE: SortWhitelist = {
  entryNumber: 'entryNumber',
  date: 'date',
  description: 'description',
  status: 'status',
};
const PAYMENTS_SORTABLE: SortWhitelist = {
  invoice: (dir) => ({ invoice: { invoiceNumber: dir } }),
  amount: 'amount',
  method: 'method',
  date: 'date',
  reference: { field: 'reference', nullable: true },
};
import { validateJournalBalance } from './accounting.utils';
import { generateEntryNumber, GL_REFERENCE_TYPES } from '../../shared/services/gl.service';
import { glAccountFlow, GLDateRange } from '../../shared/services/gl.reporting';
import { getOperationalSummary } from '../../shared/services/operational.reporting';
import { SYSTEM_ACCOUNT_CODES } from './accounting.accounts';
import { assertPeriodOpen } from '../../shared/services/periodLock.service';
import { recordHistoricalEntry } from '../../shared/services/historicalEntry.service';
import { AppError } from '../../core/errors/AppError';
import { resolvePeriod } from '../../core/utils/periodFilter';
import { localDateRange } from '../../core/utils/dateWindows';

export interface AccountInput {
  code: string;
  name: string;
  type: string;
  normalBalance?: string;
  isActive?: boolean;
  parentId?: number | null;
  notes?: string;
}

export interface JournalEntryInput {
  date?: Date;
  description: string;
  referenceType?: string;
  referenceId?: number;
  lines: { accountId: number; description?: string; debit?: number; credit?: number }[];
  /** سبب الإدخال المتأخر — يُسجَّل في Audit Log عند قيد يخصّ سنة سابقة. */
  lateEntryReason?: string;
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export class AccountingService {
  /**
   * يولّد رقم قيد يومية فريدًا بصيغة JRN-<سنة القيد>-<تسلسل>.
   * غلاف حول `generateEntryNumber` في `gl.service` — مصدر واحد لصيغة الترقيم.
   */
  async generateJournalNumber(entryDate: Date = new Date()): Promise<string> {
    return generateEntryNumber(prisma as unknown as Prisma.TransactionClient, entryDate);
  }

  // Chart of Accounts
  async listAccounts(query: PaginationQuery & { type?: string; isActive?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.AccountWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive !== 'false';
    if (query.search) where.OR = [{ name: { contains: query.search } }, { nameEn: { contains: query.search } }];

    const orderBy = buildOrderBy(query, ACCOUNTS_SORTABLE, [{ code: 'asc' }], [{ id: 'desc' }]) as Prisma.AccountOrderByWithRelationInput[];
    const [data, total] = await Promise.all([
      prisma.account.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy,
        include: { parent: { select: { code: true, name: true } } },
      }),
      prisma.account.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  async createAccount(input: AccountInput, req: Request) {
    const account = await prisma.account.create({ data: { ...input, normalBalance: input.normalBalance ?? 'DEBIT' } });
    await recordAudit({ req, action: 'CREATE', module: 'accounting', entityId: account.id, newValue: input });
    return account;
  }

  async updateAccount(id: number, input: Partial<AccountInput>, req: Request) {
    const old = await prisma.account.findUniqueOrThrow({ where: { id } });
    const account = await prisma.account.update({ where: { id }, data: input });
    await recordAudit({ req, action: 'UPDATE', module: 'accounting', entityId: id, oldValue: old, newValue: input });
    return account;
  }

  async deleteAccount(id: number, req: Request) {
    const used = await prisma.journalEntryLine.count({ where: { accountId: id } });
    if (used > 0) throw new Error('لا يمكن حذف حساب مرتبط بقيود محاسبية');
    const account = await prisma.account.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: 'accounting', entityId: id, oldValue: account });
    return account;
  }

  // Journal Entries
  async listJournalEntries(query: PaginationQuery & { from?: string; to?: string; status?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.JournalEntryWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) where.description = { contains: query.search };
    const dateRange = localDateRange(query.from, query.to);
    if (dateRange) where.date = dateRange;

    const orderBy = buildOrderBy(query, JOURNAL_SORTABLE, [{ date: 'desc' }], [{ id: 'desc' }]) as Prisma.JournalEntryOrderByWithRelationInput[];
    const [data, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy,
        include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      }),
      prisma.journalEntry.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  /**
   * ينشئ قيد يومية يدويًا مباشرة (`tx.journalEntry.create`)، لا عبر
   * `gl.service.ts`'s `createBalancedJournal` — استثناء موثَّق، لا مسار موازٍ
   * منسي: القيد اليدوي referenceType='MANUAL' بلا مستند مصدر (`referenceId`
   * اختياري)، وهي دلالة لا تدعمها `createBalancedJournal` كما هي. المعيار
   * يبقى واحدًا رغم ذلك لأن هذه الدالة تستدعي بنفسها صراحةً كل ما يحمي المسار
   * المركزي: `assertPeriodOpen` (حارس قفل الفترة، أدناه)، و`roundMoney` عند
   * التخزين، و`validateJournalBalance` (تتقاسم `moneyEquals`/`sumMoney` مع
   * `createBalancedJournal` — انظر `accounting.utils.ts`). راجع تعليق
   * `createBalancedJournal` في `gl.service.ts` لتفصيل هذا الاستثناء.
   */
  async createJournalEntry(input: JournalEntryInput, req: Request) {
    validateJournalBalance(input.lines);

    const entryDate = input.date ?? new Date();

    const entry = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, entryDate, { operation: 'إنشاء قيد يدوي', module: 'accounting' });

      return tx.journalEntry.create({
        data: {
          // داخل المعاملة لضمان عدم التعارض مع قيود متزامنة
          entryNumber: await generateEntryNumber(tx, entryDate),
          date: entryDate,
          description: input.description,
          referenceType: input.referenceType ?? 'MANUAL',
          referenceId: input.referenceId ?? null,
          status: 'POSTED',
          lines: {
            // تطبيع عند حدود التخزين: كانت قيم المستخدم تُكتب خامًا في الدفتر، فتدخل
            // قيم دون-الفلس إلى الأستاذ العام. الحارس (validateJournalBalance) صار يقيس
            // بنفس القاعدة، فالتقريب هنا يتّسق معه ولا يفتح فجوة توازن.
            create: input.lines.map((l) => ({
              accountId: l.accountId,
              description: l.description ?? null,
              debit: roundMoney(l.debit ?? 0),
              credit: roundMoney(l.credit ?? 0),
            })),
          },
        },
        include: { lines: { include: { account: true } } },
      });
    });

    await recordAudit({ req, action: 'CREATE', module: 'accounting', entityId: entry.id, newValue: input });
    await recordHistoricalEntry({
      req,
      module: 'accounting',
      recordType: 'قيد يومية يدوي',
      entityId: entry.id,
      documentNumber: entry.entryNumber,
      transactionDate: entry.date,
      lateEntryReason: input.lateEntryReason,
    });
    return entry;
  }

  async cancelJournalEntry(id: number, req: Request) {
    const entry = await prisma.journalEntry.findUniqueOrThrow({ where: { id } });
    if (entry.status === 'CANCELLED') throw new Error('القيد ملغى بالفعل');
    if (entry.referenceType !== 'MANUAL') throw new Error('لا يمكن إلغاء قيد مرتبط بمستند');
    await assertPeriodOpen(prisma, entry.date, { operation: 'إلغاء قيد', module: 'accounting', entityId: id });
    const updated = await prisma.journalEntry.update({ where: { id }, data: { status: 'CANCELLED' } });
    await recordAudit({ req, action: 'UPDATE', module: 'accounting', entityId: id, oldValue: entry, newValue: { status: 'CANCELLED' } });
    return updated;
  }

  /**
   * عكس قيد يدوي بقيد مضاد.
   *
   * التاريخ الافتراضي هو تاريخ القيد الأصلي، لا تاريخ اليوم: عكس قيد 2024
   * يجب ألا يظهر في 2026 بصمت. المستخدم يستطيع تمرير `reversalDate` صراحةً
   * عندما يكون التصحيح حدثًا محاسبيًا في فترة لاحقة.
   *
   * استثناء موثَّق آخر (مثل `createJournalEntry` أعلاه): يكتب مباشرة، لا عبر
   * `gl.service.ts`'s `reverseGL` — لأن العكس اليدوي referenceType='MANUAL_REVERSAL'
   * برسالة سبب اختيارية، ويرفض صراحة عكس أي قيد مرتبط بمستند (`إلا هذا المسار
   * نفسه، عبر رسالة الخطأ أدناه`)، وهي قواعد عمل خاصة بالقيد اليدوي لا تخص
   * `reverseGL` العام. يستدعي `assertPeriodOpen` بنفسه كما تفعل `reverseGL`.
   */
  async reverseJournalEntry(id: number, input: { reversalDate?: Date; reason?: string }, req: Request) {
    const original = await prisma.journalEntry.findUniqueOrThrow({
      where: { id },
      include: { lines: true },
    });

    // يُعكَس فقط قيد يدوي مُرحَّل: لا قيد ملغى، ولا قيد عكسي، ولا قيد مرتبط بمستند
    // (الفاتورة/المصروف/الراتب تُعكَس عبر مسار وحدتها لتبقى الحالة والأرصدة متسقة).
    if (original.status !== 'POSTED') throw AppError.badRequest('لا يمكن عكس قيد غير مرحَّل');
    if (original.referenceType === 'MANUAL_REVERSAL') throw AppError.badRequest('لا يمكن عكس قيد عكسي');
    if (original.referenceType && original.referenceType !== 'MANUAL') {
      throw AppError.badRequest('لا يمكن عكس قيد مرتبط بمستند — استخدم إلغاء المستند نفسه');
    }

    // حارس التكرار (مستوى الكود، قبل قيد @@unique([referenceType, referenceId]) في DB).
    const existingReversal = await prisma.journalEntry.findFirst({
      where: { referenceType: 'MANUAL_REVERSAL', referenceId: original.id },
      select: { id: true, entryNumber: true },
    });
    if (existingReversal) {
      throw AppError.badRequest(`القيد معكوس بالفعل بالقيد ${existingReversal.entryNumber}`);
    }

    const reversalDate = input.reversalDate ?? original.date;

    const reversal = await prisma.$transaction(async (tx) => {
      await assertPeriodOpen(tx, reversalDate, { operation: 'عكس قيد', module: 'accounting', entityId: id });

      return tx.journalEntry.create({
        data: {
          entryNumber: await generateEntryNumber(tx, reversalDate),
          date: reversalDate,
          description: `عكس قيد ${original.entryNumber}${input.reason ? ` — ${input.reason}` : ''}`,
          referenceType: 'MANUAL_REVERSAL',
          referenceId: original.id,
          status: 'POSTED',
          lines: {
            create: original.lines.map((l) => ({
              accountId: l.accountId,
              description: `عكس: ${l.description ?? ''}`.trim(),
              debit: l.credit,
              credit: l.debit,
            })),
          },
        },
        include: { lines: { include: { account: true } } },
      });
    });

    await recordAudit({
      req,
      action: 'REVERSE',
      module: 'accounting',
      entityId: id,
      oldValue: { entryNumber: original.entryNumber, date: original.date },
      newValue: { entryNumber: reversal.entryNumber, date: reversal.date, reason: input.reason ?? null },
    });
    return reversal;
  }

  // Payments list (from existing Payment model tied to invoices)
  async listPayments(query: PaginationQuery & { method?: string; from?: string; to?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.PaymentWhereInput = {};
    if (query.method) where.method = query.method;
    const dateRange = localDateRange(query.from, query.to);
    if (dateRange) where.date = dateRange;

    const orderBy = buildOrderBy(query, PAYMENTS_SORTABLE, [{ date: 'desc' }], [{ id: 'desc' }]) as Prisma.PaymentOrderByWithRelationInput[];
    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy,
        include: { invoice: { select: { invoiceNumber: true, direction: true } } },
      }),
      prisma.payment.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  // Financial Summary
  /**
   * الملخص المالي — **هجين** منذ الحزمة 6 من هجرة التقارير التشغيلية (مبنيّ على قرار
   * التدقيق المعماري في الحزمة 5، المعتمد نهائيًا):
   *
   *   المقاييس التشغيلية (الإيراد/المصروف/التحصيل/صافي الربح) ← محرك التقارير التشغيلية
   *   (getOperationalSummary) — تطابق تمامًا لوحة التحكم ومركز القرار وتقرير الأرباح
   *   والخسائر (الحزم 2-4)، لأنها المفهوم نفسه في الحالتين: Invoice/Expense(APPROVED)/
   *   Payment، لا حساب موازٍ.
   *
   *   مقاييس المحاسبة (عدد القيود، إجمالي المدين/الدائن) ← الأستاذ العام كما هي تمامًا —
   *   لا معادل تشغيلي لها؛ تشمل كل الحسابات (أصول/خصوم/حقوق ملكية أيضًا)، لا الإيراد
   *   والمصروف فقط.
   *
   * مدفوعات الموردين (`totalSupplierPaid`، وحقل `totalPaymentsRecorded` المشتق منها)
   * تبقى من الأستاذ العام كما هي — خارج نطاق هذه الحزمة عمدًا؛ ستُعالَج في حزمة تالية.
   * `/transactions/profit-loss` (transactions.service.ts) لم يُمَسّ ويبقى كما هو تمامًا.
   */
  async financialSummary(from?: string, to?: string) {
    // نفس دلالة الفترة المستخدمة في لوحة القيادة/مركز القرار (resolvePeriod): تحليل محلي
    // للتاريخ (منتصف ليل محلي) مع endOfDay على تاريخ النهاية. كان `new Date(to)` يحلّل
    // "2026-12-31" كمنتصف ليل UTC بلا endOfDay، فيُسقط معظم اليوم الأخير من الفترة —
    // فيختلف رقم مركز المالية عن بقية الشاشات. الآن مصدر واحد لحدود الفترة.
    const period = resolvePeriod({ fromDate: from, toDate: to });
    const range: GLDateRange = { from: period.flow?.gte, to: period.flow?.lte };
    const hasDateFilter = !!(range.from || range.to);
    const journalDateFilter: Prisma.DateTimeFilter = {};
    if (range.from) journalDateFilter.gte = range.from;
    if (range.to) journalDateFilter.lte = range.to;
    const journalWhere: Prisma.JournalEntryWhereInput = {
      status: 'POSTED',
      ...(hasDateFilter ? { date: journalDateFilter } : {}),
    };

    const [operationalSummary, apFlow, journalTotals, journalEntryCount] = await Promise.all([
      // التشغيلي: الإيراد/المصروف/التحصيل/صافي الربح بنداء واحد — لا الأستاذ العام.
      getOperationalSummary(range),
      // مدفوعات الموردين = مدين حساب ذمم الموردين على قيود السداد (PURCHASE_PAYMENT) —
      // من الأستاذ العام كما هي، بلا تغيير (خارج نطاق هذه الحزمة).
      glAccountFlow(SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE, { referenceTypes: [GL_REFERENCE_TYPES.PURCHASE_PAYMENT], range }),
      // المحاسبي: عدد القيود وإجمالي المدين/الدائن — من الأستاذ العام كما هو، بلا تغيير.
      prisma.journalEntryLine.aggregate({ where: { journalEntry: journalWhere }, _sum: { debit: true, credit: true } }),
      prisma.journalEntry.count({ where: journalWhere }),
    ]);

    const totalCollected = operationalSummary.collections;
    const totalSupplierPaid = apFlow.debit;

    return {
      totalRevenue: operationalSummary.revenue,
      totalCollected,
      totalExpenses: operationalSummary.expenses,
      totalPaymentsRecorded: roundMoney(totalCollected + totalSupplierPaid),
      journalEntryCount,
      totalJournalDebit: roundMoney(journalTotals._sum.debit ?? 0),
      totalJournalCredit: roundMoney(journalTotals._sum.credit ?? 0),
      netProfit: operationalSummary.netProfit,
    };
  }
}

export const accountingService = new AccountingService();
