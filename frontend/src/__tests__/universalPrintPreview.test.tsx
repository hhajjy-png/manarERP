// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { flushAsyncUpdates } from './helpers/flush';
import { readFileSync } from 'node:fs';
import {
  PrintPreviewDialog,
  composeStyledFromNode,
  getPageSpec,
  isFlagEnabled,
  PRINT_CENTER_PHASE2_INVOICE,
  PRINT_CENTER_PHASE2_QUOTATION,
} from '../printing';

/**
 * UNIVERSAL PRINT PREVIEW v1.
 *
 * الاتجاه الجديد: المعاينة تعرض فقط. الطباعة الفعلية تبقى على مسار الصفحة القديم.
 * لا artifact printing، لا نافذة مخفية، لا plugins:true، لا PDF وسيط.
 */

function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');
}

const APP_CSS = `
@font-face { font-family: "IBM Plex Sans Arabic"; src: url(./IBMPlexSansArabic-Regular-DHf6.woff2) format("woff2"); }
.logo { background-image: url(./almanar-logo.png); }
._amt_h4sh { direction: ltr; unicode-bidi: isolate; }
@media print { @page { size: A4; margin: 8mm 10mm; } .no-print { display: none !important; } }
`;

let sheet: HTMLStyleElement;

beforeEach(() => {
  sheet = document.createElement('style');
  sheet.textContent = APP_CSS;
  document.head.appendChild(sheet);
  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'ar');
});

afterEach(() => {
  cleanup();
  sheet.remove();
  document.body.innerHTML = '';
});

/** جذر طباعة فيه مبلغ عربي + عناصر يجب ألا تُطبع. */
function invoiceRoot(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'inv-wrap';

  const chrome = document.createElement('div');
  chrome.className = 'no-print';
  chrome.textContent = 'TOOLBAR-SIDEBAR-TEMPLATE-SELECTOR';

  const dialog = document.createElement('div');
  dialog.className = 'pc-scrim';
  dialog.textContent = 'PREVIEW-DIALOG-CHROME';

  const arabic = document.createElement('p');
  arabic.textContent = 'فاتورة ضريبية — شركة المنار الدولية';

  const amount = document.createElement('span');
  amount.className = '_amt_h4sh';
  amount.textContent = '10,395.000 KWD';

  root.append(chrome, dialog, arabic, amount);
  document.body.appendChild(root);
  return root;
}

const compose = (node: HTMLElement) =>
  composeStyledFromNode({
    node,
    pageSpec: getPageSpec('a4-portrait'),
    title: 'فاتورة 123',
    lang: 'ar',
    stripSelectors: ['.no-print'],
  });

// ── مستند المعاينة ───────────────────────────────────────────────────────────────
describe('Universal Print Preview — مستند المعاينة', () => {
  it('العربية تبقى سليمة بعد التركيب', () => {
    const html = compose(invoiceRoot());
    expect(html).toContain('فاتورة ضريبية — شركة المنار الدولية');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
  });

  it('KWD تبقى كما هي: 10,395.000 KWD', () => {
    const root = invoiceRoot();
    expect(root.querySelector('._amt_h4sh')!.textContent).toBe('10,395.000 KWD');
    const html = compose(root);
    expect(html).toContain('10,395.000 KWD');
    expect(html).not.toContain('KWD 10 395 000');
  });

  it('لا formatter نقدي جديد في مسار المعاينة', () => {
    for (const f of ['src/printing/composeDocument.ts', 'src/printing/styleCapture.ts']) {
      const code = codeOf(f);
      expect(code).not.toContain('NumberFormat');
      expect(code).not.toContain('toLocaleString');
      expect(code).not.toContain('KWD');
    }
  });

  it('روابط الخطوط والصور تُحلّ (السبب الجذري لتشوّه العربية)', () => {
    const html = compose(invoiceRoot());
    expect(html).toContain('<base href='); // الأصول النسبية في العلامات تُحلّ
    expect(html).not.toContain('url(./'); // الأصول النسبية في CSS صارت مطلقة
    expect(html).toContain('@font-face'); // تعريف الخط موجود
  });

  it('لا chrome للتطبيق ولا نافذة المعاينة داخل المستند', () => {
    const html = compose(invoiceRoot());
    expect(html).not.toContain('TOOLBAR-SIDEBAR-TEMPLATE-SELECTOR');
    expect(html).not.toContain('PREVIEW-DIALOG-CHROME'); // .pc-scrim تُنزع دائمًا
  });

  it('لا يُعدَّل الـ DOM الحي', () => {
    const root = invoiceRoot();
    compose(root);
    expect(root.querySelector('.no-print')).not.toBeNull();
    expect(root.hasAttribute('data-print-root')).toBe(false);
  });
});

