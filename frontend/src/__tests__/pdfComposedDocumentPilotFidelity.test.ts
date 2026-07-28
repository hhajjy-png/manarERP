// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { composeStyledFromNode, getPageSpec, MAX_COMPOSED_HTML_BYTES } from '../printing';

/**
 * Saved PDF Fidelity Pilot — تركيب المستند (المرحلة 5A).
 *
 * الهدف: إثبات أن «حفظ PDF» لشهادة الراتب و«المعاينة الدقيقة» يستقبلان نفس المستند
 * المُركَّب حرفيًا — لا نسختين متكافئتين. الشكل الحقيقي في `FormLayout.doExportPdf`
 * (فرع `pdfUseComposedDocument`) هو:
 *
 *   composeStyledFromNode({ node: formPageRef.current, pageSpec: getPageSpec('a4-portrait'),
 *                            title: title || name, lang, stripSelectors: ['.no-print'] })
 *
 * وهو **نفس الاستدعاء** الذي يبنيه `useAccurateFormPreview`'s composeDefault للمعاينة.
 * هذا الملف لا يُعيد اختبار `composeStyledFromNode` نفسها (مغطاة في
 * `printCenterPhase2bFidelity.test.ts`) — يثبت أن مُدخلات الاستدعاء الحقيقية (بنية
 * شهادة راتب: CSS التطبيق + قواعد الطباعة التي يحقنها FormLayout + خطوط Cairo +
 * صورتا التوقيع/الختم + تحويل «وضع التصميم») تُنتج مستندًا كاملًا وصحيحًا، وأن نفس
 * المُدخلات تُنتج **نفس المخرَج** حرفيًا في كل مرة.
 */

/** واجهة التطبيق: مطابقة لِما يحقنه app/theme.css فعليًا (توكن + جسم الصفحة). */
const APP_SHELL_CSS = `
:root { --app-font-ui: "IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif; --xpl-muted: #64748b; }
body { font-family: var(--app-font-ui); -webkit-font-smoothing: antialiased; }
@page { margin: 1cm; }
`;

/** خطوط Cairo عبر @fontsource — الأوزان الثلاثة التي تُحمَّل فعليًا على الشاشة. */
const FONTSOURCE_CAIRO_CSS = `
@font-face { font-family: 'Cairo'; font-style: normal; font-weight: 400; src: url(./cairo-arabic-400.woff2) format('woff2'); }
@font-face { font-family: 'Cairo'; font-style: normal; font-weight: 600; src: url(./cairo-arabic-600.woff2) format('woff2'); }
@font-face { font-family: 'Cairo'; font-style: normal; font-weight: 700; src: url(./cairo-arabic-700.woff2) format('woff2'); }
@media (prefers-color-scheme: dark) { body { background: #0f172a; } }
`;

/**
 * قواعد الطباعة التي يحقنها FormLayout نفسه — نفس البنية الحرفية الموجودة في
 * FormLayout.tsx اليوم (بروفايل letterhead: هامش 20مم موحّد)، **بما فيها @page
 * المتداخلة داخل @media print** — وهذا بالضبط ما يجعل هامش النموذج الحقيقي يفوز
 * على هامش app/theme.css العام (1cm) وعلى افتراضي PageSpec (a4-portrait، 12mm).
 */
const FORM_LAYOUT_PRINT_CSS = `
@media screen { .form-page { border: 1px solid #e2e8f0; box-shadow: 0 2px 12px rgba(0,0,0,0.07); } }
@media print {
  @page { size: A4; margin: 20mm; }
  html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
  .no-print { display: none !important; }
  .form-page { width: 100% !important; padding: 20mm !important; box-sizing: border-box !important; margin: 0 !important; max-width: none !important; border: none !important; box-shadow: none !important; }
  .form-page-footer { page-break-inside: avoid; }
}
`;

let styleEls: HTMLStyleElement[] = [];

function addSheet(css: string): void {
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
  styleEls.push(el);
}

/**
 * عقدة `.form-page` مصغّرة تحاكي بنية شهادة الراتب فعليًا: تذييل toolbar
 * (`.no-print`، يجب أن يُزال)، صورتا توقيع/ختم (data URI — كما تُخزَّن فعليًا في
 * الإعدادات)، وتحويل «وضع التصميم» على غلاف التوقيع (سحب/تحجيم عبر
 * `brandingElementTransform`، نفس آلية `ApprovalSection`).
 */
