// @vitest-environment jsdom
/**
 * صفحة المقبوضات — عقود الواجهة.
 *
 * ما تحرسه هذه المجموعة ليس المظهر بل **السلوك الذي يسهل كسره بصمت**:
 * الفلاتر تصل الطلب فعلًا، تغييرها يعيد إلى الصفحة الأولى، الملخّص لا يُعاد
 * حسابه عند تقليب الصفحات، والنسبة لا تصبح `Infinity` حين يكون الشهر السابق
 * صفرًا. كلّها أشياء لا يكشفها فحص الأنواع.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getMock = vi.fn();
vi.mock('../../api/client', () => ({
  api: {
    get: (...a: unknown[]) => getMock(...a),
    post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

vi.mock('../../stores/authStore', () => ({
  useAuth: () => ({ hasPermission: () => true, isSystemAdmin: () => true, user: { id: 1, fullName: 'tester' } }),
}));

import Receipts from '../Receipts';

/* ── أجسام استجابة واقعية ────────────────────────────────────────────────── */

function receipt(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    date: '2026-09-07T00:00:00.000Z',
    amount: 9435,
    method: 'CHEQUE',
    reference: '004108',
    notes: null,
    createdAt: '2026-09-07T11:22:04.566Z',
    invoiceId: 43,
    invoiceNumber: 'MN-INV-2026-043',
    invoiceIssueDate: '2026-07-01T00:00:00.000Z',
    invoiceTotal: 9435,
    invoiceRemaining: 0,
    invoiceStatus: 'PAID',
    customerId: 3,
    customerName: 'وزارة الأشغال',
    contractId: null,
    contractCode: null,
    ...over,
  };
}

const SUMMARY = {
  totals: { total: 31892.2, count: 3, average: 10630.733 },
  largest: { id: 1, amount: 20794, date: '2026-09-07', method: 'TRANSFER', customerName: 'وزارة الأشغال', invoiceNumber: 'MN-INV-2026-008' },
  byMethod: [
    { method: 'CASH', total: 0, count: 0, percent: 0 },
    { method: 'BANK', total: 0, count: 0, percent: 0 },
    { method: 'CHEQUE', total: 11098.2, count: 2, percent: 34.798 },
    { method: 'TRANSFER', total: 20794, count: 1, percent: 65.202 },
  ],
  months: {
    current: { total: 31892.2, count: 3, from: '2026-09-01', to: '2026-09-10' },
    previous: { total: 18612.3, count: 7, from: '2026-08-01', to: '2026-08-31' },
    delta: 13279.9,
    percent: 71.349,
  },
};

function listBody(rows: unknown[] = [receipt()], total = 1) {
  return { data: { data: { data: rows, meta: { page: 1, pageSize: 15, total, totalPages: Math.max(1, Math.ceil(total / 15)) } } } };
}

/** يوجّه كل نقطة نهاية إلى جسمها — بلا اعتماد على ترتيب النداءات. */
function route(overrides: { list?: unknown; summary?: unknown; fail?: 'list' | 'summary' } = {}) {
  getMock.mockImplementation(async (url: string) => {
    if (url === '/receipts') {
      if (overrides.fail === 'list') throw new Error('تعذّر تحميل المقبوضات');
      return overrides.list ?? listBody();
    }
    if (url === '/receipts/summary') {
      if (overrides.fail === 'summary') throw new Error('تعذّر تحميل الملخّص');
      return { data: { data: overrides.summary ?? SUMMARY } };
    }
    if (url === '/customers') {
      return { data: { data: { data: [{ id: 3, name: 'وزارة الأشغال' }, { id: 4, name: 'بلدية الكويت' }] } } };
    }
    return { data: { data: null } };
  });
}

const renderPage = () => render(<MemoryRouter><Receipts /></MemoryRouter>);

/**
 * استعلامات مقصورة على الجدول.
 *
 * اسم العميل يظهر أيضًا في بطاقة «أكبر عملية قبض»، فاستعلام على مستوى الصفحة
 * يجد عنصرين ويفشل لسبب لا علاقة له بما نختبره. هذا المساعد يقصر البحث على
 * جسم الجدول وحده.
 */
