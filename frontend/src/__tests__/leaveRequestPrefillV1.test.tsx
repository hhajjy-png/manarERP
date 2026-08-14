// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

/* ════════════════════════════════════════════════════════════════════════════
   الجانب المُستقبِل لاختصار «طباعة نموذج الإجازة».

   العقد المحروس هنا:
     • النموذج القائم يستقبل سجل الإجازة المُمرَّر ويعرض قيمه — لا قالب جديد.
     • فتحه بالطريقة المعتادة (بلا حالة) يسلك مسلكه السابق حرفيًا: آخر إجازة من
       الخادم، لا شيء تغيّر.
     • الاختصار لا يكتب شيئًا في قاعدة البيانات ولا يعدّل سجل الإجازة.
   ════════════════════════════════════════════════════════════════════════════ */

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
/** حالة المسار — تُبدَّل بين الاختبارات لمحاكاة «باختصار» و«بلا اختصار». */
const routerState = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('../api/client', () => ({
  api,
  errorMessage: (e: unknown) => (e as { message?: string })?.message ?? String(e),
}));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ employeeId: '7' }),
  useLocation: () => ({ search: '', state: routerState.value }),
}));
vi.mock('../lib/i18n', () => ({
  useT: () => ({ t: (k: string) => k }),
  t: (k: string) => k,
}));

// طبقة الطباعة/التخطيط تُستبدل بغلاف شفّاف: هذه الحزمة لا تمسّ محرّك الطباعة ولا
// مسار PDF، فلا قيمة في تشغيلهما هنا — المحروس هو القيم التي تصل إلى القالب.
vi.mock('../forms/shared/FormLayout', () => ({
  default: ({ children, toolbarExtra }: { children: ReactNode; toolbarExtra?: ReactNode }) => (
    <div data-testid="form-layout">{toolbarExtra}{children}</div>
  ),
}));
vi.mock('../printing', () => ({
  useAccurateFormPreview: () => ({ dialog: null, button: null }),
  isFlagEnabled: () => false,
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1: 'flag',
}));

import LeaveRequest from '../pages/LeaveRequest';

const EMPLOYEE = { id: 7, code: 'EMP-7', fullName: 'محمد علي', fullNameEn: 'Mohammed Ali', jobTitle: 'سائق', department: 'العمليات' };

beforeEach(() => {
  vi.clearAllMocks();
  routerState.value = null;
  api.post.mockResolvedValue({ data: { data: {} } });
});
afterEach(cleanup);

/** نصّ المستند كاملًا — القالب يرسم القيم داخل جدول عرض لا حقول إدخال. */
function docText(): string {
  return (screen.getByTestId('form-layout').textContent ?? '').replace(/\s+/g, ' ');
}

describe('LeaveRequest — مع اختصار الطباعة', () => {
  beforeEach(() => {
    // الخادم يعرف إجازة أحدث (سنوية في مارس) — والاختصار يمرّر إجازة أخرى معتمدة.
    api.get.mockResolvedValue({ data: { data: {
      employee: EMPLOYEE,
      latestLeave: { type: 'ANNUAL', startDate: '2026-03-01', endDate: '2026-03-05', days: 5, reason: null },
    } } });
    routerState.value = {
      leavePrefill: { id: 2, type: 'SICK', startDate: '2026-05-10', endDate: '2026-05-14', days: 5 },
    };
  });

  it('يعرض اسم الموظف — يأتي من الخادم عبر معرّف المسار كما كان دائمًا', async () => {
    render(<LeaveRequest />);
    await waitFor(() => expect(screen.getByTestId('form-layout')).toBeInTheDocument());
    expect(docText()).toContain('محمد علي');
    expect(api.get).toHaveBeenCalledWith('/forms/leave-request/7');
  });

  it('يعرض نوع الإجازة وتاريخيها من السجل المُمرَّر لا من آخر إجازة في الخادم', async () => {
    render(<LeaveRequest />);
    await waitFor(() => expect(screen.getByTestId('form-layout')).toBeInTheDocument());
    const text = docText();

    // النوع المُمرَّر (مرضية) — لا النوع الأحدث في الخادم (سنوية).
    expect(text).toContain('إجازة مرضية');
    expect(text).not.toContain('إجازة سنوية');
    // التاريخان كما وردا في السجل — بلا تاريخ اليوم وبلا إعادة احتساب مدة.
    expect(text).toContain('10/05/2026');
    expect(text).toContain('14/05/2026');
  });

  it('يبقي الحقول الأخرى فارغة وقابلة للتعبئة اليدوية قبل الطباعة', async () => {
    render(<LeaveRequest />);
    await waitFor(() => expect(screen.getByTestId('form-layout')).toBeInTheDocument());

    // «تاريخ العودة المتوقع» حقل يدوي يبقى فارغًا بانتظار المستخدم.
    const expectedReturn = screen.getByTitle('page.leaveReq.field.expected_return') as HTMLInputElement;
    expect(expectedReturn).toBeInTheDocument();
    expect(expectedReturn.value).toBe('');
    expect(expectedReturn).not.toBeDisabled();
  });

  it('لا يكتب شيئًا في قاعدة البيانات ولا يعدّل سجل الإجازة', async () => {
    render(<LeaveRequest />);
    await waitFor(() => expect(screen.getByTestId('form-layout')).toBeInTheDocument());

    // الكتابة الوحيدة هي سجل الطباعة القائم أصلًا في هذا النموذج — لا مسار إجازات.
    for (const call of api.post.mock.calls) {
      expect(String(call[0])).toBe('/forms/print-log');
    }
    expect(api.post.mock.calls.some((c) => String(c[0]).includes('/leaves'))).toBe(false);
  });
});

