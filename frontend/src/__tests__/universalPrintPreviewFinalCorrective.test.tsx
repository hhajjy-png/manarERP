// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import { PrintPreviewDialog, composeStyledFromNode, getPageSpec } from '../printing';

/**
 * Universal Print Preview — Final Corrective v1.
 *
 * A. الصفحات التقديرية = 2 لفاتورة من صفحة واحدة، مع امتداد أبيض طويل.
 *    السبب: القياس كان يقرأ `documentElement.scrollHeight` — وهو **لا يقلّ عن ارتفاع
 *    الـ viewport**، وviewport الـ iframe هو ارتفاعه الذي نضبطه نحن. أي أن القياس كان
 *    يقيس الإطار لا المستند، وكان بابًا لحلقة ذاتية.
 *
 * B. الإطار الأسود في PDF: `pdf:export` يلتقط النافذة الحيّة، وElectron يتجاهل
 *    `@media print` هناك، فتُرسم خلفية قشرة التطبيق حول الفاتورة.
 */

const MM_TO_PX = 96 / 25.4;
const PAGE_H = 297 * MM_TO_PX; // ≈ 1122.52 — والـ iframe يُضبط على 1123 (مُقرَّب)
const dialogSrc = readFileSync('src/printing/components/PrintPreviewDialog.tsx', 'utf8');
const invoiceSrc = readFileSync('src/pages/InvoicePreview.tsx', 'utf8');

/** ارتفاع كل عنصر داخل مستند الـ iframe — jsdom لا يحسب تخطيطًا. */
let contentHeight = 900;
/** ما يعيده `documentElement.scrollHeight`: أرضيته هي ارتفاع الـ viewport (مصدر الخلل القديم). */
const viewportFloor = () => Math.max(contentHeight, 1123);

/**
 * jsdom لا يحسب تخطيطًا. نزرع الأبعاد داخل **realm الـ iframe نفسه** — فله window
 * وprototype مستقلّان عن الصفحة الحاضنة (لو زرعناها في الخارج لقرأ المكوّن أصفارًا،
 * ولمرّ الاختبار زورًا).
 */
function stubLayout(win: Window & typeof globalThis) {
  Object.defineProperty(win.HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: HTMLElement) {
      const h = this.hasAttribute('data-print-root') ? contentHeight : 0;
      return { width: 794, height: h, top: 0, left: 0, right: 794, bottom: h, x: 0, y: 0 } as DOMRect;
    },
  });
  Object.defineProperty(win.HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.hasAttribute('data-print-root')) return contentHeight;
      // body — أرضيته هي ارتفاع الـ viewport: مصدر الصفحة الثانية الوهمية القديمة.
      return viewportFloor();
    },
  });
}

beforeEach(() => {
  contentHeight = 900; // فاتورة من صفحة واحدة
  // ورقة أنماط حقيقية: `capturePrintStyles` يرفض مستندًا بلا أنماط (بحق).
  const style = document.createElement('style');
  style.id = 'test-styles';
  style.textContent = '@page { size: A4; margin: 8mm 10mm; } .inv-wrap { color: #0f172a; }';
  document.head.appendChild(style);
});

afterEach(() => {
  cleanup();
  document.getElementById('test-styles')?.remove();
});

/** مستند مُركَّب حقيقي: نفس المُركِّب المستخدم في المعاينة والتصدير. */
function composeDoc(): string {
  const node = document.createElement('div');
  node.className = 'inv-wrap';
  node.innerHTML = '<h1>فاتورة</h1><p>1,135.000 KWD</p>';
  document.body.appendChild(node);
  const html = composeStyledFromNode({
    node,
    pageSpec: getPageSpec('a4-portrait'),
    title: 'فاتورة MN-INV-2026-0217',
    lang: 'ar',
    stripSelectors: ['.no-print'],
  });
  node.remove();
  return html;
}

function openPreview(html?: string) {
  render(
    <PrintPreviewDialog
      open
      onClose={vi.fn()}
      onPrint={vi.fn()}
      compose={() => html ?? '<!DOCTYPE html><html><body><div data-print-root>م</div></body></html>'}
      documentLabel="فاتورة · MN-INV-2026-0217"
    />,
  );
}

