// @vitest-environment jsdom
/**
 * Comprehensive Reports — Monthly Employee Entitlements Report Pack v1.
 *
 * تُشغَّل صفحة التقارير **الحقيقية** مع طبقة API مُزيَّفة تُعيد نفس شكل حمولة الخادم
 * لهذا التقرير. الغرض ثلاثة أمور لا يكشفها `tsc` ولا اختبارات الخلفية:
 *   (١) بطاقة التقرير موجودة في مركز التقارير — لا صفحة مستقلة.
 *   (٢) أدوات الجدول (فرز + بحث سريع + شارة الحالة) تعمل لهذا التقرير.
 *   (٣) **الانحدار**: التقارير الأخرى تبقى بلا أدوات وبلا رؤوس قابلة للنقر.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
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

const COLUMNS = [
  { header: 'الرقم الوظيفي', key: 'employeeNumber', width: 14 },
  { header: 'اسم الموظف', key: 'employeeName', width: 30 },
  { header: 'صافي المستحق', key: 'netAmount', width: 18, numFmt: '#,##0.000', format: 'currency' },
  { header: 'حالة الكشف', key: 'status', width: 12 },
];

const ENTITLEMENTS_PAYLOAD = {
  title: 'تقرير مستحقات الموظفين الشهرية',
  subtitle: 'أغسطس 2026 — عدد الكشوف: 3 — عدد الموظفين: 3 — إجمالي صافي المستحقات: 900.000 KWD',
  columns: COLUMNS,
  rows: [
    { employeeNumber: '053', employeeName: 'سليمان أحمد', netAmount: 500, status: 'معتمد' },
    { employeeNumber: '054', employeeName: 'حسن علي', netAmount: 300, status: 'مسودة' },
    { employeeNumber: '082', employeeName: 'ناصر خالد', netAmount: 100, status: 'معتمد' },
  ],
  totalsRow: { employeeName: 'الإجمالي (3 موظف)', netAmount: 900 },
  kpis: [{ label: 'إجمالي صافي المستحقات', value: 900, format: 'currency', color: 'green', icon: 'payments' }],
  sections: [],
};

/** تقرير قائم بلا أدوات جدول — مرجع الانحدار. */
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

/**
 * يختار التقرير من بطاقته ثم يُشغّله من زرّ «عرض التقرير» في قسم النتيجة.
 *
 * التشغيل من قسم النتيجة لا من زرّ البطاقة: هذا الاختبار يقصد مسار «تهيئة ← عرض
 * التقرير» بفلاتره المضبوطة. (زرّ البطاقة صار ينفّذ مفتاح بطاقته صراحةً بعد حزمة
 * Reports Center Run Button Stale Selection Fix v1 — تغطيته في اختبارها الخاصّ.)
 */
function reportCard(cardTitle: string): HTMLElement {
  const card = [...document.querySelectorAll('.rcx-card')].find(
    (c) => c.querySelector('.rcx-card-name')?.textContent?.trim() === cardTitle,
  );
  if (!card) throw new Error(`لا توجد بطاقة تقرير باسم «${cardTitle}»`);
  return card as HTMLElement;
}

async function runReportCard(cardTitle: string) {
  const card = await waitFor(() => reportCard(cardTitle));
  fireEvent.click(within(card).getByText('تهيئة'));
  const section = document.querySelector('section.xpl-card') as HTMLElement;
  fireEvent.click(within(section).getAllByText(/عرض التقرير/)[0]);
}

function mainTable(): HTMLElement {
  return document.querySelectorAll('table.xpl-table')[0] as HTMLElement;
}

function bodyRowNames(): string[] {
  const rows = [...mainTable().querySelectorAll('tbody tr')].filter((r) => !r.classList.contains('rcx-totals-row'));
  return rows.map((r) => (r.querySelectorAll('td')[1]?.textContent ?? '').trim());
}

beforeEach(() => {
  // «المؤخّرات» و«المفضّلات» تُحفظ في localStorage — تُمسح كي لا يتسرّب اختبار إلى تاليه.
  localStorage.clear();
  getMock.mockReset();
  getMock.mockImplementation((url: string) => {
    if (url.startsWith('/reports/employee-entitlements-monthly')) {
      return Promise.resolve({ data: { data: ENTITLEMENTS_PAYLOAD } });
    }
    if (url.startsWith('/reports/')) return Promise.resolve({ data: { data: PLAIN_PAYLOAD } });
    return Promise.resolve({ data: { data: { data: [] } } });
  });
});

