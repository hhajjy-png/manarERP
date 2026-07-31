// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import Forms from '../pages/Forms';
import EmployeeFormsMenu from '../components/employee/EmployeeFormsMenu';
import { EMPLOYEE_FORM_CARDS, FORM_CARDS } from '../forms/shared/formsRegistry';
import { api } from '../api/client';
import { SELECTABLE_PROFILE_IDS, PRINT_PROFILES } from '../forms/shared/printProfiles';

/**
 * Employee Smart Forms Hub v1 — يستبدل زر «طباعة النماذج» المفرد بقائمة منبثقة
 * («نماذج الموظف») مبنيّة من سجل النماذج نفسه (`formsRegistry.ts`). اختيار بند
 * ينقل معرّف الموظف والنموذج فقط (?employee=<id>&form=<key>) إلى مركز النماذج،
 * الذي يُنفّذ **نفس** مقبض التحديد ومقبض الطباعة المستخدَمين يدويًا — فيصل المستخدم
 * جاهزًا للطباعة بلا أي اختيار إضافي.
 */

const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');

const resourcePageCode = code(readFileSync('src/pages/ResourcePage.tsx', 'utf8'));
const formsCode = code(readFileSync('src/pages/Forms.tsx', 'utf8'));
const formsMenuCode = code(readFileSync('src/components/employee/EmployeeFormsMenu.tsx', 'utf8'));

const EMPLOYEES = [
  { id: 5, code: 'EMP-005', fullName: 'سارة العتيبي', jobTitle: 'مهندسة مدنية' },
  { id: 9, code: 'EMP-009', fullName: 'خالد الفهد', jobTitle: 'مشرف موقع' },
];

let get: ReturnType<typeof vi.fn>;

beforeEach(() => {
  get = vi.fn(async (url: string) => {
    if (url === '/employees') return { data: { data: { data: EMPLOYEES } } };
    return { data: { data: null } };
  });
  vi.spyOn(api, 'get').mockImplementation(get as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── درج الموظف: القائمة المنبثقة تحلّ محلّ الزر المفرد (توثيق مصدري) ──────────
describe('درج الموظف — استبدال الزر المفرد بقائمة نماذج الموظف', () => {
  it('الإجراء القديم المفرد (print-forms) لم يعد موجودًا', () => {
    expect(resourcePageCode).not.toContain("key: 'print-forms'");
    expect(resourcePageCode).not.toContain('action.print_forms');
  });

  it('EmployeeFormsMenu مُركَّب ضمن نفس صف الإجراءات السريعة، مقيّدًا بصلاحية forms.read', () => {
    expect(resourcePageCode).toContain("const canPrintForms = hasPermission('forms.read');");
    expect(resourcePageCode).toContain('{canPrintForms && <EmployeeFormsMenu employeeId={viewing.id} />}');
  });
});

// ── EmployeeFormsMenu: القائمة مبنيّة من السجل، لا أسماء مُكرَّرة ──────────────
describe('EmployeeFormsMenu — قائمة مبنيّة ديناميكيًا من سجل النماذج', () => {
  it('لا أسماء نماذج مكتوبة حرفيًا في مصدر المكوّن — كلها تأتي من EMPLOYEE_FORM_CARDS', () => {
    expect(formsMenuCode).toContain("import { EMPLOYEE_FORM_CARDS } from '../../forms/shared/formsRegistry';");
    expect(formsMenuCode).toContain('EMPLOYEE_FORM_CARDS.map(');
    // لا وجود لعنوان نموذج واحد حرفيًا (مثال تمثيلي) داخل المكوّن نفسه.
    expect(formsMenuCode).not.toContain('طلب إجازة');
    expect(formsMenuCode).not.toContain('شهادة راتب');
  });

  it('الزر يفتح قائمة تعرض كل نماذج الموظف — وعددها بالضبط كعدد السجل الحالي', async () => {
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <EmployeeFormsMenu employeeId={5} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'نماذج الموظف' }));
    const menu = screen.getByRole('menu', { name: 'نماذج الموظف' });
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(EMPLOYEE_FORM_CARDS.length);
    // عيّنة تمثيلية من عناوين نماذج الموارد البشرية.
    expect(within(menu).getByText('طلب إجازة')).toBeInTheDocument();
    expect(within(menu).getByText('شهادة راتب')).toBeInTheDocument();
  });

  it('لا تظهر نماذج العمليات (لا تخصّ موظفًا) ضمن القائمة', async () => {
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <EmployeeFormsMenu employeeId={5} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'نماذج الموظف' }));
    const menu = screen.getByRole('menu', { name: 'نماذج الموظف' });
    expect(within(menu).queryByText('عرض سعر')).not.toBeInTheDocument();
    expect(within(menu).queryByText('طلب شراء')).not.toBeInTheDocument();
    expect(within(menu).queryByText('سند قبض')).not.toBeInTheDocument();
  });

  it('اختيار بند ينقل معرّف الموظف والنموذج فقط إلى مركز النماذج', async () => {
    function LocationProbe() {
      const location = useLocation();
      return <div data-testid="probe">{location.pathname}{location.search}</div>;
    }
    render(
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/start']}>
        <Routes>
          <Route path="/start" element={<EmployeeFormsMenu employeeId={5} />} />
          <Route path="/forms" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'نماذج الموظف' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /طلب إجازة/ }));
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('/forms?employee=5&form=leave-request');
    });
  });

  it('مفتاح Escape يغلق القائمة ويعيد التركيز إلى الزر', async () => {
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <EmployeeFormsMenu employeeId={5} />
      </MemoryRouter>,
    );
    const trigger = screen.getByRole('button', { name: 'نماذج الموظف' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0], { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('النقر خارج القائمة يغلقها', async () => {
    render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <div>
          <EmployeeFormsMenu employeeId={5} />
          <button type="button">خارج القائمة</button>
        </div>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'نماذج الموظف' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'خارج القائمة' }));
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});

