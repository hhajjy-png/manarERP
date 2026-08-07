/* ════════════════════════════════════════════════════════════════════════════
   Financial Analysis Engine — طبقة البيانات.

   المسؤولية الوحيدة: تحميل **مجموعة بيانات واحدة** للفترة المطلوبة، مرّة واحدة
   لكل طلب. لا حساب ولا تنسيق هنا — كل الاشتقاق يجري في الطبقة النقيّة
   (`financialAnalysis.compute.ts`).

   قواعد العمل (ما هو إيراد؟ ما هو مصروف؟ ما هو تحصيل؟) **ليست مكتوبة هنا**:
   تُستورد حرفيًا من محرّك التقارير التشغيلية `shared/services/operational.reporting`
   وهو المصدر التشغيلي الوحيد المعتمد في المشروع. هذا ما يضمن أن أرقام هذه
   الصفحة تطابق لوحة التحكم وتقرير الأرباح والخسائر ومركز الشؤون المالية بلا
   إعادة كتابة لأي منطق.
   ════════════════════════════════════════════════════════════════════════════ */

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { endOfLocalDay, localDateRange, startOfLocalDay, toLocalDateString } from '../../core/utils/dateWindows';
import { roundMoney } from '../../shared/utils/money';
import {
  EXPENSE_OPERATIONAL_STATUS,
  SALES_INVOICE_ACTIVE,
  getOperationalProfitAndLoss,
} from '../../shared/services/operational.reporting';
import type {
  AnalysisDataset,
  AnalysisPeriod,
  DrilldownKind,
  DrilldownResult,
  DrilldownRow,
} from './financialAnalysis.types';

/** أقصى عدد سجلات تُعاد في نافذة التنقّل التفصيلي (المجموع يبقى للكل). */
export const DRILLDOWN_LIMIT = 300;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface AnalysisRangeInput {
  from?: string;
  to?: string;
}

/**
 * يحلّ الفترة المختارة وفترتها السابقة المكافئة بالطول.
 *
 * الفترة السابقة تنتهي في اليوم السابق مباشرةً لبداية الفترة الحالية وتمتد
 * العدد نفسه من الأيام — أساسٌ عادل لعمود «مقارنة بالفترة السابقة». غياب أحد
 * الحدّين يعني «بلا مقارنة» (لا يمكن اشتقاق فترة سابقة من مدى مفتوح).
 */
export function resolveAnalysisPeriod(input: AnalysisRangeInput): AnalysisPeriod {
  const from = input.from ?? null;
  const to = input.to ?? null;
  if (!from || !to) {
    return { from, to, days: null, previousFrom: null, previousTo: null };
  }

  // منتصف ليل **الطرفين**، لا منتصف ليل البداية مقابل نهاية يوم النهاية.
  //
  // الفرق ليس تجميليًا: `endOfLocalDay` هو 23:59:59.999، فالفرق بينه وبين بداية
  // اليوم الأول يساوي (n − 0.000001) يومًا. `Math.round` يرفعه إلى n، ثم تُضاف
  // واحدة للشمول فيخرج **n + 1**. النتيجة كانت يومًا زائدًا في كل فترة بلا استثناء:
  // أغسطس ⇒ 32 يومًا، ويوم واحد ⇒ يومان. وذلك يضخّم «متوسط فترة التحصيل» ويمدّد
  // نافذة المقارنة السابقة يومًا كاملًا فوق طول الفترة الحالية، فيقارَن غير المتكافئ.
  //
  // الفرق بين منتصفَي ليل عدد صحيح من الأيام إلا عند انزياح توقيت صيفي (±ساعة)،
  // و`Math.round` يبتلعه — لذلك تبقى الصيغة صحيحة في أي منطقة زمنية.
  const start = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  if (!start || !end) {
    return { from, to, days: null, previousFrom: null, previousTo: null };
  }

  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1);
  const prevEnd = new Date(start.getTime() - MS_PER_DAY);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * MS_PER_DAY);

  return {
    from,
    to,
    days,
    previousFrom: toLocalDateString(prevStart),
    previousTo: toLocalDateString(prevEnd),
  };
}

/**
 * يُحمّل مجموعة البيانات الموحّدة.
 *
 * **ثلاثة استعلامات صفوف + استعلامَا تجميع للفترة السابقة، لا أكثر.** كل قسم من
 * الأقسام السبعة يُشتقّ من هذه المصفوفات نفسها؛ لا يوجد استعلام لكل جدول ولا
 * لكل بطاقة. الحقول المُنتقاة هي الحدّ الأدنى الذي تحتاجه الأقسام مجتمعةً، فيبقى
 * الحِمل خطّيًا مع عدد السجلات ومعقولًا عند آلاف الصفوف.
 */
