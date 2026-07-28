// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { PrintPreviewDialog } from '../printing';

/**
 * Print Preview — العرض المتصل (تراجع عن الفصل البصري).
 *
 * الفصل السابق كان يقصّ عند مضاعفات ارتفاع A4 (`translateY(pageH × i)`) وهو **لا يعرف**
 * أين يكسر Chromium الصفحات فعلًا: يتجاهل هوامش `@page`، وعرض صندوق الطباعة الأضيق،
 * و`page-break-before/after`، و`break-inside: avoid`. فكان يعرض حدودًا **خاطئة بثقة**.
 *
 * القرار: عرض متصل + رقم صفحات **تقديري** مُعلَن + تنبيه صريح بأن الطابع هو من يقسّم.
 * لا محاكاة لفواصل الصفحات في هذه الحزمة.
 */

const MM_TO_PX = 96 / 25.4;
const PAGE_H = 297 * MM_TO_PX;
const PAGE_W = 210 * MM_TO_PX;
const CSS = readFileSync('src/printing/components/PrintCenter.css', 'utf8');
const dialogSrc = readFileSync('src/printing/components/PrintPreviewDialog.tsx', 'utf8');
const code = dialogSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');

let contentHeight = 900;

function stubLayout(win: Window & typeof globalThis) {
  Object.defineProperty(win.HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const h = this.hasAttribute('data-print-root') ? contentHeight : 0;
      return { width: PAGE_W, height: h, top: 0, left: 0, right: PAGE_W, bottom: h, x: 0, y: 0 } as DOMRect;
    },
  });
  Object.defineProperty(win.HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-print-root') ? contentHeight : Math.max(contentHeight, 1123);
    },
  });
}

beforeEach(() => {
  contentHeight = 900;
});
afterEach(cleanup);

const html = '<!DOCTYPE html><html dir="rtl"><body><div data-print-root>عقد عمل</div></body></html>';
const onPrint = vi.fn();

function open() {
  onPrint.mockClear();
  render(
    <PrintPreviewDialog
      open
      onClose={vi.fn()}
      onPrint={onPrint}
      compose={() => html}
      documentLabel="عقد عمل · C-1"
    />,
  );
}

async function loadFrame() {
  const frame = document.querySelector('.pc-frame') as HTMLIFrameElement;
  stubLayout(frame.contentWindow as Window & typeof globalThis);
  const doc = frame.contentDocument!;
  const root = doc.createElement('div');
  root.setAttribute('data-print-root', '');
  doc.body.appendChild(root);
  fireEvent.load(frame);
  await waitFor(() => expect(document.querySelector('.pc-sheet')).toBeTruthy());
}

const sheets = () => document.querySelectorAll('.pc-sheet');
const frames = () => document.querySelectorAll('.pc-frame');
const pages = () => Number(document.querySelector('.pc-pages strong')!.textContent);
const px = (v: string) => Number.parseFloat(v);
const note = () => screen.queryByText('عرض متصل — التقسيم النهائي يحدده الطابع');

// ── التراجع ─────────────────────────────────────────────────────────────────────
describe('العرض عاد متصلًا', () => {
  it('ورقة واحدة وإطار واحد مهما بلغ عدد الصفحات — لا مكدّس ولا أوراق متعددة', async () => {
    contentHeight = 1600; // صفحتان تقديريًا
    open();
    await loadFrame();
    expect(pages()).toBe(2);
    expect(sheets()).toHaveLength(1);
    expect(frames()).toHaveLength(1);
  });

  it('لا أثر لـ pc-stack ولا لإزاحة الصفحات في الكود أو الأنماط', () => {
    expect(code).not.toContain('pc-stack');
    expect(code).not.toContain('translateY');
    expect(code).not.toContain('data-page');
    expect(CSS).not.toContain('.pc-stack');
    expect(code).toMatch(/transform:\s*`scale\(\$\{scale\}\)`/); // تكبير فقط
  });

  it('ارتفاع الورقة يعود إلى ارتفاع المستند كاملًا (عرض متصل)', async () => {
    contentHeight = 1600;
    open();
    await loadFrame();
    const sheet = sheets()[0] as HTMLElement;
    const scale = px(sheet.style.width) / PAGE_W;
    expect(px(sheet.style.height)).toBeCloseTo(PAGE_H * 2 * scale, 0); // صفحتان متصلتان
  });

  it('لا فواصل بصرية تُرسم — لا حدّ ولا فراغ بين الصفحات', () => {
    expect(CSS).not.toMatch(/gap:\s*32px/);
    expect(code).not.toContain('Array.from({ length: pageCount }');
  });
});

