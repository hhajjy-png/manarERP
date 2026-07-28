// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import ApprovalSection from '../forms/shared/ApprovalSection';
import {
  BRANDING_LAYOUT_BOUNDS,
  DEFAULT_ELEMENT_LAYOUT,
  brandingElementTransform,
  clampBrandingElementLayout,
} from '../print-templates/utils/brandingLayout';
import type { BrandingLayout } from '../print-templates/engine/types';

/**
 * الحدود المركزية المعتمدة لتخطيط التوقيع والختم.
 *
 * كان هذا الملف يحرس تجربة شهادة الراتب (مدى واسع لنموذج واحد). التجربة اعتُمدت
 * وعُمِّمت، فصار الملف يحرس **العكس**: مجموعة حدود واحدة، يقرأها كل مسار تحكّم من نفس
 * المكان — فلا يعود ممكنًا أن يسمح محرِّرٌ بموضع يقصّه الرسم أو حوارٌ آخر.
 *
 * تحديث (Blank A4 Free Print v1): أُضيف استثناء **واحد موثَّق** بقرار صريح من مالك
 * المنتج — `blank-a4-print`. سببه أن الحدود المركزية تصف حرية الحركة داخل **خانة
 * الاعتماد** المشتركة في تذييل نموذج مُنسَّق، بينما الورقة الفارغة بلا خانة وبلا محتوى:
 * منطقة الوضع فيها هي الورقة كاملة، لأن غرض المستند نفسه ختمُ موضع اعتباطي على ورقة
 * خارجية مطبوعة مسبقًا.
 *
 * ما يحرسه هذا الملف **لم يتغيّر جوهره**: لا انحراف عرَضي لأي مستند، ومصدر واحد لكل
 * مسار تحكّم. ما تغيّر هو صياغة القاعدة: من «لا استثناء إطلاقًا» إلى «استثناء واحد
 * مُعلَن في جدول مغلق، وكل ما عداه — وكل مستندات خانة الاعتماد — على المركزية».
 *
 * (اسم الملف بقي من مرحلة التجربة — يحتاج إعادة تسمية إلى `centralBrandingBounds`.)
 */

const SIG = 'data:image/png;base64,SIG';

const el = (over: Partial<typeof DEFAULT_ELEMENT_LAYOUT> = {}) => ({ ...DEFAULT_ELEMENT_LAYOUT, ...over });
const pair = (over: Partial<BrandingLayout> = {}): BrandingLayout => ({ signature: el(), stamp: el(), ...over });

const src = (p: string) => readFileSync(p, 'utf8');

afterEach(cleanup);

// ── القيم المعتمدة ─────────────────────────────────────────────────────────────
describe('الحدود المعتمدة', () => {
  it('x و y من -150 إلى +150، والحجم من 0.2 إلى 4', () => {
    expect(BRANDING_LAYOUT_BOUNDS).toEqual({
      minX: -150, maxX: 150,
      minY: -150, maxY: 150,
      minScale: 0.2, maxScale: 4,
    });
  });

  it('كل قيمة محفوظة سابقًا تقع داخل المدى الجديد — فلا حاجة لأي ترحيل', () => {
    // أوسع ما كانت تسمح به الحدود القديمة (قوالب الطباعة: ‎±80/±60/0.4–2.5).
    for (const old of [
      el({ x: 80, y: 60, scale: 2.5 }),
      el({ x: -80, y: -60, scale: 0.4 }),
      el({ x: 70, y: 20, scale: 2 }),   // أوسع ما كانت تسمح به حدود النماذج
      el({ x: -70, y: -45, scale: 0.4 }),
    ]) {
      expect(clampBrandingElementLayout(old)).toEqual(old);
    }
  });
});