export async function loadAnalysisDataset(input: AnalysisRangeInput): Promise<AnalysisDataset> {
  const period = resolveAnalysisPeriod(input);
  const expenseRange = localDateRange(period.from, period.to);

  /**
   * نافذة الأستاذ: **حتى نهاية الفترة فقط، بلا حدّ أدنى**.
   *
   * حركة الفترة تُشتقّ منها بترشيح واحد أدناه بدل استعلام ثانٍ — فعدد الاستعلامات
   * يبقى كما كان (ثلاثة + مجاميع الفترة السابقة)، ويُكسب معه الرصيد المرحَّل الذي
   * يحتاجه §5. المصروفات لا تُرحَّل بطبيعتها فتبقى محصورة بالفترة.
   */
  const ledgerEnd = endOfLocalDay(period.to);
  const ledgerRange = ledgerEnd ? { lte: ledgerEnd } : undefined;

  const [invoiceRows, expenseRows, paymentRows, previous] = await Promise.all([
    prisma.invoice.findMany({
      where: { ...SALES_INVOICE_ACTIVE, ...(ledgerRange ? { issueDate: ledgerRange } : {}) },
      select: {
        id: true,
        invoiceNumber: true,
        issueDate: true,
        total: true,
        customerId: true,
        customer: { select: { name: true } },
      },
      orderBy: { issueDate: 'asc' },
    }),
    prisma.expense.findMany({
      where: { status: EXPENSE_OPERATIONAL_STATUS, ...(expenseRange ? { date: expenseRange } : {}) },
      select: { id: true, code: true, date: true, amount: true, category: true, description: true },
      orderBy: { date: 'asc' },
    }),
    prisma.payment.findMany({
      where: {
        ...(ledgerRange ? { date: ledgerRange } : {}),
        invoice: SALES_INVOICE_ACTIVE,
      },
      select: {
        id: true,
        date: true,
        amount: true,
        invoiceId: true,
        invoice: {
          select: { invoiceNumber: true, customerId: true, customer: { select: { name: true } } },
        },
      },
      orderBy: { date: 'asc' },
    }),
    loadPreviousPeriodTotals(period),
  ]);

  const ledgerInvoices = invoiceRows.map((i) => ({
    id: i.id,
    invoiceNumber: i.invoiceNumber,
    issueDate: i.issueDate,
    total: roundMoney(i.total ?? 0),
    customerId: i.customerId ?? null,
    customerName: i.customer?.name ?? null,
  }));
  const ledgerPayments = paymentRows.map((p) => ({
    id: p.id,
    date: p.date,
    amount: roundMoney(p.amount ?? 0),
    invoiceId: p.invoiceId,
    invoiceNumber: p.invoice?.invoiceNumber ?? '',
    customerId: p.invoice?.customerId ?? null,
    customerName: p.invoice?.customer?.name ?? null,
  }));

  // حركة الفترة = الأستاذ من بدايتها فصاعدًا. غياب `from` (مدى مفتوح) يعني أن
  // الأستاذ **هو** حركة الفترة، فلا ترشيح ولا نسخ.
  const periodStart = startOfLocalDay(period.from);
  const sinceStart = <T>(rows: T[], dateOf: (row: T) => Date): T[] =>
    periodStart ? rows.filter((row) => dateOf(row) >= periodStart) : rows;

  return {
    period,
    invoices: sinceStart(ledgerInvoices, (i) => i.issueDate),
    expenses: expenseRows.map((e) => ({
      id: e.id,
      code: e.code,
      date: e.date,
      amount: roundMoney(e.amount ?? 0),
      category: e.category,
      description: e.description,
    })),
    payments: sinceStart(ledgerPayments, (p) => p.date),
    ledger: { invoices: ledgerInvoices, payments: ledgerPayments },
    previous,
  };
}

/**
 * أرقام الفترة السابقة — عبر `getOperationalProfitAndLoss` نفسها التي يستخدمها
 * تقرير الأرباح والخسائر، فلا يُعاد تعريف الإيراد/المصروف هنا إطلاقًا.
 */
async function loadPreviousPeriodTotals(period: AnalysisPeriod): Promise<AnalysisDataset['previous']> {
  const prev = localDateRange(period.previousFrom, period.previousTo);
  if (!prev?.gte || !prev.lte) return { revenue: 0, expenses: 0, profit: 0 };

  const pl = await getOperationalProfitAndLoss({ from: prev.gte, to: prev.lte });
  return { revenue: pl.revenue, expenses: pl.expenses, profit: pl.netProfit };
}

