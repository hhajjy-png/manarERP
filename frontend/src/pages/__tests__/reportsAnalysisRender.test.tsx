// @vitest-environment jsdom
/**
 * انحدار: Expense Analysis Report Enhancement Pack v1
 *
 * تُشغَّل صفحة التقارير **الحقيقية** (لا محاكاة) مع طبقة API مُزيَّفة تُعيد نفس شكل
 * الحمولة التي يُصدرها الخادم فعلًا لتقرير المصروفات — بمؤشراته وأقسامه التحليلية.
 * الغرض: التقاط أي استثناء يقع أثناء العرض، وهو ما لا يكشفه `tsc` ولا اختبارات
 * الخلفية لأن كليهما لا يُشغّل React.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getMock = vi.fn();
vi.mock('../../api/client', () => ({
  api: {
    get: (...a: unknown[]) => getMock(...a),
    post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  },
  errorMessage: (e: unknown) => String(e),
}));

vi.mock('../../stores/authStore', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    isSystemAdmin: () => true,
    user: { id: 1, fullName: 'tester' },
  }),
}));

import { FinancialPeriodProvider } from '../../context/FinancialPeriodContext';
import Reports from '../Reports';

/** حمولة مطابقة لما يبنيه الخادم فعلًا (مُلتقطة من تشغيل حقيقي على قاعدة التطوير). */
const EXPENSES_PAYLOAD = {
  title: 'تقرير المصروفات',
  subtitle: 'العدد: 2 — الإجمالي: 1,500.000 KWD',
  columns: [
    { header: 'الرقم', key: 'code', width: 16 },
    { header: 'التصنيف', key: 'category', width: 18 },
    { header: 'المبلغ', key: 'amount', width: 16, numFmt: '#,##0.000', format: 'currency' },
  ],
  rows: [
    { code: 'EXP-1', category: 'وقود', amount: 1000 },
    { code: 'EXP-2', category: 'صيانة', amount: 500 },
  ],
  totalsRow: { category: 'الإجمالي', amount: 1500 },
  kpis: [
    { label: 'إجمالي المصروفات', value: 1500, format: 'currency', color: 'blue', icon: 'payments' },
    { label: 'عدد حركات الصرف', value: 2, icon: 'receipt_long' },
    { label: 'أعلى شهر إنفاقًا', value: 'فبراير 2026', hint: 1000, hintFormat: 'currency', color: 'red', icon: 'calendar_month' },
  ],
  sections: [
    {
      title: 'مصفوفة المصروفات: التصنيفات × الأشهر',
      columns: [
        { header: 'التصنيف', key: 'category', width: 26 },
        { header: 'يناير 2025', key: 'm_2025-01', width: 15, numFmt: '#,##0.000', format: 'currency' },
        { header: 'الإجمالي', key: 'total', width: 17, numFmt: '#,##0.000', format: 'currency' },
      ],
      rows: [
        { category: 'وقود', 'm_2025-01': 1000, total: 1000 },
        { category: 'صيانة', 'm_2025-01': 500, total: 500 },
      ],
      totalsRow: { category: 'الإجمالي', 'm_2025-01': 1500, total: 1500 },
    },
    {
      title: 'أكبر المصروفات (أعلى 20)',
      note: 'يعرض هذا القسم أكبر 20 حركة من أصل 25 — وهو عيّنة لا إجمالي.',
      columns: [
        { header: 'التاريخ', key: 'date', width: 16, align: 'center' },
        { header: 'المبلغ', key: 'amount', width: 17, numFmt: '#,##0.000', format: 'currency' },
      ],
      rows: [{ date: '2025-01-05', amount: 1000 }],
    },
  ],
};

/** تقرير بلا طبقة تحليلية — يجب أن يبقى سلوكه كما كان قبل الحزمة. */
const PLAIN_PAYLOAD = {
  title: 'تقرير العملاء',
  subtitle: 'إجمالي العملاء: 1',
  columns: [{ header: 'الاسم', key: 'name', width: 20 }],
  rows: [{ name: 'عميل' }],
};

function mount() {
  return render(
    <MemoryRouter>
      <FinancialPeriodProvider>
        <Reports />
      </FinancialPeriodProvider>
    </MemoryRouter>,
  );
}

describe('صفحة التقارير — عرض التقرير التحليلي', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockImplementation((url: string) => {
      if (url.startsWith('/reports/')) return Promise.resolve({ data: { data: EXPENSES_PAYLOAD } });
      return Promise.resolve({ data: { data: { data: [] } } });
    });
  });

  it('يعرض الجدول والمؤشرات والأقسام بلا استثناء', async () => {
    mount();
    const runButtons = await screen.findAllByText(/عرض التقرير/);
    runButtons[0].click();

    await waitFor(() => {
      expect(screen.getByText('تقرير المصروفات')).toBeTruthy();
    });
    // المؤشرات
    await waitFor(() => expect(screen.getByText('إجمالي المصروفات')).toBeTruthy());
    expect(screen.getByText('فبراير 2026')).toBeTruthy();
    // الأقسام
    expect(screen.getByText('مصفوفة المصروفات: التصنيفات × الأشهر')).toBeTruthy();
    expect(screen.getByText('أكبر المصروفات (أعلى 20)')).toBeTruthy();
    expect(screen.getByText(/عيّنة لا إجمالي/)).toBeTruthy();
  });

  it('التقرير بلا مؤشرات/أقسام يُعرض كما كان', async () => {
    getMock.mockImplementation((url: string) => {
      if (url.startsWith('/reports/')) return Promise.resolve({ data: { data: PLAIN_PAYLOAD } });
      return Promise.resolve({ data: { data: { data: [] } } });
    });
    mount();
    const runButtons = await screen.findAllByText(/عرض التقرير/);
    runButtons[0].click();
    await waitFor(() => expect(screen.getByText('إجمالي العملاء: 1')).toBeTruthy());
  });
});