async function tableBody(): Promise<HTMLElement> {
  await waitFor(() => expect(document.querySelector('.rcpx-table tbody tr')).toBeTruthy());
  return document.querySelector('.rcpx-table tbody') as HTMLElement;
}

/** أول صفّ في الجدول — نقطة الدخول إلى لوحة التفاصيل. */
async function firstRow(): Promise<HTMLElement> {
  return within(await tableBody()).getAllByRole('button')[0];
}

/** كل نداءات نقطة نهاية معيّنة، مع معطياتها. */
const callsTo = (url: string) =>
  getMock.mock.calls.filter((c) => c[0] === url).map((c) => (c[1] as { params: Record<string, unknown> })?.params ?? {});

const lastParams = (url: string) => callsTo(url).at(-1)!;

beforeEach(() => {
  getMock.mockReset();
  localStorage.clear();
  route();
});

/* ── ١) الرسم والمؤشرات ─────────────────────────────────────────────────── */

describe('المقبوضات — الرسم وبطاقات المؤشرات', () => {
  it('ترسم الصفحة وتعرض عنوانها', async () => {
    renderPage();
    expect(await screen.findByText('المقبوضات')).toBeTruthy();
  });

  it('تعرض بطاقات الإجمالي والشهر الحالي والشهر السابق والفرق', async () => {
    renderPage();
    expect(await screen.findByText('إجمالي المقبوضات')).toBeTruthy();
    expect(screen.getByText('مقبوضات الشهر الحالي')).toBeTruthy();
    expect(screen.getByText('مقبوضات الشهر السابق')).toBeTruthy();
    expect(screen.getByText('الفرق عن الشهر السابق')).toBeTruthy();
    expect(screen.getByText('عدد عمليات القبض')).toBeTruthy();
  });

  it('تعرض بطاقة لكل مجموعة وسيلة قبض حقيقية — ولا تخترع وسيلة', async () => {
    renderPage();
    expect(await screen.findByText('النقدي')).toBeTruthy();
    expect(screen.getByText('الشيكات')).toBeTruthy();
    expect(screen.getByText('التحويلات البنكية')).toBeTruthy();
    // وسائل غير موجودة في النظام يجب ألّا تظهر إطلاقًا.
    expect(screen.queryByText('KNET')).toBeNull();
    expect(screen.queryByText('نقاط بيع')).toBeNull();
  });

  it('تعرض نسبة التغيّر حين يوجد أساس', async () => {
    renderPage();
    // تظهر مرّتين عمدًا: مؤشّر الاتجاه على بطاقة الشهر الحالي، ووصف بطاقة الفرق.
    expect((await screen.findAllByText('+71.3%')).length).toBeGreaterThan(0);
  });

  it('شهر سابق بصفر ⇒ نصّ صريح لا Infinity ولا NaN', async () => {
    route({
      summary: {
        ...SUMMARY,
        months: { ...SUMMARY.months, previous: { total: 0, count: 0, from: '2026-08-01', to: '2026-08-31' }, delta: 31892.2, percent: null },
      },
    });
    renderPage();
    expect(await screen.findAllByText('لا مقبوضات في الشهر السابق')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Infinity');
    expect(document.body.textContent).not.toContain('NaN');
  });

  it('تعرض الإفصاح الدائم عن تعريف «مقبوض» وحالة الشيكات', async () => {
    renderPage();
    const disclosure = await screen.findByText(/دورة حياة الشيك الوارد/);
    expect(disclosure.textContent).toContain('حالة سداد الفاتورة');
  });
});

/* ── ٢) الفلاتر ─────────────────────────────────────────────────────────── */

describe('المقبوضات — الفلاتر', () => {
  it('الفترة الافتراضية عند أول فتح هي الشهر الحالي', async () => {
    renderPage();
    await waitFor(() => expect(callsTo('/receipts').length).toBeGreaterThan(0));
    const p = lastParams('/receipts');
    const now = new Date();
    const expectedFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    expect(p.from).toBe(expectedFrom);
  });

  it('اختيار اختصار فترة يغيّر معطيات الطلب', async () => {
    renderPage();
    await waitFor(() => expect(callsTo('/receipts').length).toBeGreaterThan(0));
    fireEvent.click(await screen.findByText('اليوم'));
    await waitFor(() => {
      const p = lastParams('/receipts');
      expect(p.from).toBe(p.to); // «اليوم» طرفاه متساويان
    });
  });

  it('فلتر وسيلة القبض يصل الطلب بالقيمة المخزَّنة لا بالنص العربي', async () => {
    renderPage();
    await waitFor(() => expect(callsTo('/receipts').length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('وسيلة القبض'), { target: { value: 'CHEQUE' } });
    await waitFor(() => expect(lastParams('/receipts').method).toBe('CHEQUE'));
  });

  it('فلتر حالة سداد الفاتورة يصل الطلب باسم `invoiceStatus`', async () => {
    renderPage();
    await waitFor(() => expect(callsTo('/receipts').length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('حالة سداد الفاتورة'), { target: { value: 'PARTIAL' } });
    await waitFor(() => expect(lastParams('/receipts').invoiceStatus).toBe('PARTIAL'));
  });

  it('قائمة الحالات تقتصر على حالتَي السداد الحقيقيتين — لا حالات شيكات مخترَعة', async () => {
    renderPage();
    const select = await screen.findByLabelText('حالة سداد الفاتورة');
    const values = Array.from(select.querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value);
    expect(values).toEqual(['', 'PAID', 'PARTIAL']);
    // حالات الشيك تُذكر في الإفصاح **لنفي تتبّعها**، فوجودها هناك مقصود؛ ما يجب
    // ألّا يوجد هو خيارُ فلترٍ بها — أي ادّعاء أن النظام يميّزها.
    const labels = Array.from(select.querySelectorAll('option')).map((o) => o.textContent ?? '');
    expect(labels.some((l) => l.includes('مرتجع') || l.includes('مودع') || l.includes('محصَّل'))).toBe(false);
  });

  it('البحث مُهدَّأ: يصل الطلب بعد السكون لا بكل حرف', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderPage();
      await waitFor(() => expect(callsTo('/receipts').length).toBeGreaterThan(0));
      const before = callsTo('/receipts').length;
      const box = screen.getByLabelText('بحث في المقبوضات');
      fireEvent.change(box, { target: { value: '00' } });
      fireEvent.change(box, { target: { value: '004' } });
      fireEvent.change(box, { target: { value: '004108' } });
      // لا طلب جديد بسبب النصّ قبل انقضاء التهدئة.
      expect(callsTo('/receipts').filter((p) => p.search).length).toBe(0);
      await vi.advanceTimersByTimeAsync(400);
      await waitFor(() => expect(lastParams('/receipts').search).toBe('004108'));
      expect(callsTo('/receipts').length).toBeLessThan(before + 4);
    } finally {
      vi.useRealTimers();
    }
  });

  it('حدّا المبلغ يصلان الطلب من الفلاتر المتقدّمة', async () => {
    renderPage();
    fireEvent.click(await screen.findByText(/فلاتر متقدمة/));
    fireEvent.change(screen.getByLabelText('الحد الأدنى'), { target: { value: '1000' } });
    await waitFor(() => expect(lastParams('/receipts').minAmount).toBe('1000'));
  });

  it('عدّاد الفلاتر المتقدّمة يظهر حين تكون نشطة', async () => {
    renderPage();
    fireEvent.click(await screen.findByText(/فلاتر متقدمة/));
    fireEvent.change(screen.getByLabelText('الحد الأدنى'), { target: { value: '1000' } });
    expect(await screen.findByText(/فلاتر متقدمة \(1\)/)).toBeTruthy();
  });
});

/* ── ٣) الفلاتر النشطة وإعادة الضبط ─────────────────────────────────────── */

describe('المقبوضات — حالة الفلاتر النشطة', () => {
  it('تظهر شريحة لكل فلتر نشط ويمكن إزالتها منفردةً', async () => {
    renderPage();
    await waitFor(() => expect(callsTo('/receipts').length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('وسيلة القبض'), { target: { value: 'CHEQUE' } });

    const chip = await screen.findByText(/وسيلة القبض: شيك/);
    fireEvent.click(within(chip.parentElement as HTMLElement).getByRole('button'));

    await waitFor(() => expect(lastParams('/receipts').method).toBeUndefined());
  });

  it('شريحة الفترة معروضة دائمًا ولا تحمل زرّ إزالة (الصفحة لا تعمل بلا فترة)', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(callsTo('/receipts').length).toBeGreaterThan(0));
    const periodChip = container.querySelector('.rcpx-period-chip')!;
    expect(periodChip).toBeTruthy();
    expect(periodChip.querySelector('button')).toBeNull();
  });

  it('«إعادة ضبط» يعيد كل الفلاتر إلى الافتراضي', async () => {
    renderPage();
    await waitFor(() => expect(callsTo('/receipts').length).toBeGreaterThan(0));
    fireEvent.change(screen.getByLabelText('وسيلة القبض'), { target: { value: 'CASH' } });
    await waitFor(() => expect(lastParams('/receipts').method).toBe('CASH'));

    fireEvent.click(screen.getByText('إعادة ضبط'));
    await waitFor(() => {
      const p = lastParams('/receipts');
      expect(p.method).toBeUndefined();
      expect(p.page).toBe(1);
    });
  });
});