/* ── التنقّل التفصيلي ────────────────────────────────────────────────────── */

export interface DrilldownInput extends AnalysisRangeInput {
  kind: DrilldownKind;
  /** حصر إضافي بشهر بعينه `YYYY-MM` (يُشتقّ من الصف المضغوط عليه). */
  month?: string;
  /** حصر إضافي بتصنيف مصروف. */
  category?: string;
  /** حصر إضافي بعميل. */
  customerId?: number;
}

/** يضيّق مدى الفترة إلى شهر بعينه حين يطلب الصف ذلك. */
function narrowToMonth(input: DrilldownInput): AnalysisRangeInput {
  if (!input.month) return { from: input.from, to: input.to };
  const [y, m] = input.month.split('-').map(Number);
  if (!y || !m) return { from: input.from, to: input.to };
  const last = new Date(y, m, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

/**
 * سجلات الفترة/الخلية المضغوط عليها — نفس شروط مجموعة البيانات حرفيًا، فلا
 * يمكن أن يختلف مجموع النافذة عن الرقم الذي فُتحت منه.
 */
export async function loadDrilldown(input: DrilldownInput): Promise<DrilldownResult> {
  const scope = narrowToMonth(input);
  const range = localDateRange(scope.from, scope.to);
  const take = DRILLDOWN_LIMIT;

  if (input.kind === 'expenses') {
    const where: Prisma.ExpenseWhereInput = {
      status: EXPENSE_OPERATIONAL_STATUS,
      ...(range ? { date: range } : {}),
      ...(input.category ? { category: input.category } : {}),
    };
    const [rows, agg] = await Promise.all([
      prisma.expense.findMany({
        where,
        select: { id: true, code: true, date: true, amount: true, description: true },
        orderBy: { date: 'desc' },
        take,
      }),
      prisma.expense.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    return buildResult(
      'expenses',
      rows.map<DrilldownRow>((r) => ({
        id: r.id,
        date: toLocalDateString(r.date),
        reference: r.code,
        label: r.description,
        amount: roundMoney(r.amount ?? 0),
      })),
      roundMoney(agg._sum.amount ?? 0),
      agg._count._all,
      take,
    );
  }

  if (input.kind === 'collections') {
    const where: Prisma.PaymentWhereInput = {
      ...(range ? { date: range } : {}),
      invoice: {
        ...SALES_INVOICE_ACTIVE,
        ...(input.customerId != null ? { customerId: input.customerId } : {}),
      },
    };
    const [rows, agg] = await Promise.all([
      prisma.payment.findMany({
        where,
        select: {
          id: true,
          date: true,
          amount: true,
          invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
        },
        orderBy: { date: 'desc' },
        take,
      }),
      prisma.payment.aggregate({ where, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    return buildResult(
      'collections',
      rows.map<DrilldownRow>((r) => ({
        id: r.id,
        date: toLocalDateString(r.date),
        reference: r.invoice?.invoiceNumber ?? '',
        label: r.invoice?.customer?.name ?? '',
        amount: roundMoney(r.amount ?? 0),
      })),
      roundMoney(agg._sum.amount ?? 0),
      agg._count._all,
      take,
    );
  }

  const where: Prisma.InvoiceWhereInput = {
    ...SALES_INVOICE_ACTIVE,
    ...(range ? { issueDate: range } : {}),
    ...(input.customerId != null ? { customerId: input.customerId } : {}),
  };
  const [rows, agg] = await Promise.all([
    prisma.invoice.findMany({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        issueDate: true,
        total: true,
        customer: { select: { name: true } },
      },
      orderBy: { issueDate: 'desc' },
      take,
    }),
    prisma.invoice.aggregate({ where, _sum: { total: true }, _count: { _all: true } }),
  ]);
  return buildResult(
    'revenue',
    rows.map<DrilldownRow>((r) => ({
      id: r.id,
      date: toLocalDateString(r.issueDate),
      reference: r.invoiceNumber,
      label: r.customer?.name ?? '',
      amount: roundMoney(r.total ?? 0),
    })),
    roundMoney(agg._sum.total ?? 0),
    agg._count._all,
    take,
  );
}

function buildResult(
  kind: DrilldownKind,
  rows: DrilldownRow[],
  total: number,
  count: number,
  limit: number,
): DrilldownResult {
  return { kind, rows, total, count, truncated: count > limit };
}