// ── مركز النماذج: مقبض تحديد موحّد (كما كان) ───────────────────────────────
describe('مركز النماذج — مقبض تحديد الموظف موحّد', () => {
  it('الاختيار اليدوي والتحديد التلقائي يستدعيان نفس selectEmployee', () => {
    expect(formsCode).toContain('function selectEmployee(id: string) {');
    expect(formsCode).toContain('onChange={(e) => selectEmployee(e.target.value)}');
    expect(formsCode).toContain('selectEmployee(preselectEmployeeId);');
    const directCalls = (formsCode.match(/setSelectedId\(/g) ?? []).length;
    expect(directCalls).toBe(1);
  });

  it('الإطلاق التلقائي للنموذج يستدعي نفس handleOpen الذي يستدعيه النقر اليدوي', () => {
    expect(formsCode).toContain('const handleOpen = useCallback((card: FormCard, opts?: { replace?: boolean }) => {');
    // النقر اليدوي يستدعي handleOpen بلا opts ⇒ push عادي، بلا تغيير في السلوك.
    expect(formsCode).toContain('onClick={() => handleOpen(card)}');
    // الإطلاق التلقائي وحده يمرّر replace:true (إصلاح انحدار الرجوع).
    expect(formsCode).toContain('handleOpen(card, { replace: true });');
    // نداءان فقط لهذا المقبض في كل الملف: النقر اليدوي، والإطلاق التلقائي.
    const handleOpenCalls = (formsCode.match(/handleOpen\(card/g) ?? []).length;
    expect(handleOpenCalls).toBe(2);
  });
});

function renderFormsWithRouter(initialEntry: string) {
  function LocationProbe() {
    const location = useLocation();
    return <div data-testid="probe">{location.pathname}{location.search}</div>;
  }
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/forms" element={<Forms />} />
        <Route path="/forms/:route/:employeeId" element={<LocationProbe />} />
        <Route path="/forms/:route" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ── مركز النماذج: التحديد المسبق للموظف والنموذج معًا (Smart Forms Hub) ───────
describe('مركز النماذج — التحديد المسبق للموظف والنموذج عبر ?employee&form', () => {
  it('موظف ونموذج صالحان ⇒ ينتقل تلقائيًا إلى شاشة النموذج جاهزة للطباعة', async () => {
    renderFormsWithRouter('/forms?employee=5&form=leave-request');
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('/forms/leave-request/5?printMode=plain-a4');
    });
  });

  it('موظف صالح + نموذج غير موجود بالسجل ⇒ الموظف يبقى محدَّدًا، بلا أي تنقّل، بلا خطأ', async () => {
    renderFormsWithRouter('/forms?employee=5&form=not-a-real-form');
    await waitFor(() => {
      const select = screen.getByLabelText('اختر الموظف (مشترك لجميع النماذج) *') as HTMLSelectElement;
      expect(select.value).toBe('5');
    });
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
    expect(screen.queryByText(/خطأ/)).not.toBeInTheDocument();
  });

  it('معرّف موظف غير صالح + نموذج صالح ⇒ الشاشة تفتح بشكل طبيعي بلا أي تحديد أو تنقّل', async () => {
    renderFormsWithRouter('/forms?employee=999&form=leave-request');
    await waitFor(() => {
      expect(screen.getByText(/سارة العتيبي/)).toBeInTheDocument();
    });
    const select = screen.getByLabelText('اختر الموظف (مشترك لجميع النماذج) *') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
    expect(screen.queryByText(/خطأ/)).not.toBeInTheDocument();
  });

  it('كلاهما غير صالح ⇒ يطابق سلوك اليوم تمامًا، بلا أخطاء', async () => {
    renderFormsWithRouter('/forms?employee=999&form=not-a-real-form');
    await waitFor(() => {
      expect(screen.getByText(/سارة العتيبي/)).toBeInTheDocument();
    });
    const select = screen.getByLabelText('اختر الموظف (مشترك لجميع النماذج) *') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(screen.queryByTestId('probe')).not.toBeInTheDocument();
  });

  it('وصول مباشر بلا أي معرّفات ⇒ السلوك كما كان تمامًا', async () => {
    renderFormsWithRouter('/forms');
    await waitFor(() => {
      expect(screen.getByText(/سارة العتيبي/)).toBeInTheDocument();
    });
    const select = screen.getByLabelText('اختر الموظف (مشترك لجميع النماذج) *') as HTMLSelectElement;
    expect(select.value).toBe('');
  });

  it('التغيير اليدوي بعد التحديد التلقائي (بلا نموذج) يعمل تمامًا كما كان', async () => {
    renderFormsWithRouter('/forms?employee=5');
    await waitFor(() => {
      const select = screen.getByLabelText('اختر الموظف (مشترك لجميع النماذج) *') as HTMLSelectElement;
      expect(select.value).toBe('5');
    });
    const select = screen.getByLabelText('اختر الموظف (مشترك لجميع النماذج) *') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '9' } });
    expect(select.value).toBe('9');
    expect(screen.getAllByText(/خالد الفهد/)).toHaveLength(2);
  });
});

