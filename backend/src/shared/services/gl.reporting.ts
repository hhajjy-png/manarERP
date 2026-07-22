import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { roundMoney } from '../utils/money';

/**
 * محرّك التقارير المالية من الأستاذ العام (القيد المزدوج).
 *
 * منذ Operational Reporting Migration (الحزم 1-6، معتمدة نهائيًا): هذا المحرك **لم يعد**
 * مصدر أرقام الإدارة (لوحة التحكم، مركز القرار التنفيذي، تقرير الأرباح والخسائر، الملخص
 * المالي في المحاسبة) — تلك تأتي الآن من محرك التقارير التشغيلية
 * (`shared/services/operational.reporting.ts`). هذا الملف يبقى المصدر حصريًا لِـ: دفتر
 * اليومية، دليل الحسابات، ميزان المراجعة، والمراجعة المحاسبية.
 *
 * استخدامان متبقيان فقط، كلاهما مقصود:
 *   - `transactions.service.ts profitAndLoss()` — `/transactions/profit-loss`، لم يُهاجَر
 *     بعد عمدًا (مؤجَّل لحزمة تنظيف لاحقة).
 *   - `accounting.service.ts financialSummary()` — حركة حساب الرقابة لمدفوعات الموردين
 *     (AP) فقط عبر `glAccountFlow`، أبقاها قرار الحزمة 6 دون تغيير.
 *
 * الأساس: استحقاقي (accrual). الإيراد يُعترَف عند إصدار الفاتورة (قيد Dr AR / Cr Revenue)،
 * والمصروف عند اعتماده/صرفه. القيود العكسية (‎*_REVERSAL) تُطرح تلقائيًا لأنها أسطر معاكسة
 * على نفس الحسابات. لا يُحتسب إلا المُرحَّل (status='POSTED').
 */

type Client = Prisma.TransactionClient | typeof prisma;

export interface GLDateRange {
  from?: Date;
  to?: Date;
}

export interface GLProfitAndLoss {
  revenue: number;
  expenses: number;
  netProfit: number;
}

function dateFilter(range?: GLDateRange): Prisma.DateTimeFilter | undefined {
  if (!range || (!range.from && !range.to)) return undefined;
  const f: Prisma.DateTimeFilter = {};
  if (range.from) f.gte = range.from;
  if (range.to) f.lte = range.to;
  return f;
}

function entryWhere(range?: GLDateRange): Prisma.JournalEntryWhereInput {
  const df = dateFilter(range);
  return { status: 'POSTED', ...(df ? { date: df } : {}) };
}

/**
 * الأرباح والخسائر من الأستاذ العام لفترة (أو كل الفترات إن لم تُحدَّد).
 *   الإيراد  = Σ(دائن − مدين) على حسابات النوع REVENUE.
 *   المصروف = Σ(مدين − دائن) على حسابات النوع EXPENSE.
 *   صافي الربح = الإيراد − المصروف.
 */
export async function glProfitAndLoss(
  range?: GLDateRange,
  client: Client = prisma,
): Promise<GLProfitAndLoss> {
  const where = entryWhere(range);
  const [rev, exp] = await Promise.all([
    client.journalEntryLine.aggregate({
      where: { account: { type: 'REVENUE' }, journalEntry: where },
      _sum: { debit: true, credit: true },
    }),
    client.journalEntryLine.aggregate({
      where: { account: { type: 'EXPENSE' }, journalEntry: where },
      _sum: { debit: true, credit: true },
    }),
  ]);
  const revenue = roundMoney((rev._sum.credit ?? 0) - (rev._sum.debit ?? 0));
  const expenses = roundMoney((exp._sum.debit ?? 0) - (exp._sum.credit ?? 0));
  return { revenue, expenses, netProfit: roundMoney(revenue - expenses) };
}

/**
 * صافي حركة حساب نظام (بالرمز) على قيود من أنواع مرجع محدَّدة — لمؤشرات النقد.
 * يُرجع مجموع المدين والدائن (مقرَّبَين). الاستخدام الوحيد المتبقي: مدفوعات الموردين في
 * `accounting.service.ts` = مدين حساب ذمم الموردين (2000) على قيود PURCHASE_PAYMENT.
 */
export async function glAccountFlow(
  accountCode: string,
  opts: { referenceTypes?: string[]; range?: GLDateRange } = {},
  client: Client = prisma,
): Promise<{ debit: number; credit: number }> {
  const where: Prisma.JournalEntryWhereInput = {
    ...entryWhere(opts.range),
    ...(opts.referenceTypes ? { referenceType: { in: opts.referenceTypes } } : {}),
  };
  const agg = await client.journalEntryLine.aggregate({
    where: { account: { code: accountCode }, journalEntry: where },
    _sum: { debit: true, credit: true },
  });
  return { debit: roundMoney(agg._sum.debit ?? 0), credit: roundMoney(agg._sum.credit ?? 0) };
}
