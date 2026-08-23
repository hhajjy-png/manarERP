// @vitest-environment jsdom
/**
 * PERMANENT GUARD — فشل الطلب ليس صفرًا.
 *
 * تدقيق 2026-08-22 وجد بطاقات مالية تعرض `0.000 د.ك` حين يفشل طلبها، وبطاقات أخرى
 * تحتفظ بأرقام الفلتر السابق فوق جدول الفلتر الجديد. كلتاهما كذبة لا يستطيع المستخدم
 * تمييزها عن الحقيقة. هذا الملف يمنع عودتهما.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import KpiRowSection from '../components/dashboard/command/KpiRowSection';
import FinancialIntelPanel from '../components/dashboard/FinancialIntelPanel';
import UnavailableValue from '../components/UnavailableValue';
import type { FinancialSummary } from '../components/dashboard/command/types';

const FINANCIAL: FinancialSummary = {
  totalRevenue: 1000, totalExpenses: 400, netProfit: 600,
  totalCollected: 900, totalOutstanding: 250,
  monthOnMonthChanges: { revenue: null, expenses: null, profit: null, collections: null },
  thisMonth: { revenue: 0, expenses: 0, profit: 0, collections: 0 },
  lastMonth: { revenue: 0, expenses: 0, profit: 0, collections: 0 },
  topCustomersByRevenue: [],
  overallCollectionRate: null,
} as unknown as FinancialSummary;

/** أي نص يوحي بمبلغ صفري معروض كقيمة حقيقية. */
const ZERO_MONEY = /(^|[^\d.,])0[.,]000([^\d]|$)/;

describe('UnavailableValue — علامة القيمة غير المتاحة', () => {
  it('يعرض شرطة لا صفرًا، مع سبب مقروء آليًا', () => {
    render(<UnavailableValue />);
    const el = screen.getByLabelText(/غير متاحة/);
    expect(el.textContent).toBe('—');
    expect(el.textContent).not.toMatch(/0/);
  });
});

describe('صافي النقد — فشل مركز القرار لا يصير فائضًا صفريًا', () => {
  it('يعرض «—» حين تكون القيمة غائبة', () => {
    const { container } = render(
      <KpiRowSection financial={FINANCIAL} cashFlow={null} loading={false} />,
    );
    expect(container.textContent).toContain('—');
    // قبل الإصلاح: 0.000 بنغمة «فائض» خضراء.
    expect(container.querySelectorAll('.xpl-unavailable').length).toBeGreaterThan(0);
  });

  it('يعرض القيمة الحقيقية حين تكون متاحة — بما فيها صفر حقيقي', () => {
    const { container } = render(
      <KpiRowSection financial={FINANCIAL} cashFlow={0} loading={false} />,
    );
    // صفر حقيقي معلومة صحيحة؛ الممنوع هو صفر مخترَع عند الفشل.
    expect(container.querySelectorAll('.xpl-unavailable').length).toBe(0);
  });

  it('غياب الملخّص كله يعطي حالة فارغة صريحة لا شبكة أصفار', () => {
    const { container } = render(
      <KpiRowSection financial={null} cashFlow={null} loading={false} />,
    );
    expect(container.querySelector('.db-empty')).not.toBeNull();
    expect(container.textContent).not.toMatch(ZERO_MONEY);
  });
});

describe('لوحة الذكاء المالي — فشل الطلب لا يعرض أصفارًا مالية', () => {
  it('البطاقات الثلاث تعرض «—» حين تكون البيانات غائبة', () => {
    const { container } = render(<FinancialIntelPanel data={null} loading={false} />);

    const unavailable = container.querySelectorAll('.xpl-unavailable');
    expect(unavailable.length).toBe(3); // تحصيلات + مصروفات + ذمم

    const kpiText = [...container.querySelectorAll('.db-kpi-val')]
      .map((n) => n.textContent ?? '').join(' ');
    expect(kpiText).not.toMatch(ZERO_MONEY);
  });

  it('لا يُلوّن البطاقات بنغمة نجاح/تحذير على قيمة غير موجودة', () => {
    const { container } = render(<FinancialIntelPanel data={null} loading={false} />);
    expect(container.querySelector('.db-kpi.c-green')).toBeNull();
    expect(container.querySelector('.db-kpi.c-red')).toBeNull();
    expect(container.querySelector('.db-kpi.c-amber')).toBeNull();
  });

  it('حالة التحميل تعرض هياكل لا أصفارًا', () => {
    const { container } = render(<FinancialIntelPanel data={null} loading />);
    expect(container.textContent).not.toMatch(ZERO_MONEY);
  });
});