describe('LeaveRequest — بلا اختصار (السلوك السابق لم يتغيّر)', () => {
  it('يعرض آخر إجازة من الخادم تمامًا كما كان', async () => {
    routerState.value = null; // فتح عادي: لا حالة مسار
    api.get.mockResolvedValue({ data: { data: {
      employee: EMPLOYEE,
      latestLeave: { type: 'ANNUAL', startDate: '2026-03-01', endDate: '2026-03-05', days: 5, reason: null },
    } } });

    render(<LeaveRequest />);
    await waitFor(() => expect(screen.getByTestId('form-layout')).toBeInTheDocument());
    const text = docText();

    expect(text).toContain('إجازة سنوية');
    expect(text).toContain('01/03/2026');
    expect(text).toContain('05/03/2026');
  });

  it('موظف بلا إجازات: تظهر حقول الإدخال اليدوية فارغة كما كان', async () => {
    routerState.value = null;
    api.get.mockResolvedValue({ data: { data: { employee: EMPLOYEE, latestLeave: null } } });

    render(<LeaveRequest />);
    await waitFor(() => expect(screen.getByTestId('form-layout')).toBeInTheDocument());

    const typeSelect = screen.getByTitle('page.leaveReq.field.leave_type') as HTMLSelectElement;
    expect(typeSelect.value).toBe('');
    expect((screen.getByTitle('field.start_date') as HTMLInputElement).value).toBe('');
    expect((screen.getByTitle('field.end_date') as HTMLInputElement).value).toBe('');
    // الأنواع الأربعة هي نفسها المخزَّنة في سجل الإجازة — لا خريطة تحويل ثانية.
    expect(Array.from(typeSelect.options).map((o) => o.value)).toEqual(['', 'ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY']);
  });
});

// ── إعادة طباعة الطلب بقيمه المحفوظة (Full Leave Request Data Capture v1) ────

describe('LeaveRequest — إعادة تعبئة بيانات الطلب المحفوظة', () => {
  const SAVED = {
    id: 2, type: 'SICK', startDate: '2026-05-10', endDate: '2026-05-14', days: 5,
    reason: 'ظرف صحي', expectedReturnDate: '2026-05-15',
  };

  beforeEach(() => {
    // الخادم يحمل إجازة **أحدث** مختلفة — لإثبات أن المطبوع هو السجل المختار.
    api.get.mockResolvedValue({ data: { data: {
      employee: EMPLOYEE,
      latestLeave: { type: 'ANNUAL', startDate: '2026-07-01', endDate: '2026-07-03', days: 3, reason: 'أحدث', expectedReturnDate: null },
    } } });
    routerState.value = { leavePrefill: SAVED };
  });

  it('تعود كل القيم المحفوظة معبّأة في الحقول القابلة للتحرير', async () => {
    render(<LeaveRequest />);
    await waitFor(() => expect(screen.getByTestId('form-layout')).toBeInTheDocument());

    expect((screen.getByTitle('page.leaveReq.field.leave_type') as HTMLSelectElement).value).toBe('SICK');
    expect((screen.getByTitle('field.start_date') as HTMLInputElement).value).toBe('10/05/2026');
    expect((screen.getByTitle('field.end_date') as HTMLInputElement).value).toBe('14/05/2026');
    expect((screen.getByTitle('page.leaveReq.field.reason') as HTMLInputElement).value).toBe('ظرف صحي');
    expect((screen.getByTitle('page.leaveReq.field.expected_return') as HTMLInputElement).value).toBe('15/05/2026');
    // عدد الأيام معروض ومحسوب من التاريخين — لا يُدخله المستخدم في مكان الإنشاء.
    expect((screen.getByTitle('page.leaveReq.field.days') as HTMLInputElement).value).toBe('5');
  });

  it('يطبع السجل المختار حتى مع وجود إجازة أحدث في الخادم', async () => {
    render(<LeaveRequest />);
    await waitFor(() => expect(screen.getByTestId('form-layout')).toBeInTheDocument());
    const text = docText();

    expect(text).toContain('إجازة مرضية');   // السجل المختار
    expect(text).not.toContain('إجازة سنوية'); // لا الإجازة الأحدث
    expect(text).toContain('10/05/2026');
    expect(text).toContain('14/05/2026');
    expect(text).toContain('ظرف صحي');
    expect(text).not.toContain('أحدث');
  });

  it('الحقول تبقى قابلة للتحرير، وتعديلها لا يمسّ سجل الإجازة', async () => {
    render(<LeaveRequest />);
    await waitFor(() => expect(screen.getByTestId('form-layout')).toBeInTheDocument());

    const reason = screen.getByTitle('page.leaveReq.field.reason') as HTMLInputElement;
    expect(reason).not.toBeDisabled();
    fireEvent.change(reason, { target: { value: 'سبب معدّل قبل الطباعة' } });
    expect(reason.value).toBe('سبب معدّل قبل الطباعة');

    // التعديل بقي في حالة الصفحة وحدها: لا طلب كتابة انطلق بعده.
    // (الكتابة الوحيدة في هذه الصفحة هي سجل الطباعة القائم أصلًا.)
    for (const call of api.post.mock.calls) {
      expect(String(call[0])).toBe('/forms/print-log');
    }
    expect(api.post.mock.calls.some((c) => String(c[0]).includes('/leaves'))).toBe(false);
  });
});