// ── لا استثناءات: مجموعة واحدة ─────────────────────────────────────────────────
describe('استثناء واحد موثَّق فقط', () => {
  it('ثوابت الحدود القديمة والتجريبية وجدول التجاوزات المفتوح حُذفت كلها', () => {
    const utils = src('src/print-templates/utils/brandingLayout.ts');
    for (const gone of [
      'PRINT_TEMPLATE_BOUNDS',
      'FORM_BRANDING_BOUNDS',
      'EXPERIMENTAL_WIDE_BOUNDS',
      'DOC_BOUNDS_OVERRIDES',
      'boundsForDocument',
    ]) {
      expect(utils).not.toContain(gone);
    }
  });

  it('لا مستند خانة اعتماد يُخصّ بمدى — الاستثناء للورقة الفارغة وحدها', () => {
    const utils = src('src/print-templates/utils/brandingLayout.ts');
    const overrides = utils.slice(
      utils.indexOf('const BOUNDS_BY_DOC'),
      utils.indexOf('export function getBrandingLayoutBounds'),
    );
    // الجدول مغلق: مفتاح واحد لا غير.
    expect(overrides.match(/'[a-z0-9-]+':/g) ?? []).toEqual(["'blank-a4-print':"]);
    for (const approvalSlotDoc of [
      'salary-certificate', 'receipt-voucher', 'purchase-request',
      'leave-request', 'invoice', 'quotation',
    ]) {
      expect(overrides).not.toContain(`'${approvalSlotDoc}'`);
    }
  });

  it('مجموعتا حدود فقط: المركزية + استثناء Blank A4', () => {
    const utils = src('src/print-templates/utils/brandingLayout.ts');
    const exported = utils.match(/export const \w*BOUNDS\w*/g) ?? [];
    expect(exported).toEqual([
      'export const BRANDING_LAYOUT_BOUNDS',
      'export const BLANK_A4_LAYOUT_BOUNDS',
    ]);
  });

  it('القصّ يقبل حدودًا اختيارية تفترض المركزية — فحذف المعامل سلوكٌ سابق حرفيًا', () => {
    const utils = src('src/print-templates/utils/brandingLayout.ts');
    expect(utils).toContain('bounds: Readonly<BrandingLayoutBounds> = BRANDING_LAYOUT_BOUNDS,');
    // السلوك لا النص: بلا معامل ⇒ نفس النتيجة تمامًا كما قبل الاستثناء.
    expect(clampBrandingElementLayout(el({ x: 400, y: -400, scale: 9 })))
      .toEqual(el({ x: 150, y: -150, scale: 4 }));
  });
});

// ── كل مسار تحكّم يقرأ من المصدر الواحد ────────────────────────────────────────
describe('سريان الحدود على كل مسار تحكّم', () => {
  it('السحب والمقابض يقصّان عبر patchDoc ⇒ حدود المستند نفسه، من مصدر واحد', () => {
    const hook = src('src/print-templates/hooks/useBrandingDesigner.ts');
    // مصدر واحد للحدود، محلولٌ بمفتاح المستند — لا رقم مثبَّت ولا مجموعة ثانية.
    expect(hook).toContain('const bounds = getBrandingLayoutBounds(docType);');
    expect(hook).toContain('clampBrandingElementLayout({ ...current[type], ...patch }, bounds)');
    const drag = hook.slice(hook.indexOf('function continueDrag'), hook.indexOf('function endDrag'));
    const resize = hook.slice(hook.indexOf('function continueResize'), hook.indexOf('function endResize'));
    expect(drag).toContain('patchDoc(');
    expect(resize).toContain('patchDoc(');
  });

  it('المحاذاة وUndo/Redo تمرّان بنفس القصّ', () => {
    const hook = src('src/print-templates/hooks/useBrandingDesigner.ts');
    // alignCenterH/V و bringForward/sendBackward كلها updateElement → patchDoc.
    expect(hook).toContain('function alignCenterH(type: ElementType) { updateElement(type, { x: 0 }); }');
    expect(hook).toContain('const next = patchDoc(type, patch);');
    // التاريخ يخزّن حالات مقصوصة سلفًا، فالتراجع لا يُعيد قيمة خارج المدى.
    expect(hook).toContain('pushHistory(next);');
  });

  it('منزلقات لوحة وضع التصميم تقرأ من الحدود لا من أرقام مثبَّتة', () => {
    const panel = src('src/print-templates/components/BrandingDesignerPanel.tsx');
    expect(panel).toContain('min={bounds.minX} max={bounds.maxX}');
    expect(panel).toContain('min={bounds.minY} max={bounds.maxY}');
    expect(panel).toContain('min={bounds.minScale} max={bounds.maxScale}');
  });

  it('منزلقات حوار المعايرة في الإعدادات تقرأ من الحدود نفسها', () => {
    const dlg = src('src/print-templates/components/BrandingLayoutDesigner.tsx');
    expect(dlg).toContain('min={BRANDING_LAYOUT_BOUNDS.minX} max={BRANDING_LAYOUT_BOUNDS.maxX}');
    expect(dlg).toContain('min={BRANDING_LAYOUT_BOUNDS.minY} max={BRANDING_LAYOUT_BOUNDS.maxY}');
    expect(dlg).toContain('min={BRANDING_LAYOUT_BOUNDS.minScale} max={BRANDING_LAYOUT_BOUNDS.maxScale}');
    expect(dlg).not.toContain('max={2.5}');
    expect(dlg).not.toContain('min={-80}');
  });

  it('مقبض الحجم يُعلن المدى المركزي', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const designer = {
      isActive: true, selected: 'signature', inkMode: 'original',
      startDrag: () => {}, continueDrag: () => {}, endDrag: () => {},
      startResize: () => {}, continueResize: () => {}, endResize: () => {},
    } as any;
    const { container } = render(<ApprovalSection signatureUrl={SIG} designer={designer} />);
    const handle = container.querySelector('[role="slider"]')!;
    expect(handle.getAttribute('aria-valuemax')).toBe('400');
    expect(handle.getAttribute('aria-valuemin')).toBe('20');
  });

  it('القصّ وقت قراءة/رسم التخطيط هو نفسه — لا خاصية bounds تُمرَّر بعد الآن', () => {
    const approval = src('src/forms/shared/ApprovalSection.tsx');
    expect(approval).not.toContain('bounds');
    expect(src('src/forms/shared/FormLayout.tsx')).not.toContain('bounds={');
    expect(src('src/pages/ReceiptVoucher.tsx')).not.toContain('bounds={');
  });
});

