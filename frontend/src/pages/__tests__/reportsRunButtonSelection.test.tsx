// @vitest-environment jsdom
/**
 * Reports Center — Run Button Stale Selection Fix v1.
 *
 * العيب (قائم منذ Desktop 2026.5.9، مكتشف في Desktop Production 2026.5.10):
 * زرّ «تشغيل» داخل بطاقة التقرير كان ينفّذ:
 *
 *     selectReport(rt.key); setTimeout(loadPreview, 0);
 *
 * و`loadPreview` دالّة `useCallback` تغلق على `selected` الخاصّ برسمة الضغط —
 * أي التقرير المحدَّد **قبل** الضغط. `setTimeout` يحتجز ذلك المرجع القديم، فحين
 * يُنفَّذ المؤقّت يطلب `/reports/<التقرير السابق>/preview` لا تقرير البطاقة
 * المضغوطة. النتيجة: المستخدم يضغط بطاقة «ب» فيُفتح تقرير «أ».
 *
 * هذه الاختبارات تُثبت العقد المطلوب: **مفتاح البطاقة المضغوطة هو المفتاح المنفَّذ**،
 * لكلّ تقرير في السجلّ (`REPORT_TYPES`) بلا استثناء، وبلا اعتماد على أيّ تأخير.
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
import Reports, { REPORT_TYPES } from '../Reports';

/** كلّ طلبات المعاينة المُسجَّلة بالترتيب — مصدر الحقيقة لِما نُفِّذ فعلًا. */
const previewCalls: { key: string; params: Record<string, string> }[] = [];

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
 * بطاقات المركز تُرسَم من `REPORT_TYPES` بالترتيب نفسه (`filteredReports` مُرشَّح
 * بـ `.filter` فيحفظ الترتيب) حين تكون الشريحة «الكل» ولا بحث — وهو الوضع
 * الابتدائي بعد مسح `localStorage`. لذا فالفهرس يربط البطاقة بمفتاحها بلا
 * اعتماد على نصّ مُترجَم.
 */
async function cardAt(index: number): Promise<HTMLElement> {
  return waitFor(() => {
    const cards = document.querySelectorAll('.rcx-card');
    expect(cards.length).toBe(REPORT_TYPES.length);
    return cards[index] as HTMLElement;
  });
}

/** يضغط زرّ «تشغيل» داخل البطاقة — المسار المباشر محلّ الإصلاح. */
async function clickRunOnCard(index: number) {
  const card = await cardAt(index);
  fireEvent.click(within(card).getByText('تشغيل'));
}

/** يضغط جسم البطاقة («تهيئة») — يختار التقرير دون تشغيله. */
async function selectCard(index: number) {
  const card = await cardAt(index);
  fireEvent.click(within(card).getByText('تهيئة'));
}

beforeEach(() => {
  // «المؤخّرات» و«المفضّلات» تُحفظ في localStorage — تُمسح كي لا يتسرّب اختبار إلى تاليه.
  localStorage.clear();
  previewCalls.length = 0;
  getMock.mockReset();
  getMock.mockImplementation((url: string, cfg?: { params?: Record<string, string> }) => {
    const m = /^\/reports\/(.+)\/preview$/.exec(url);
    if (m) {
      previewCalls.push({ key: m[1], params: { ...(cfg?.params ?? {}) } });
      return Promise.resolve({
        data: { data: { title: `تقرير ${m[1]}`, subtitle: `مصدر النتيجة: ${m[1]}`, columns: [{ header: 'س', key: 'c' }], rows: [] } },
      });
    }
    return Promise.resolve({ data: { data: { data: [] } } });
  });
});

