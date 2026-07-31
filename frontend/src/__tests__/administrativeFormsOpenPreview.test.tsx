// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import Forms from '../pages/Forms';
import FormLayout from '../forms/shared/FormLayout';
import { PrintWorkspace } from '../components/print-workspace';
import { FORM_CARDS } from '../forms/shared/formsRegistry';
import {
  ADMIN_FORM_PREVIEW_INITIAL_ZOOM,
  hasFormOpenIntent,
  withFormOpenIntent,
} from '../forms/shared/formOpenIntent';
import { PRINT_PROFILES } from '../forms/shared/printProfiles';
import { t as translate } from '../lib/i18n';
import { api } from '../api/client';

/**
 * Administrative Forms Preview UX Pack v1
 *
 * البطاقة في صفحة النماذج الإدارية صارت «فتح» بدل «طباعة»: تفتح معاينة النموذج
 * القائمة (مساحة عمل الطباعة) على تكبير ابتدائي 80% — بلا طباعة تلقائية، وبلا أي
 * مساس بمسار الطباعة نفسه أو بهندسة الصفحة.
 *
 * كل ما يميّز هذا المسار علامةٌ واحدة في الرابط (`?open=preview`)؛ أي مسار آخر يصل
 * لنفس الشاشات (مسار الشيكات، رابط عميق) لا يحملها فيبقى سلوكه كما كان حرفًا بحرف.
 */

const EMPLOYEES = [
  { id: 5, code: 'EMP-005', fullName: 'سارة العتيبي', jobTitle: 'مهندسة مدنية' },
  { id: 9, code: 'EMP-009', fullName: 'خالد الفهد', jobTitle: 'مشرف موقع' },
];

/** بوابة الطباعة الفعلية: `printSubmit` = طباعة يدوية عبر البوابة،
 *  `printPage` = مسار `printCurrentView` (وهو ما تستدعيه الطباعة التلقائية). */
let printSubmit: ReturnType<typeof vi.fn>;
let printPage: ReturnType<typeof vi.fn>;

function stubPrintBridge() {
  printSubmit = vi.fn(async () => ({ status: 'printed' as const }));
  printPage = vi.fn(async () => ({ success: true }));
  (window as unknown as { manar: unknown }).manar = { printSubmit, printPage };
}

beforeEach(() => {
  stubPrintBridge();
  vi.spyOn(api, 'get').mockImplementation((async (url: string) => {
    if (url === '/employees') return { data: { data: { data: EMPLOYEES } } };
    return { data: { data: null } };
  }) as never);
  vi.spyOn(api, 'post').mockImplementation((async () => ({ data: { data: {} } })) as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as unknown as { manar?: unknown }).manar;
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="probe">{location.pathname}{location.search}</div>;
}

function renderFormsAt(entry: string) {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[entry]}>
      <Routes>
        <Route path="/forms" element={<Forms />} />
        <Route path="/forms/:route/:employeeId" element={<LocationProbe />} />
        <Route path="/forms/:route" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function renderFormsWithEmployee() {
  const utils = renderFormsAt('/forms?employee=5');
  await waitFor(() => {
    const select = screen.getByLabelText('اختر الموظف (مشترك لجميع النماذج) *') as HTMLSelectElement;
    expect(select.value).toBe('5');
  });
  return utils;
}

/** نفس النموذج تمامًا، يتغيّر رابط الوصول وحده. */
function renderFormAt(entry: string, props: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[entry]}>
      <FormLayout
        ready
        formNumber="FORM-001"
        title="طلب إجازة"
        profile="plain-a4"
        formType="leave-request"
        qrData={{ formType: 'leave-request', formNumber: 'FORM-001', entityName: 'س', entityId: 5 }}
        {...props}
      >
        <div>BODY CONTENT HERE</div>
      </FormLayout>
    </MemoryRouter>,
  );
}

