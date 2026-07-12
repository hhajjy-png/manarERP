// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import FormLayout from '../forms/shared/FormLayout';
import {
  setFlagOverride,
  PRINT_CENTER_PHASE2,
  PRINT_CENTER_PHASE2_QUOTATION,
  PRINT_CENTER_PHASE2_INVOICE,
  isPhase2Enabled,
} from '../printing';

/**
 * Quotation Legacy Preview Bridge v1.
 *
 * الوضع الافتراضي لعرض السعر هو Legacy، وزر الطباعة فيه يملكه `FormLayout`. الجسر
 * يعترض **لحظة** الطباعة فقط عبر prop اختيارية (`printIntercept`) — ولا يمسّ
 * `doPrint` نفسه: نفس النسخ، نفس الجاهزية، نفس البوابة، نفس `webContents.print`.
 *
 * المعاينة طبقة عرض: لا تطبع بنفسها، بل تستدعي `proceed` الذي سلّمه `FormLayout`.
 */

const quotationSrc = readFileSync('src/pages/Quotation.tsx', 'utf8');
const formLayoutSrc = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');

const qCode = code(quotationSrc);
const flCode = code(formLayoutSrc);

const qr = { formType: 'quotation', formNumber: 'Q-1', date: '01/01/2026' } as never;

/** ما يصل جسر preload فعلًا — نتحقق منه بدل الوثوق بأن الطباعة «حدثت». */
type PrintJobLike = { docType: string; copies: number; destination: string };

function renderForm(printIntercept?: (ctx: { proceed: () => void; node: HTMLElement | null }) => void) {
  return render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <FormLayout
        formType="quotation"
        lang="ar"
        ready={false}
        formNumber="Q-2026-001"
        title="عرض سعر"
        profile="plain-a4"
        qrData={qr}
        printIntercept={printIntercept}
      >
        <div>بنود عرض السعر</div>
      </FormLayout>
    </MemoryRouter>,
  );
}

/** زر الطباعة في شريط FormLayout تحديدًا (شاشة العمل تحوي عناصر أخرى فيها كلمة «طباعة»). */
const printBtn = () =>
  screen
    .getAllByRole('button')
    .find((b) => b.textContent?.replace(/\s+/g, ' ').trim() === '🖨️ طباعة')!;

afterEach(() => {
  cleanup();
  setFlagOverride(PRINT_CENTER_PHASE2_QUOTATION, null);
  setFlagOverride(PRINT_CENTER_PHASE2, null);
  vi.restoreAllMocks();
});

// ── العلم ───────────────────────────────────────────────────────────────────────
describe('العلم — الافتراضي والاحترام للعلم الرئيسي', () => {
  it('PRINT_CENTER_PHASE2_QUOTATION ON افتراضيًا (Phase A) — ومعه الفاتورة', () => {
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_QUOTATION)).toBe(true);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_INVOICE)).toBe(true);
  });

  it('override بقيمة off يتغلّب على الافتراض ON', () => {
    setFlagOverride(PRINT_CENTER_PHASE2_QUOTATION, false);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_QUOTATION)).toBe(false);
    setFlagOverride(PRINT_CENTER_PHASE2_QUOTATION, null);
  });

  it('العلم الرئيسي يظل قاطعًا: إطفاؤه يُبطل معاينة عرض السعر ولو كان علمها ON', () => {
    setFlagOverride(PRINT_CENTER_PHASE2_QUOTATION, true);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_QUOTATION)).toBe(true);
    setFlagOverride(PRINT_CENTER_PHASE2, false);
    expect(isPhase2Enabled(PRINT_CENTER_PHASE2_QUOTATION)).toBe(false);
  });

  it('الوضع الافتراضي للشاشة ما زال legacy — لا تحويل تلقائي إلى Engine', () => {
    expect(qCode).toContain("useState<'legacy' | 'engine'>('legacy')");
  });
});

