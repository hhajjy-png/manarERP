// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';

/* ════════════════════════════════════════════════════════════════════════════
   عقد «إدارة الإجازات» داخل صفحة تفاصيل مستحقات الموظف.

   هذه الحزمة لا تنشئ نظام إجازات: تصل الواجهة بمسارات موجودة أصلًا في الخادم.
   لذلك تحرس هذه الاختبارات **الوصلة** لا الحسبة:
     • الزر والحوار يظهران لمن يملك الصلاحية فقط.
     • الجسم المُرسَل يطابق `leaveSchema` — وبلا `days` إطلاقًا (الخادم يشتقّها).
     • الاعتماد/الرفض يظهران للحالة PENDING وحدها ويضربان المسار الصحيح.
     • كل عملية ناجحة تعيد تحميل نموذج القراءة الموحّد للمستحقات.
   ════════════════════════════════════════════════════════════════════════════ */

const api = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(),
}));
/** صلاحيات قابلة للتبديل بين الاختبارات (المستخدم غير المخوّل). */
const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
/** جاسوس التنقّل — يثبت أن اختصار الطباعة يفتح النموذج القائم بحالته الصحيحة. */
const navigateSpy = vi.hoisted(() => vi.fn());

vi.mock('../api/client', () => ({
  api,
  errorMessage: (e: unknown) => (e as { message?: string })?.message ?? String(e),
}));
vi.mock('../stores/authStore', () => ({
  useAuth: () => ({
    hasPermission: (k: string) => perms.granted.has(k),
    isSystemAdmin: () => false,
    user: { id: 1, username: 'hr', role: 'HR_MANAGER' },
  }),
}));
vi.mock('../lib/i18n', () => ({
  useT: () => ({ t: (k: string) => k }),
  t: (k: string) => k,
}));
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: '7' }),
  useNavigate: () => navigateSpy,
}));

import EmployeeEntitlementsCenter from '../pages/EmployeeEntitlementsCenter';
import AddLeaveDialog from '../components/employee/AddLeaveDialog';
import type { EntitlementsResponse, LeaveRow } from '../components/employee/entitlementsShared';

// ── تجهيزة نموذج القراءة ──────────────────────────────────────────────────────

const BALANCE = { entitlement: 0, paid: 0, remaining: 0, payable: true };

function response(leaveHistory: LeaveRow[]): EntitlementsResponse {
  return {
    employee: { id: 7, code: 'EMP-7', fullName: 'محمد علي', salary: 300, hireDate: '2024-01-01', status: 'ACTIVE' },
    asOf: '2026-08-14',
    result: {
      hasHireDate: true, hasWageBase: true,
      duration: { years: 2, months: 7, days: 13, totalDays: 956 },
      firstYearEligible: true, annualEntitlementDays: 30,
      accruedLeaveDays: 40, usedLeaveDays: 5, remainingLeaveDays: 35, overusedLeaveDays: 0,
      dailyWage: 10, leaveAllowanceDays: 35, leaveAllowanceValue: 350,
      gratuity: null, assumptionsApplied: false,
    },
    wageBase: { baseSalary: 300, total: 300, source: 'EMPLOYEE_SALARY' },
    leaveExclusionBreakdown: {
      grossAnnualLeaveDays: 5, holidaysExcludedDays: 0, sickExcludedDays: 0,
      netUsedLeaveDays: 5, holidaysConfiguredCount: 0,
    },
    leaveHistory,
    payments: { entries: [], totalsByCategory: {}, totalRecorded: 0 },
    balances: {
      leaveAllowance: BALANCE, endOfService: BALANCE,
      totalPayable: 0, totalPaid: 0, totalRemaining: 0,
      payableCategories: ['LEAVE_ALLOWANCE'],
    },
    finalSettlement: null,
    cancelledSettlements: [],
    estimatedEndOfService: {
      isEstimate: true, asOf: '2026-08-14', terminationAmount: null, resignationAmount: null,
      includedInPayable: false, payableNow: false, activationRequires: '', scenariosAreHypothetical: true,
    },
  } as EntitlementsResponse;
}

function leave(over: Partial<LeaveRow> = {}): LeaveRow {
  return { id: 1, type: 'ANNUAL', startDate: '2026-03-01', endDate: '2026-03-05', days: 5, status: 'PENDING', ...over };
}

