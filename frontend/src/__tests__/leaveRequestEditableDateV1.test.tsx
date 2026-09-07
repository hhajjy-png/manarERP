// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';

/* ════════════════════════════════════════════════════════════════════════════
   Leave Request — Editable Request Date v1.

   «تاريخ تقديم الطلب» كان يُكتب في المستند بتاريخ **يوم الطباعة** دائمًا، فإعادة
   طباعة طلب قديم كانت تُظهر تاريخًا لم يُقدَّم فيه الطلب أصلًا. صار حقلًا يملكه
   المستخدم. العقد المحروس هنا:
     • طلب جديد ⇒ الحقل يبدأ بتاريخ اليوم (افتراض لا فرض).
     • المستخدم يغيّره قبل الطباعة، والمستند يطبع ما اختاره لا تاريخ اليوم.
     • طلب محفوظ ⇒ يُعرض تاريخه المحفوظ، ولا يُستبدل بتاريخ اليوم.
     • سجل قديم بلا تاريخ محفوظ ⇒ يسقط إلى تاريخ اليوم — السلوك السابق حرفيًا.
     • تاريخا بداية الإجازة ونهايتها وعدد أيامها لا تتأثر بأيٍّ من ذلك.

   ساعة النظام مثبَّتة، فـ«اليوم» قيمة معلومة يمكن تمييزها عن أي تاريخ آخر — بلا
   ذلك يصير اختبار «الافتراض هو اليوم» تحصيلَ حاصل.
   ════════════════════════════════════════════════════════════════════════════ */

const TODAY_ISO = '2026-09-07';
const TODAY_SHOWN = '07/09/2026';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
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
import AddLeaveDialog from '../components/employee/AddLeaveDialog';

const EMPLOYEE = { id: 7, code: 'EMP-7', fullName: 'محمد علي', fullNameEn: 'Mohammed Ali', jobTitle: 'سائق', department: 'العمليات' };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(TODAY_ISO + 'T09:00:00'));
  vi.clearAllMocks();
  routerState.value = null;
  api.post.mockResolvedValue({ data: { data: {} } });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** نصّ المستند كاملًا كما يُطبع. */
function docText(): string {
  return (screen.getByTestId('form-layout').textContent ?? '').replace(/\s+/g, ' ');
}

function requestDateField(): HTMLInputElement {
  return screen.getByTitle('page.leaveReq.field.request_date') as HTMLInputElement;
}

/** يكتب تاريخًا معروضًا في حقل `DateInput` ويُثبّته (الالتزام يقع عند الخروج). */
function typeInto(input: HTMLInputElement, shown: string) {
  fireEvent.change(input, { target: { value: shown } });
  fireEvent.blur(input);
}

async function renderForm() {
  render(<LeaveRequest />);
  await waitFor(() => expect(screen.getByTestId('form-layout')).toBeInTheDocument());
}

// ── ١. النموذج المطبوع ───────────────────────────────────────────────────────

describe('LeaveRequest — تاريخ تقديم الطلب قابل للتحرير', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: { data: { employee: EMPLOYEE, latestLeave: null } } });
  });

  it('طلب جديد: الحقل موجود، غير معطَّل، ويبدأ بتاريخ اليوم', async () => {
    await renderForm();
    const field = requestDateField();

    expect(field).toBeInTheDocument();
    expect(field).not.toBeDisabled();
    expect(field).not.toHaveAttribute('readonly');
    expect(field.value).toBe(TODAY_SHOWN);
    expect(docText()).toContain(TODAY_SHOWN);
  });

  it('تغيير التاريخ يُطبع كما اختاره المستخدم — لا تاريخ اليوم', async () => {
    await renderForm();
    typeInto(requestDateField(), '20/06/2026');

    expect(requestDateField().value).toBe('20/06/2026');
    const text = docText();
    expect(text).toContain('20/06/2026');
    expect(text).not.toContain(TODAY_SHOWN);
  });

  it('لا يمسّ تاريخي الإجازة ولا عدد أيامها', async () => {
    await renderForm();
    typeInto(screen.getByTitle('field.start_date') as HTMLInputElement, '01/07/2026');
    typeInto(screen.getByTitle('field.end_date') as HTMLInputElement, '05/07/2026');
    const days = () => (screen.getByTitle('page.leaveReq.field.days') as HTMLInputElement).value;
    await waitFor(() => expect(days()).toBe('5'));

    typeInto(requestDateField(), '20/06/2026');

    expect((screen.getByTitle('field.start_date') as HTMLInputElement).value).toBe('01/07/2026');
    expect((screen.getByTitle('field.end_date') as HTMLInputElement).value).toBe('05/07/2026');
    expect(days()).toBe('5');
  });

  it('لا يكتب شيئًا في قاعدة البيانات — النموذج ما يزال للطباعة وحدها', async () => {
    await renderForm();
    typeInto(requestDateField(), '20/06/2026');

    for (const call of api.post.mock.calls) {
      expect(String(call[0])).toBe('/forms/print-log');
    }
  });
});

