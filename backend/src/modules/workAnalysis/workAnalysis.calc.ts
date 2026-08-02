import { roundMoney } from '@shared/utils/money';

/**
 * المرجع الحسابي الوحيد لتحليل الشغل والعمولة (جانب الخادم).
 *
 * ═══ ملاحظة على الازدواجية ═══
 * يوجد نظير مطابق سلوكيًا في `frontend/src/lib/workAnalysisCalc.ts`. هذا **ليس**
 * منطقًا مكرَّرًا بالمصادفة: الواجهة والخادم مشروعا TypeScript منفصلان بلا حزمة
 * مشتركة، والمتطلّب يفرض إعادة حساب فورية أثناء الكتابة دون أي نداء شبكة — فلا
 * مفرّ من وجود نسخة تعمل في المتصفح. نفس المبرِّر الموثّق أصلًا في
 * `frontend/src/lib/money.ts` تجاه `backend/src/shared/utils/money.ts`.
 *
 * ما يمنع الانحراف: الملفّان يشتركان في **نفس تركيبات الاختبار الحرفية**
 * (`workAnalysis.calc.test.ts` على الجانبين)، فأي تعديل في أحدهما دون الآخر يُسقط
 * اختبارات ذلك الجانب فورًا.
 *
 * ═══ عقد التقريب ═══
 * التقريب يتم على **إجمالي السطر** بـ `roundMoney` (نصف بعيدًا عن الصفر، 3 خانات)،
 * ثم تُجمع الإجماليات المدوَّرة. هذا نفس عقد الفواتير حرفيًا: ما يراه المستخدم في
 * عمود «الإجمالي» هو بعينه ما يدخل في المجموع، فلا يظهر فرق فلس بين الأسطر ومجموعها.
 * النِّسَب المئوية ليست نقودًا — لا تُمرَّر على `roundMoney` إطلاقًا.
 */

export interface WorkAnalysisLineAmounts {
  /** عمولة الوحدة = سعر العميل − سعر صاحب المعدة. قد تكون سالبة (بيع بخسارة). */
  commissionPerUnit: number;
  customerTotal: number;
  ownerTotal: number;
  commissionTotal: number;
  /** نسبة العمولة من سعر العميل (٪). صفر حين يكون سعر العميل صفرًا — لا قسمة على صفر. */
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

/** يحوّل أي مُدخَل غير رقمي (null/undefined/NaN) إلى صفر — لا يُسمح لـ NaN بالتسرّب. */
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