describe('مركز التقارير — بطاقة تقرير مستحقات الموظفين الشهرية', () => {
  it('التقرير معروض داخل صفحة التقارير الشاملة ضمن مجموعة الموارد البشرية', async () => {
    mount();
    const card = await waitFor(() => reportCard('تقرير مستحقات الموظفين الشهرية'));
    expect(within(card).getByText('الموارد البشرية')).toBeTruthy();
  });

  it('يطلب مسار التقرير الصحيح ويعرض العنوان والمجاميع', async () => {
    mount();
    await runReportCard('تقرير مستحقات الموظفين الشهرية');
    await waitFor(() => expect(screen.getByText(/عدد الكشوف: 3/)).toBeTruthy());
    expect(getMock.mock.calls.some(([u]) => u === '/reports/employee-entitlements-monthly/preview')).toBe(true);
    expect(screen.getByText('الإجمالي (3 موظف)')).toBeTruthy();
  });
});

describe('أدوات جدول التقرير', () => {
  it('يعرض حالة الكشف كشارة ملوّنة لا نصًّا عاريًا', async () => {
    mount();
    await runReportCard('تقرير مستحقات الموظفين الشهرية');
    await waitFor(() => expect(screen.getByText(/عدد الكشوف: 3/)).toBeTruthy());

    const approved = [...mainTable().querySelectorAll('td .xpl-chip')].filter((c) => c.textContent?.includes('معتمد'));
    expect(approved).toHaveLength(2);
    expect(approved[0].className).toContain('xpl-chip--green');
    const draft = [...mainTable().querySelectorAll('td .xpl-chip')].filter((c) => c.textContent?.includes('مسودة'));
    expect(draft[0].className).toContain('xpl-chip--orange');
  });

  it('الفرز بالنقر على الرأس يعيد ترتيب الصفوف تصاعديًا ثم تنازليًا ثم يُلغى', async () => {
    mount();
    await runReportCard('تقرير مستحقات الموظفين الشهرية');
    await waitFor(() => expect(screen.getByText(/عدد الكشوف: 3/)).toBeTruthy());

    const original = bodyRowNames();
    const netHeader = [...mainTable().querySelectorAll('th .rcx-sort-btn')]
      .find((b) => b.textContent?.includes('صافي المستحق'))!;

    fireEvent.click(netHeader);
    expect(bodyRowNames()).toEqual(['ناصر خالد', 'حسن علي', 'سليمان أحمد']);

    fireEvent.click(netHeader);
    expect(bodyRowNames()).toEqual(['سليمان أحمد', 'حسن علي', 'ناصر خالد']);

    fireEvent.click(netHeader);
    expect(bodyRowNames()).toEqual(original);
  });

  it('البحث السريع يصفّي الصفوف ويعيد احتساب المجاميع على المعروض', async () => {
    mount();
    await runReportCard('تقرير مستحقات الموظفين الشهرية');
    await waitFor(() => expect(screen.getByText(/عدد الكشوف: 3/)).toBeTruthy());

    const box = document.querySelector('.rcx-table-tools input') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'حسن' } });

    expect(bodyRowNames()).toEqual(['حسن علي']);
    expect(screen.getByText('المعروض 1 من 3')).toBeTruthy();
    // المجاميع لم تعد مجاميع الخادم — بل مجموع نتائج البحث، ومُعلَنة كذلك صراحةً.
    const totals = mainTable().querySelector('tr.rcx-totals-row')!;
    expect(totals.textContent).toContain('إجمالي نتائج البحث');
    expect(totals.textContent).toContain('300.000');
    expect(totals.textContent).not.toContain('900.000');
  });
});

describe('انحدار: التقارير القائمة لا تتغيّر', () => {
  it('تقرير بلا `tableTools` يبقى بلا شريط أدوات ولا رؤوس قابلة للفرز', async () => {
    mount();
    await runReportCard('تقرير العملاء');
    await waitFor(() => expect(screen.getByText('إجمالي العملاء: 1')).toBeTruthy());

    expect(document.querySelector('.rcx-table-tools')).toBeNull();
    expect(document.querySelector('.rcx-sort-btn')).toBeNull();
    expect(document.querySelector('.rcx-table--tools')).toBeNull();
  });
});
