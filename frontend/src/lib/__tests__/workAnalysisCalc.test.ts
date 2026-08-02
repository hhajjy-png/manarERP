import { describe, expect, it } from 'vitest';
import { calcLine, calcTotals, formatPct } from '../workAnalysisCalc';
import { roundMoney } from '../money';

/**
 * ═══ تركيبات مشتركة — لا تُعدَّل في طرف واحد ═══
 * هذه الكتلة مطابقة حرفيًا لنظيرتها في
 * `backend/src/modules/workAnalysis/__tests__/workAnalysis.calc.test.ts`.
 * الملفّان يحرسان نسختي منطق الحساب (الواجهة/الخادم) من الانحراف: أي تغيير في
 * معادلة أو تقريب في أحد الطرفين يُسقط اختبارات ذلك الطرف فورًا.
 * عند تعديل التركيبات، عدّلها في الملفّين معًا.
 */
const SHARED_FIXTURES = {
  /** حالة نموذجية: نقل أسفلت 100 طن بعمولة دينارين ونصف للطن. */
  plain: { customerPrice: 12.5, ownerPrice: 10, quantity: 100 },
  /** حدّ التقريب: 1.0005 يجب أن تصعد إلى 1.001 لا أن تسقط بسبب تمثيل الثنائي. */
  roundingEdge: { customerPrice: 1.0005, ownerPrice: 0.0005, quantity: 1 },
  /** بيع بخسارة: سعر صاحب المعدة أعلى من سعر العميل — عمولة سالبة مشروعة. */
  loss: { customerPrice: 5, ownerPrice: 7, quantity: 3 },
  /** سعر عميل صفر — لا يجوز أن تنتج قسمة على صفر (NaN/Infinity). */
  zeroPrice: { customerPrice: 0, ownerPrice: 0, quantity: 10 },
  /** كمية صفر — عمولة الوحدة تبقى محسوبة، والإجماليات صفر. */
  zeroQuantity: { customerPrice: 10, ownerPrice: 8, quantity: 0 },
} as const;

describe('calcLine', () => {
  it('يحسب العمولة والإجماليات لحالة نموذجية', () => {
    const result = calcLine(SHARED_FIXTURES.plain);

    expect(result.commissionPerUnit).toBe(2.5);
    expect(result.customerTotal).toBe(1250);
    expect(result.ownerTotal).toBe(1000);
    expect(result.commissionTotal).toBe(250);
    expect(result.commissionPct).toBeCloseTo(20, 10);
  });

  it('يقرّب إلى ثلاث خانات نصفًا بعيدًا عن الصفر عند حدّ التعادل', () => {
    const result = calcLine(SHARED_FIXTURES.roundingEdge);

    expect(result.customerTotal).toBe(1.001);
    expect(result.ownerTotal).toBe(0.001);
    expect(result.commissionTotal).toBe(1);
  });

  it('يُنتج عمولة سالبة حين يتجاوز سعر صاحب المعدة سعر العميل', () => {
    const result = calcLine(SHARED_FIXTURES.loss);

    expect(result.commissionPerUnit).toBe(-2);
    expect(result.customerTotal).toBe(15);
    expect(result.ownerTotal).toBe(21);
    expect(result.commissionTotal).toBe(-6);
    expect(result.commissionPct).toBeCloseTo(-40, 10);
  });

  it('يُرجع نسبة صفر بدل القسمة على صفر حين يكون سعر العميل صفرًا', () => {
    const result = calcLine(SHARED_FIXTURES.zeroPrice);

    expect(result.commissionPct).toBe(0);
    expect(Number.isFinite(result.commissionPct)).toBe(true);
    expect(result.commissionTotal).toBe(0);
  });

  it('يُبقي عمولة الوحدة محسوبة حين تكون الكمية صفرًا', () => {
    const result = calcLine(SHARED_FIXTURES.zeroQuantity);

    expect(result.commissionPerUnit).toBe(2);
    expect(result.customerTotal).toBe(0);
    expect(result.commissionTotal).toBe(0);
    expect(result.commissionPct).toBeCloseTo(20, 10);
  });

  it('يحوّل المُدخَل غير الرقمي إلى صفر ولا يُسرّب NaN', () => {
    const result = calcLine({
      customerPrice: Number.NaN,
      ownerPrice: Number.NaN,
      quantity: Number.NaN,
    });

    expect(result.commissionPerUnit).toBe(0);
    expect(result.customerTotal).toBe(0);
    expect(result.commissionTotal).toBe(0);
    expect(result.commissionPct).toBe(0);
  });
});