// ── انحدار الرجوع (Back): الدرج ← قائمة النماذج ← المعاينة ← رجوع ─────────────
// جذر العلّة: التنقّل التلقائي من رابط العبور (?employee&form) إلى شاشة النموذج
// الفعلية كان navigate() عاديًا (push) لا replace — فيترك رابط العبور كمدخل خفي
// إضافي في السجل. الزر «رجوع ›» في FormLayout يستخدم navigate(-1) الأصلي فقط
// (بلا أي منطق مخصّص)، فتعتمد صحّته كليًا على استقامة سجل المتصفح نفسه.
describe('انحدار الرجوع — الدرج ← نماذج الموظف ← المعاينة ← رجوع', () => {
  function PreviewStandIn() {
    // يحاكي زر «رجوع ›» الحقيقي في FormLayout.tsx: navigate(-1) الأصلي فقط.
    const navigate = useNavigate();
    const location = useLocation();
    return (
      <div>
        <div data-testid="probe">{location.pathname}{location.search}</div>
        <button type="button" onClick={() => navigate(-1)}>رجوع ›</button>
      </div>
    );
  }

  function renderFullChain(initialEntry: string) {
    return render(
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/employees" element={<EmployeeFormsMenu employeeId={5} />} />
          <Route path="/forms" element={<Forms />} />
          <Route path="/forms/:route/:employeeId" element={<PreviewStandIn />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('الدرج ← نماذج الموظف ← معاينة ← رجوع (زر التطبيق) يعود مباشرة إلى الموظفين، لا إلى رابط العبور', async () => {
    renderFullChain('/employees');
    fireEvent.click(screen.getByRole('button', { name: 'نماذج الموظف' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /طلب إجازة/ }));

    // تنقّل تلقائي داخل مركز النماذج ينتهي بشاشة المعاينة.
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('/forms/leave-request/5?printMode=plain-a4');
    });

    fireEvent.click(screen.getByRole('button', { name: 'رجوع ›' }));

    // العبور عبر ?employee=5&form=leave-request استُبدل في السجل، فلا يظهر إطلاقًا.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'نماذج الموظف' })).toBeInTheDocument();
    });
  });

  it('وصول مباشر برابط عميق للمعاينة: زر الرجوع لا يزال يستخدم history.back الأصلي بلا تغيير', () => {
    const formLayoutCode = code(readFileSync('src/forms/shared/FormLayout.tsx', 'utf8'));
    expect(formLayoutCode).toContain("onClick={() => navigate(-1)}");
  });

  it('النقر اليدوي على بطاقة داخل مركز النماذج نفسه (بلا Smart Forms Hub) يبقى push — الرجوع يعيد إلى مركز النماذج', async () => {
    render(
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/forms?employee=5']}>
        <Routes>
          <Route path="/forms" element={<Forms />} />
          <Route path="/forms/:route/:employeeId" element={<PreviewStandIn />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => {
      const select = screen.getByLabelText('اختر الموظف (مشترك لجميع النماذج) *') as HTMLSelectElement;
      expect(select.value).toBe('5');
    });
    fireEvent.click(screen.getAllByRole('button', { name: 'فتح' })[0]);
    await waitFor(() => expect(screen.getByTestId('probe')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'رجوع ›' }));

    // يعود إلى مركز النماذج نفسه (وليس أبعد) — سلوك يدوي لم يتغيّر.
    await waitFor(() => {
      expect(screen.getByLabelText('اختر الموظف (مشترك لجميع النماذج) *')).toBeInTheDocument();
    });
  });
});