// ── النص التوضيحي ───────────────────────────────────────────────────────────────
describe('تنبيه «عرض متصل»', () => {
  it('يظهر عند أكثر من صفحة', async () => {
    contentHeight = 1600;
    open();
    await loadFrame();
    expect(pages()).toBe(2);
    expect(note()).toBeInTheDocument();
  });

  it('لا يظهر في مستند من صفحة واحدة', async () => {
    contentHeight = 900;
    open();
    await loadFrame();
    expect(pages()).toBe(1);
    expect(note()).toBeNull();
  });

  it('عنصر واجهة فقط: خارج srcdoc، ولا يدخل القياس ولا يغيّر عدد الصفحات', async () => {
    contentHeight = 1600;
    open();
    await loadFrame();
    const srcdoc = (frames()[0] as HTMLIFrameElement).getAttribute('srcdoc')!;
    expect(srcdoc).not.toContain('عرض متصل');
    expect(srcdoc).not.toContain('pc-continuous-note');
    // موضعه داخل شريط الأدوات — لا داخل الـ canvas ولا الورقة.
    expect(document.querySelector('.pc-toolbar .pc-continuous-note')).toBeTruthy();
    expect(document.querySelector('.pc-canvas .pc-continuous-note')).toBeNull();
    expect(pages()).toBe(2); // القياس كما هو
  });

  it('لا يصل الورق: نافذة المعاينة كلها مخفية عند الطباعة', () => {
    expect(CSS).toMatch(/@media print\s*\{[\s\S]*?\.pc-scrim\s*\{\s*display:\s*none\s*!important/);
  });
});

// ── القياس والطباعة والـ PDF ────────────────────────────────────────────────────
describe('القياس والطباعة بلا تغيير', () => {
  it('عدد الصفحات ما زال تقديريًا بنفس المعادلة والعتبة', () => {
    expect(code).toContain('Math.ceil((contentH - PAGE_EPSILON) / pageHpx)');
    expect(code).toContain('const PAGE_EPSILON = 8;');
    expect(code).toContain("doc.querySelector<HTMLElement>('[data-print-root]')");
    expect(screen.queryByLabelText('الصفحة التالية')).toBeNull(); // لا ترقيم وهمي
  });

  it('onPrint: إغلاق ثم تفويض واحد — والمعاينة لا تعرف IPC', async () => {
    contentHeight = 1600;
    open();
    await loadFrame();
    fireEvent.click(screen.getByRole('button', { name: 'طباعة' }));
    await waitFor(() => expect(onPrint).toHaveBeenCalledTimes(1));
    for (const banned of ['window.manar', 'webContents', 'submitPrintJob', 'printCurrentView']) {
      expect(code).not.toContain(banned);
    }
  });

  it('المُركِّب ومسار PDF لم يُمسّا', () => {
    const compose = readFileSync('src/printing/composeDocument.ts', 'utf8');
    expect(compose).toContain('export function composeStyledFromNode');
    expect(compose).not.toContain('pc-stack');
    const inv = readFileSync('src/pages/InvoicePreview.tsx', 'utf8');
    expect(inv).toContain('window.manar.exportPdfFromHtml(html, suggestedName)');
    const fl = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
    expect(fl).toContain('composeStyledFromNode'); // مسار PDF الوحيد الآن (5D — buildFormPdfDocument تقاعد)
  });
});