// ── العلم OFF: السلوك القديم حرفيًا ─────────────────────────────────────────────
describe('Legacy + العلم OFF — السلوك القديم بلا أي تغيير', () => {
  // الافتراض صار ON، فنُطفئه صراحةً: تغطية OFF هي حارس التراجع، ولا تُفقد.
  beforeEach(() => setFlagOverride(PRINT_CENTER_PHASE2, false));

  it('زر الطباعة يستدعي doPrint مباشرة (لا وسيط، لا حوار)', () => {
    renderForm(undefined); // بلا اعتراض — هذا ما يمرّره Quotation حين يكون العلم OFF
    // نفس الشجرة القديمة: لا نافذة معاينة.
    expect(document.querySelector('.pc-scrim')).toBeNull();
    fireEvent.click(printBtn());
    expect(document.querySelector('.pc-scrim')).toBeNull(); // لم يُفتح شيء
  });

  it('Quotation لا يمرّر اعتراضًا ولا يُصيّر الحوار حين يكون العلم OFF', () => {
    expect(qCode).toContain('printIntercept={usePrintCenterQuotation ? legacyPrintIntercept : undefined}');
    expect(qCode).toMatch(/\{usePrintCenterQuotation && \(\s*<PrintPreviewDialog/);
  });

  it('بقية النماذج (سندات، عقود…) لا تمرّر printIntercept أصلًا — غير متأثرة', () => {
    const others = ['src/forms/PurchaseOrder.tsx', 'src/forms/MaterialRequest.tsx'];
    for (const f of others) {
      let src: string;
      try { src = readFileSync(f, 'utf8'); } catch { continue; }
      expect(src).not.toContain('printIntercept');
    }
  });
});

// ── العلم ON: الجسر ─────────────────────────────────────────────────────────────
describe('Legacy + العلم ON — الجسر يفتح المعاينة ولا يطبع', () => {
  it('الضغط على «طباعة» يعترض: يسلّم proceed + العقدة، ولا ينفّذ الطباعة فورًا', () => {
    const intercept = vi.fn();
    renderForm(intercept);
    fireEvent.click(printBtn());
    expect(intercept).toHaveBeenCalledTimes(1);
    const ctx = intercept.mock.calls[0][0] as { proceed: () => void; node: HTMLElement | null };
    expect(typeof ctx.proceed).toBe('function'); // مسار الطباعة القديم نفسه
    expect(ctx.node).toBeInstanceOf(HTMLElement);
    expect(ctx.node!.classList.contains('form-page')).toBe(true); // العقدة التي تُطبع فعلًا
  });

  it('لا طباعة تُنفَّذ ما لم يُستدعَ proceed صراحةً', () => {
    const printSubmit = vi.fn(async () => ({ status: 'printed' as const }));
    (window as unknown as { manar: unknown }).manar = { printSubmit };
    renderForm(() => { /* يفتح المعاينة فقط */ });
    fireEvent.click(printBtn());
    expect(printSubmit).not.toHaveBeenCalled(); // ← لا طباعة مزدوجة ولا طباعة فورية
    delete (window as unknown as { manar?: unknown }).manar;
  });

  it('استدعاء proceed ينفّذ مسار FormLayout القديم كما هو — مرة واحدة، بعدد النسخ', async () => {
    const printSubmit = vi.fn(async (_job: PrintJobLike) => ({ status: 'printed' as const }));
    (window as unknown as { manar: unknown }).manar = { printSubmit };
    let proceed!: () => void;
    renderForm((ctx) => { proceed = ctx.proceed; });

    fireEvent.click(printBtn());
    proceed(); // ← هذا ما يفعله زر «طباعة» داخل المعاينة

    await waitFor(() => expect(printSubmit).toHaveBeenCalledTimes(1));
    const job = printSubmit.mock.calls[0][0];
    expect(job.docType).toBe('form');
    expect(job.destination).toBe('printer');
    expect(job.copies).toBe(1); // عدد النسخ يبقى ملك FormLayout — الجسر لا يمسّه
    delete (window as unknown as { manar?: unknown }).manar;
  });
});

// ── عقد الجسر في الكود ──────────────────────────────────────────────────────────
describe('عقد الجسر — لا يمسّ مسار الطباعة', () => {
  it('doPrint لم يتغيّر: نفس الجاهزية ونفس البوابة ونفس النسخ', () => {
    expect(flCode).toContain('if (!isFlagEnabled(PRINT_CENTER_FOUNDATION_V1))');
    expect(flCode).toContain('printCurrentView();');
    expect(flCode).toContain('submitPrintJob(');
    expect(flCode).toMatch(/copies:\s*count/);
    expect(flCode).toContain("docType: 'form'");
    expect(flCode).toContain('waitForPrintReady()');
    // نقطة الاعتراض تقرّر **متى** يُستدعى doPrint، لا **ماذا** يفعل.
    expect(flCode).toContain('printIntercept({ proceed: doPrint, node: formPageRef.current })');
    // ولا مسار طباعة ثانٍ داخل FormLayout.
    expect((flCode.match(/submitPrintJob\(/g) ?? []).length).toBe(1);
  });

  it('المعاينة تفوّض ولا تطبع: onPrint يستدعي المسار الذي سلّمه FormLayout', () => {
    expect(qCode).toContain('legacyPrintRef.current = proceed');
    expect(qCode).toContain('onPrint={runLegacyPrint}');
    expect(qCode).toContain('legacyPrintRef.current?.()');
    // لا استدعاء طباعة جديد/بديل في مسار Legacy: الطباعة تخرج من FormLayout وحده.
    expect(qCode).not.toContain('submitPrintJob');
    expect(qCode).not.toContain('createPrintJob');
    // `window.manar` في هذا الملف يخصّ تصدير PDF القائم — لم تمسّه هذه الحزمة.
    expect(qCode).toContain('window.manar?.exportPdf(suggestedName)');
  });

  it('الحماية من النقر المزدوج مُعاد استخدامها لا مُعاد اختراعها', () => {
    const dlg = code(readFileSync('src/printing/components/PrintPreviewDialog.tsx', 'utf8'));
    expect(dlg).toContain('if (printingRef.current) return;'); // حارس الحوار
    expect(dlg).toContain('onClose();'); // الإغلاق أولًا
    expect(dlg).toContain('onPrint();'); // ثم التفويض
    // وحارس in-flight في البوابة نفسها لم يُمسّ.
    const gw = code(readFileSync('src/printing/printCenter.ts', 'utf8'));
    expect(gw).toMatch(/inFlight|isPrintInFlight/);
  });

  it('المعاينة تُبنى من نفس المحتوى الحالي — نفس المُركِّب، لا composer بديل', () => {
    expect(qCode).toContain('const composeQuotationPreview = useCallback((sourceNode?: HTMLElement | null)');
    expect(qCode).toContain('composeQuotationPreview(legacyNode)');
    expect(qCode).toContain('composeStyledFromNode({');
    expect((qCode.match(/composeStyledFromNode\(\{/g) ?? []).length).toBe(1); // مُركِّب واحد لا اثنان
    expect(qCode).toContain("stripSelectors: ['.no-print']");
    expect(qCode).toContain('lang,'); // اللغة الحالية تعبر إلى المعاينة
  });

  it('التكبير للعرض فقط: لا يمسّ callback الطباعة ولا عدد النسخ', () => {
    const dlg = code(readFileSync('src/printing/components/PrintPreviewDialog.tsx', 'utf8'));
    expect(dlg).not.toContain('copies');
    expect(dlg).not.toContain('createPrintJob');
    // التكبير يغيّر مقاس العرض فقط (transform + مقاس الورقة) ولا يعيد بناء المستند.
    expect(dlg).toMatch(/transform:\s*`scale\(\$\{scale\}\)`/);
    expect(dlg).toContain('}, [open]);'); // المستند يُبنى عند الفتح فقط
  });
});

// ── الانحدار ────────────────────────────────────────────────────────────────────
describe('الانحدار — لا شيء آخر تغيّر', () => {
  it('Engine Mode في عرض السعر ما زال كما كان', () => {
    expect(qCode).toContain('compose={composeQuotationPreview}');
    expect(qCode).toContain('onPrint={() => printCurrentView()}');
    expect(qCode).toContain('@page { size: A4; margin: 0; }');
  });

  it('تجربة الفاتورة لم تتأثر', () => {
    const inv = code(readFileSync('src/pages/InvoicePreview.tsx', 'utf8'));
    expect(inv).toContain('onClick={() => printCurrentView()}');
    expect(inv).toContain('compose={composeInvoicePreview}');
    expect(inv).not.toContain('printIntercept');
  });

  it('تصدير PDF بلا تغيير (النماذج والفاتورة)', () => {
    expect(flCode).toContain('window.manar?.exportPdfFromHtml');
    expect(flCode).toContain('buildFormPdfDocument');
    const inv = code(readFileSync('src/pages/InvoicePreview.tsx', 'utf8'));
    expect(inv).toContain('window.manar.exportPdfFromHtml(html, suggestedName)');
  });

  it('Electron وBackend خارج نطاق الحزمة تمامًا', () => {
    const preload = readFileSync('../electron/preload.ts', 'utf8');
    expect(preload).toContain("ipcRenderer.invoke('print:submit'");
    expect(preload).not.toContain('printIntercept');
  });
});

// ── تباين خيارات التوقيع/الختم في شاشة قالب الطباعة ─────────────────────────────
describe('شاشة قالب الطباعة — «التوقيع» و«الختم» مقروءان', () => {
  /** كتلة خياري التوقيع/الختم وحدها — لا الحاويات المجاورة (خيار Template Studio مثلًا). */
  const start = qCode.indexOf('printOptionsInitialized && (');
  const optionsBlock = () => qCode.slice(start, qCode.indexOf('marginRight:', start));
  /** سطر الحاوية الذي كان يفرض خلفية فاتحة بلا لون نص. */
  const containerLine = () =>
    optionsBlock()
      .split(/\r?\n/)
      .find((l) => l.includes('borderRadius: 8') && l.includes('display:')) ?? '';

  it('لون النص مُعيَّن صراحةً بتوكن الثيم — لا يُترك موروثًا', () => {
    const block = optionsBlock();
    // كان `color: undefined` للحالة المفعّلة: يرث لون الثيم (أبيض في الداكن) فوق خلفية
    // مثبَّتة فاتحة ⇒ أبيض على أبيض.
    expect(block).toContain("color: branding.signatureUrl ? 'var(--text)' : 'var(--text-muted)'");
    expect(block).toContain("color: branding.stampUrl ? 'var(--text)' : 'var(--text-muted)'");
    expect(block).not.toContain('#94a3b8'); // لا لون نص مثبّت
    expect(block).not.toContain('color: undefined');
  });

  it('الخلفية توكن أيضًا — تتحرّك مع الثيم مثل النص، فلا يتجمّد التباين', () => {
    const line = containerLine();
    expect(line).toContain("background: 'var(--surface-2)'");
    expect(line).toContain("color: 'var(--text)'");
    expect(line).not.toContain('#f8fafc'); // لا خلفية مثبّتة على الحاوية
  });

  it('السلوك لم يتغيّر: نفس الـ checkbox ونفس منطق الإظهار', () => {
    const block = optionsBlock();
    expect(block).toContain('checked={printShowSignature}');
    expect(block).toContain('checked={printShowStamp}');
    expect(block).toContain('disabled={!branding.signatureUrl}');
    expect(block).toContain('disabled={!branding.stampUrl}');
    expect(block).toContain('onChange={(e) => setPrintShowSignature(e.target.checked)}');
    expect(block).toContain('onChange={(e) => setPrintShowStamp(e.target.checked)}');
  });
});
