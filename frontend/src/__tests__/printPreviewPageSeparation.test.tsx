// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { PrintPreviewDialog } from '../printing';

/**
 * Print Preview — الفصل البصري بين الصفحات.
 *
 * كان المستند يُعرض كإطار واحد داخل **ورقة واحدة طويلة** بارتفاع
 * `pageH × pageCount`، فبدت الصفحات متصلة بلا فاصل.
 *
 * الآن: **مكدّس أوراق** — لكل صفحة صندوق ورقة بارتفاع صفحة واحدة، يعرض **نفس** المستند
 * مُزاحًا بمقدار صفحة ومحصورًا بـ `overflow: hidden`. المستند لم يُقسَّم ولم يُقصّ ولم
 * يُعد ترتيبه، والفراغ يعيش في حاوية العرض خارجه تمامًا.
 */

const MM_TO_PX = 96 / 25.4;
const PAGE_H = 297 * MM_TO_PX;
const PAGE_W = 210 * MM_TO_PX;
const CSS = readFileSync('src/printing/components/PrintCenter.css', 'utf8');
const dialogSrc = readFileSync('src/printing/components/PrintPreviewDialog.tsx', 'utf8');

/** ارتفاع محتوى المستند — يحدّد عدد الصفحات المقدَّر. */
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

/** srcDoc لا يُحمّل في jsdom — نبني مستند الإطار الأول ونطلق onLoad. */
async function loadFirstFrame() {
  const frame = document.querySelector('.pc-frame') as HTMLIFrameElement;
  const doc = frame.contentDocument!;
  stubLayout(frame.contentWindow as Window & typeof globalThis);
  const root = doc.createElement('div');
  root.setAttribute('data-print-root', '');
  doc.body.appendChild(root);
  fireEvent.load(frame);
  await waitFor(() => expect(document.querySelectorAll('.pc-sheet').length).toBeGreaterThan(0));
}

const sheets = () => [...document.querySelectorAll<HTMLElement>('.pc-sheet')];
const frames = () => [...document.querySelectorAll<HTMLIFrameElement>('.pc-frame')];
const pages = () => Number(document.querySelector('.pc-pages strong')!.textContent);
const px = (v: string) => Number.parseFloat(v);
/** عدد الفواصل البصرية = الفجوات بين الأوراق. */
const separators = () => Math.max(0, sheets().length - 1);

// ── عدد الصفحات والفواصل ────────────────────────────────────────────────────────
describe('الفصل البصري بحسب عدد الصفحات', () => {
  it('صفحة واحدة: ورقة واحدة، بلا فاصل ولا فراغ سفلي وهمي', async () => {
    contentHeight = 900;
    open();
    await loadFirstFrame();
    expect(pages()).toBe(1);
    expect(sheets()).toHaveLength(1);
    expect(separators()).toBe(0);
    // ارتفاع الورقة = صفحة واحدة بالضبط — لا امتداد.
    expect(px(sheets()[0].style.height)).toBeCloseTo(PAGE_H * (px(sheets()[0].style.width) / PAGE_W), 0);
  });

  it('صفحتان: ورقتان وفاصل واحد', async () => {
    contentHeight = 1600;
    open();
    await loadFirstFrame();
    expect(pages()).toBe(2);
    expect(sheets()).toHaveLength(2);
    expect(separators()).toBe(1);
  });

  it('ثلاث صفحات: ثلاث أوراق وفاصلان فقط', async () => {
    contentHeight = PAGE_H * 2.4;
    open();
    await loadFirstFrame();
    expect(pages()).toBe(3);
    expect(sheets()).toHaveLength(3);
    expect(separators()).toBe(2);
  });

  it('كل ورقة تعرض صفحتها: إزاحة صفحة كاملة لكل واحدة، بلا قصّ ولا تكرار', async () => {
    contentHeight = 1600;
    open();
    await loadFirstFrame();
    const [f1, f2] = frames();
    expect(f1.style.transform).toContain('translateY(0px)'); // الصفحة الأولى
    expect(f2.style.transform).toContain(`translateY(-${Math.round(PAGE_H)}px)`); // الثانية
    // المستند نفسه في كل إطار — لم يُقسَّم ولم يُعد بناؤه.
    expect(f1.getAttribute('srcdoc')).toBe(f2.getAttribute('srcdoc'));
    expect(px(f1.style.height)).toBeCloseTo(Math.round(PAGE_H * 2), 0); // الارتفاع الكامل
  });
});

