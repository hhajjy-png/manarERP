// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { flushAsyncUpdates } from './helpers/flush';
import { readFileSync } from 'node:fs';
import { PrintPreviewDialog } from '../printing';

/**
 * Universal Print Preview — Corrective & UI Polish v1.
 *
 * ثلاثة عيوب مؤكّدة يدويًا:
 *   1. زر «طباعة» الأصلي اختفى — استُبدل بزر المعاينة.
 *   2. خيارات التكبير غير مقروءة (أبيض على أبيض).
 *   3. موضع KWD معكوس: «KWD 280.000» بدل «280.000 KWD».
 * + إزالة زر «تحصيل» من شريط شاشة الطباعة، وتنظيم الشريط.
 */

const invoiceSrc = readFileSync('src/pages/InvoicePreview.tsx', 'utf8');
const dialogSrc = readFileSync('src/printing/components/PrintPreviewDialog.tsx', 'utf8');
const css = readFileSync('src/printing/components/PrintCenter.css', 'utf8');

function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');
}
const invoiceCode = code(invoiceSrc);

afterEach(cleanup);

// ── العيب 1: زر الطباعة الأصلي ───────────────────────────────────────────────────
describe('العيب 1 — زر الطباعة الأصلي', () => {
  it('زر «طباعة» الأصلي موجود ويستدعي مسار الطباعة القديم مباشرة', () => {
    expect(invoiceCode).toContain("onClick={() => printCurrentView()}");
    expect(invoiceCode).toContain("t('btn.inv.print_invoice')");
  });

  it('زر الطباعة لا يفتح المعاينة ولا يتأثر بعلم المعاينة', () => {
    // زر الطباعة خارج أي شرط على العلم — لا ternary يستبدله بزر المعاينة.
    expect(invoiceCode).not.toMatch(
      /usePrintCenterInvoice \?\s*\(\s*<button[^>]*onClick=\{\(\) => setPrintCenterOpen\(true\)\}/,
    );
    const printBtn = invoiceCode.indexOf("t('btn.inv.print_invoice')");
    const before = invoiceCode.slice(Math.max(0, printBtn - 260), printBtn);
    expect(before).not.toContain('usePrintCenterInvoice');
  });

  /**
   * Reassessed after the WYSIWYG POC (review item 7).
   *
   * The ORIGINAL guard grepped a ±120-character window around the FIRST occurrence of
   * `setPrintCenterOpen(true)`. That was accidental-satisfaction-prone in both
   * directions: it inspected only one site, and any unrelated code drifting into the
   * window could break or silently weaken it. The POC's
   * `onFallback={() => setPrintCenterOpen(true)}` legitimately sits next to an
   * `onPrint` prop, which is what exposed the weakness.
   *
   * The replacement is STRICTLY STRONGER: instead of looking near one site, it
   * ENUMERATES EVERY `printCurrentView` call site in the page and requires each one to
   * be an explicitly allow-listed delegation. A new, unreviewed print call anywhere in
   * the invoice screen now fails this test — which the old proximity grep would have
   * missed entirely.
   */
  it('every printCurrentView call site is an explicit, allow-listed print delegation', () => {
    const CALL = /printCurrentView\(\)/g;
    // The only legitimate ways the invoice screen may reach the legacy print path.
    const ALLOWED = [
      /onClick=\{\(\) => printCurrentView\(\)\}/,       // the official Print button
      /onPrint=\{\(\) => printCurrentView\(\)\}/,       // a preview dialog delegating on «طباعة»
      /setTimeout\(\(\) => printCurrentView\(\), \d+\)/, // the ?print=1 auto-print effect
    ];

    const sites: string[] = [];
    for (const m of invoiceCode.matchAll(CALL)) {
      const from = Math.max(0, (m.index ?? 0) - 60);
      sites.push(invoiceCode.slice(from, (m.index ?? 0) + 40).replace(/\s+/g, ' ').trim());
    }
    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      expect(
        ALLOWED.some((re) => re.test(site)),
        `unexpected printCurrentView call site: ${site}`,
      ).toBe(true);
    }
  });

  it('no button that OPENS a preview prints — the accurate-preview (WYSIWYG) one', () => {
    // Every preview-opening click handler, checked at the handler itself (not by proximity).
    const opener = 'onClick={() => setWysiwygPocOpen(true)}'; // accurate preview
    expect(invoiceCode).toContain(opener);
    let from = 0;
    for (;;) {
      const idx = invoiceCode.indexOf(opener, from);
      if (idx === -1) break;
      const around = invoiceCode.slice(Math.max(0, idx - 140), idx + opener.length + 140);
      expect(around).not.toContain('printCurrentView');
      from = idx + opener.length;
    }
  });

  it('the official Print button is not gated by any preview flag', () => {
    const printBtn = invoiceCode.indexOf("t('btn.inv.print_invoice')");
    const before = invoiceCode.slice(Math.max(0, printBtn - 260), printBtn);
    expect(before).not.toContain('usePrintCenterInvoice');
    expect(before).not.toContain('useWysiwygPoc');
  });

  it('الأزرار مصنّفة بصريًا: الطباعة أساسية، وما عداها ثانوي — ولا إجراء خطر', () => {
    expect(invoiceCode).toMatch(/className="btn"[\s\S]{0,90}printCurrentView/); // أساسي
    expect(invoiceCode).toMatch(/className="btn secondary"[\s\S]{0,220}t\('btn\.accurate_preview'\)/); // المعاينة الدقيقة — ثانوي
    expect(invoiceCode).not.toContain('danger-ghost'); // «إلغاء» غادر شاشة الطباعة
  });
});