describe('calcTotals', () => {
  it('يجمع الأسطر ويحسب الهامش ومتوسط العمولة', () => {
    const totals = calcTotals([SHARED_FIXTURES.plain, SHARED_FIXTURES.loss]);

    expect(totals.totalCustomerValue).toBe(1265);
    expect(totals.totalOwnerCost).toBe(1021);
    expect(totals.totalCommission).toBe(244);
    expect(totals.totalQuantity).toBe(103);
    expect(totals.lineCount).toBe(2);
    expect(totals.grossMarginPct).toBeCloseTo((244 / 1265) * 100, 10);
    expect(totals.avgCommissionPerUnit).toBe(2.369);
  });

  it('يُرجع أصفارًا لقائمة فارغة بلا NaN', () => {
    const totals = calcTotals([]);

    expect(totals.totalCustomerValue).toBe(0);
    expect(totals.totalCommission).toBe(0);
    expect(totals.lineCount).toBe(0);
    expect(totals.grossMarginPct).toBe(0);
    expect(totals.avgCommissionPerUnit).toBe(0);
  });

  it('يتجنّب القسمة على صفر حين تكون كل الكميات صفرًا', () => {
    const totals = calcTotals([SHARED_FIXTURES.zeroQuantity, SHARED_FIXTURES.zeroQuantity]);

    expect(totals.avgCommissionPerUnit).toBe(0);
    expect(totals.grossMarginPct).toBe(0);
  });

  /**
   * المطابقة الحسابية — الخاصية التي تجعل الشاشة قابلة للتصديق:
   * مجموع أعمدة الأسطر يساوي بالضبط ما تعرضه بطاقات المؤشرات، بلا فرق فلس.
   * تُختبر على 200 سطر مولَّد حتميًا بأسعار ثلاثية الخانات وكميات كسرية.
   */
  it('يطابق مجموع الأسطر إجماليات البطاقات بالضبط (200 سطر)', () => {
    const lines = Array.from({ length: 200 }, (_, i) => ({
      customerPrice: roundMoney(3 + (i * 7919) % 1000 / 1000),
      ownerPrice: roundMoney(1 + (i * 104729) % 1000 / 1000),
      quantity: roundMoney(0.25 + (i % 37) * 1.75),
    }));

    const totals = calcTotals(lines);
    const perLine = lines.map(calcLine);

    const sumCustomer = perLine.reduce((acc, l) => roundMoney(acc + l.customerTotal), 0);
    const sumOwner = perLine.reduce((acc, l) => roundMoney(acc + l.ownerTotal), 0);
    const sumCommission = perLine.reduce((acc, l) => roundMoney(acc + l.commissionTotal), 0);

    expect(totals.totalCustomerValue).toBe(sumCustomer);
    expect(totals.totalOwnerCost).toBe(sumOwner);
    expect(totals.totalCommission).toBe(sumCommission);
    // الإيراد − التكلفة = العمولة، وهي المعادلة المعروضة في «ملخّص الربحية».
    expect(roundMoney(totals.totalCustomerValue - totals.totalOwnerCost)).toBe(totals.totalCommission);
  });
});

describe('formatPct', () => {
  it('يصوغ خانتين عشريتين ويطبّع الصفر السالب', () => {
    expect(formatPct(19.2885375)).toBe('19.29%');
    expect(formatPct(-0)).toBe('0.00%');
    expect(formatPct(Number.NaN)).toBe('0.00%');
  });
});
