// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { flushAsyncUpdates } from './helpers/flush';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import {
  useLegacyFormPreview,
  isLegacyFormsPreviewEnabled,
  isPhase2Enabled,
  setFlagOverride,
  PRINT_PREVIEW_LEGACY_FORMS_V1,
  PRINT_PREVIEW_LEGACY_FORMS_SPECIAL,
  PRINT_PREVIEW_LEGACY_FORMS_HR,
  PRINT_PREVIEW_LEGACY_FORMS_FINANCE,
  PRINT_CENTER_PHASE2,
  PRINT_CENTER_PHASE2_RECEIPT_VOUCHER,
} from '../printing';
import { printCurrentView } from '../utils/print';

/**
 * Legacy Print Preview Overlay — Phase 2.
 *
 * النموذجان هنا **لا يستخدمان FormLayout**، فدالة الطباعة القديمة فيهما ليست
 * `doPrint` بل:
 *   قسيمة الراتب → `printCurrentView` (زر + طباعة تلقائية عند الجاهزية)
 *   عقد العمل    → `handlePrint` (تحفظ مسودّة وتسجّل الطباعة ثم تستدعي printCurrentView)
 *
 * المِحوَل يمرّر تلك الدالة نفسها كـ `proceed`. المعاينة تفتح، تعرض، ثم تفوّض — ولا تطبع.
 */

const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');

const payslipCode = code(readFileSync('src/pages/PayrollPayslip.tsx', 'utf8'));
const contractCode = code(readFileSync('src/pages/EmploymentContract.tsx', 'utf8'));
const rvCode = code(readFileSync('src/pages/ReceiptVoucher.tsx', 'utf8'));
const hookCode = code(readFileSync('src/printing/useLegacyFormPreview.tsx', 'utf8'));

let printSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  localStorage.clear();
  // `capturePrintStyles` يرفض — بحق — بناء مستند بلا أنماط. الشاشتان الحقيقيتان تحملان
  // أنماطهما؛ هنا نوفّر ورقة أنماط حقيقية للمنصّة.
  const style = document.createElement('style');
  style.id = 'test-styles';
  style.textContent = '@page { size: A4; margin: 12mm; } .no-print { display: none; }';
  document.head.appendChild(style);
  printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  document.getElementById('test-styles')?.remove();
  setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, null);
  setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL, null);
  vi.restoreAllMocks();
});

const on = () => {
  setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, true);
  setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL, true);
};

/**
 * نموذج تجريبي يحاكي **بنية** الشاشتين: خطّاف مشترك + مِحوَل يمرّر دالة الطباعة القديمة،
 * مع مسار طباعة تلقائية اختياري — تمامًا كقسيمة الراتب.
 */
function Harness({ legacyPrint, auto = false }: { legacyPrint: () => void; auto?: boolean }) {
  const preview = useLegacyFormPreview({
    enabled: isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL),
    title: 'مستند',
    documentLabel: 'مستند · X-1',
  });
  const rootRef = { current: null } as { current: HTMLDivElement | null };
  const request = () => {
    if (preview.printIntercept) {
      preview.printIntercept({ proceed: legacyPrint, node: rootRef.current });
      return;
    }
    legacyPrint();
  };
  return (
    <MemoryRouter future={ROUTER_FUTURE}>
      {preview.dialog}
      <div
        ref={(el) => {
          rootRef.current = el;
        }}
      >
        <button className="no-print" onClick={request}>
          طباعة
        </button>
        <p>محتوى المستند الحالي</p>
        {auto && <AutoPrint request={request} />}
      </div>
    </MemoryRouter>
  );
}

function AutoPrint({ request }: { request: () => void }) {
  const fired = { current: false };
  if (!fired.current) {
    fired.current = true;
    queueMicrotask(request); // يحاكي waitForPrintReady().then(request)
  }
  return null;
}

const dialogOpen = () => document.querySelector('.pc-scrim') !== null;
const pcBtn = (label: string) =>
  [...document.querySelectorAll('.pc-toolbar button')].find((b) =>
    (b.getAttribute('aria-label') ?? b.textContent ?? '').includes(label),
  ) as HTMLButtonElement;
/** زر الشاشة نفسه — لا زر شريط المعاينة (كلاهما اسمه «طباعة»). */
const screenPrintBtn = () => document.querySelector('button.no-print') as HTMLButtonElement;