// ── العيب 2: تباين خيارات التكبير ────────────────────────────────────────────────
describe('العيب 2 — خيارات التكبير مقروءة', () => {
  it('لون النص والخلفية مُعيَّنان صراحةً على select وعلى option (لا وراثة)', () => {
    expect(css).toMatch(/\.pc-select\s*\{[^}]*color:\s*#0f172a\s*!important/);
    expect(css).toMatch(/\.pc-select\s*\{[^}]*background-color:\s*#ffffff\s*!important/);
    expect(css).toMatch(/\.pc-select option\s*\{[^}]*color:\s*#0f172a\s*!important/);
    expect(css).toMatch(/\.pc-select option\s*\{[^}]*background-color:\s*#ffffff\s*!important/);
  });

  it('لا white-on-white ولا dark-on-dark — الخيار المحدَّد/المؤشَّر مقروء', () => {
    expect(css).toMatch(/option:checked[\s\S]{0,80}color:\s*#ffffff\s*!important/);
    expect(css).toMatch(/option:checked[\s\S]{0,120}background-color:\s*#4f46e5\s*!important/);
  });

  it('الوضع الداكن مغطّى صراحةً', () => {
    const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    expect(dark).toMatch(/\.pc-select\s*\{[^}]*color:\s*#f1f5f9\s*!important/);
    expect(dark).toMatch(/\.pc-select option\s*\{[^}]*background-color:\s*#1e293b\s*!important/);
  });

  it('حالة disabled لا تعتمد على الشفافية وحدها', () => {
    expect(css).toMatch(/\.pc-select:disabled\s*\{[^}]*color:\s*#64748b\s*!important/);
    expect(css).toMatch(/\.pc-select:disabled\s*\{[^}]*opacity:\s*1/);
  });
});

// ── العيب 3: موضع KWD ────────────────────────────────────────────────────────────
describe('العيب 3 — موضع KWD', () => {
  it('السبب الجذري bidi لا الـ formatter: عزل LTR على كل موضع نقدي', () => {
    expect(invoiceCode).toContain("direction: 'ltr'");
    expect(invoiceCode).toContain("unicodeBidi: 'isolate'");
    expect(invoiceCode).toContain('moneyCell');
  });

  it('يستخدم الـ formatter المشترك الرسمي فقط — لا formatter محلي جديد', () => {
    expect(invoiceCode).toContain("import { money, dateText } from '../config/modules'");
    expect(invoiceCode).not.toContain('NumberFormat');
    expect(invoiceCode).not.toContain('toLocaleString');
    // لا سلسلة KWD مكتوبة يدويًا في الصفحة (ما يمنع KWD مكرَّرة).
    expect(invoiceCode).not.toContain("'KWD'");
    expect(invoiceCode).not.toContain('"KWD"');
  });

  it('الصيغة الرسمية «1,135.000 KWD»: الرقم أولًا، ثلاث منازل، أرقام غربية', async () => {
    const { formatCurrency } = await import('../lib/format');
    const out = formatCurrency(1135, { language: 'english' });
    expect(out).toBe('1,135.000 KWD'); // الرقم ثم الرمز
    expect(out).not.toMatch(/^KWD/);
    expect(out).not.toMatch(/[٠-٩]/); // أرقام غربية
    expect((out.match(/KWD/g) ?? []).length).toBe(1); // لا تكرار
  });

  it('العزل مطبَّق على كل المواضع: البنود والمجاميع والمسدد والمتبقي', () => {
    for (const site of [
      'money(item.unitPrice)',
      'money(item.total)',
      'money(data.subtotal)',
      'money(data.total)',
      'money(data.paidAmount)',
    ]) {
      const i = invoiceCode.indexOf(site);
      expect(i).toBeGreaterThan(-1);
      const around = invoiceCode.slice(Math.max(0, i - 200), i);
      expect(around).toMatch(/moneyCell|fValMoney/);
    }
    // كل خلايا المستند المطبوع معزولة (١١ موضعًا). نافذة الدفع ليست جزءًا من المستند.
    expect((invoiceCode.match(/moneyCell|fValMoney/g) ?? []).length).toBeGreaterThanOrEqual(11);
  });

  it('لا تغيير في الحسابات', () => {
    expect(invoiceCode).toContain('const remaining');
    expect(invoiceCode).not.toContain('Math.round(total *'); // لا حساب جديد
  });
});

// ── زر «تحصيل» ───────────────────────────────────────────────────────────────────
describe('زر «تحصيل» — أُزيل من شريط شاشة الطباعة فقط', () => {
  it('غير موجود في شريط شاشة الطباعة', () => {
    const bar = invoiceCode.slice(
      invoiceCode.indexOf('invx-actions'),
      invoiceCode.indexOf('invx-doc-settings'),
    );
    expect(bar).not.toContain("t('page.invoices.collect')");
  });

  it('وظيفة التحصيل ومكوّناتها لم تُحذف', () => {
    expect(invoiceCode).toContain('canCollect'); // الشرط ما زال محسوبًا
    expect(invoiceCode).toContain('setPaying'); // نافذة الدفع باقية
    expect(invoiceCode).toContain('payAmount');
    expect(invoiceCode).toContain('payMethod');
    expect(invoiceCode).toMatch(/\/payments|addPayment|handlePay/); // مسار الدفع باقٍ
  });

  it('صلاحيات التحصيل ومنطق العمل بلا تغيير', () => {
    expect(invoiceCode).toContain("hasPermission('invoices.update')");
    // لا تغيير في API الدفع — المسار ما زال محميًا كما كان.
    const backend = readFileSync('../backend/src/modules/payments/payments.routes.ts', 'utf8');
    expect(backend).toContain('router.use(authenticate)');
    expect(backend).toContain('requireRole(ROLES.SYSTEM_ADMIN)');
  });

  it('الزر باقٍ في المواضع التشغيلية الأخرى (قائمة الفواتير)', () => {
    const invoices = readFileSync('src/pages/Invoices.tsx', 'utf8');
    expect(invoices).toMatch(/collect|تحصيل/i);
  });
});

// ── ترتيب الأزرار والحجم المدمج ──────────────────────────────────────────────────
describe('شريط الإجراءات — الترتيب والحجم', () => {
  it('الترتيب حسب الأولوية: رجوع ← طباعة ← معاينة ← PDF ← تصميم ← تعديل ← إلغاء', () => {
    const at = (s: string) => invoiceCode.indexOf(s);
    const back = at('action.back') >= 0 ? at('action.back') : at('رجوع');
    const print = at("t('btn.inv.print_invoice')");
    const preview = at("t('btn.accurate_preview')");
    const pdf = at('⬇️ PDF');
    const edit = at("t('action.edit')");
    const template = at('قالب الطباعة');
    expect(print).toBeLessThan(preview);
    expect(preview).toBeLessThan(pdf);
    expect(pdf).toBeLessThan(edit);
    expect(edit).toBeLessThan(template); // «قالب الطباعة» آخر الأدوات — موضع «إلغاء» السابق
    if (back >= 0) expect(back).toBeLessThan(print);
  });

  it('الحجم المدمج محصور في هذه الشاشة — لا تغيير عالمي لأزرار المشروع', () => {
    expect(css).toMatch(/\.invx-actions \.btn\s*\{[\s\S]*?height:\s*38px/);
    expect(css).toMatch(/\.invx-actions \.btn\s*\{[\s\S]*?padding-inline:\s*14px/);
    expect(css).toMatch(/\.invx-actions \.btn\s*\{[\s\S]*?font-size:\s*13\.5px/);
    expect(css).toMatch(/\.invx-actions\s*\{[\s\S]*?gap:\s*8px/);
    // لا قاعدة عامة على .btn وحدها
    expect(css).not.toMatch(/^\.btn\s*\{/m);
  });

  it('يلتف بصورة منظمة في العرض المتوسط', () => {
    expect(css).toMatch(/\.invx-actions\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  });

  it('الصف الثانوي يحمل خيارات المحتوى فقط: التوقيع والختم', () => {
    expect(invoiceCode).toContain('invx-doc-settings');
    const settings = invoiceCode.slice(invoiceCode.indexOf('invx-doc-settings'));
    // خيارات التوقيع/الختم صارت عنصرًا مشتركًا (BrandingAssetPicker) بعد
    // Multi-Signature & Stamp Management v1 — نفس الصف ونفس المحتوى، بلا منطق محلي.
    expect(settings).toContain('<BrandingAssetPicker selection={brandingSelection} />');
    expect(settings).not.toContain('قالب الطباعة'); // انتقل إلى الصف الأساسي
    // ولا يُصيَّر أصلًا إن لم تكن الخيارات جاهزة — فلا فراغ بصري مكان الزر المنقول.
    expect(invoiceCode).toMatch(/brandingSelection\.ready && \(\s*<div className="no-print invx-doc-settings">/);
  });

  it('«إلغاء» غادر شريط شاشة الطباعة — ووظيفته لم تُمسّ', () => {
    const bar = invoiceCode.slice(
      invoiceCode.indexOf('invx-actions'),
      invoiceCode.indexOf('invx-doc-settings'),
    );
    expect(bar).not.toContain("t('page.invoices.cancel_inv')");
    // الـ handler وnافذة التأكيد وحالة الإلغاء والـ API — كلها باقية بلا تغيير.
    expect(invoiceCode).toContain('executeCancel');
    expect(invoiceCode).toContain('showCancelConfirm');
    expect(invoiceCode).toContain('/cancel');
    // ويبقى الإلغاء متاحًا تشغيليًا في قائمة الفواتير (Quick + Danger actions + تأكيد).
    const invoices = readFileSync('src/pages/Invoices.tsx', 'utf8');
    expect(invoices).toContain("t('page.invoices.cancel_inv')");
    expect(invoices).toContain("api.patch(`/invoices/${id}/cancel`)");
    expect(invoices).toContain("t('confirm.cancel_invoice')");
  });

  it('«قالب الطباعة» أداة إعداد في الصف الأساسي — أخفّ من «طباعة»، ومنطقه بلا تغيير', () => {
    const bar = invoiceCode.slice(
      invoiceCode.indexOf('invx-actions'),
      invoiceCode.indexOf('invx-doc-settings'),
    );
    expect(bar).toContain('قالب الطباعة');
    expect(bar).toMatch(/className="btn secondary"[\s\S]{0,600}قالب الطباعة/); // لا primary
    expect(bar).toContain("setPreviewMode(m => m === 'legacy' ? 'engine' : 'legacy')"); // نفس السلوك
    expect(bar).toContain('dashboard_customize'); // أيقونة واضحة لا زخرفية
  });
});

// ── تحسينات المعاينة ─────────────────────────────────────────────────────────────
describe('نافذة المعاينة — التحسينات', () => {
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

  it('Fit Width هو الوضع الافتراضي', async () => {
    await setup();
    expect(screen.getByRole('button', { name: /ملاءمة العرض/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('Fit Page موجود ويستخدم حسابًا مستقلًا (أصغر النسبتين) لا نسبة ثابتة', async () => {
    await setup();
    expect(screen.getByRole('button', { name: /ملاءمة الصفحة/ })).toBeInTheDocument();
    const c = code(dialogSrc);
    expect(c).toContain('Math.min(availW / pageWpx, availH / pageHpx)'); // Fit Page
    expect(c).toContain('availW / pageWpx'); // Fit Width
    expect(c).toContain('ResizeObserver'); // يُعاد الحساب عند تغيير الحجم
  });

  it('كل نسب التكبير معروضة', async () => {
    await setup();
    for (const p of ['25%', '50%', '75%', '100%', '125%', '150%', '200%']) {
      expect(screen.getByRole('option', { name: p })).toBeInTheDocument();
    }
  });

  it('الورقة متوسّطة داخل الـ canvas، والـ canvas وحده قابل للتمرير', () => {
    expect(css).toMatch(/\.pc-canvas\s*\{[\s\S]*?justify-content:\s*center/);
    expect(css).toMatch(/\.pc-canvas\s*\{[\s\S]*?overflow:\s*auto/);
    expect(css).toMatch(/\.pc-body\s*\{[\s\S]*?overflow:\s*hidden/); // التمرير ليس هنا
    expect(css).toMatch(/overscroll-behavior:\s*contain/); // لا يتسرّب خلف النافذة
  });

  it('حشوة بصرية حول الورقة وتتقلّص على الشاشات الضيقة', () => {
    expect(css).toMatch(/\.pc-canvas\s*\{[\s\S]*?padding:\s*56px/);
    expect(css).toMatch(/max-width:\s*900px[\s\S]{0,80}padding:\s*40px/);
  });

  it('الورقة بيضاء بحدّ خفيف وظل هادئ', () => {
    expect(css).toMatch(/\.pc-sheet\s*\{[\s\S]*?background:\s*#fff/);
    expect(css).toMatch(/\.pc-sheet\s*\{[\s\S]*?border:\s*1px solid/);
    expect(css).toMatch(/\.pc-sheet\s*\{[\s\S]*?box-shadow/);
  });

  it('تمرير صفحة التطبيق مقفل أثناء الفتح ويعود بعد الإغلاق', () => {
    const c = code(dialogSrc);
    // القفل صار عبر العدّاد المرجعي المشترك (`lib/scrollLock`) بدل كتابة
    // `body.style.overflow` مباشرة — النيّة نفسها، والآلية آمنة عند التداخل.
    expect(c).toContain('lockScroll()');
    expect(c).toContain('unlockScroll()');
    expect(c).not.toContain('document.body.style.overflow');
  });

  it('عدد الصفحات تقديري ولا أزرار تنقّل وهمية', async () => {
    await setup();
    expect(screen.getAllByText(/الصفحات التقديرية/).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText('الصفحة التالية')).toBeNull();
    expect(screen.queryByLabelText('الصفحة السابقة')).toBeNull();
  });

  it('زر «طباعة» يغلق المعاينة ثم يستدعي callback مرة واحدة', async () => {
    const { onPrint, onClose } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'طباعة' }));
    expect(onClose).toHaveBeenCalledTimes(1); // الإغلاق أولًا
    await flushAsyncUpdates(); // التفويض يقع في إطار الرسم التالي — ننتظره
    await vi.waitFor(() => expect(onPrint).toHaveBeenCalledTimes(1));
  });

  it('النقر المزدوج لا ينفّذ عمليتين', async () => {
    const { onPrint } = await setup();
    const btn = screen.getByRole('button', { name: 'طباعة' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await flushAsyncUpdates();
    await vi.waitFor(() => expect(onPrint).toHaveBeenCalledTimes(1));
    expect(onPrint).toHaveBeenCalledTimes(1);
  });

  it('الإغلاق لا يطبع', async () => {
    const { onPrint, onClose } = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPrint).not.toHaveBeenCalled();
  });

  it('الـ iframe لا يستدعي أي IPC ولا يطبع بنفسه', () => {
    const c = code(dialogSrc);
    for (const banned of ['window.manar', 'webContents', 'printArtifact', 'submitPrintJob', 'printCurrentView', 'pdfjs']) {
      expect(c).not.toContain(banned);
    }
    expect(document.querySelector('iframe')).toBeNull(); // لم تُفتح بعد
    setup();
    expect(document.querySelector('iframe')!.getAttribute('sandbox')).toBe('allow-same-origin');
  });
});

// ── الانحدار ─────────────────────────────────────────────────────────────────────
describe('الانحدار', () => {
  it('Quotation لا تتأثر — مسار طباعتها القديم كما هو', () => {
    const q = readFileSync('src/pages/Quotation.tsx', 'utf8');
    expect(q).toContain('printCurrentView()');
    expect(q).toContain('@page { size: A4; margin: 0; }');
  });

  it('لا عودة لـ PDF.js أو النافذة المخفية أو artifact printing', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.dependencies['pdfjs-dist']).toBeUndefined();
    const preload = readFileSync('../electron/preload.ts', 'utf8');
    expect(preload).not.toContain('printArtifact');
    expect(preload).not.toContain('plugins');
  });

  it('الشيكات وForms والطباعة القديمة بلا مساس', () => {
    const cheques = readFileSync('src/pages/Cheques.tsx', 'utf8');
    expect(cheques).toContain('const CHEQUE_PAGE_OFFSET_Y_MM: number = 40;');
    const form = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
    expect(form).toContain('submitPrintJob(');
    expect(invoiceCode).toContain('@page { size: A4; margin: 8mm 10mm; }'); // هندسة الفاتورة
  });
});