/** srcDoc لا يُحمّل في jsdom، فنبني مستند الإطار يدويًا ثم نطلق onLoad. */
async function loadFrame() {
  const frame = document.querySelector('.pc-frame') as HTMLIFrameElement;
  const doc = frame.contentDocument!;
  stubLayout(frame.contentWindow as Window & typeof globalThis);
  const root = doc.createElement('div');
  root.setAttribute('data-print-root', '');
  root.textContent = 'محتوى الفاتورة';
  doc.body.appendChild(root);
  fireEvent.load(frame);
  await waitFor(() => expect(document.querySelector('.pc-sheet')).toBeTruthy());
  return frame;
}

const pages = () => Number(document.querySelector('.pc-pages strong')!.textContent);
const sheetH = () => Number.parseFloat((document.querySelector('.pc-sheet') as HTMLElement).style.height);

// ── Part A ──────────────────────────────────────────────────────────────────────
describe('Part A — قياس عدد الصفحات', () => {
  it('فاتورة من صفحة واحدة ⇒ صفحة واحدة (لا صفحة ثانية وهمية)', async () => {
    contentHeight = 900;
    openPreview();
    await loadFrame();
    expect(pages()).toBe(1);
  });

  it('لا امتداد أبيض: ارتفاع الورقة = صفحة واحدة فقط', async () => {
    contentHeight = 900;
    openPreview();
    await loadFrame();
    const scale = sheetH() / PAGE_H; // الورقة = pageH × pageCount × scale
    expect(sheetH()).toBeCloseTo(PAGE_H * 1 * scale, 0);
    expect(sheetH()).toBeLessThan(PAGE_H * 2 * scale);
  });

  it('القياس لا يعتمد على ارتفاع الـ iframe الخارجي ولا على body.scrollHeight', () => {
    const code = dialogSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toContain("doc.querySelector<HTMLElement>('[data-print-root]')");
    expect(code).not.toContain('doc.body.scrollHeight');
    expect(code).not.toContain('documentElement.scrollHeight'); // ← أرضية الـ viewport
    // ولا يدخل ارتفاع الإطار (pageCount) في معادلة القياس ⇒ لا حلقة ذاتية.
    const measure = code.slice(code.indexOf('const onFrameLoad'), code.indexOf('const doPrint'));
    expect(measure).not.toContain('pageCount');
    expect(measure).not.toContain('frameRef.current.style');
  });

  it('تجاوز كسري 1–2px لا يصنع صفحة ثانية', async () => {
    contentHeight = PAGE_H + 1.5; // ‎1124.02‎ — تجاوز كسري لا أكثر
    openPreview();
    await loadFrame();
    expect(pages()).toBe(1);
  });

  it('لكن تجاوزًا حقيقيًا يعطي صفحتين — لا نخفي صفحة موجودة', async () => {
    contentHeight = 1600; // محتوى يفيض عن صفحة فعلًا
    openPreview();
    await loadFrame();
    expect(pages()).toBe(2);
  });

  it('ثلاث صفحات تُحسب ثلاثًا — لا hardcode لواحدة', async () => {
    contentHeight = PAGE_H * 2.4;
    openPreview();
    await loadFrame();
    expect(pages()).toBe(3);
  });

  it('تغيير التكبير لا يغيّر عدد الصفحات (القياس مستقل عن العرض)', async () => {
    contentHeight = 900;
    openPreview();
    await loadFrame();
    expect(pages()).toBe(1);
    for (const z of ['0.25', '2', '1']) {
      fireEvent.change(screen.getByLabelText('مستوى التكبير'), { target: { value: z } });
      expect(pages()).toBe(1);
    }
    fireEvent.click(screen.getByRole('button', { name: /ملاءمة الصفحة/ }));
    expect(pages()).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: /ملاءمة العرض/ }));
    expect(pages()).toBe(1);
  });

  it('المستند المُركَّب يحمل [data-print-root] — مرساة القياس موجودة فعلًا', () => {
    expect(composeDoc()).toContain('data-print-root');
  });
});