// ── الأعلام ─────────────────────────────────────────────────────────────────────
describe('العلم', () => {
  it('PRINT_PREVIEW_LEGACY_FORMS_SPECIAL ON افتراضيًا (Phase A) — والعلم الرئيسي ما زال قاطعًا', () => {
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL)).toBe(true);
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, false); // Kill Switch — يُبطل المجموعة
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL)).toBe(false);
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, null);
  });

  it('override بقيمة off يتغلّب على الافتراض ON — تراجع فوري بلا إصدار', () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL, false);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL)).toBe(false);
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL, null);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL)).toBe(true); // عاد للافتراض
  });

  it('تعطيل مجموعة أخرى لا يمسّ هذه المجموعة — الأعلام مستقلة', () => {
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, false);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(false);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_SPECIAL)).toBe(true); // لم تتأثّر
    setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_HR, null);
  });

  it('كل المجموعات ON افتراضيًا بعد التفعيل الكامل', () => {
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(true);
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_FINANCE)).toBe(true);
  });

  it('علم واحد للنموذجين — لا علم لكل شاشة', () => {
    expect(payslipCode).toContain('PRINT_PREVIEW_LEGACY_FORMS_SPECIAL');
    expect(contractCode).toContain('PRINT_PREVIEW_LEGACY_FORMS_SPECIAL');
    const flags = readFileSync('src/printing/flags.ts', 'utf8');
    expect(flags).not.toContain('PRINT_PREVIEW_LEGACY_FORMS_PAYSLIP');
    expect(flags).not.toContain('PRINT_PREVIEW_LEGACY_FORMS_CONTRACT');
  });
});

// ── السلوك ──────────────────────────────────────────────────────────────────────
describe('العلم OFF — الطباعة القديمة كما هي', () => {
  // الافتراض صار ON في Phase A، فنُطفئ العلم الرئيسي **صراحةً** هنا. تغطية OFF هي حارس
  // التراجع — لا تُفقد لمجرّد أن السياسة انقلبت.
  beforeEach(() => setFlagOverride(PRINT_PREVIEW_LEGACY_FORMS_V1, false));

  it('الزر يستدعي دالة الطباعة القديمة مباشرة، ولا معاينة', async () => {
    const legacy = vi.fn();
    render(<Harness legacyPrint={legacy} />);
    await flushAsyncUpdates();
    fireEvent.click(screenPrintBtn());
    await flushAsyncUpdates();
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(dialogOpen()).toBe(false);
  });

  it('الطباعة التلقائية تبقى مباشرة', async () => {
    const legacy = vi.fn();
    render(<Harness legacyPrint={legacy} auto />);
    await flushAsyncUpdates();
    await waitFor(() => expect(legacy).toHaveBeenCalledTimes(1));
    expect(dialogOpen()).toBe(false);
  });
});