const OPEN = '/forms/leave-request/5?printMode=plain-a4&open=preview';
const PLAIN = '/forms/leave-request/5?printMode=plain-a4';
const scaler = () => screen.getByTestId('pw-scaler');

// ── A. تسمية الإجراء في البطاقات ─────────────────────────────────────────────
describe('A — بطاقات النماذج الإدارية تعرض «فتح» لا «طباعة»', () => {
  it('كل بطاقة في السجل تحمل زر «فتح»، ولا زر «طباعة» واحد في الصفحة', async () => {
    await renderFormsWithEmployee();
    expect(screen.getAllByRole('button', { name: 'فتح' })).toHaveLength(FORM_CARDS.length);
    expect(screen.queryByRole('button', { name: 'طباعة' })).not.toBeInTheDocument();
  });

  it('التسمية تأتي من بنية الترجمة القائمة (عربي/إنجليزي)، لا نصًا مثبَّتًا في الصفحة', () => {
    expect(translate('page.forms.open_btn', 'ar')).toBe('فتح');
    expect(translate('page.forms.open_btn', 'en')).toBe('Open');
    // زر الطباعة الحقيقي (داخل شاشة عرض السعر) يستخدم مفتاحه القديم ولم يُمسّ.
    expect(translate('page.forms.print_btn', 'ar')).toBe('طباعة');
    expect(translate('page.forms.print_btn', 'en')).toBe('Print');
  });
});

// ── B + C. النقر يفتح النموذج بنفس بياناته، بلا طباعة فورية ──────────────────
describe('B/C — «فتح» ينقل إلى نفس النموذج بنفس البيانات، بلا طباعة', () => {
  it('يمرّر نفس الموظف ونفس وضع الطباعة، ويضيف علامة الفتح فقط', async () => {
    await renderFormsWithEmployee();
    const card = (document.getElementById('mode-leave-request') as HTMLElement).closest('.fmx-card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'فتح' }));
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('/forms/leave-request/5?printMode=plain-a4&open=preview');
    });
  });

  it('اختيار قالب طباعة مختلف يصل كما هو (البيانات المُمرَّرة لم تتغيّر)', async () => {
    await renderFormsWithEmployee();
    const select = document.getElementById('mode-leave-request') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'ready-paper' } });
    fireEvent.click(within(select.closest('.fmx-card') as HTMLElement).getByRole('button', { name: 'فتح' }));
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('/forms/leave-request/5?printMode=ready-paper&open=preview');
    });
  });

  it('النقر نفسه لا يُطلق أي طباعة', async () => {
    await renderFormsWithEmployee();
    fireEvent.click(screen.getAllByRole('button', { name: 'فتح' })[0]);
    await waitFor(() => expect(screen.getByTestId('probe')).toBeInTheDocument());
    expect(printPage).not.toHaveBeenCalled();
    expect(printSubmit).not.toHaveBeenCalled();
  });

  it('النموذج المفتوح عبر «فتح» لا يطبع تلقائيًا رغم جاهزيته', async () => {
    renderFormAt(OPEN);
    expect(screen.getByText('BODY CONTENT HERE')).toBeInTheDocument();
    // مهلة أطول من جاهزية الطباعة القصوى: لو كانت الطباعة التلقائية حيّة لظهرت.
    await new Promise((r) => setTimeout(r, 200));
    expect(printPage).not.toHaveBeenCalled();
    expect(printSubmit).not.toHaveBeenCalled();
  });
});

