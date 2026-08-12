/**
 * دفتر المديونيات والسلف — دوال خالصة.
 *
 * ═══ الرصيد مشتقّ، لا مخزَّن ═══
 * لا يوجد في قاعدة البيانات عمود رصيد ولا عمود «مسدَّد» ولا عمود حالة. كلها تُحسب هنا
 * من الأصل ومن حركات الدفتر. عمودٌ مخزَّن كان سيصير مصدر حقيقة ثانيًا يتباعد عن الدفتر
 * أوّلَ مرة ينسى مسارُ كتابةٍ تحديثَه — وهو الصنف الذي يجعل موظفًا يُخصم منه مرّتين أو
 * لا يُخصم أبدًا، ولا يظهر الخطأ إلا بعد أشهر.
 *
 * كل ما هنا خالص وحتمي: لا Prisma، ولا تاريخ نظام، ولا حالة. الخدمة تقرأ الصفوف وتمرّرها.
 */
import { roundMoney, sumMoney } from './rounding';

/** أنواع السجل. القائمة مغلقة. */
export const DEBT_TYPES = ['ADVANCE', 'DEBT', 'CUSTOM'] as const;
export type DebtType = (typeof DEBT_TYPES)[number];

/** مصدر حركة السداد. */
export const DEBT_PAYMENT_SOURCES = ['MONTHLY_COMPENSATION', 'MANUAL_PAYMENT'] as const;
export type DebtPaymentSource = (typeof DEBT_PAYMENT_SOURCES)[number];

/** الحالة **مشتقّة** من الرصيد — لا تُخزَّن ولا تُضبط يدويًا. */
export type DebtStatus = 'OPEN' | 'SETTLED';

/** أقل ما يحتاجه الحساب من حركة سداد. */
export interface LedgerMovement {
  id: number;
  amount: number;
}

export interface DebtBalance {
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: DebtStatus;
}

/**
 * رصيد مديونية = الأصل − مجموع حركاتها.
 *
 * المجموع يقع مرة واحدة (`sumMoney`) لا تراكميًا، فلا يتسلّل فلس من التقريب المتكرّر.
 * الرصيد **لا يُقصّ عند الصفر**: رصيد سالب يعني خللًا في البيانات يجب أن يُرى لا أن
 * يُخفى، والتحقّق في `assertPaymentWithinBalance` هو ما يمنع نشوءه أصلًا.
 */
export function computeDebtBalance(originalAmount: number, movements: readonly LedgerMovement[]): DebtBalance {
  if (!Number.isFinite(originalAmount)) throw new Error('أصل المديونية ليس قيمة صالحة');
  const original = roundMoney(originalAmount);
  const paid = sumMoney(movements.map((m) => m.amount));
  const remaining = roundMoney(original - paid);
  return {
    originalAmount: original,
    paidAmount: paid,
    remainingAmount: remaining,
    // «مسدَّدة» عند الصفر أو أقل — لا عند «قريب من الصفر»: الفلس فارق حقيقي.
    status: remaining <= 0 ? 'SETTLED' : 'OPEN',
  };
}

/**
 * الرصيد المتاح لحركة **بعينها** — أي الرصيد بعد استبعاد أثر الحركة نفسها.
 *
 * هذا هو جوهر صحّة التعديل: عند تعديل استقطاع من ٢٥ إلى ٣٠ على مديونية أصلها ١٠٠
 * وعليها هذه الحركة وحدها، الرصيد «الظاهر» ٧٥ — والمقارنة به ترفض ٣٠ خطأً. الصحيح
 * مقارنةُ ٣٠ بالرصيد **بدون** الحركة القديمة، أي ١٠٠.
 */
export function availableForMovement(
  originalAmount: number,
  movements: readonly LedgerMovement[],
  excludeMovementId?: number | null,
): number {
  const others = excludeMovementId == null ? movements : movements.filter((m) => m.id !== excludeMovementId);
  return computeDebtBalance(originalAmount, others).remainingAmount;
}