/**
 * جدول سجل الإجازات وحده — الصفحة تعرض نفس شرائح الحالة في الخط الزمني أيضًا،
 * فأي استعلام على مستوى الصفحة يلتقط عنصرين. عمود «عدد الأيام» يميّز هذا الجدول.
 */
function leaveTable(): HTMLElement {
  return screen.getByRole('columnheader', { name: 'field.ent.days_count' }).closest('table') as HTMLElement;
}

/**
 * `DateInput` حقل نصّي مقنّع بصيغة DD/MM/YYYY، ولا يُصدِر القيمة القانونية
 * 'YYYY-MM-DD' إلا عند فقدان التركيز (`commit()` على blur) — لذا يكتب المساعد
 * ثم يُغادر الحقل، تمامًا كما يفعل المستخدم.
 */
function typeDate(labelText: string, ddmmyyyy: string) {
  const input = screen.getByLabelText(labelText);
  fireEvent.change(input, { target: { value: ddmmyyyy } });
  fireEvent.blur(input);
}

beforeEach(() => {
  vi.clearAllMocks();
  perms.granted = new Set(['employees.read', 'employees.create', 'employees.update']);
  api.get.mockResolvedValue({ data: { data: response([leave()]) } });
  api.post.mockResolvedValue({ data: { data: { id: 99 } } });
  api.patch.mockResolvedValue({ data: { data: {} } });
});
afterEach(cleanup);

// ── ١. الزر وظهوره حسب الصلاحية ───────────────────────────────────────────────

describe('زر «إضافة إجازة»', () => {
  it('يظهر للمستخدم المخوّل داخل رأس قسم سجل الإجازات', async () => {
    render(<EmployeeEntitlementsCenter />);
    expect(await screen.findByRole('button', { name: /page\.ent\.add_leave/ })).toBeInTheDocument();
  });

  it('لا يظهر لمن لا يملك employees.create', async () => {
    perms.granted = new Set(['employees.read', 'employees.update']);
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_history');
    expect(screen.queryByRole('button', { name: /page\.ent\.add_leave/ })).toBeNull();
  });

  // ٢. فتح الحوار
  it('يفتح الحوار عند النقر — ونقره لا يطوي/يفتح القسم لأنه داخل <summary>', async () => {
    render(<EmployeeEntitlementsCenter />);
    const btn = await screen.findByRole('button', { name: /page\.ent\.add_leave/ });
    const details = btn.closest('details') as HTMLDetailsElement;
    const wasOpen = details.open;

    fireEvent.click(btn);

    await screen.findByText('msg.ent.add_leave_subtitle');
    expect(details.open).toBe(wasOpen); // الزر لم يطوِ القسم ولم يفتحه
  });
});

// ── ٣ و٤. جسم الطلب ───────────────────────────────────────────────────────────