describe('Reports Center — زرّ «تشغيل» في البطاقة ينفّذ تقرير البطاقة نفسها', () => {
  it('السجلّ يحوي التقارير التسعة عشر المعروفة في Desktop Production 2026.5.10', () => {
    expect(REPORT_TYPES.length).toBe(19);
    expect(REPORT_TYPES.map((r) => r.key)).toContain('receipts');
  });

  /**
   * تغطية انحدار مسوقة بالسجلّ: كلّ بطاقة في `REPORT_TYPES`. التقرير الابتدائي
   * المحدَّد هو `invoices`، فأيّ بطاقة سواه كانت تكشف العيب مباشرة.
   */
  it.each(REPORT_TYPES.map((rt, i) => [i, rt.key] as const))(
    'البطاقة %i (%s): المفتاح المضغوط == المفتاح المنفَّذ',
    async (index, key) => {
      mount();
      await clickRunOnCard(index);
      await waitFor(() => expect(previewCalls.length).toBe(1));
      expect(previewCalls[0].key).toBe(key);
    },
  );

  it('التقرير المحدَّد «أ» ثم الضغط على بطاقة «ب» — يُنفَّذ «ب»', async () => {
    mount();
    const bIndex = REPORT_TYPES.findIndex((r) => r.key === 'receipts');
    await selectCard(REPORT_TYPES.findIndex((r) => r.key === 'payroll'));
    await clickRunOnCard(bIndex);
    await waitFor(() => expect(previewCalls.length).toBe(1));
    expect(previewCalls[0].key).toBe('receipts');
  });

  it('التقرير المحدَّد هو نفسه بطاقة الضغط — يعمل طبيعيًا', async () => {
    mount();
    const i = REPORT_TYPES.findIndex((r) => r.key === 'expenses');
    await selectCard(i);
    await clickRunOnCard(i);
    await waitFor(() => expect(previewCalls.length).toBe(1));
    expect(previewCalls[0].key).toBe('expenses');
  });

  it('بلا أيّ تهيئة سابقة — الضغط المباشر على «المقبوضات» ينفّذ «المقبوضات»', async () => {
    mount();
    await clickRunOnCard(REPORT_TYPES.findIndex((r) => r.key === 'receipts'));
    await waitFor(() => expect(previewCalls.length).toBe(1));
    expect(previewCalls[0].key).toBe('receipts');
  });

  it('ضغط متتابع سريع على بطاقتين — كلّ طلب يحمل مفتاح بطاقته', async () => {
    mount();
    const a = REPORT_TYPES.findIndex((r) => r.key === 'contracts');
    const b = REPORT_TYPES.findIndex((r) => r.key === 'equipment');
    // بلا انتظار بين الضغطتين: لو اعتمد التنفيذ على انتشار `setState` لالتقط
    // النداء الثاني حالة قديمة.
    await clickRunOnCard(a);
    await clickRunOnCard(b);
    await waitFor(() => expect(previewCalls.length).toBe(2));
    expect(previewCalls.map((c) => c.key)).toEqual(['contracts', 'equipment']);
  });

  it('لا يحمل الطلب فلاتر التقرير السابق عند التبديل من بطاقة أخرى', async () => {
    mount();
    // «كشف حساب عميل» يعرض فلتر العميل؛ نضبطه ثم نشغّل تقريرًا آخر مباشرة.
    await selectCard(REPORT_TYPES.findIndex((r) => r.key === 'customer-statement'));
    await clickRunOnCard(REPORT_TYPES.findIndex((r) => r.key === 'employees'));
    await waitFor(() => expect(previewCalls.length).toBe(1));
    expect(previewCalls[0].key).toBe('employees');
    expect(previewCalls[0].params.customerId).toBeUndefined();
  });

  it('مسار «تهيئة ← تشغيل التقرير» التقليدي يبقى يعمل كما هو', async () => {
    mount();
    await selectCard(REPORT_TYPES.findIndex((r) => r.key === 'cheques'));
    const drawer = await waitFor(() => {
      const el = document.querySelector('.xpl-drawer') ?? document.querySelector('[class*="drawer"]');
      if (!el) throw new Error('لم يُفتح جارور التهيئة');
      return el as HTMLElement;
    });
    fireEvent.click(within(drawer).getByText('تشغيل التقرير'));
    await waitFor(() => expect(previewCalls.length).toBe(1));
    expect(previewCalls[0].key).toBe('cheques');
  });

  it('زرّ «عرض التقرير» في قسم النتيجة يبقى يعمل على التقرير المحدَّد', async () => {
    mount();
    await selectCard(REPORT_TYPES.findIndex((r) => r.key === 'attendance'));
    const section = document.querySelector('section.xpl-card') as HTMLElement;
    fireEvent.click(within(section).getAllByText(/عرض التقرير/)[0]);
    await waitFor(() => expect(previewCalls.length).toBe(1));
    expect(previewCalls[0].key).toBe('attendance');
  });

  it('التشغيل المباشر يعرض نتيجة التقرير المضغوط في الواجهة', async () => {
    mount();
    await clickRunOnCard(REPORT_TYPES.findIndex((r) => r.key === 'receipts'));
    // العنوان الفرعي هو هويّة النتيجة المعروضة فعلًا للمستخدم.
    await waitFor(() => expect(screen.getByText('مصدر النتيجة: receipts')).toBeTruthy());
  });
});
