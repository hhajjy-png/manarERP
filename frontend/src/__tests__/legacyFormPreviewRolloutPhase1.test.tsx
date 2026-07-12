// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import FormLayout from '../forms/shared/FormLayout';
import {
  useLegacyFormPreview,
  isLegacyFormsPreviewEnabled,
  setFlagOverride,
  PRINT_PREVIEW_LEGACY_FORMS_V1,
  PRINT_PREVIEW_LEGACY_FORMS_FINANCE,
  PRINT_PREVIEW_LEGACY_FORMS_HR,
} from '../printing';

/**
 * Universal Legacy Print Preview Overlay — Phase 1.
 *
 * نفس نمط Quotation، مستخرَجًا في خطّاف مشترك. المعاينة **طبقة عرض**: تفتح، تعرض،
 * ثم تفوّض إلى `FormLayout.doPrint` — المنفّذ الوحيد للطباعة، بلا تعديل.
 *
 * الاختبارات سلوكية حيث أمكن: تُصيّر `FormLayout` فعليًا وتعدّ ما يصل جسر preload.
 */

const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');

const flCode = code(readFileSync('src/forms/shared/FormLayout.tsx', 'utf8'));
const hookCode = code(readFileSync('src/printing/useLegacyFormPreview.tsx', 'utf8'));

/** النماذج العشرة التي شملتها Phase 1 (ومجموعة العلم لكل منها). */
const PHASE1 = [
  ['EmployeeWarning', 'HR'],
  ['LeaveRequest', 'HR'],
  ['PerformanceEvaluation', 'HR'],
  ['Resignation', 'HR'],
  ['ReturnToWork', 'HR'],
  ['SalaryAdvance', 'HR'],
  ['SalaryCertificate', 'HR'],
  ['ToWhomItMayConcern', 'HR'],
  ['PaymentVoucher', 'FINANCE'],
  ['PurchaseRequest', 'FINANCE'],
] as const;

/**
 * الشاشات التي تبقى **خارج** جسر النماذج القديمة.
 * (عقد العمل وقسيمة الراتب تخرّجا في Phase 2 عبر المِحوَل الصغير — انظر
 * `legacyFormPreviewRolloutPhase2.test.tsx`؛ لذلك لم يعودا هنا.)
 */
const DEFERRED = ['Cheques', 'ReportPrint', 'BankReconciliation', 'BankSalaryAnalytics'] as const;

type PrintJobLike = { docType: string; copies: number; destination: string; documentId?: string };

let printSubmit: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // عدد النسخ يُحفظ لكل نوع مستند (سلوك قائم في FormLayout) — نعزله بين الاختبارات
  // حتى لا يتسرّب اختيار اختبارٍ إلى الذي يليه.
  localStorage.clear();
  printSubmit = vi.fn(async (_job: PrintJobLike) => ({ status: 'printed' as const }));
  (window as unknown as { manar: unknown }).manar = { printSubmit };
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { manar?: unknown }).manar;
  setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, null);
  setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, null);
  setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_FINANCE, null);
  vi.restoreAllMocks();
});

/** نموذج تجريبي يستخدم نفس الخطّاف ونفس FormLayout الحقيقيين. */
function Harness({
  group,
  ready = false,
}: {
  group: typeof PRINT_PREVIEW_LEGACY_FORMS_HR | typeof PRINT_PREVIEW_LEGACY_FORMS_FINANCE;
  /** ثمانية نماذج تطبع تلقائيًا عند الجاهزية — هذا هو المسار الذي كان يتجاوز المعاينة. */
  ready?: boolean;
}) {
  const preview = useLegacyFormPreview({
    enabled: isLegacyFormsPreviewEnabled(group),
    title: 'شهادة راتب',
    documentLabel: 'شهادة راتب · F-1',
    lang: 'ar',
  });
  return (
    <MemoryRouter>
      {preview.dialog}
      <FormLayout
        formType="salary-certificate"
        lang="ar"
        ready={ready}
        formNumber="F-2026-001"
        title="شهادة راتب"
        profile="plain-a4"
        qrData={{ formType: 'salary-certificate', formNumber: 'F-1' } as never}
        printIntercept={preview.printIntercept}
      >
        <div>محتوى النموذج</div>
      </FormLayout>
    </MemoryRouter>
  );
}

