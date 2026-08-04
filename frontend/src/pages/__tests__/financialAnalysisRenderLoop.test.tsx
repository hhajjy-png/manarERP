// @vitest-environment jsdom
import { Profiler } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FinancialPeriodProvider } from '../../context/FinancialPeriodContext';

/* ════════════════════════════════════════════════════════════════════════════
   حارس ضدّ حلقة إعادة الرسم في مركز التحليل المالي.

   العيب الأصلي: `useT()` كانت تُعيد دالّة جديدة في كل رسم، وكانت موضوعة في مصفوفة
   اعتماديات تأثير التحميل. فكل رسم يُعيد تشغيل التأثير ⇒ `setLoading(true)` ⇒
   رسم ⇒ دالّة `t` جديدة ⇒ تأثير ⇒ طلب شبكة… حلقة لا تتقارب. وشريط الفلتر كان
   يهتزّ لأن زرّ «تحديث البيانات» يتأرجح بين الدوّار والأيقونة فيتغيّر عرضه،
   فيُعاد تدفّق صفّ الفلاتر كلّه عشرات المرّات في الثانية.

   القياس عند وقوع العيب في نفس النافذة الزمنية: **119 التزام رسم و79 طلب شبكة**،
   بلا تقارب. بعد الإصلاح: **4 التزامات وطلب واحد**.
   ════════════════════════════════════════════════════════════════════════════ */

const getMock = vi.fn();
vi.mock('../../api/client', () => ({ api: { get: (...args: unknown[]) => getMock(...args) } }));

// استيراد ساكن: `vi.mock` تُرفَع فوق الاستيرادات، فالوحدة الوهمية سارية.
// (الاستيراد الديناميكي داخل الاختبار كان يحمّل الوحدة داخل مهلة الاختبار
//  فيتجاوزها تحت حمل التشغيل المتوازي.)
import FinancialAnalysisCenter from '../FinancialAnalysisCenter';

const EMPTY_REPORT = {
  period: { from: '2026-01-01', to: '2026-12-31', days: 365, previousFrom: '2025-01-01', previousTo: '2025-12-31' },
  profitability: { kpis: { revenue: 0, expenses: 0, profit: 0, profitMargin: null }, rows: [] },
  revenue: { kpis: { totalRevenue: 0, invoiceCount: 0, averageInvoice: 0, topMonth: null, topMonthRevenue: 0 }, rows: [] },
  expenses: { kpis: { totalExpenses: 0, expenseCount: 0, averageExpense: 0, topCategory: null, topCategoryAmount: 0 }, rows: [] },
  collections: { kpis: { collected: 0, outstanding: 0, collectionRate: null, averageCollection: 0 }, rows: [] },
  receivables: { asOf: null, kpis: { totalOutstanding: 0, debtorCount: 0, averagePerDebtor: 0, averageAgeDays: null, oldestAgeDays: null, highRiskOutstanding: 0 }, rows: [] },
  monthlyPerformance: { rows: [], totals: { revenue: 0, expenses: 0, profit: 0, collections: 0, profitMargin: null } },
  topLists: { topCustomers: [], topExpenseCategories: [], topProfitMonths: [] },
  indicators: { rows: [] },
  monthAxisTruncated: false,
};

function renderPage(onCommit?: () => void) {
  return render(
    <MemoryRouter>
      <FinancialPeriodProvider>
        <Profiler id="fac" onRender={() => onCommit?.()}>
          <FinancialAnalysisCenter />
        </Profiler>
      </FinancialPeriodProvider>
    </MemoryRouter>,
  );
}

/**
 * يُفرِغ حلقة الأحداث عدّة دورات داخل `act` — تكفي لأي حلقة رسم أن تتكشّف، وتُبقي
 * القياس حتميًّا (كل تحديث حالة يُطبَّق قبل التأكيد) بدل الاعتماد على التوقيت.
 */
async function settle(rounds = 10) {
  await act(async () => {
    for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

describe('FinancialAnalysisCenter — render loop guard', () => {
  beforeEach(() => {
    getMock.mockReset();
    // كائن **جديد** لكل استجابة — تمامًا كما يفعل axios. الكائن المشترك كان
    // يُخفي العيب: `setReport` بنفس المرجع يجعل React يتخطّى إعادة الرسم.
    getMock.mockImplementation(async () => ({ data: { data: structuredClone(EMPTY_REPORT) } }));
    sessionStorage.clear();
  });

  it('fetches the report exactly once for a stable filter', async () => {
    renderPage();
    await settle();
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('does not keep refetching after the request settles', async () => {
    renderPage();
    await settle();
    const afterFirstSettle = getMock.mock.calls.length;
    await settle(20);
    expect(getMock.mock.calls.length).toBe(afterFirstSettle);
  });

  it('commits a bounded number of times and then goes quiet', async () => {
    let commits = 0;
    renderPage(() => { commits += 1; });
    await settle();
    const afterLoad = commits;
    // التحميل الطبيعي: تركيب ⇒ حالة تحميل ⇒ وصول التقرير. حدٌّ متساهل يمسك
    // الحلقة (عشرات الالتزامات) دون أن يتكسّر مع أي تحسين رسم لاحق.
    expect(afterLoad).toBeLessThanOrEqual(6);

    await settle(20);
    expect(commits).toBe(afterLoad); // لا التزام واحد بعد استقرار البيانات
  });

  it('still requests the report on the analysis endpoint with the active range', async () => {
    renderPage();
    await settle();
    const [url, config] = getMock.mock.calls[0] as [string, { params: { from?: string; to?: string } }];
    expect(url).toBe('/financial-analysis');
    expect(config.params).toHaveProperty('from');
    expect(config.params).toHaveProperty('to');
  });
});