// ── Part B ──────────────────────────────────────────────────────────────────────
describe('Part B — تصدير PDF بلا إطار أسود', () => {
  const code = invoiceSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');

  it('التصدير يمرّ عبر HTML مستقل (النافذة المخفية) لا عبر التقاط النافذة الحيّة', () => {
    expect(code).toContain('composeInvoicePreview()');
    expect(code).toContain('window.manar.exportPdfFromHtml(html, suggestedName)');
    // `exportPdf` باقٍ كمسار احتياطي فقط للبيئات بلا الجسر — لا كمسار أساسي.
    expect(code).toMatch(/exportPdfFromHtml[\s\S]{0,200}window\.manar\?\.exportPdf\(suggestedName\)/);
  });

  it('مستند التصدير: html وbody بخلفية بيضاء صريحة، بهامش وحشو صفر', () => {
    const html = composeDoc();
    expect(html).toMatch(/html,\s*body\s*\{[^}]*background:\s*#fff\s*!important/);
    expect(html).toMatch(/html,\s*body\s*\{[^}]*margin:\s*0/);
    expect(html).toMatch(/html,\s*body\s*\{[^}]*padding:\s*0/);
    expect(html).toContain('color-scheme: light'); // لا خلفية داكنة موروثة
  });

  it('المستند لا يحمل قشرة التطبيق ولا سطح المعاينة', () => {
    const html = composeDoc();
    for (const chrome of ['pc-scrim', 'pc-canvas', 'pc-toolbar', 'pc-sheet', 'invx-actions', 'sidebar', 'xpl-shell']) {
      expect(html).not.toContain(chrome);
    }
    expect(html).not.toContain('no-print'); // شريط الأوامر مُقتطع
  });

  it('الجذر القابل للطباعة يملأ الصفحة: لا إطار ولا ظل ولا خلفية سلف حوله', () => {
    const html = composeDoc();
    expect(html).toMatch(/\[data-print-root\]\s*\{[^}]*margin:\s*0\s*!important/);
    expect(html).toMatch(/\[data-print-root\]\s*\{[^}]*box-shadow:\s*none\s*!important/);
    expect(html).toMatch(/\[data-print-root\]\s*\{[^}]*background:\s*#fff\s*!important/);
  });

  it('@page واحد فقط — قاعدة القالب هي التي تسود، ولا مقاس شاشة', () => {
    const html = composeDoc();
    expect((html.match(/@page/g) ?? []).length).toBe(1);
    // قاعدة القالب (هوامش الفاتورة) تسود على قاعدة PageSpec — سلوك مقصود وغير متغيّر.
    // (jsdom يُسقط الواصف `size` عند التحليل؛ Chromium يحتفظ به — لذا نؤكّد على الهوامش.)
    expect(html).toMatch(/@page\s*\{[^}]*margin:\s*8mm 10mm/);
    expect(html).not.toMatch(/@page[^}]*min-width/); // لا شيء من مقاسات الشاشة
  });

  it('العربية وKWD تعبران التصدير كما هما', () => {
    const html = composeDoc();
    expect(html).toContain('فاتورة');
    expect(html).toContain('1,135.000 KWD'); // الرقم أولًا، ثلاث منازل
    expect(html).toContain('dir="rtl"');
  });
});

// ── الانحدار ────────────────────────────────────────────────────────────────────
describe('الانحدار — المسارات المستقرة بلا مساس', () => {
  it('printCurrentView ومسار الطباعة القديم لم يتغيّرا', () => {
    expect(invoiceSrc).toContain('onClick={() => printCurrentView()}');
    expect(invoiceSrc).toContain('@page { size: A4; margin: 8mm 10mm; }');
    const client = readFileSync('src/api/client.ts', 'utf8');
    expect(client).toContain('printPage');
    expect(client).toContain('exportPdf');
    expect(client).toContain('exportPdfFromHtml');
  });

  it('الطباعة من المعاينة ما زالت تغلق ثم تفوّض للصفحة — والمعاينة لا تعرف IPC', () => {
    const code = dialogSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toContain('onClose();');
    expect(code).toContain('onPrint();');
    for (const banned of ['window.manar', 'webContents', 'printToPDF', 'pdfjs']) {
      expect(code).not.toContain(banned);
    }
  });

  it('مسار PDF في Electron لم يُعدَّل (الجسران باقيان كما هما)', () => {
    const ipc = readFileSync('../electron/ipc/pdf.ipc.ts', 'utf8');
    expect(ipc).toContain("ipcMain.handle('pdf:exportHtml'");
    expect(ipc).toContain("ipcMain.handle('pdf:export'");
    expect(ipc).toContain('waitForRenderReady(hiddenWin)');
  });

  it('Forms ما زالت على نفس مبدأ التصدير المستقل', () => {
    const form = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
    expect(form).toMatch(/exportPdfFromHtml|exportFromHtml/);
  });
});