/* ── ٤) الجدول ──────────────────────────────────────────────────────────── */

describe('المقبوضات — الجدول', () => {
  it('يعرض صفًّا لكل عملية قبض بأعمدتها', async () => {
    route({ list: listBody([receipt({ id: 1 }), receipt({ id: 2, amount: 1663.2, customerName: 'بلدية الكويت' })], 2) });
    renderPage();
    const body = await tableBody();
    expect(within(body).getByText('بلدية الكويت')).toBeTruthy();
    expect(body.querySelectorAll('tr')).toHaveLength(2);
  });

  it('يعرض شارة الوسيلة وشارة حالة الفاتورة', async () => {
    renderPage();
    const row = await firstRow();
    expect(within(row).getByText('شيك')).toBeTruthy();
    expect(within(row).getByText('الفاتورة مسددة بالكامل')).toBeTruthy();
  });

  it('صفٌّ نقدي يعرض اسم المستلم في عمود المرجع — فلا يبدو الجدول مكسورًا', async () => {
    route({ list: listBody([receipt({ method: 'CASH', reference: null, notes: 'أحمد المطيري' })]) });
    renderPage();
    const body = await tableBody();
    expect(within(body).getByText('نقدي')).toBeTruthy();
    expect(within(body).getByText('أحمد المطيري')).toBeTruthy();
  });

  it('لا يوجد عمود «البنك» ولا «تاريخ الشيك» — لا يحملهما النموذج', async () => {
    renderPage();
    await tableBody();
    const headers = Array.from(document.querySelectorAll('.rcpx-table thead th')).map((th) => th.textContent);
    expect(headers.some((h) => h?.includes('البنك'))).toBe(false);
    expect(headers.some((h) => h?.includes('تاريخ الشيك'))).toBe(false);
  });

  it('الفرز الخادمي: النقر على ترويسة يُرسل sortBy/sortDir ويعود للصفحة الأولى', async () => {
    renderPage();
    await tableBody();
    fireEvent.click(screen.getByRole('button', { name: /المبلغ/ }));
    await waitFor(() => {
      const p = lastParams('/receipts');
      expect(p.sortBy).toBe('amount');
      expect(p.page).toBe(1);
    });
  });
});