// ── ٢. طلب محفوظ: التاريخ المحفوظ لا تاريخ اليوم ─────────────────────────────

describe('LeaveRequest — طلب إجازة موجود', () => {
  const SAVED = {
    id: 2, type: 'SICK' as const, startDate: '2026-05-10', endDate: '2026-05-14', days: 5,
    reason: 'ظرف صحي', expectedReturnDate: '2026-05-15', requestDate: '2026-05-02',
  };

  it('اختصار الطباعة: يعرض تاريخ التقديم المحفوظ ويطبعه', async () => {
    api.get.mockResolvedValue({ data: { data: { employee: EMPLOYEE, latestLeave: null } } });
    routerState.value = { leavePrefill: SAVED };
    await renderForm();

    expect(requestDateField().value).toBe('02/05/2026');
    const text = docText();
    expect(text).toContain('02/05/2026');
    expect(text).not.toContain(TODAY_SHOWN);
  });

  it('سجل أُنشئ قبل الحزمة (بلا تاريخ محفوظ): يسقط إلى تاريخ اليوم كما كان', async () => {
    api.get.mockResolvedValue({ data: { data: { employee: EMPLOYEE, latestLeave: null } } });
    routerState.value = { leavePrefill: { ...SAVED, requestDate: '' } };
    await renderForm();

    expect(requestDateField().value).toBe(TODAY_SHOWN);
    expect(docText()).toContain(TODAY_SHOWN);
  });

  it('الفتح العادي على آخر إجازة محفوظة: يتبنّى تاريخ تقديمها لا تاريخ اليوم', async () => {
    api.get.mockResolvedValue({ data: { data: {
      employee: EMPLOYEE,
      latestLeave: { type: 'ANNUAL', startDate: '2026-03-01', endDate: '2026-03-05', days: 5, reason: null, requestDate: '2026-02-25' },
    } } });
    await renderForm();

    await waitFor(() => expect(requestDateField().value).toBe('25/02/2026'));
    const text = docText();
    expect(text).toContain('25/02/2026');
    expect(text).not.toContain(TODAY_SHOWN);
    // وبيانات الإجازة نفسها كما كانت — لم تتغيّر بهذه الحزمة.
    expect(text).toContain('01/03/2026');
    expect(text).toContain('05/03/2026');
  });

  it('آخر إجازة بلا تاريخ تقديم محفوظ: تاريخ اليوم — السلوك السابق حرفيًا', async () => {
    api.get.mockResolvedValue({ data: { data: {
      employee: EMPLOYEE,
      latestLeave: { type: 'ANNUAL', startDate: '2026-03-01', endDate: '2026-03-05', days: 5, reason: null },
    } } });
    await renderForm();

    expect(requestDateField().value).toBe(TODAY_SHOWN);
    expect(docText()).toContain(TODAY_SHOWN);
  });

  it('تعديل المستخدم يفوز على التبنّي التلقائي', async () => {
    api.get.mockResolvedValue({ data: { data: {
      employee: EMPLOYEE,
      latestLeave: { type: 'ANNUAL', startDate: '2026-03-01', endDate: '2026-03-05', days: 5, reason: null, requestDate: '2026-02-25' },
    } } });
    await renderForm();
    await waitFor(() => expect(requestDateField().value).toBe('25/02/2026'));

    typeInto(requestDateField(), '01/01/2026');
    expect(requestDateField().value).toBe('01/01/2026');
    expect(docText()).toContain('01/01/2026');
  });
});

// ── ٣. الحفظ الفعلي عند إنشاء الإجازة ────────────────────────────────────────

describe('AddLeaveDialog — التاريخ المختار يُحفظ فعلًا', () => {
  it('يبدأ بتاريخ اليوم', () => {
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect((screen.getByLabelText('page.leaveReq.field.request_date') as HTMLInputElement).value).toBe(TODAY_SHOWN);
  });

  it('يرسل التاريخ الذي اختاره المستخدم — لا تاريخ اليوم', async () => {
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={vi.fn()} />);
    // المؤقّتات الحقيقية تعود بعد تثبيت الحالة الابتدائية، لأن `waitFor` يحتاجها.
    vi.useRealTimers();

    typeInto(screen.getByLabelText('page.leaveReq.field.request_date') as HTMLInputElement, '02/05/2026');
    typeInto(screen.getByLabelText('field.start_date') as HTMLInputElement, '10/05/2026');
    typeInto(screen.getByLabelText('field.end_date') as HTMLInputElement, '14/05/2026');
    fireEvent.click(screen.getByRole('button', { name: /action\.save/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const body = api.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.requestDate).toBe('2026-05-02');
    expect(body.requestDate).not.toBe(TODAY_ISO);
    // ولا يمسّ تاريخي الإجازة، ولا يُرسل `days` (يشتقّها الخادم).
    expect(body.startDate).toBe('2026-05-10');
    expect(body.endDate).toBe('2026-05-14');
    expect(body).not.toHaveProperty('days');
  });
});