const printBtn = () =>
  screen.getAllByRole('button').find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === '🖨️ طباعة')!;
const dialogOpen = () => document.querySelector('.pc-scrim') !== null;
/** أزرار **شريط المعاينة** تحديدًا — شاشة العمل (PrintWorkspace) لها أيضًا أزرار تكبير. */
const pcBtn = (label: string) =>
  [...document.querySelectorAll('.pc-toolbar button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').includes(label),
  ) as HTMLButtonElement;
const previewPrintBtn = () => pcBtn('طباعة');
const pcSelect = () => document.querySelector('.pc-toolbar select') as HTMLSelectElement;

// ── الأعلام ─────────────────────────────────────────────────────────────────────
describe('الأعلام', () => {
  it('الثلاثة مطفأة افتراضيًا — لا سلوك افتراضي يتغيّر', () => {
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(false);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_FINANCE)).toBe(false);
  });

  it('العلم الرئيسي وحده لا يفعّل شيئًا، والمجموعة وحدها كذلك', () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, true);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(false); // الرئيسي فقط
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, false);
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, true);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(false); // المجموعة فقط
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, true);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(true); // الاثنان
  });

  it('المجموعتان مستقلتان — تفعيل تدريجي حقيقي', () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, true);
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, true);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(true);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_FINANCE)).toBe(false);
  });
});

// ── العلم OFF ───────────────────────────────────────────────────────────────────
describe('العلم OFF — الطباعة القديمة كما هي', () => {
  it('لا حوار، ولا اعتراض أصلًا (printIntercept = undefined)', () => {
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} />);
    expect(dialogOpen()).toBe(false);
    fireEvent.click(printBtn());
    expect(dialogOpen()).toBe(false); // لم يُفتح شيء
  });

  it('الزر يستدعي مسار الطباعة القديم مباشرة', async () => {
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} />);
    fireEvent.click(printBtn());
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(printSubmit.mock.calls[0][0].docType).toBe('form');
  });
});

// ── العلم ON ────────────────────────────────────────────────────────────────────
describe('العلم ON — المعاينة تفتح ولا تطبع', () => {
  beforeEach(() => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, true);
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, true);
  });

  it('الضغط على «طباعة» يفتح المعاينة ولا يبدأ طباعة', () => {
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} />);
    fireEvent.click(printBtn());
    expect(dialogOpen()).toBe(true);
    expect(printSubmit).not.toHaveBeenCalled(); // ← لا طباعة عند الفتح
  });

  it('المعاينة تُبنى من العقدة المطبوعة نفسها (.form-page) لا من عقدة تجميلية', () => {
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} />);
    fireEvent.click(printBtn());
    const html = document.querySelector('.pc-frame')!.getAttribute('srcdoc')!;
    expect(html).toContain('form-page');
    expect(html).toContain('data-print-root'); // مرساة المستند المُركَّب
    expect(html).toContain('محتوى النموذج'); // المحتوى الحالي على الشاشة
    expect(html).not.toContain('pw-toolbar'); // بلا قشرة شاشة العمل
  });

  it('«طباعة» داخل المعاينة تنفّذ doPrint القديم مرة واحدة، بنفس الإعدادات', async () => {
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} />);
    fireEvent.click(printBtn());
    fireEvent.click(previewPrintBtn());
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const job = printSubmit.mock.calls[0][0];
    expect(job.docType).toBe('form');
    expect(job.destination).toBe('printer');
    expect(job.copies).toBe(1);
    expect(job.documentId).toBe('F-2026-001'); // نفس هوية المستند القديمة
  });

  it('عدد النسخ يبقى ملك FormLayout — المعاينة لا تعرفه ولا تغيّره', async () => {
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} />);
    const plus = screen.getAllByLabelText('نسخة أكثر')[0];
    fireEvent.click(plus);
    fireEvent.click(plus); // 3 نسخ
    fireEvent.click(printBtn());
    fireEvent.click(previewPrintBtn());
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(printSubmit.mock.calls[0][0].copies).toBe(3); // نداء واحد بثلاث نسخ
  });

  it('الإغلاق لا يطبع', () => {
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} />);
    fireEvent.click(printBtn());
    fireEvent.click(pcBtn('إغلاق'));
    expect(printSubmit).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(false);
  });

  it('النقر المزدوج داخل المعاينة ينفّذ عملية واحدة فقط', async () => {
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} />);
    fireEvent.click(printBtn());
    const btn = previewPrintBtn();
    fireEvent.click(btn);
    fireEvent.click(btn);
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(printSubmit).toHaveBeenCalledTimes(1);
  });

  it('التكبير لا يمسّ الطباعة: نفس النسخ ونفس الإعدادات بعد تغيير النسبة', async () => {
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} />);
    fireEvent.click(printBtn());
    fireEvent.change(pcSelect(), { target: { value: '0.25' } });
    fireEvent.click(pcBtn('ملاءمة الصفحة'));
    fireEvent.click(previewPrintBtn());
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const job = printSubmit.mock.calls[0][0];
    expect(job.copies).toBe(1);
    expect(job.docType).toBe('form');
  });
});