describe('AddLeaveDialog — الجسم المُرسَل', () => {
  it('يرسل النوع + البداية + النهاية + employeeId إلى POST /employees/leaves', async () => {
    const onSaved = vi.fn();
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText('page.leaveReq.field.leave_type'), { target: { value: 'SICK' } });
    typeDate('field.start_date', '01/03/2026');
    typeDate('field.end_date', '05/03/2026');
    fireEvent.click(screen.getByRole('button', { name: /action\.save/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/employees/leaves', {
      employeeId: 7, type: 'SICK', startDate: '2026-03-01', endDate: '2026-03-05',
    }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('لا يرسل `days` ولا `status` — الخادم يشتقّ الأيام ويفرض PENDING', async () => {
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={vi.fn()} />);

    typeDate('field.start_date', '01/03/2026');
    typeDate('field.end_date', '05/03/2026');
    fireEvent.click(screen.getByRole('button', { name: /action\.save/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const body = api.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('days');
    expect(body).not.toHaveProperty('status');
    expect(Object.keys(body).sort()).toEqual(['employeeId', 'endDate', 'startDate', 'type']);
  });

  it('يعرض أنواع الإجازة الأربعة الموجودة في leaveSchema، بلا نوع مُخترَع', () => {
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={vi.fn()} />);
    const options = within(screen.getByLabelText('page.leaveReq.field.leave_type')).getAllByRole('option') as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual(['ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY']);
  });

  it('يمنع الحفظ قبل اكتمال التاريخين، ويرفض نهايةً تسبق البداية', () => {
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={vi.fn()} />);
    const save = () => screen.getByRole('button', { name: /action\.save/ });

    expect(save()).toBeDisabled(); // لا تواريخ بعد

    typeDate('field.start_date', '10/03/2026');
    typeDate('field.end_date', '01/03/2026');
    expect(save()).toBeDisabled();
    expect(screen.getByText('msg.ent.leave_dates_out_of_order')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('يمنع الإرسال المزدوج — نقرتان متتاليتان تُنتجان طلبًا واحدًا', async () => {
    let release: (v: unknown) => void = () => {};
    api.post.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={vi.fn()} />);

    typeDate('field.start_date', '01/03/2026');
    typeDate('field.end_date', '05/03/2026');
    const save = screen.getByRole('button', { name: /action\.save/ });
    fireEvent.click(save);
    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    release({ data: { data: {} } });
  });
});

// ── ٥. الإجازة الجديدة تظهر PENDING ──────────────────────────────────────────

describe('بعد الإضافة', () => {
  it('يعيد تحميل نموذج القراءة، فتظهر الإجازة الجديدة بحالة PENDING', async () => {
    api.get.mockResolvedValueOnce({ data: { data: response([]) } });
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_history');
    expect(api.get).toHaveBeenCalledTimes(1);

    // القراءة التالية تُرجع السجل الجديد كما أنشأه الخادم — PENDING.
    api.get.mockResolvedValue({ data: { data: response([leave({ id: 99, status: 'PENDING' })]) } });

    fireEvent.click(screen.getByRole('button', { name: /page\.ent\.add_leave/ }));
    typeDate('field.start_date', '01/03/2026');
    typeDate('field.end_date', '05/03/2026');
    fireEvent.click(screen.getByRole('button', { name: /action\.save/ }));

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(within(leaveTable()).getByText('opt.ent.leave_status.pending')).toBeInTheDocument();
  });
});

// ── ٦ إلى ٩. الاعتماد والرفض ─────────────────────────────────────────────────

describe('إجراءات الاعتماد / الرفض', () => {
  it('تظهر للحالة PENDING وحدها', async () => {
    api.get.mockResolvedValue({ data: { data: response([
      leave({ id: 1, status: 'PENDING' }),
      leave({ id: 2, status: 'APPROVED' }),
      leave({ id: 3, status: 'REJECTED' }),
    ]) } });
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_history');
    const table = within(leaveTable());

    // صفّ واحد فقط يحمل الإجراءين.
    expect(table.getAllByRole('button', { name: /action\.approve/ })).toHaveLength(1);
    expect(table.getAllByRole('button', { name: /action\.reject/ })).toHaveLength(1);

    // الصف المعتمد لا يحمل اعتمادًا ولا رفضًا (يحمل زر الطباعة وحده — انظر قسم
    // اختصار الطباعة أدناه)، والمرفوض لا يحمل أي إجراء إطلاقًا.
    const approvedRow = table.getByText('opt.ent.leave_status.approved').closest('tr')!;
    expect(within(approvedRow).queryByRole('button', { name: /action\.approve/ })).toBeNull();
    expect(within(approvedRow).queryByRole('button', { name: /action\.reject/ })).toBeNull();
    const rejectedRow = table.getByText('opt.ent.leave_status.rejected').closest('tr')!;
    expect(within(rejectedRow).queryByRole('button')).toBeNull();
  });

  it('الاعتماد يضرب PATCH /employees/leaves/:id/approve', async () => {
    render(<EmployeeEntitlementsCenter />);
    fireEvent.click(await screen.findByRole('button', { name: /action\.approve/ }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/employees/leaves/1/approve'));
  });

  it('الرفض يضرب PATCH /employees/leaves/:id/reject', async () => {
    render(<EmployeeEntitlementsCenter />);
    fireEvent.click(await screen.findByRole('button', { name: /action\.reject/ }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/employees/leaves/1/reject'));
  });

  it('يعيد تحميل نموذج قراءة المستحقات بعد الاعتماد — محرّك المستحقات يقرأ APPROVED', async () => {
    render(<EmployeeEntitlementsCenter />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: /action\.approve/ }));

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.get.mock.calls[1][0]).toBe('/employees/7/entitlements');
  });

  it('يعيد تحميل نموذج القراءة بعد الرفض أيضًا', async () => {
    render(<EmployeeEntitlementsCenter />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

    fireEvent.click(await screen.findByRole('button', { name: /action\.reject/ }));

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it('يمنع الإرسال المزدوج أثناء تنفيذ إجراء', async () => {
    let release: (v: unknown) => void = () => {};
    api.patch.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    render(<EmployeeEntitlementsCenter />);

    const approve = await screen.findByRole('button', { name: /action\.approve/ });
    fireEvent.click(approve);
    fireEvent.click(approve);
    fireEvent.click(screen.getByRole('button', { name: /action\.reject/ }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    release({ data: { data: {} } });
  });

  // ١٠. المستخدم غير المخوّل
  it('لا يعرض أي إجراء اعتماد/رفض لمن لا يملك employees.update', async () => {
    perms.granted = new Set(['employees.read', 'employees.create']);
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_history');
    const table = within(leaveTable());
    expect(table.getByText('opt.ent.leave_status.pending')).toBeInTheDocument();

    expect(table.queryByRole('button', { name: /action\.approve/ })).toBeNull();
    expect(table.queryByRole('button', { name: /action\.reject/ })).toBeNull();
    expect(api.patch).not.toHaveBeenCalled();
  });
});

// ── ١١. لا أثر على المخطط ────────────────────────────────────────────────────

describe('نطاق الحزمة', () => {
  it('لا تستدعي الواجهة أي مسار إنشاء/تعديل/حذف غير المسارات الثلاثة القائمة', async () => {
    render(<EmployeeEntitlementsCenter />);
    fireEvent.click(await screen.findByRole('button', { name: /action\.approve/ }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());

    // لا حذف ولا تعديل إجازة في هذه الحزمة (خارج النطاق صراحةً).
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    for (const call of api.patch.mock.calls) {
      expect(String(call[0])).toMatch(/^\/employees\/leaves\/\d+\/(approve|reject)$/);
    }
  });
});

// ── اختصار «طباعة نموذج الإجازة» (Print Form Shortcut v1) ─────────────────────

describe('اختصار طباعة نموذج الإجازة — جانب الإرسال', () => {
  const threeStatuses = () => response([
    leave({ id: 1, status: 'PENDING' }),
    leave({ id: 2, status: 'APPROVED', type: 'SICK', startDate: '2026-05-10', endDate: '2026-05-14', days: 5,
      reason: 'رحلة عائلية', expectedReturnDate: '2026-05-15' }),
    leave({ id: 3, status: 'REJECTED' }),
  ]);

  it('يظهر زر الطباعة للإجازة المعتمدة وحدها', async () => {
    api.get.mockResolvedValue({ data: { data: threeStatuses() } });
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_history');
    const table = within(leaveTable());

    expect(table.getAllByRole('button', { name: /page\.ent\.print_leave_form/ })).toHaveLength(1);

    const approvedRow = table.getByText('opt.ent.leave_status.approved').closest('tr')!;
    expect(within(approvedRow).getByRole('button', { name: /page\.ent\.print_leave_form/ })).toBeInTheDocument();
  });

  it('لا يظهر لـ PENDING ولا لـ REJECTED', async () => {
    api.get.mockResolvedValue({ data: { data: threeStatuses() } });
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_history');
    const table = within(leaveTable());

    const pendingRow = table.getByText('opt.ent.leave_status.pending').closest('tr')!;
    expect(within(pendingRow).queryByRole('button', { name: /page\.ent\.print_leave_form/ })).toBeNull();
    // الصف المعلّق يحمل الاعتماد/الرفض فقط.
    expect(within(pendingRow).getByRole('button', { name: /action\.approve/ })).toBeInTheDocument();

    const rejectedRow = table.getByText('opt.ent.leave_status.rejected').closest('tr')!;
    expect(within(rejectedRow).queryByRole('button')).toBeNull();
  });

  it('يفتح مسار نموذج الإجازة القائم للموظف نفسه، ويمرّر سجل الإجازة المختار وحده', async () => {
    api.get.mockResolvedValue({ data: { data: threeStatuses() } });
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_history');

    fireEvent.click(within(leaveTable()).getByRole('button', { name: /page\.ent\.print_leave_form/ }));

    expect(navigateSpy).toHaveBeenCalledTimes(1);
    const [path, options] = navigateSpy.mock.calls[0];
    // هوية الموظف تسافر في المسار — الآلية التي يعرّف بها النموذج موظفه أصلًا.
    expect(path).toBe('/forms/leave-request/7');
    // والحالة تحمل حقول السجل المختار: النوع والتاريخين (والأيام كما هي مخزَّنة).
    expect(options.state.leavePrefill).toEqual({
      id: 2, type: 'SICK', startDate: '2026-05-10', endDate: '2026-05-14', days: 5,
      reason: 'رحلة عائلية', expectedReturnDate: '2026-05-15',
    });
  });

  it('اختصار عرضي بحت — لا كتابة ولا تعديل على سجل الإجازة', async () => {
    api.get.mockResolvedValue({ data: { data: threeStatuses() } });
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_history');
    api.get.mockClear();

    fireEvent.click(within(leaveTable()).getByRole('button', { name: /page\.ent\.print_leave_form/ }));

    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled(); // لا إعادة تحميل: لا شيء تغيّر
  });
});

// ── التقاط بيانات طلب الإجازة كاملة (Full Leave Request Data Capture v1) ──────

describe('AddLeaveDialog — كل حقول نموذج الإجازة القابلة للإدخال', () => {
  /**
   * الحصر الكامل لما كان المستخدم يعبّئه يدويًا في صفحة `LeaveRequest`.
   * `days` مستبعد عمدًا: يشتقّه الخادم، ولا يُدخَل هنا (يُحرَس باختبار مستقل أدناه).
   */
  const FORM_LABELS = [
    'page.leaveReq.field.leave_type',
    'field.start_date',
    'field.end_date',
    'page.leaveReq.field.expected_return',
    'page.leaveReq.field.reason',
  ];

  it('تعرض كل حقول الطلب بنفس ألفاظ صفحة الطباعة', () => {
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={vi.fn()} />);
    for (const label of FORM_LABELS) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('لا تطلب عدد الأيام يدويًا — تعلن أن الخادم يحتسبه', () => {
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText('page.leaveReq.field.days')).toBeNull();
    expect(screen.getByText('msg.ent.leave_days_server_note')).toBeInTheDocument();
  });

  it('لا تطلب بيانات الموظف يدويًا — تُقرأ من ملفه', () => {
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={vi.fn()} />);

    // لا حقل اسم/رقم وظيفي/مسمّى/قسم: النموذج يقرؤها من ملف الموظف بمعرّفه.
    for (const label of ['col.sal.employee', 'col.code', 'lbl.payslip.department', 'field.job_title']) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    // مجموع حقول الإدخال = حقول الطلب وحدها: ثلاثة تواريخ + السبب + قائمة النوع.
    expect(screen.getAllByRole('textbox')).toHaveLength(4);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('ترسل بيانات الطلب كاملة إلى المسار القائم', async () => {
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('page.leaveReq.field.leave_type'), { target: { value: 'EMERGENCY' } });
    typeDate('field.start_date', '01/06/2026');
    typeDate('field.end_date', '04/06/2026');
    typeDate('page.leaveReq.field.expected_return', '05/06/2026');
    fireEvent.change(screen.getByLabelText('page.leaveReq.field.reason'), { target: { value: 'ظرف عائلي' } });
    fireEvent.click(screen.getByRole('button', { name: /action\.save/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/employees/leaves', {
      employeeId: 7,
      type: 'EMERGENCY',
      startDate: '2026-06-01',
      endDate: '2026-06-04',
      reason: 'ظرف عائلي',
      expectedReturnDate: '2026-06-05',
    }));
  });

  it('تحذف الحقلين الاختياريين حين يتركهما المستخدم فارغين', async () => {
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={vi.fn()} />);

    typeDate('field.start_date', '01/06/2026');
    typeDate('field.end_date', '04/06/2026');
    fireEvent.click(screen.getByRole('button', { name: /action\.save/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const body = api.post.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['employeeId', 'endDate', 'startDate', 'type']);
  });

  it('ترفض تاريخ عودة يسبق نهاية الإجازة', () => {
    render(<AddLeaveDialog employeeId={7} onClose={vi.fn()} onSaved={vi.fn()} />);

    typeDate('field.start_date', '01/06/2026');
    typeDate('field.end_date', '10/06/2026');
    typeDate('page.leaveReq.field.expected_return', '05/06/2026');

    expect(screen.getByRole('button', { name: /action\.save/ })).toBeDisabled();
    expect(screen.getByText('msg.ent.leave_return_before_end')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});

// ── تفاصيل رصيد الإجازة والتسوية المالية ─────────────────────────────────────
// (Legal Leave Balance & Payments Reconciliation Pack v1)

describe('تفاصيل رصيد الإجازة — لا تصفير بلا تفسير', () => {
  /** استجابة بأرقام رصيد صريحة + موقف مالي لبدل الإجازة. */
  function withBalance(over: {
    accrued?: number; used?: number; remaining?: number; overused?: number;
    entitlement?: number; paid?: number; netRemaining?: number;
  } = {}): EntitlementsResponse {
    const base = response([leave({ status: 'APPROVED' })]);
    return {
      ...base,
      result: {
        ...base.result,
        accruedLeaveDays: over.accrued ?? 45,
        usedLeaveDays: over.used ?? 30,
        remainingLeaveDays: over.remaining ?? 15,
        overusedLeaveDays: over.overused ?? 0,
        leaveAllowanceDays: over.remaining ?? 15,
        dailyWage: 10,
      },
      balances: {
        ...base.balances,
        leaveAllowance: {
          entitlement: over.entitlement ?? 150,
          paid: over.paid ?? 0,
          remaining: over.netRemaining ?? over.entitlement ?? 150,
          payable: true,
        },
      },
    } as EntitlementsResponse;
  }

  it('يعرض المتراكم والمستخدم والمتبقي معًا — مثال 45 / 30 / 15', async () => {
    api.get.mockResolvedValue({ data: { data: withBalance() } });
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_balance_details');

    expect(screen.getByText('field.ent.accrued_leave_days')).toBeInTheDocument();
    expect(screen.getByText('field.ent.used_leave_days')).toBeInTheDocument();
    expect(screen.getByText('field.ent.current_leave_balance')).toBeInTheDocument();
  });

  it('يعرض التسوية المالية الأربعة: أجر يومي · قيمة · مدفوع · صافٍ', async () => {
    api.get.mockResolvedValue({ data: { data: withBalance({ paid: 50, netRemaining: 100 }) } });
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_balance_details');

    expect(screen.getByText('field.ent.daily_wage')).toBeInTheDocument();
    expect(screen.getByText('field.ent.leave_allowance_value')).toBeInTheDocument();
    expect(screen.getByText('field.ent.leave_payments_recorded')).toBeInTheDocument();
    expect(screen.getByText('field.ent.leave_net_remaining_value')).toBeInTheDocument();
    expect(screen.getByText('msg.ent.leave_financial_reconciliation_note')).toBeInTheDocument();
  });

  it('التجاوز يظهر برقمه، ولا يُعرض تحذير حين لا تجاوز', async () => {
    api.get.mockResolvedValue({ data: { data: withBalance({ accrued: 30, used: 35, remaining: 0, overused: 5 }) } });
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_balance_details');

    expect(screen.getAllByText('field.ent.overused_days').length).toBeGreaterThan(0);
    expect(screen.getByText('msg.ent.warning.over_used_days')).toBeInTheDocument();
  });

  it('بلا تجاوز: لا تحذير ولا حقل تجاوز', async () => {
    api.get.mockResolvedValue({ data: { data: withBalance() } });
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_balance_details');

    expect(screen.queryByText('msg.ent.warning.over_used_days')).toBeNull();
    expect(screen.queryByText('field.ent.overused_days')).toBeNull();
  });

  it('قاعدة الاستهلاك معلنة للمستخدم تحت تسلسل التسوية', async () => {
    api.get.mockResolvedValue({ data: { data: withBalance() } });
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_balance_details');

    expect(screen.getByText('msg.ent.leave_usage_rule_note')).toBeInTheDocument();
  });

  it('سجل الإجازات وسير عمله باقيان كما هما', async () => {
    api.get.mockResolvedValue({ data: { data: {
      ...withBalance(),
      leaveHistory: [leave({ id: 1, status: 'PENDING' }), leave({ id: 2, status: 'APPROVED' })],
    } } });
    render(<EmployeeEntitlementsCenter />);
    await screen.findByText('section.ent.leave_history');
    const table = within(leaveTable());

    expect(screen.getByRole('button', { name: /page\.ent\.add_leave/ })).toBeInTheDocument();
    expect(table.getByRole('button', { name: /action\.approve/ })).toBeInTheDocument();
    expect(table.getByRole('button', { name: /action\.reject/ })).toBeInTheDocument();
    expect(table.getByRole('button', { name: /page\.ent\.print_leave_form/ })).toBeInTheDocument();
  });
});