describe('العلم ON — المعاينة أولًا', () => {
  beforeEach(on);

  it('الزر يفتح المعاينة ولا يطبع', async () => {
    const legacy = vi.fn();
    render(<Harness legacyPrint={legacy} />);
    await flushAsyncUpdates();
    fireEvent.click(screenPrintBtn());
    await flushAsyncUpdates();
    expect(dialogOpen()).toBe(true);
    expect(legacy).not.toHaveBeenCalled();
    expect(printSpy).not.toHaveBeenCalled(); // لا حوار Electron
  });

  it('الطباعة التلقائية تمرّ بالمعاينة — لا حوار طباعة عند الفتح', async () => {
    const legacy = vi.fn();
    render(<Harness legacyPrint={legacy} auto />);
    await flushAsyncUpdates();
    await waitFor(() => expect(dialogOpen()).toBe(true));
    expect(legacy).not.toHaveBeenCalled();
    expect(printSpy).not.toHaveBeenCalled();
  });

  it('«طباعة» داخل المعاينة تنفّذ الدالة القديمة مرة واحدة', async () => {
    const legacy = vi.fn();
    render(<Harness legacyPrint={legacy} />);
    await flushAsyncUpdates();
    fireEvent.click(screenPrintBtn());
    await flushAsyncUpdates();
    fireEvent.click(pcBtn('طباعة'));
    await waitFor(() => expect(legacy).toHaveBeenCalledTimes(1));
    expect(legacy).toHaveBeenCalledTimes(1);
  });

  it('النقر المزدوج داخل المعاينة ⇒ عملية واحدة', async () => {
    const legacy = vi.fn();
    render(<Harness legacyPrint={legacy} />);
    await flushAsyncUpdates();
    fireEvent.click(screenPrintBtn());
    await flushAsyncUpdates();
    const b = pcBtn('طباعة');
    fireEvent.click(b);
    fireEvent.click(b);
    await waitFor(() => expect(legacy).toHaveBeenCalledTimes(1));
    expect(legacy).toHaveBeenCalledTimes(1);
  });

  it('الإغلاق لا يطبع', async () => {
    const legacy = vi.fn();
    render(<Harness legacyPrint={legacy} />);
    await flushAsyncUpdates();
    fireEvent.click(screenPrintBtn());
    await flushAsyncUpdates();
    fireEvent.click(pcBtn('إغلاق'));
    expect(dialogOpen()).toBe(false);
    expect(legacy).not.toHaveBeenCalled();
  });

  it('تزامن التلقائي مع النقر اليدوي ⇒ معاينة واحدة وطباعة واحدة', async () => {
    const legacy = vi.fn();
    render(<Harness legacyPrint={legacy} auto />);
    await flushAsyncUpdates();
    await waitFor(() => expect(dialogOpen()).toBe(true));
    fireEvent.click(screenPrintBtn()); // نقرة يدوية والمعاينة مفتوحة
    expect(document.querySelectorAll('.pc-scrim')).toHaveLength(1);
    fireEvent.click(pcBtn('طباعة'));
    await waitFor(() => expect(legacy).toHaveBeenCalledTimes(1));
    expect(legacy).toHaveBeenCalledTimes(1);
  });

  it('المعاينة تعرض المحتوى الحالي من العقدة الحقيقية', async () => {
    render(<Harness legacyPrint={vi.fn()} />);
    await flushAsyncUpdates();
    fireEvent.click(screenPrintBtn());
    await flushAsyncUpdates();
    const html = document.querySelector('.pc-frame')!.getAttribute('srcdoc')!;
    expect(html).toContain('محتوى المستند الحالي');
    expect(html).toContain('data-print-root');
  });
});

// ── عقد المِحوَل في الشاشتين ─────────────────────────────────────────────────────
describe('قسيمة الراتب — بوابة واحدة للزر وللطباعة التلقائية', () => {
  it('كلا المسارين يمرّان بـ requestPrint نفسه', () => {
    expect(payslipCode).toContain('onClick={requestPrint}');
    expect(payslipCode).toContain('if (!canceled) requestPrint();'); // مسار الجاهزية
    expect(payslipCode).toContain('waitForPrintReady()'); // الجاهزية القديمة كما هي
  });

  it('proceed هو printCurrentView نفسها — بلا نسخ ولا تغليف', () => {
    expect(payslipCode).toContain('intercept({ proceed: printCurrentView, node: printRootRef.current })');
    expect(payslipCode).toContain('printCurrentView();'); // المسار القديم حين لا بوابة
    expect(typeof printCurrentView).toBe('function');
  });

  it('لا مسار طباعة جديد: لا PrintJob ولا IPC في الصفحة', () => {
    for (const banned of ['submitPrintJob', 'createPrintJob', 'window.manar']) {
      expect(payslipCode).not.toContain(banned);
    }
  });

  it('حسابات الراتب والقالب بلا مساس', () => {
    const raw = readFileSync('src/pages/PayrollPayslip.tsx', 'utf8');
    expect(raw).toContain('/payroll/${id}/payslip'); // نفس مصدر البيانات
    expect(raw).not.toContain('toFixed(2)'); // لا تنسيق جديد
  });
});

describe('عقد العمل — مِحوَل حول الزر فقط (لا طباعة تلقائية)', () => {
  it('proceed هو handlePrint القديمة نفسها', () => {
    expect(contractCode).toContain('preview.printIntercept({ proceed: handlePrint, node: printRootRef.current })');
    expect(contractCode).toContain('onClick={requestPrint}');
  });

  it('handlePrint لم تتغيّر: المسودّة وسجلّ الطباعة والعدّاد ثم printCurrentView', () => {
    const block = contractCode.slice(contractCode.indexOf('function handlePrint()'));
    expect(block).toContain("saveDraft('employment-contract'");
    expect(block).toContain('addPrintLog({');
    expect(block).toContain('setPrintCount(c => c + 1)');
    expect(block).toContain('printCurrentView();');
  });

  it('لم يُنقل إلى FormLayout ولم يتغيّر منطق البيانات أو القالب', () => {
    expect(contractCode).not.toContain('FormLayout');
    expect(contractCode).toContain('<EmploymentContractTemplate employee={employee} params={params} profile={profile} />');
    expect(contractCode).toContain('onSelectNew'); // خيار «موظف جديد» كما هو
  });

  it('لا طباعة تلقائية في هذه الشاشة', () => {
    expect(contractCode).not.toContain('waitForPrintReady');
  });
});