/* ── ٥) الترقيم ─────────────────────────────────────────────────────────── */

describe('المقبوضات — الترقيم', () => {
  it('ينتقل إلى الصفحة التالية بمعطى `page`', async () => {
    route({ list: { data: { data: { data: [receipt()], meta: { page: 1, pageSize: 15, total: 40, totalPages: 3 } } } } });
    renderPage();
    fireEvent.click(await screen.findByText('التالي'));
    await waitFor(() => expect(lastParams('/receipts').page).toBe(2));
  });

  it('تقليب الصفحات لا يُعيد جلب الملخّص — لا تجميع مهدور', async () => {
    route({ list: { data: { data: { data: [receipt()], meta: { page: 1, pageSize: 15, total: 40, totalPages: 3 } } } } });
    renderPage();
    await screen.findByText('التالي');
    const summaryCallsBefore = callsTo('/receipts/summary').length;
    fireEvent.click(screen.getByText('التالي'));
    await waitFor(() => expect(lastParams('/receipts').page).toBe(2));
    expect(callsTo('/receipts/summary').length).toBe(summaryCallsBefore);
  });

  it('الفلاتر تبقى مطبَّقة عبر الصفحات', async () => {
    route({ list: { data: { data: { data: [receipt()], meta: { page: 1, pageSize: 15, total: 40, totalPages: 3 } } } } });
    renderPage();
    await screen.findByText('التالي');
    fireEvent.change(screen.getByLabelText('وسيلة القبض'), { target: { value: 'CHEQUE' } });
    await waitFor(() => expect(lastParams('/receipts').method).toBe('CHEQUE'));
    fireEvent.click(screen.getByText('التالي'));
    await waitFor(() => {
      const p = lastParams('/receipts');
      expect(p.page).toBe(2);
      expect(p.method).toBe('CHEQUE'); // لم يسقط الفلتر مع تغيّر الصفحة
    });
  });
});