// ── حاجز رجعي: لا مفتاح ترجمة خام يظهر أبدًا — لا في القائمة ولا في مركز النماذج ──
// (Forms Registry Translation Audit v1) يكمّل formsRegistryTranslationAudit.test.ts
// (الذي يفحص القاموس/المصدر) بفحص العرض الفعلي: لو أُضيف نموذج جديد بمفتاح ناقص،
// هذا الحاجز يفشل فورًا بدل أن يظهر "page.xxx.title" حرفيًا للمستخدم.
const RAW_KEY_PATTERN = /\b(?:page|voucher)\.[a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_.]*\b/;

describe('حاجز رجعي — لا مفتاح ترجمة خام في أي مكان', () => {
  it('قائمة «نماذج الموظف»: كل بند مترجَم فعليًا، بلا استثناء', () => {
    const { container } = render(
      <MemoryRouter future={ROUTER_FUTURE}>
        <EmployeeFormsMenu employeeId={5} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'نماذج الموظف' }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem')).toHaveLength(EMPLOYEE_FORM_CARDS.length);
    expect(container.textContent).not.toMatch(RAW_KEY_PATTERN);
  });

  it('مركز النماذج: كل بطاقة (Hr وOps) مترجَمة فعليًا، بلا استثناء', async () => {
    const { container } = renderFormsWithRouter('/forms');
    await waitFor(() => {
      expect(screen.getByText(/سارة العتيبي/)).toBeInTheDocument();
    });
    // كل بطاقات FORM_CARDS ظاهرة (لا فلترة نشطة) — الفحص يغطّي التسجيل كاملاً.
    expect(screen.getAllByText((_, el) => el?.className === 'fmx-card-title-ar')).toHaveLength(FORM_CARDS.length);
    expect(container.textContent).not.toMatch(RAW_KEY_PATTERN);
  });
});

// ── قائمة قوالب الطباعة في كل بطاقة: مشتقة من PRINT_PROFILES المركزي (ready-paper) ──
// كل نموذج قابل للاختيار (selectable) في PRINT_PROFILES يظهر تلقائيًا هنا كخيار —
// بلا أي قائمة مستقلة مكرَّرة (لا PrintMode ولا PRINT_MODE_LABELS بعد الآن).
describe('مركز النماذج — قائمة قوالب الطباعة مشتقة من PRINT_PROFILES', () => {
  it('البطاقة (غير عقد العمل) تعرض بالضبط خيارات PRINT_PROFILES القابلة للاختيار الثلاثة', async () => {
    renderFormsWithRouter('/forms?employee=5');
    await waitFor(() => {
      expect(screen.getByLabelText('اختر الموظف (مشترك لجميع النماذج) *')).toBeInTheDocument();
    });
    const select = document.getElementById('mode-leave-request') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(values).toEqual(SELECTABLE_PROFILE_IDS);
    expect(labels).toEqual(SELECTABLE_PROFILE_IDS.map((id) => PRINT_PROFILES[id].labelAr));
    expect(labels).toEqual(['A4 عادي', 'ورق الشركة الرسمي', 'ورق جاهز']);
  });

  it('اختيار «ورق جاهز» يمرَّر profile=ready-paper عبر نفس مسار ?printMode المستخدَم للقوالب الأخرى', async () => {
    renderFormsWithRouter('/forms?employee=5');
    await waitFor(() => {
      expect(screen.getByLabelText('اختر الموظف (مشترك لجميع النماذج) *')).toBeInTheDocument();
    });
    const select = document.getElementById('mode-leave-request') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'ready-paper' } });
    const card = select.closest('.fmx-card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'فتح' }));
    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('/forms/leave-request/5?printMode=ready-paper');
    });
  });

  it('عقد العمل يبقى بلا قائمة قوالب طباعة في مركز النماذج (مستثنى كما كان قبل «ورق جاهز»)', async () => {
    renderFormsWithRouter('/forms?employee=5');
    await waitFor(() => {
      expect(screen.getByLabelText('اختر الموظف (مشترك لجميع النماذج) *')).toBeInTheDocument();
    });
    expect(document.getElementById('mode-employment-contract')).toBeNull();
  });
});