// ── سند القبض: بوابة واحدة، بلا ازدواج ──────────────────────────────────────────
describe('سند القبض — الفئة B: بوابته المستقلة كما هي', () => {
  it('لم يُمسّ: لا مِحوَل جديد ولا علم Legacy Forms', () => {
    expect(rvCode).not.toContain('useLegacyFormPreview');
    expect(rvCode).not.toContain('PRINT_PREVIEW_LEGACY_FORMS');
    expect(rvCode).not.toContain('printIntercept');
  });

  it('بوابته الوحيدة ما زالت PRINT_CENTER_PHASE2_RECEIPT_VOUCHER — ولا علم ثانٍ يحكمه', () => {
    expect(rvCode).toContain('isPhase2Enabled(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER)');
    expect((rvCode.match(/usePrintCenterPath/g) ?? []).length).toBeGreaterThan(1);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER)).toBe(true); // ON بعد التفعيل الكامل
    // والعلم الرئيسي ما زال قاطعًا فوقه — بوابة واحدة، لا اثنتان.
    setFlagOverride(PRINT_CENTER_PHASE2, false);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_RECEIPT_VOUCHER)).toBe(false);
    setFlagOverride(PRINT_CENTER_PHASE2, null);
  });

  it('مساره ومُركِّبه ورقمه بلا تغيير', () => {
    expect(rvCode).toContain('composeFromNode({');
    expect(rvCode).toContain('RECEIPT_VOUCHER_PAGE_SPEC');
    expect(rvCode).toContain("api.post('/forms/receipt-voucher-number')");
    expect(rvCode).toContain('printCurrentView();'); // المسار القديم كما هو
  });
});

// ── الانحدار ────────────────────────────────────────────────────────────────────
describe('الانحدار', () => {
  it('نماذج Phase 1 على علمها وبوابتها كما هي', () => {
    const sc = code(readFileSync('src/pages/SalaryCertificate.tsx', 'utf8'));
    expect(sc).toContain('isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)');
    expect(sc).toContain('printIntercept={preview.printIntercept}');
    expect(isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR)).toBe(true);
    const fl = code(readFileSync('src/forms/shared/FormLayout.tsx', 'utf8'));
    expect(fl).toContain('intercept({ proceed: doPrint, node: formPageRef.current })');
    expect((fl.match(/submitPrintJob\(/g) ?? []).length).toBe(1);
  });

  it('الفاتورة وعرض السعر بلا تغيير', () => {
    const inv = code(readFileSync('src/pages/InvoicePreview.tsx', 'utf8'));
    expect(inv).toContain('compose={composeInvoicePreview}');
    expect(inv).not.toContain('useLegacyFormPreview');
    const q = code(readFileSync('src/pages/Quotation.tsx', 'utf8'));
    expect(q).toContain('legacyPrintRef.current = proceed');
    expect(q).not.toContain('useLegacyFormPreview');
  });

  it('الشيكات والتقارير خارج النطاق ولم تُمسّ', () => {
    for (const page of ['Cheques', 'ReportPrint', 'BankReconciliation', 'BankSalaryAnalytics']) {
      const src = readFileSync(`src/pages/${page}.tsx`, 'utf8');
      expect(src).not.toContain('useLegacyFormPreview');
      expect(src).not.toContain('printIntercept');
    }
  });

  it('الخطّاف المشترك ما زال لا يعرف الطباعة، وPDF بلا تغيير', () => {
    for (const banned of ['submitPrintJob', 'createPrintJob', 'window.manar', 'copies', 'exportPdf']) {
      expect(hookCode).not.toContain(banned);
    }
    const fl = code(readFileSync('src/forms/shared/FormLayout.tsx', 'utf8'));
    expect(fl).toContain('window.manar?.exportPdfFromHtml');
  });
});