// ── سلوك نافذة المعاينة ─────────────────────────────────────────────────────────
describe('Universal Print Preview — النافذة', () => {
  /** يُصيّر الحوار ثم ينتظر ما ينتظره فعلًا: تحميل الـ iframe وإطار الرسم التالي. */
  const setup = async (onPrint = vi.fn(), onClose = vi.fn()) => {
    render(
      <PrintPreviewDialog
        open
        onClose={onClose}
        onPrint={onPrint}
        compose={() => '<!DOCTYPE html><html dir="rtl"><body>مستند</body></html>'}
        documentLabel="فاتورة · INV-1"
      />,
    );
    await flushAsyncUpdates();
    return { onPrint, onClose };
  };

  it('تعرض المستند داخل iframe (نفس أصل التطبيق) — لا PDF ولا نافذة مخفية', async () => {
    await setup();
    const frame = document.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame!.getAttribute('srcdoc')).toContain('مستند');
    expect(frame!.getAttribute('sandbox')).toBe('allow-same-origin'); // لا سكربتات
  });

  it('زر «طباعة» يغلق المعاينة ثم يستدعي مسار الصفحة مرة واحدة', async () => {
    const { onPrint, onClose } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'طباعة' }));

    // الإغلاق أولًا — وإلا ظهرت النافذة نفسها في الورقة.
    expect(onClose).toHaveBeenCalledTimes(1);

    // التفويض يقع في إطار الرسم التالي (سلوك إنتاجي مقصود) — ننتظره، لا نُلغيه.
    await flushAsyncUpdates();
    await vi.waitFor(() => expect(onPrint).toHaveBeenCalledTimes(1));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('النقر المزدوج السريع لا ينتج طباعتين', async () => {
    const { onPrint } = await setup();
    const btn = screen.getByRole('button', { name: 'طباعة' });
    fireEvent.click(btn);
    fireEvent.click(btn); // فورًا
    await flushAsyncUpdates();
    await vi.waitFor(() => expect(onPrint).toHaveBeenCalledTimes(1));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('الإغلاق لا يطبع', async () => {
    const { onPrint, onClose } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    await flushAsyncUpdates();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPrint).not.toHaveBeenCalled();
  });

  it('النافذة لا تعرف شيئًا عن IPC ولا تطبع بنفسها', () => {
    const code = codeOf('src/printing/components/PrintPreviewDialog.tsx');
    expect(code).not.toContain('printArtifact');
    expect(code).not.toContain('submitPrintJob');
    expect(code).not.toContain('printCurrentView');
    expect(code).not.toContain('window.manar');
    expect(code).not.toContain('webContents');
    expect(code).toContain('onPrint()'); // الطباعة مسؤولية الصفحة
  });

  it('CSS يخفي نافذة المعاينة عند الطباعة (حاجز ثانٍ)', () => {
    const css = readFileSync('src/printing/components/PrintCenter.css', 'utf8');
    expect(css).toMatch(/@media print[\s\S]*\.pc-scrim\s*\{\s*display:\s*none/);
  });
});

