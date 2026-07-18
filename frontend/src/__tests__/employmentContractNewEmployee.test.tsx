// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import EmploymentContract from '../pages/EmploymentContract';
import { api } from '../api/client';

/**
 * عقد العمل — «موظف جديد» (إدخال يدوي للطباعة فقط).
 *
 * الميزة كانت **منفَّذة بالكامل** لكنها **غير قابلة للوصول**: مركز النماذج كان يعتبر
 * الموظف إلزاميًا لبطاقة عقد العمل، فيُعطّل الزر حتى يُختار موظف، ثم يفتح الشاشة
 * بمعرّف موظف — والشاشة تتخطّى مُحدِّد النمط كلما وصلها معرّف. فلم يكن هناك أي طريق
 * إلى الخيار.
 *
 * الإصلاح في **مدخل الشاشة وحده**: الموظف صار اختياريًا لهذه البطاقة، فبلا اختيار
 * تُفتح الشاشة بلا معرّف ⇒ يظهر المُحدِّد بخياريه.
 */

const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');

const formsCode = code(readFileSync('src/pages/Forms.tsx', 'utf8'));
const contractCode = code(readFileSync('src/pages/EmploymentContract.tsx', 'utf8'));

let post: ReturnType<typeof vi.fn>;
let put: ReturnType<typeof vi.fn>;
let get: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  // إعدادات الشركة فقط — لا شيء آخر يُجلب في مسار «موظف جديد».
  get = vi.fn(async (url: string) =>
    url === '/settings' ? { data: { data: {} } } : { data: { data: null } },
  );
  post = vi.fn(async () => ({ data: { data: {} } }));
  put = vi.fn(async () => ({ data: { data: {} } }));
  vi.spyOn(api, 'get').mockImplementation(get as never);
  vi.spyOn(api, 'post').mockImplementation(post as never);
  vi.spyOn(api, 'put').mockImplementation(put as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** الشاشة بلا معرّف موظف — هكذا يفتحها مركز النماذج حين لا يُختار موظف. */
function openScreen() {
  render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/forms/employment-contract']}>
      <EmploymentContract />
    </MemoryRouter>,
  );
}

/** ملء نموذج الإدخال اليدوي: الاسم والراتب مطلوبان. */
function fillManual(name = 'أحمد المنصور', salary = '850') {
  fireEvent.click(screen.getByText('موظف جديد — إدخال يدوي'));
  const inputs = document.querySelectorAll('input');
  fireEvent.change(inputs[0], { target: { value: name } }); // الاسم بالعربي
  const salaryInput = [...inputs].find((i) => i.getAttribute('type') === 'number') ?? inputs[1];
  fireEvent.change(salaryInput, { target: { value: salary } });
}

// ── المدخل: الخيار ظاهر ─────────────────────────────────────────────────────────
describe('الوصول إلى الخيار', () => {
  it('مركز النماذج: بطاقة عقد العمل لا تُعطَّل بغياب اختيار موظف', () => {
    expect(formsCode).toContain('employeeOptional: true');
    expect(formsCode).toContain('const disabled = needsEmployee && !card.employeeOptional && !selectedId;');
    // وبلا اختيار تُفتح الشاشة **بلا معرّف** ⇒ يظهر المُحدِّد.
    expect(formsCode).toContain('if (card.employeeOptional && !selectedId) {');
    expect(formsCode).toContain('navigate(`/forms/${card.route}`);');
  });

  it('مسار الموظف المختار لم يتغيّر: يُفتح بالمعرّف وبنفس printMode', () => {
    expect(formsCode).toContain('navigate(`/forms/${card.route}/${selectedId}?printMode=${printModes[card.key]}`);');
  });

  it('الشاشة تعرض الخيارين حين تُفتح بلا معرّف', async () => {
    openScreen();
    await waitFor(() => expect(screen.getByText('موظف جديد — إدخال يدوي')).toBeInTheDocument());
    expect(screen.getByText('موظف موجود في النظام')).toBeInTheDocument();
  });

  it('مع معرّف موظف تتخطّى الشاشة المُحدِّد كما كانت (السلوك القديم)', () => {
    expect(contractCode).toContain("useState<Mode>(employeeId ? 'params' : 'selector')");
  });
});