function salaryCertificateLikeNode(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'form-page';
  root.style.maxWidth = '793px';
  root.style.margin = '0 auto';
  root.style.background = '#fff';
  root.style.direction = 'rtl';

  const toolbar = document.createElement('div');
  toolbar.className = 'no-print';
  toolbar.textContent = 'شريط أدوات — لا يُطبع';
  root.appendChild(toolbar);

  const body = document.createElement('div');
  body.innerHTML = `
    <h1>شهادة راتب</h1>
    <div class="form-page-footer">
      <div style="transform: translate(4px, -2px) scale(1.05);">
        <img data-testid="signature" src="data:image/png;base64,SIGNATURE_BYTES" alt="توقيع" />
      </div>
      <img data-testid="stamp" src="data:image/png;base64,STAMP_BYTES" alt="ختم" />
    </div>
  `;
  root.appendChild(body);
  document.body.appendChild(root);
  return root;
}

beforeEach(() => {
  document.documentElement.setAttribute('dir', 'rtl');
  document.documentElement.setAttribute('lang', 'ar');
  document.body.className = 'xpl-scope';
  addSheet(APP_SHELL_CSS);
  addSheet(FONTSOURCE_CAIRO_CSS);
  addSheet(FORM_LAYOUT_PRINT_CSS);
});

afterEach(() => {
  styleEls.forEach((el) => el.remove());
  styleEls = [];
  document.body.innerHTML = '';
  document.body.className = '';
});

/** الاستدعاء الحقيقي حرفيًا — نفس شكل نداء FormLayout.doExportPdf (فرع الـPilot). */
const composeAsPilotPdf = (node: HTMLElement, lang: 'ar' | 'en' = 'ar') =>
  composeStyledFromNode({
    node,
    pageSpec: getPageSpec('a4-portrait'),
    title: 'شهادة راتب · 2026-01',
    lang,
    stripSelectors: ['.no-print'],
  });

describe('تكافؤ المُدخلات مع Accurate Preview', () => {
  it('نفس شكل نداء composeDefault داخل useAccurateFormPreview.tsx حرفيًا', () => {
    const hookSrc = readFileSync('src/printing/useAccurateFormPreview.tsx', 'utf8');
    // التوثيق الحرفي لِما يبنيه composeDefault — أي انحراف هنا يعني أن الـPilot لم
    // يعد يستدعي composeStyledFromNode بنفس الشكل الذي تستدعيه به المعاينة.
    expect(hookSrc).toContain('pageSpec: getPageSpec(pageSpecId)');
    expect(hookSrc).toContain("stripSelectors: ['.no-print']");
    expect(hookSrc).toContain("pageSpecId = 'a4-portrait'"); // الافتراضي الذي يعتمده الـPilot
  });

  it('نفس المُدخلات (عقدة + pageSpec + title + lang + stripSelectors) ⇒ نفس المستند المُركَّب حرفيًا في كل مرة', () => {
    // هذا هو إثبات التكافؤ المباشر: بما أن كلا الاستدعاءين الحقيقيين (Preview
    // وPDF) يمرّران نفس شكل المُدخلات بالبناء (مثبَت أعلاه)، فإن ثبات المخرَج تحت
    // نفس المُدخلات هو ما يضمن تطابق ما يراه المستخدم في المعاينة مع ما يُحفظ.
    const first = composeAsPilotPdf(salaryCertificateLikeNode());
    document.body.innerHTML = '';
    const second = composeAsPilotPdf(salaryCertificateLikeNode());
    expect(second).toBe(first);
  });
});