/* ── ٦) التفاصيل ────────────────────────────────────────────────────────── */

describe('المقبوضات — لوحة التفاصيل', () => {
  it('النقر على صفّ يفتح التفاصيل ببيانات القبض والفاتورة', async () => {
    renderPage();
    fireEvent.click(await firstRow());
    expect(await screen.findByText('تفاصيل عملية القبض')).toBeTruthy();
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('بيانات القبض')).toBeTruthy();
    expect(within(drawer).getByText('بيانات الفاتورة')).toBeTruthy();
    // رقم الفاتورة يظهر في صفّ الجدول أيضًا — الاستعلام مقصور على اللوحة.
    expect(within(drawer).getByText('MN-INV-2026-043')).toBeTruthy();
  });

  it('عنوان خانة المرجع يتبع الوسيلة (رقم الشيك للشيك)', async () => {
    renderPage();
    fireEvent.click(await firstRow());
    await screen.findByText('تفاصيل عملية القبض');
    expect(screen.getByText('رقم الشيك')).toBeTruthy();
  });

  it('توفّر إجراء الانتقال إلى الفاتورة بدل تكرار شاشتها', async () => {
    renderPage();
    fireEvent.click(await firstRow());
    expect(await screen.findByText('فتح الفاتورة')).toBeTruthy();
  });
});

/* ── ٧) حالات الفراغ والخطأ ─────────────────────────────────────────────── */

describe('المقبوضات — الفراغ والخطأ', () => {
  it('حالة فراغ برسالة عربية وزرّ إعادة ضبط', async () => {
    route({ list: listBody([], 0) });
    renderPage();
    expect(await screen.findByText('لا توجد مقبوضات مطابقة للفلاتر المحددة')).toBeTruthy();
    expect(screen.getByText('إعادة ضبط الفلاتر')).toBeTruthy();
  });

  it('فشل القائمة يعرض خطأً عربيًا مع إعادة محاولة', async () => {
    route({ fail: 'list' });
    renderPage();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('تعذّر تحميل المقبوضات')).toBeTruthy();
  });

  it('فشل الملخّص يُبطل البطاقات القديمة بدل عرض رقم لمجموعة خاطئة', async () => {
    route({ fail: 'summary' });
    renderPage();
    await screen.findByRole('alert');
    // لا بطاقات إجمالي معروضة فوق جدولٍ فلترُه مختلف.
    expect(screen.queryByText('إجمالي المقبوضات')).toBeNull();
  });
});