// ── الإدخال اليدوي ──────────────────────────────────────────────────────────────
describe('«موظف جديد» — إدخال يدوي للطباعة فقط', () => {
  it('يظهر حقل الاسم، ولا تُجلب قائمة موظفين', async () => {
    openScreen();
    await waitFor(() => screen.getByText('موظف جديد — إدخال يدوي'));
    fireEvent.click(screen.getByText('موظف جديد — إدخال يدوي'));
    expect(document.querySelectorAll('input').length).toBeGreaterThan(0);
    // لا استعلام موظفين — البيانات يدوية بالكامل.
    expect(get.mock.calls.every(([url]) => !String(url).startsWith('/employees'))).toBe(true);
  });

  it('لا يُنشئ سجل موظف: لا POST ولا PUT إطلاقًا', async () => {
    openScreen();
    await waitFor(() => screen.getByText('موظف جديد — إدخال يدوي'));
    fillManual();
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    // ولا استدعاء لأي مسار موظفين.
    for (const [url] of get.mock.calls) expect(String(url)).not.toContain('/employees');
  });

  it('الموظف اليدوي معزول: id = 0 ولا معرّف وهمي', () => {
    // مصدر الموظف اليدوي الوحيد — بلا معرّف حقيقي.
    expect(contractCode).toMatch(/onComplete\(\{\s*id:\s*0,/);
    expect(contractCode).toContain("code: 'جديد'");
    // ولا يوجد أي إنشاء موظف في الشاشة.
    expect(contractCode).not.toMatch(/api\.post\(['"`]\/employees/);
    expect(contractCode).not.toMatch(/api\.put\(['"`]\/employees/);
  });

  it('التبديل بين النمطين معزول: لا يبقى معرّف قديم ولا اسم يدوي عالق', () => {
    // كل نمط يبني الموظف من مصدره وحده ويستبدل الحالة كاملة.
    expect(contractCode).toContain('onComplete={emp => { setEmployee(emp); setMode(\'params\'); }}');
    expect(contractCode).toContain('onFound={emp => { setEmployee(emp); setMode(\'params\'); }}');
    // والرجوع يفرّق بين المسارين حسب id === 0.
    expect(contractCode).toContain("setMode(employee.id === 0 ? 'new-form' : 'existing-lookup')");
  });
});

// ── الطباعة والمعاينة ───────────────────────────────────────────────────────────
describe('الطباعة والمعاينة — بلا تغيير', () => {
  it('الطباعة تمرّ بـ handlePrint القديمة نفسها', () => {
    expect(contractCode).toContain('preview.printIntercept({ proceed: handlePrint, node: printRootRef.current })');
    const block = contractCode.slice(contractCode.indexOf('function handlePrint()'));
    expect(block).toContain("saveDraft('employment-contract'");
    expect(block).toContain('addPrintLog({');
    expect(block).toContain('printCurrentView();');
  });

  it('سجلّ الطباعة يحمل الاسم لا معرّفًا — ولا يمسّ قاعدة البيانات', () => {
    const start = contractCode.indexOf('function handlePrint()');
    const block = contractCode.slice(start, contractCode.indexOf('function restoreLastDraft()', start));
    expect(block).toContain('employeeName: employee.fullName'); // الاسم اليدوي يمرّ كما هو
    expect(block).not.toContain('employeeId');
    const store = readFileSync('src/stores/printLogStore.ts', 'utf8');
    expect(store).not.toContain('api.'); // متجر محلي بحت
  });

  it('المسودّة محلية وتستعيد الموظف اليدوي كما هو', () => {
    expect(contractCode).toContain("saveDraft('employment-contract', { employee, params, profile })");
    expect(contractCode).toContain('function restoreLastDraft()');
    const store = readFileSync('src/stores/printDraftStore.ts', 'utf8');
    expect(store).not.toContain('api.'); // لا تصل قاعدة البيانات
  });

  it('القالب يقرأ الاسم من كائن الموظف نفسه — لا مسار ثانٍ', () => {
    expect(contractCode).toContain('<EmploymentContractTemplate employee={employee} params={params} profile={profile} formNumber={formNumber} />');
    // القالب يقرأ الاسم من الكائن نفسه (عربي وإنجليزي) — لا مصدر ثانٍ للاسم.
    const tpl = readFileSync('src/forms/EmploymentContractTemplate.tsx', 'utf8');
    expect(tpl).toContain('emp.fullName');
    expect(tpl).toContain('emp.fullNameEn ?? emp.fullName');
  });

  it('معاينة Phase 2 والعرض المتصل بلا تغيير', () => {
    expect(contractCode).toContain('useLegacyFormPreview({');
    expect(contractCode).toContain('PRINT_PREVIEW_LEGACY_FORMS_SPECIAL');
    const dlg = readFileSync('src/printing/components/PrintPreviewDialog.tsx', 'utf8');
    expect(dlg).toContain('عرض متصل — التقسيم النهائي يحدده الطابع');
    const hook = readFileSync('src/printing/useLegacyFormPreview.tsx', 'utf8');
    expect(hook).toContain('proceedRef.current?.()'); // لم يُمسّ
  });
});

// ── الانحدار ────────────────────────────────────────────────────────────────────
describe('الانحدار — لا شيء خارج المدخل تغيّر', () => {
  it('بقية بطاقات النماذج بسلوكها القديم', () => {
    expect(formsCode).toContain("{ key: 'quotation'"); // requiresEmployee: false كما هو
    expect(formsCode).toContain('if (card.requiresEmployee === false) {');
    // والموظف الاختياري محصور ببطاقة واحدة.
    expect((formsCode.match(/employeeOptional: true/g) ?? []).length).toBe(1);
  });

  it('لا Backend ولا Database ولا Payroll: الشاشة لا تكتب شيئًا', () => {
    expect(contractCode).not.toContain('api.post');
    expect(contractCode).not.toContain('api.put');
    expect(contractCode).not.toContain('api.delete');
    expect(contractCode).not.toContain('payroll');
    expect(contractCode).not.toContain('attendance');
  });

  it('الفاتورة وعرض السعر وقسيمة الراتب بلا مساس', () => {
    expect(code(readFileSync('src/pages/InvoicePreview.tsx', 'utf8'))).toContain('compose={composeInvoicePreview}');
    expect(code(readFileSync('src/pages/Quotation.tsx', 'utf8'))).toContain('onPrint={runLegacyPrint}');
    expect(code(readFileSync('src/pages/PayrollPayslip.tsx', 'utf8'))).toContain('intercept({ proceed: printCurrentView, node: printRootRef.current })');
  });
});

// ── غلاف شاشة الاختيار (UX) ─────────────────────────────────────────────────────
describe('شاشة اختيار نوع الموظف — الغلاف البصري', () => {
  it('زر «الرجوع إلى مركز النماذج» ظاهر ويوجّه إلى /forms صراحةً', async () => {
    openScreen();
    await waitFor(() => screen.getByText('موظف جديد — إدخال يدوي'));
    expect(screen.getByRole('button', { name: /الرجوع إلى مركز النماذج/ })).toBeInTheDocument();
    // مسار صريح — لا navigate(-1) الذي قد يعيد المستخدم إلى مكان غير متوقع.
    expect(contractCode).toContain("onBackToForms={() => navigate('/forms')}");
    const selector = contractCode.slice(
      contractCode.indexOf('function ModeSelector('),
      contractCode.indexOf('function ExistingEmployeeLookup('),
    );
    expect(selector).not.toContain('navigate(-1)');
  });

  it('الرأس: العنوان والوصف المعتمدان', async () => {
    openScreen();
    await waitFor(() => screen.getByText('عقد العمل'));
    expect(screen.getByText('اختر طريقة إدخال بيانات الموظف')).toBeInTheDocument();
  });

  it('التنبيه صريح داخل بطاقة الإدخال اليدوي', async () => {
    openScreen();
    await waitFor(() => screen.getByText('موظف جديد — إدخال يدوي'));
    expect(screen.getByText(/لن يتم إنشاء سجل موظف في النظام/)).toBeInTheDocument();
  });

  it('البطاقتان قابلتان للنقر بالكامل ومتاحتان بلوحة المفاتيح', async () => {
    openScreen();
    await waitFor(() => screen.getByText('موظف جديد — إدخال يدوي'));
    const cards = [...document.querySelectorAll('.ecx-card')] as HTMLButtonElement[];
    expect(cards).toHaveLength(2);
    for (const c of cards) expect(c.tagName).toBe('BUTTON'); // بؤرة ولوحة مفاتيح مجّانًا
    const selector = contractCode.slice(
      contractCode.indexOf('function ModeSelector('),
      contractCode.indexOf('function ExistingEmployeeLookup('),
    );
    expect(selector).toContain('.ecx-card:focus-visible');
    expect(selector).toContain('.ecx-card:hover');
    expect(selector).toContain('max-width: 860px');       // حاوية مركزية، لا فراغ مفرط
    expect(selector).toContain('align-items: stretch');   // بطاقتان متساويتا الارتفاع
    expect(selector).not.toContain('gradient');           // بلا زخرفة
    expect(selector).not.toContain('backdrop-filter');
  });

  it('النقر على البطاقتين ينقل إلى مسارَيهما القديمين', async () => {
    openScreen();
    await waitFor(() => screen.getByText('موظف جديد — إدخال يدوي'));
    fireEvent.click(screen.getByText('موظف موجود في النظام'));
    await waitFor(() => expect(screen.queryByText('موظف جديد — إدخال يدوي')).toBeNull());
    expect(post).not.toHaveBeenCalled(); // ولا كتابة في أي مسار
  });

  it('زر الرجوع خارج المستند المطبوع — لا يظهر في القالب ولا في الجذر المطبوع', () => {
    const tpl = readFileSync('src/forms/EmploymentContractTemplate.tsx', 'utf8');
    expect(tpl).not.toContain('مركز النماذج');
    // الزر يعيش في شاشة الاختيار وحدها؛ الجذر المطبوع (printRootRef) يخصّ وضع المعاينة.
    const preview = contractCode.slice(contractCode.indexOf("if (mode === 'preview'"));
    expect(preview).not.toContain('مركز النماذج');
  });
});