export interface PaymentValidationContext {
  originalAmount: number;
  movements: readonly LedgerMovement[];
  /** معرّف الحركة الجاري تعديلها — يُستبعد أثرها قبل المقارنة. */
  excludeMovementId?: number | null;
  /** بيان السجل — يظهر في رسالة الرفض حتى يعرف المستخدم أيّ مديونية رُفضت. */
  debtLabel: string;
}

/**
 * يرفض سدادًا يتجاوز الرصيد المتاح (المتطلب ١٨).
 *
 * يرمي `Error` نصّيًا؛ طبقة الخدمة تحوّله إلى `AppError` بالرمز المناسب. إبقاء المحرّك
 * جاهلًا بـExpress هو ما يُبقيه قابلًا لإعادة الاستخدام عند ربط الوحدة مستقبلًا.
 */
export function assertPaymentWithinBalance(amount: number, ctx: PaymentValidationContext): number {
  if (!Number.isFinite(amount)) throw new Error('مبلغ السداد ليس قيمة صالحة');
  const value = roundMoney(amount);
  if (value <= 0) throw new Error('مبلغ السداد يجب أن يكون أكبر من صفر');

  const available = availableForMovement(ctx.originalAmount, ctx.movements, ctx.excludeMovementId);
  if (value > available) {
    throw new Error(
      `مبلغ السداد (${value.toFixed(3)} د.ك) يتجاوز الرصيد المتبقي على «${ctx.debtLabel}» ` +
        `(${available.toFixed(3)} د.ك). لا يمكن سداد أكثر من المتبقي.`,
    );
  }
  return value;
}

/**
 * يرفض خفض أصل المديونية إلى ما دون المسدَّد فعلًا (المتطلب ١٠).
 *
 * أصلٌ أقلّ من المسدَّد ينتج رصيدًا سالبًا — أي أن الشركة صارت مدينةً للموظف بأثر
 * تعديلٍ إداري، وهو ما لا يعنيه المستخدم قطعًا حين يصحّح رقمًا.
 */
export function assertOriginalCoversPayments(
  newOriginalAmount: number,
  movements: readonly LedgerMovement[],
): number {
  if (!Number.isFinite(newOriginalAmount)) throw new Error('أصل المديونية ليس قيمة صالحة');
  const value = roundMoney(newOriginalAmount);
  if (value <= 0) throw new Error('أصل المديونية يجب أن يكون أكبر من صفر');

  const paid = sumMoney(movements.map((m) => m.amount));
  if (value < paid) {
    throw new Error(
      `لا يمكن خفض أصل المديونية إلى ${value.toFixed(3)} د.ك لأن المسدَّد عليها فعلًا ` +
        `${paid.toFixed(3)} د.ك. عدّل حركات السداد أو احذفها أولًا.`,
    );
  }
  return value;
}

/** ملخّص سجل موظف كامل — للعرض في ملف الموظف السنوي. */
export interface DebtPortfolioSummary {
  totalDebts: number;
  openDebts: number;
  settledDebts: number;
  totalOriginal: number;
  totalPaid: number;
  totalRemaining: number;
}

export function summarizeDebts(balances: readonly DebtBalance[]): DebtPortfolioSummary {
  return {
    totalDebts: balances.length,
    openDebts: balances.filter((b) => b.status === 'OPEN').length,
    settledDebts: balances.filter((b) => b.status === 'SETTLED').length,
    totalOriginal: sumMoney(balances.map((b) => b.originalAmount)),
    totalPaid: sumMoney(balances.map((b) => b.paidAmount)),
    // الرصيد القائم يجمع المديونيات المفتوحة وحدها: مديونية مسدَّدة برصيد صفر لا تضيف
    // شيئًا، وأخرى بفائض سالب (لو وُجد بخلل بيانات) لا يجوز أن تُقاصّ دَينًا حقيقيًا.
    totalRemaining: sumMoney(balances.filter((b) => b.status === 'OPEN').map((b) => b.remainingAmount)),
  };
}
