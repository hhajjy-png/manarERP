import { roundMoney } from './money';

/**
 * المرجع الحسابي لتحليل الشغل والعمولة (جانب الواجهة).
 *
 * ═══ لماذا يوجد نظير على الخادم ═══
 * `backend/src/modules/workAnalysis/workAnalysis.calc.ts` يحمل نفس المنطق حرفيًا.
 * الواجهة والخادم مشروعا TypeScript منفصلان بلا حزمة مشتركة، والمتطلّب يفرض إعادة
 * حساب فورية مع كل ضغطة مفتاح دون أي نداء شبكة — فوجود نسخة تعمل في المتصفح شرط
 * وظيفي لا ترف. نفس المبرِّر الموثّق في `money.ts` تجاه `backend/shared/utils/money.ts`.
 *
 * ما يمنع الانحراف: `__tests__/workAnalysisCalc.test.ts` هنا و
 * `workAnalysis.calc.test.ts` على الخادم يشتركان في **نفس تركيبات الاختبار الحرفية**
 * (SHARED_FIXTURES أدناه)، فأي تعديل في طرف دون الآخر يُسقط اختبارات ذلك الطرف.
 *
 * ═══ عقد التقريب ═══
 * التقريب على **إجمالي السطر** (`roundMoney`: نصف بعيدًا عن الصفر، 3 خانات)، ثم تُجمع
 * الإجماليات المدوَّرة — نفس عقد الفواتير. فما يظهر في عمود «الإجمالي» هو بعينه ما
 * يدخل في المجموع، ولا يظهر فرق فلس بين الأسطر ومجموعها.
 * النِّسَب المئوية ليست نقودًا ولا تُقرَّب بـ `roundMoney`.
 */

export interface WorkAnalysisLineAmounts {
  /** عمولة الوحدة = سعر العميل − سعر صاحب المعدة. قد تكون سالبة (بيع بخسارة). */
  commissionPerUnit: number;
  customerTotal: number;
  ownerTotal: number;
  commissionTotal: number;
  /** نسبة العمولة من سعر العميل (٪). صفر حين سعر العميل صفر — لا قسمة على صفر. */
  commissionPct: number;
}

export interface WorkAnalysisLineInputAmounts {
  customerPrice: number;
  ownerPrice: number;
  quantity: number;
}

export interface WorkAnalysisTotals {
  totalCustomerValue: number;
  totalOwnerCost: number;
  totalCommission: number;
  totalQuantity: number;
  lineCount: number;
  /** هامش الربح الإجمالي (٪) = مجموع العمولة ÷ مجموع قيمة العميل. */
  grossMarginPct: number;
  /** متوسط العمولة لكل وحدة = مجموع العمولة ÷ مجموع الكميات. */
  avgCommissionPerUnit: number;
}

/** يحوّل أي مُدخَل غير رقمي (نص فارغ، null، NaN) إلى صفر — لا يتسرّب NaN إلى الشاشة. */
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function calcLine(line: WorkAnalysisLineInputAmounts): WorkAnalysisLineAmounts {
  const customerPrice = num(line.customerPrice);
  const ownerPrice = num(line.ownerPrice);
  const quantity = num(line.quantity);

  const commissionPerUnit = roundMoney(customerPrice - ownerPrice);
  const customerTotal = roundMoney(customerPrice * quantity);
  const ownerTotal = roundMoney(ownerPrice * quantity);

  return {
    commissionPerUnit,
    customerTotal,
    ownerTotal,
    // مشتق من الإجماليين المدوَّرين لا من (عمولة الوحدة × الكمية)، فيتطابق العمود
    // مع الطرح الظاهر للمستخدم مهما بلغت الكمية.
    commissionTotal: roundMoney(customerTotal - ownerTotal),
    commissionPct: customerPrice === 0 ? 0 : (commissionPerUnit / customerPrice) * 100,
  };
}

export function calcTotals(lines: readonly WorkAnalysisLineInputAmounts[]): WorkAnalysisTotals {
  let totalCustomerValue = 0;
  let totalOwnerCost = 0;
  let totalCommission = 0;
  let totalQuantity = 0;

  for (const line of lines) {
    const amounts = calcLine(line);
    totalCustomerValue = roundMoney(totalCustomerValue + amounts.customerTotal);
    totalOwnerCost = roundMoney(totalOwnerCost + amounts.ownerTotal);
    totalCommission = roundMoney(totalCommission + amounts.commissionTotal);
    totalQuantity += num(line.quantity);
  }

  return {
    totalCustomerValue,
    totalOwnerCost,
    totalCommission,
    totalQuantity,
    lineCount: lines.length,
    grossMarginPct: totalCustomerValue === 0 ? 0 : (totalCommission / totalCustomerValue) * 100,
    avgCommissionPerUnit: totalQuantity === 0 ? 0 : roundMoney(totalCommission / totalQuantity),
  };
}

/** صياغة نسبة مئوية للعرض — خانتان عشريتان، وتُطبَّع `-0` إلى `0`. */
export function formatPct(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const normalized = safe === 0 ? 0 : safe;
  return `${normalized.toFixed(2)}%`;
}