// ── D + E + F. التكبير الابتدائي 80% ثم ملكيّة المستخدم له ────────────────────
describe('D/E/F — المعاينة تفتح على 80%، ثم يملك المستخدم التكبير', () => {
  it('D: تفتح على 80% بالضبط (لا «ملاءمة الصفحة»)', () => {
    renderFormAt(OPEN);
    expect(scaler().style.transform).toBe(`scale(${ADMIN_FORM_PREVIEW_INITIAL_ZOOM})`);
    expect(screen.getByRole('button', { name: 'ملاءمة الصفحة' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'ملاءمة العرض' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('E: المستخدم يغيّر التكبير بعد الفتح — بالأزرار، بإعادة الضبط، وبـ Ctrl+عجلة', () => {
    const { container } = renderFormAt(OPEN);
    fireEvent.click(screen.getByRole('button', { name: 'تكبير' }));
    expect(scaler().style.transform).toBe('scale(0.9)');

    fireEvent.click(screen.getByRole('button', { name: 'إعادة التكبير إلى 100%' }));
    expect(scaler().style.transform).toBe('scale(1)');

    fireEvent.wheel(container.querySelector('.pw-canvas')!, { ctrlKey: true, deltaY: -100 });
    expect(scaler().style.transform).toBe('scale(1.1)');
  });

  it('F: التكبير المختار لا يُستبدل بعدها — لا إعادة فرض لـ 80% ما دامت المعاينة مفتوحة', async () => {
    renderFormAt(OPEN);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة التكبير إلى 100%' }));
    expect(scaler().style.transform).toBe('scale(1)');
    // إعادة تصيير + مرور وقت (تأثيرات الملاءمة/الجاهزية) لا تُعيد 80%.
    fireEvent.click(screen.getByRole('button', { name: 'خيارات عرض إضافية' }));
    await new Promise((r) => setTimeout(r, 120));
    expect(scaler().style.transform).toBe('scale(1)');
  });
});

// ── G + H. دورة الحياة: كل فتحة تبدأ من 80% ──────────────────────────────────
describe('G/H — كل فتحة جديدة تبدأ من 80% من جديد', () => {
  it('G: إغلاق نموذج وفتح نموذج آخر ⇒ 80% مجددًا', () => {
    const a = renderFormAt(OPEN);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة التكبير إلى 100%' }));
    expect(scaler().style.transform).toBe('scale(1)');
    a.unmount();

    renderFormAt('/forms/salary-advance/5?printMode=plain-a4&open=preview', { title: 'طلب سلفة', formType: 'salary-advance' });
    expect(scaler().style.transform).toBe(`scale(${ADMIN_FORM_PREVIEW_INITIAL_ZOOM})`);
  });

  it('H: إعادة فتح النموذج نفسه ⇒ 80% مجددًا', () => {
    const first = renderFormAt(OPEN);
    fireEvent.click(screen.getByRole('button', { name: 'تصغير' }));
    expect(scaler().style.transform).toBe('scale(0.7)');
    first.unmount();

    renderFormAt(OPEN);
    expect(scaler().style.transform).toBe(`scale(${ADMIN_FORM_PREVIEW_INITIAL_ZOOM})`);
  });
});

// ── I + J. الطباعة: نفس المسار، ونفس الهندسة ─────────────────────────────────
describe('I/J — الطباعة من داخل المعاينة تبقى على مسارها وهندستها', () => {
  it('I: زر «طباعة» داخل المعاينة يصل إلى بوابة الطباعة القائمة كما هي', async () => {
    renderFormAt(OPEN);
    fireEvent.click(screen.getByRole('button', { name: '🖨️ طباعة' }));
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1));
    const job = printSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(job.docType).toBe('form');
    expect(job.destination).toBe('printer');
    expect(job.copies).toBe(1);
    // لا تكبير ولا مقياس يتسرّب إلى أمر الطباعة إطلاقًا.
    expect(JSON.stringify(job)).not.toMatch(/zoom|scaleFactor|"scale"/i);
  });

  it('J: تكبير المعاينة لا يغيّر بايتًا واحدًا من هندسة الطباعة (@page/الهوامش/CSS)', () => {
    const withIntent = renderFormAt(OPEN).container.querySelector('style')!.textContent!;
    cleanup();
    const withoutIntent = renderFormAt(PLAIN).container.querySelector('style')!.textContent!;
    expect(withIntent).toBe(withoutIntent);
    // ونفس هوامش القالب المركزية حرفيًا — لا اشتقاق جديد ولا قيمة مخترعة هنا.
    const m = PRINT_PROFILES['plain-a4'].margins;
    expect(withIntent).toContain(`@page { size: A4; margin: ${m.top} ${m.right} ${m.bottom} ${m.left}; }`);
  });

  it('J: التكبير يعيش على غلاف المعاينة وحده — لا يلمس `.form-page` مهما تغيّر', () => {
    renderFormAt(OPEN);
    const page = document.querySelector('.form-page') as HTMLElement;
    expect(page.getAttribute('style') ?? '').not.toContain('scale');
    fireEvent.click(screen.getByRole('button', { name: 'تكبير' }));
    expect(scaler().style.transform).toBe('scale(0.9)');
    expect(page.getAttribute('style') ?? '').not.toContain('scale');
    expect(page.getAttribute('style') ?? '').not.toContain('transform');
  });
});

// ── K. المستدعون خارج هذا المسار: بلا أي تغيير ───────────────────────────────
describe('K — كل مستدعٍ آخر للمعاينة يحتفظ بسلوكه السابق', () => {
  it('`PrintWorkspace` بلا `initialZoom` يفتح على «ملاءمة الصفحة» كما كان', () => {
    render(
      <PrintWorkspace toolbar={<span />}>
        <div className="form-page">body</div>
      </PrintWorkspace>,
    );
    expect(screen.getByRole('button', { name: 'ملاءمة الصفحة' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('نموذج فُتح برابط بلا علامة (مسار الشيكات / رابط عميق) يفتح على «ملاءمة الصفحة»', () => {
    renderFormAt(PLAIN);
    expect(screen.getByRole('button', { name: 'ملاءمة الصفحة' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ونفسه يطبع تلقائيًا عند الجاهزية تمامًا كما كان (ضابط موجب)', async () => {
    renderFormAt(PLAIN);
    await waitFor(() => expect(printPage).toHaveBeenCalledTimes(1), { timeout: 4000 });
  }, 10000);

  it('مسار الشيكات (`/forms/payment-voucher/<id>`) لا يحمل العلامة أصلًا', () => {
    expect(hasFormOpenIntent('?printMode=plain-a4')).toBe(false);
    expect(hasFormOpenIntent('')).toBe(false);
    expect(hasFormOpenIntent('?open=other')).toBe(false);
    expect(hasFormOpenIntent('?open=preview')).toBe(true);
    expect(withFormOpenIntent('/forms/quotation')).toBe('/forms/quotation?open=preview');
    expect(withFormOpenIntent('/forms/leave-request/5?printMode=plain-a4'))
      .toBe('/forms/leave-request/5?printMode=plain-a4&open=preview');
  });
});

// ── L. تغطية السجل كاملاً ────────────────────────────────────────────────────
describe('L — كل نموذج في سجل النماذج الإدارية يتبع مسار «فتح»', () => {
  it('كل بطاقة تنتقل إلى مسار نموذجها حاملةً علامة الفتح', async () => {
    for (const [index, card] of FORM_CARDS.entries()) {
      await renderFormsWithEmployee();
      const cards = document.querySelectorAll('.fmx-card');
      expect(cards).toHaveLength(FORM_CARDS.length);
      fireEvent.click(within(cards[index] as HTMLElement).getByRole('button', { name: 'فتح' }));
      await waitFor(() => {
        const probe = screen.getByTestId('probe');
        expect(probe, `card ${card.key}`).toHaveTextContent(`/forms/${card.route}`);
        expect(probe, `card ${card.key}`).toHaveTextContent('open=preview');
      });
      expect(printPage, `card ${card.key}`).not.toHaveBeenCalled();
      cleanup();
    }
  }, 30000);
});