// ── عقد الجسر ───────────────────────────────────────────────────────────────────
describe('عقد الجسر — الطباعة القديمة هي المنفّذ الوحيد', () => {
  it('proceed هو doPrint نفسه — لا نسخة منه ولا تغليف', () => {
    expect(flCode).toContain('printIntercept({ proceed: doPrint, node: formPageRef.current })');
    expect(hookCode).toContain('proceedRef.current = proceed');
    expect(hookCode).toContain('proceedRef.current?.()');
  });

  it('الخطّاف لا يعرف الطباعة: لا IPC ولا نسخ ولا PrintJob', () => {
    for (const banned of ['submitPrintJob', 'createPrintJob', 'waitForPrintReady', 'window.manar', 'copies', 'printCurrentView']) {
      expect(hookCode).not.toContain(banned);
    }
  });

  it('doPrint لم يتغيّر، ولا مسار طباعة ثانٍ في FormLayout', () => {
    expect(flCode).toContain('if (!isFlagEnabled(PRINT_CENTER_FOUNDATION_V1))');
    expect(flCode).toContain('waitForPrintReady()');
    expect(flCode).toMatch(/copies:\s*count/);
    expect((flCode.match(/submitPrintJob\(/g) ?? []).length).toBe(1);
  });

  it('مُركِّب واحد مشترك — لا مُركِّب لكل نموذج', () => {
    expect(hookCode).toContain('composeStyledFromNode({');
    for (const [form] of PHASE1) {
      const src = code(readFileSync(`src/pages/${form}.tsx`, 'utf8'));
      expect(src).not.toContain('composeStyledFromNode'); // لا أحد يبني مستنده بنفسه
      expect(src).toContain('useLegacyFormPreview({');
      expect(src).toContain('printIntercept={preview.printIntercept}');
      expect(src).toContain('{preview.dialog}');
    }
  });

  it('كل نموذج من Phase 1 مربوط بمجموعة علمه الصحيحة', () => {
    for (const [form, group] of PHASE1) {
      const src = code(readFileSync(`src/pages/${form}.tsx`, 'utf8'));
      expect(src).toContain(`isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_${group})`);
    }
  });
});

// ── الانحدار ────────────────────────────────────────────────────────────────────
describe('الانحدار — لا شيء خارج النطاق تغيّر', () => {
  it('النماذج المؤجَّلة لم تُمسّ: تطبع مباشرة كما كانت', () => {
    for (const page of DEFERRED) {
      const src = readFileSync(`src/pages/${page}.tsx`, 'utf8');
      expect(src).not.toContain('useLegacyFormPreview');
      expect(src).not.toContain('printIntercept');
    }
  });

  it('الفاتورة وعرض السعر يعملان كما كانا (لكلٍّ جسره الخاص المُصدَر)', () => {
    const inv = code(readFileSync('src/pages/InvoicePreview.tsx', 'utf8'));
    expect(inv).toContain('compose={composeInvoicePreview}');
    expect(inv).not.toContain('useLegacyFormPreview');
    const q = code(readFileSync('src/pages/Quotation.tsx', 'utf8'));
    expect(q).toContain('legacyPrintRef.current = proceed'); // جسره كما هو
    expect(q).toContain('onPrint={() => printCurrentView()}'); // Engine Mode كما هو
    expect(q).not.toContain('useLegacyFormPreview'); // لم يُرحَّل — لا refactor
  });

  it('سند القبض على مساره (Phase 2) بلا تغيير', () => {
    const rv = code(readFileSync('src/pages/ReceiptVoucher.tsx', 'utf8'));
    expect(rv).toContain('PRINT_CENTER_PHASE2_RECEIPT_VOUCHER');
    expect(rv).not.toContain('useLegacyFormPreview');
  });

  it('تصدير PDF وElectron خارج النطاق تمامًا', () => {
    expect(flCode).toContain('window.manar?.exportPdfFromHtml');
    expect(flCode).toContain('buildFormPdfDocument');
    expect(hookCode).not.toContain('exportPdf');
    const preload = readFileSync('../electron/preload.ts', 'utf8');
    expect(preload).toContain("ipcRenderer.invoke('print:submit'");
    expect(preload).not.toContain('LEGACY_FORMS');
  });
});

// ── الطباعة التلقائية عند فتح النموذج ───────────────────────────────────────────
describe('auto-print عند الجاهزية', () => {
  it('العلم OFF: تطبع مباشرة كما كانت — ولا تظهر معاينة', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} ready />);
    // المسار القديم للطباعة التلقائية هو printCurrentView() ⇒ window.print().
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(dialogOpen()).toBe(false);
    printSpy.mockRestore();
  });

  it('العلم ON: تفتح المعاينة تلقائيًا — ولا حوار طباعة ولا printSubmit', async () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, true);
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, true);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} ready />);
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });

    // ← جوهر العطل: لم يعد حوار Electron يظهر فوق المعاينة.
    expect(printSpy).not.toHaveBeenCalled();
    expect(printSubmit).not.toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('العلم ON: «طباعة» داخل المعاينة تفوّض إلى doPrint مرة واحدة بنفس الإعدادات', async () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, true);
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, true);
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} ready />);
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });

    fireEvent.click(previewPrintBtn());
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    const job = printSubmit.mock.calls[0][0];
    expect(job.docType).toBe('form');
    expect(job.documentId).toBe('F-2026-001');
    expect(job.copies).toBe(1);
  });

  it('العلم ON: الإغلاق لا يطبع', async () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, true);
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, true);
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} ready />);
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });
    fireEvent.click(pcBtn('إغلاق'));
    expect(dialogOpen()).toBe(false);
    expect(printSubmit).not.toHaveBeenCalled();
  });

  it('تزامن auto-print مع نقرة يدوية: نافذة واحدة وطباعة واحدة', async () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, true);
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, true);
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_HR} ready />);
    await waitFor(() => expect(dialogOpen()).toBe(true), { timeout: 4000 });

    fireEvent.click(printBtn()); // نقرة يدوية والمعاينة مفتوحة أصلًا
    expect(document.querySelectorAll('.pc-scrim')).toHaveLength(1); // نافذة واحدة

    fireEvent.click(previewPrintBtn());
    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(printSubmit).toHaveBeenCalledTimes(1); // عملية واحدة، بلا نداء مكرر
  });

  it('النماذج بلا auto-print (ready=false) لم يتغيّر سلوكها', async () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, true);
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_FINANCE, true);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<Harness group={PRINT_PREVIEW_LEGACY_FORMS_FINANCE} />);
    await new Promise((r) => setTimeout(r, 300));
    expect(dialogOpen()).toBe(false); // لا معاينة تلقائية
    expect(printSpy).not.toHaveBeenCalled(); // ولا طباعة تلقائية
    printSpy.mockRestore();
  });

  it('auto-print يعيد استخدام نفس الاعتراض — لا بوابة ثانية ولا نسخة من doPrint', () => {
    expect(flCode).toContain('intercept({ proceed: doPrint, node: formPageRef.current })');
    expect(flCode).toContain('printCurrentView();'); // المسار القديم باقٍ حين لا اعتراض
    expect((flCode.match(/waitForPrintReady\(\)/g) ?? []).length).toBe(1); // دورة جاهزية واحدة
    expect((flCode.match(/submitPrintJob\(/g) ?? []).length).toBe(1); // منفّذ طباعة واحد
  });
});