// ── إزالة مسار artifact printing ────────────────────────────────────────────────
describe('Universal Print Preview — مسار artifact أُزيل بالكامل', () => {
  it('لا previewService ولا print:printArtifact في Electron', () => {
    expect(() => readFileSync('../electron/services/previewService.ts', 'utf8')).toThrow();
    const main = readFileSync('../electron/main.ts', 'utf8');
    const preload = readFileSync('../electron/preload.ts', 'utf8');
    for (const src of [main, preload]) {
      expect(src).not.toContain('printArtifact');
      expect(src).not.toContain('print:preview');
      expect(src).not.toContain('previewService');
    }
    expect(preload).not.toContain('plugins');
  });

  it('لا نافذة مخفية بـ plugins:true ولا طباعة ملف PDF مؤقّت', () => {
    const svc = readFileSync('../electron/services/printService.ts', 'utf8');
    // Phase 1 فيه Save-PDF مستقر (destination 'pdf') — لم يُمَسّ. الممنوع هو تحميل ملف
    // PDF في نافذة مخفية وطباعته: هذا هو المسار الذي أخرج ورقة بيضاء.
    expect(svc).not.toContain('plugins: true');
    expect(svc).not.toContain('loadFile');
    expect(svc).not.toContain('new BrowserWindow');
  });

  it('لا مرجع لـ PDF.js في الشيفرة', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.dependencies['pdfjs-dist']).toBeUndefined();
  });

  it('مسار Phase 1 والطباعة القديمة سليمان', () => {
    const preload = readFileSync('../electron/preload.ts', 'utf8');
    for (const ch of ['app:print', 'pdf:export', 'pdf:exportHtml', 'print:submit']) {
      expect(preload).toContain(ch);
    }
    const gw = readFileSync('src/printing/printCenter.ts', 'utf8');
    expect(gw).toContain('export async function submitPrintJob');
    const util = readFileSync('src/utils/print.ts', 'utf8');
    expect(util).toContain('export function printCurrentView');
  });
});

// ── الأعلام والانحدار ───────────────────────────────────────────────────────────
describe('Universal Print Preview — الأعلام والانحدار', () => {
  it('Invoice وQuotation صارا ON افتراضيًا (Phase A) — والطباعة القديمة كما هي', () => {
    expect(isFlagEnabled(PRINT_CENTER_PHASE2_INVOICE)).toBe(true);
    expect(isFlagEnabled(PRINT_CENTER_PHASE2_QUOTATION)).toBe(true);
  });

  it('مسار طباعة الفاتورة القديم لم يتغيّر', () => {
    const inv = readFileSync('src/pages/InvoicePreview.tsx', 'utf8');
    expect(inv).toContain('printCurrentView()'); // المسار القديم باقٍ
    expect(inv).toContain('@page { size: A4; margin: 8mm 10mm; }'); // الهندسة كما هي
    expect(inv).toContain('onPrint={() => printCurrentView()}'); // الطباعة = المسار القديم
    expect(inv).not.toContain('printArtifact');
  });

  it('Quotation بلا تغيير سلوكي وما زالت OFF', () => {
    const q = readFileSync('src/pages/Quotation.tsx', 'utf8');
    expect(q).toContain('printCurrentView()');
    expect(q).toContain('@page { size: A4; margin: 0; }');
    expect(q).not.toContain('printArtifact');
  });

  it('الشيكات بلا مساس — وPDFKit تقاعد لاحقًا (حزمة إكمال النواة)', () => {
    const cheques = readFileSync('src/pages/Cheques.tsx', 'utf8');
    expect(cheques).not.toMatch(/from\s+['"][^'"]*\/printing['"]/);
    expect(cheques).toContain('const CHEQUE_PAGE_OFFSET_Y_MM: number = 40;');
    // PDFKit لم يكن يشكّل العربية، وخطّه (Amiri) غير موجود في المستودع أصلًا، ولا مستدعٍ
    // له من الواجهة. تقاعد لصالح مسار HTML/Chromium الذي يخدم نفس التقارير.
    const routes = readFileSync('../backend/src/modules/reports/reports.routes.ts', 'utf8');
    expect(routes).not.toContain('buildPdf');
  });

  it('Forms: إصلاح النسخ الأصلي ما زال قائمًا', () => {
    const form = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
    expect(form).toContain('submitPrintJob(');
    expect(form).not.toContain('setTimeout(next, 1500)');
  });
});