// ── الرسم بالمدى الواسع، على النماذج وقوالب الطباعة ────────────────────────────
describe('الرسم بالمدى المعتمد', () => {
  it('موضع بعيد يصل كما هو إلى التحويل', () => {
    const { container } = render(
      <ApprovalSection signatureUrl={SIG} layout={pair({ signature: el({ x: 140, y: -130, scale: 3.5 }) })} />,
    );
    const img = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    expect(img.style.transform).toBe('translateX(-50%) translate(140px, -130px) scale(3.5)');
  });

  it('ما يتجاوز المدى يُقصّ عنده — لا مدى مفتوح', () => {
    expect(brandingElementTransform(el({ x: 9999, y: 9999, scale: 9999 })))
      .toBe('translate(150px, 150px) scale(4)');
  });

  it('الحجم يبقى عاملًا موحَّدًا حتى 4x — النسبة محفوظة', () => {
    const t = brandingElementTransform(el({ scale: 4 }));
    expect(t).toContain('scale(4)');
    expect(t).not.toMatch(/scale\([^)]*,/);
  });

  it('قوالب الفاتورة/عرض السعر تستهلك نفس الدالة ⇒ نفس المدى', () => {
    for (const f of [
      'src/print-templates/reference/invoices/InvoiceDesign1.tsx',
      'src/print-templates/reference/quotations/QuotationBase.tsx',
    ]) {
      expect(src(f)).toContain('applyBrandingElementStyle(');
    }
    const utils = src('src/print-templates/utils/brandingLayout.ts');
    expect(utils).toContain('const clamped = clampBrandingElementLayout(el, bounds);');
    // ولأن قوالب الفاتورة/عرض السعر لا تمرّر حدودًا، يعود المعامل إلى المركزية.
    expect(brandingElementTransform(el({ x: 9999, y: 9999, scale: 9999 })))
      .toBe('translate(150px, 150px) scale(4)');
  });
});

// ── Reset لم يتأثّر ────────────────────────────────────────────────────────────
describe('إعادة الضبط تُرجع الأصل تمامًا', () => {
  it('التخطيط المحايد ما زال صفر/صفر/1', () => {
    expect(DEFAULT_ELEMENT_LAYOUT).toEqual({ x: 0, y: 0, scale: 1, opacity: 1, zIndex: 1 });
  });

  it('التحويل المحايد no-op مهما اتّسعت الحدود', () => {
    expect(brandingElementTransform(el())).toBe('translate(0px, 0px) scale(1)');
  });

  it('إعادة الضبط تكتب المحايد لا حدًّا من الحدود — ولا لونًا مخصَّصًا', () => {
    const hook = src('src/print-templates/hooks/useBrandingDesigner.ts');
    expect(hook).toContain('updateElement(type, { ...DEFAULT_ELEMENT_LAYOUT, inkMode: undefined })');
    expect(hook).not.toContain('minX');
    expect(hook).not.toContain('maxScale');
  });
});

// ── التخزين بلا تغيير ─────────────────────────────────────────────────────────
describe('التخزين والمعمارية بلا تغيير', () => {
  it('نفس المفتاح الوحيد print.brandingLayout', () => {
    const hook = src('src/print-templates/hooks/useBrandingDesigner.ts');
    const keys = hook.match(/key: '[^']+'/g) ?? [];
    expect(keys).toEqual(["key: 'print.brandingLayout'"]);
  });

  it('التوسيع لم يمسّ بنية السجل — invoice/quotation مطلوبان ومفاتيح النماذج اختيارية', () => {
    const types = src('src/print-templates/engine/types.ts');
    expect(types).toContain('Record<PrintDocumentType, BrandingLayout> &');
    expect(types).toContain('Partial<Record<FormBrandingDocKey, BrandingLayout>>');
  });
});