// ── القياس لم يتأثر ─────────────────────────────────────────────────────────────
describe('الفصل لا يمسّ القياس', () => {
  it('القياس من الإطار الأول وحده — لا يقيس أحد الفواصل ولا الأوراق', () => {
    const code = dialogSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toContain('ref={i === 0 ? frameRef : undefined}');
    expect(code).toContain('onLoad={i === 0 ? onFrameLoad : undefined}');
    expect(code).toContain("doc.querySelector<HTMLElement>('[data-print-root]')");
    // معادلة عدد الصفحات والعتبة لم تتغيّرا.
    expect(code).toContain('Math.ceil((contentH - PAGE_EPSILON) / pageHpx)');
    expect(code).toContain('const PAGE_EPSILON = 8;');
  });

  it('الفراغ في حاوية العرض لا في المستند', () => {
    expect(CSS).toMatch(/\.pc-stack\s*\{[\s\S]*?gap:\s*32px/);
    // ولا هامش مضاف داخل الجذر المطبوع.
    const compose = readFileSync('src/printing/composeDocument.ts', 'utf8');
    expect(compose).toMatch(/\[data-print-root\]\s*\{[^}]*margin:\s*0\s*!important/);
    expect(compose).not.toContain('pc-stack');
  });
});

// ── التكبير ─────────────────────────────────────────────────────────────────────
describe('التكبير لا يغيّر عدد الصفحات ولا الفواصل', () => {
  it('25% · 100% · 200% · Fit Page · Fit Width — كلها ورقتان وفاصل واحد', async () => {
    contentHeight = 1600;
    open();
    await loadFirstFrame();
    const select = screen.getByLabelText('مستوى التكبير');

    for (const z of ['0.25', '1', '2']) {
      fireEvent.change(select, { target: { value: z } });
      expect(pages()).toBe(2);
      expect(sheets()).toHaveLength(2);
      expect(separators()).toBe(1);
      // والمقاس يبقى مقاسًا حقيقيًا: ورقة = A4 × النسبة.
      expect(px(sheets()[0].style.width)).toBeCloseTo(PAGE_W * Number(z), 0);
      expect(px(sheets()[0].style.height)).toBeCloseTo(PAGE_H * Number(z), 0);
    }

    for (const btn of ['ملاءمة الصفحة', 'ملاءمة العرض']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(btn) }));
      expect(pages()).toBe(2);
      expect(separators()).toBe(1);
      // نسبة A4 محفوظة في كل ورقة.
      const s = sheets()[0];
      expect(px(s.style.height) / px(s.style.width)).toBeCloseTo(PAGE_H / PAGE_W, 2);
    }
  });
});

// ── الطباعة وPDF ────────────────────────────────────────────────────────────────
describe('الطباعة والـ PDF بلا تغيير', () => {
  it('عناصر الفصل لا تدخل المستند المُركَّب', async () => {
    contentHeight = 1600;
    open();
    await loadFirstFrame();
    const srcdoc = frames()[0].getAttribute('srcdoc')!;
    for (const marker of ['pc-stack', 'pc-sheet', 'pc-canvas', 'pc-scrim', 'data-page']) {
      expect(srcdoc).not.toContain(marker);
    }
  });

  it('onPrint لم يتغيّر: الإغلاق ثم تفويض واحد', async () => {
    contentHeight = 1600;
    open();
    await loadFirstFrame();
    fireEvent.click(screen.getByRole('button', { name: 'طباعة' }));
    await waitFor(() => expect(onPrint).toHaveBeenCalledTimes(1));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('نافذة المعاينة لا تصل الورق (حاجز @media print باقٍ)', () => {
    expect(CSS).toMatch(/@media print\s*\{[\s\S]*?\.pc-scrim\s*\{\s*display:\s*none\s*!important/);
  });

  it('المُركِّب ومسار PDF لم يُمسّا', () => {
    const compose = readFileSync('src/printing/composeDocument.ts', 'utf8');
    expect(compose).toContain('export function composeStyledFromNode');
    const inv = readFileSync('src/pages/InvoicePreview.tsx', 'utf8');
    expect(inv).toContain('window.manar.exportPdfFromHtml(html, suggestedName)');
    const fl = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
    expect(fl).toContain('buildFormPdfDocument');
  });
});

// ── الانحدار ────────────────────────────────────────────────────────────────────
describe('الانحدار — كل المستهلكين يرثون الفصل بلا تغيير في سلوكهم', () => {
  it('المعاينة ما زالت لا تعرف IPC ولا تطبع', () => {
    const code = dialogSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const banned of ['window.manar', 'webContents', 'submitPrintJob', 'printCurrentView', 'pdfjs']) {
      expect(code).not.toContain(banned);
    }
  });

  it('الفاتورة وعرض السعر ونماذج Phase 1/2 تستخدم نفس الحوار — بلا نسخة خاصة', () => {
    for (const [file, marker] of [
      ['src/pages/InvoicePreview.tsx', 'compose={composeInvoicePreview}'],
      ['src/pages/Quotation.tsx', 'onPrint={runLegacyPrint}'],
      ['src/printing/useLegacyFormPreview.tsx', '<PrintPreviewDialog'],
      ['src/pages/EmploymentContract.tsx', 'useLegacyFormPreview({'],
      ['src/pages/PayrollPayslip.tsx', 'useLegacyFormPreview({'],
    ] as const) {
      expect(readFileSync(file, 'utf8')).toContain(marker);
    }
  });
});