describe('@page — تفوز هوامش النموذج الحقيقية', () => {
  it('20mm (بروفايل letterhead) لا 12mm (افتراضي a4-portrait) ولا 1cm (app/theme.css العام)', () => {
    const html = composeAsPilotPdf(salaryCertificateLikeNode());
    const pages = html.match(/@page/g) ?? [];
    expect(pages.length).toBe(1); // مرة واحدة، لا تكرار
    expect(html).toMatch(/@page[^{]*\{[^}]*margin:\s*20mm/);
    expect(html).not.toMatch(/@page[^{]*\{[^}]*margin:\s*12mm/);
    expect(html).not.toMatch(/@page[^{]*\{[^}]*margin:\s*1cm/);
  });
});

describe('الخطوط وCSS الملتقط', () => {
  it('يحمل أوجه Cairo الثلاثة (400/600/700) — لا وزن واحد فقط', () => {
    const html = composeAsPilotPdf(salaryCertificateLikeNode());
    expect(html).toContain('font-weight: 400');
    expect(html).toContain('font-weight: 600');
    expect(html).toContain('font-weight: 700');
    expect((html.match(/@font-face/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('يحمل متغيّرات CSS المخصّصة (--app-font-ui) من التطبيق', () => {
    const html = composeAsPilotPdf(salaryCertificateLikeNode());
    expect(html).toContain('--app-font-ui');
  });

  it('يُسقط كتلة الوضع الداكن — الورقة تبقى فاتحة دومًا', () => {
    const html = composeAsPilotPdf(salaryCertificateLikeNode());
    expect(html).not.toContain('prefers-color-scheme: dark');
    expect(html).not.toContain('#0f172a');
  });

  it('يحمل قواعد @media print الخاصة بـ FormLayout نفسها', () => {
    const html = composeAsPilotPdf(salaryCertificateLikeNode());
    expect(html).toContain('@media print');
    expect(html).toContain('page-break-inside: avoid');
  });
});

describe('base URI / lang / dir / body class / color-scheme', () => {
  it('يحمل <base href> — يلزم لحلّ مسارات الخطوط والصور النسبية', () => {
    const html = composeAsPilotPdf(salaryCertificateLikeNode());
    expect(html).toMatch(/<base href="[^"]+">/);
  });

  it('ينسخ صنف body من المستند المصدر', () => {
    const html = composeAsPilotPdf(salaryCertificateLikeNode());
    expect(html).toContain('class="xpl-scope"');
  });

  it('يفرض ورقة فاتحة (color-scheme: light) بصرف النظر عن سمة النظام', () => {
    const html = composeAsPilotPdf(salaryCertificateLikeNode());
    expect(html).toContain('color-scheme: light');
  });

  it('الاتجاه: RTL للعربية، LTR للإنجليزية', () => {
    expect(composeAsPilotPdf(salaryCertificateLikeNode(), 'ar')).toContain('dir="rtl"');
    document.body.innerHTML = '';
    expect(composeAsPilotPdf(salaryCertificateLikeNode(), 'en')).toContain('dir="ltr"');
  });
});

describe('التوقيع والختم و«وضع التصميم» يبقيان داخل العقدة المُركَّبة', () => {
  it('صورتا التوقيع والختم (data URI) موجودتان في المخرَج', () => {
    const html = composeAsPilotPdf(salaryCertificateLikeNode());
    expect(html).toContain('data:image/png;base64,SIGNATURE_BYTES');
    expect(html).toContain('data:image/png;base64,STAMP_BYTES');
  });

  it('تحويل «وضع التصميم» (سحب/تحجيم) على غلاف التوقيع ينتقل حرفيًا', () => {
    const html = composeAsPilotPdf(salaryCertificateLikeNode());
    expect(html).toContain('transform: translate(4px, -2px) scale(1.05)');
  });

  it('شريط الأدوات (.no-print) يُزال، لكن محتوى المستند الحقيقي يبقى', () => {
    const html = composeAsPilotPdf(salaryCertificateLikeNode());
    expect(html).not.toContain('شريط أدوات — لا يُطبع');
    expect(html).toContain('شهادة راتب');
  });
});

describe('الحجم', () => {
  it('المستند المُركَّب أقل بكثير من الحد الأقصى المسموح', () => {
    const html = composeAsPilotPdf(salaryCertificateLikeNode());
    const bytes = new TextEncoder().encode(html).length;
    expect(bytes).toBeLessThan(MAX_COMPOSED_HTML_BYTES);
    expect(bytes).toBeLessThan(200 * 1024); // بنية اختبار مصغّرة — يجب أن تبقى صغيرة جدًا
  });
});

describe('Ready-paper — تعويض الترويسة يصل بلا تكرار ولا هامش خاطئ (المرحلة 5C)', () => {
  /**
   * عقدة تحاكي بروفايل ready-paper الفعلي: `@page` هامشه صفر (النموذج المصدر
   * تحوّل هوامشه إلى padding على `.form-page`)، مع قاعدة `[data-page-logo-header]`
   * (تعويض الطباعة الحقيقي — 5mm/scale:0.93) داخل @media print — نفس البنية
   * الحرفية التي يحقنها FormLayout حين `logoHeaderIsOverlay` صحيحة.
   */
  const READY_PAPER_CSS = `
    @media print {
      @page { size: A4; margin: 0; }
      .form-page { width: 100% !important; padding: 40mm 10mm 20mm 10mm !important; }
      .form-page-footer { page-break-inside: avoid; }
      [data-page-logo-header] {
        top: 5mm !important;
        transform: scale(0.93);
        transform-origin: top center;
      }
    }
  `;

  function readyPaperNode(): HTMLElement {
    const el = document.createElement('style');
    el.textContent = READY_PAPER_CSS;
    document.head.appendChild(el);
    styleEls.push(el);

    const root = document.createElement('div');
    root.className = 'form-page';
    const header = document.createElement('div');
    header.setAttribute('data-page-logo-header', '');
    header.textContent = 'ترويسة الشركة';
    root.appendChild(header);
    root.appendChild(document.createTextNode('محتوى المستند'));
    document.body.appendChild(root);
    return root;
  }

  it('@page هامشه صفر — لا 12mm الافتراضي، ولا أي هامش آخر مضاف', () => {
    const html = composeAsPilotPdf(readyPaperNode());
    expect(html).toMatch(/@page[^{]*\{[^}]*margin:\s*0/);
    expect((html.match(/@page/g) ?? []).length).toBe(1); // مرة واحدة، لا تكرار
  });

  it('تعويض [data-page-logo-header] يصل إلى PDF — مرة واحدة فقط، لا تكرار', () => {
    const html = composeAsPilotPdf(readyPaperNode());
    const occurrences = html.match(/\[data-page-logo-header\]/g) ?? [];
    expect(occurrences.length).toBe(1);
    expect(html).toContain('scale(0.93)');
    expect(html).toContain('top: 5mm');
  });

  it('page-break-inside: avoid يصل — يحرس ظهور صفحة فارغة غير متوقَّعة', () => {
    const html = composeAsPilotPdf(readyPaperNode());
    expect(html).toContain('page-break-inside: avoid');
  });

  it('لا قصّ: overflow لا يُقيَّد على .form-page المُركَّبة', () => {
    const html = composeAsPilotPdf(readyPaperNode());
    expect(html).not.toMatch(/\.form-page\s*\{[^}]*overflow:\s*hidden/);
  });

  it('الترويسة نفسها (data-page-logo-header) موجودة داخل العقدة المُركَّبة — لا تُستنسخ ولا تُفقد', () => {
    const html = composeAsPilotPdf(readyPaperNode());
    expect(html).toContain('ترويسة الشركة');
    // مطابقتان متوقّعتان بالضبط: قاعدة CSS الواحدة `[data-page-logo-header]`
    // (مُتحقَّق منها أعلاه) + سمة DOM الواحدة `data-page-logo-header=""` على عنصر
    // الترويسة نفسه — لا نسخة ثالثة زائدة من أيٍّ منهما.
    expect((html.match(/data-page-logo-header/g) ?? []).length).toBe(2);
    expect(html).toMatch(/<div data-page-logo-header="">/);
  });
});

describe('Ink Color — بند الـAudit المفتوح (تقرير فقط، بلا تعديل)', () => {
  it('ApprovalSection (توقيع/ختم النماذج الإدارية) لا يستخدم InkColorFilterDefs إطلاقًا', () => {
    // نتيجة التدقيق: نظام Ink Color v2 حصري لمسارات الفاتورة/عرض السعر/مصمّم
    // الهوية (InvoicePreview، DesignableBrandingImage، QuotationBase) — لا علاقة
    // له بشهادة الراتب أو أي نموذج إداري آخر يمرّ بـ ApprovalSection. حارس رخيص
    // يمنع دخول الاعتماد مستقبلًا بصمت دون مراجعة صريحة.
    const approvalSection = readFileSync('src/forms/shared/ApprovalSection.tsx', 'utf8');
    const formLayout = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
    expect(approvalSection).not.toContain('InkColorFilterDefs');
    expect(approvalSection).not.toContain('inkMode');
    expect(formLayout).not.toContain('InkColorFilterDefs');
  });
});
