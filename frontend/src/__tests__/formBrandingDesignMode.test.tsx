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
  getBrandingLayoutForDocument,
  isFormBrandingDocKey,
  parseBrandingLayout,
  serializeBrandingLayout,
} from '../print-templates/utils/brandingLayout';
import type { BrandingLayout, PrintBrandingLayoutSettings } from '../print-templates/engine/types';

/**
 * Design Mode للنماذج — تعميم آلية عرض السعر نفسها.
 *
 * المطلبان الحرجان: (1) الافتراضي يطابق الحالي 100% ⇒ تحويل محايد؛ (2) استقلال كل
 * نموذج ⇒ مفتاح مستقل في نفس السجل، بلا تأثّر باختيار الصورة.
 */

const SIG = 'data:image/png;base64,SIG';
const STAMP = 'data:image/png;base64,STAMP';

const el = (over: Partial<typeof DEFAULT_ELEMENT_LAYOUT> = {}) => ({ ...DEFAULT_ELEMENT_LAYOUT, ...over });
const pair = (over: Partial<BrandingLayout> = {}): BrandingLayout => ({
  signature: el(),
  stamp: el(),
  ...over,
});

afterEach(cleanup);

// ── 1 · الافتراضي = الحالي حرفيًا ───────────────────────────────────────────────
describe('التخطيط الافتراضي محايد — النموذج غير المُصمَّم يُطبع كما كان', () => {
  it('التحويل المحايد لا يحرّك ولا يكبّر', () => {
    expect(brandingElementTransform(el())).toBe('translate(0px, 0px) scale(1)');
  });

  it('نموذج بلا مدخل في السجل يُحلّ إلى التخطيط المحايد', () => {
    const stored: PrintBrandingLayoutSettings = { invoice: pair(), quotation: pair() };
    expect(getBrandingLayoutForDocument(stored, 'salary-certificate')).toEqual(pair());
  });

  it('سجل غائب كليًّا يُحلّ إلى المحايد أيضًا', () => {
    expect(getBrandingLayoutForDocument(undefined, 'purchase-request')).toEqual(pair());
  });

  it('صورة التوقيع تُرسم بنفس نمط ما قبل وضع التصميم + تحويل محايد', () => {
    const { container } = render(<ApprovalSection signatureUrl={SIG} />);
    const img = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    expect(img.style.position).toBe('absolute');
    expect(img.style.bottom).toBe('2px');
    expect(img.style.transform).toBe('translateX(-50%) translate(0px, 0px) scale(1)');
  });

  it('التمركز على المرساة يبقى مقدَّمًا على تحويل التخطيط — فلا يفقد العنصر توسيطه وهو يتحرّك', () => {
    const { container } = render(
      <ApprovalSection signatureUrl={SIG} layout={pair({ signature: el({ x: 12, y: -8 }) })} />,
    );
    const img = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    expect(img.style.transform).toBe('translateX(-50%) translate(12px, -8px) scale(1)');
  });

  it('بلا وضع تصميم لا مقابض ولا إطار تحديد', () => {
    const { container } = render(<ApprovalSection signatureUrl={SIG} stampUrl={STAMP} stampInline />);
    expect(container.querySelector('[role="slider"]')).toBeNull();
    const img = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    expect(img.style.outline).toBe('');
  });
});

// ── 2 · استقلال كل نموذج ────────────────────────────────────────────────────────
describe('استقلال التخطيط لكل نموذج', () => {
  it('كل نموذج مدخل منفصل — شهادة الراتب لا تطابق طلب الشراء', () => {
    const stored: PrintBrandingLayoutSettings = {
      invoice: pair(),
      quotation: pair(),
      'salary-certificate': pair({ signature: el({ x: 10, scale: 1.4 }) }),
      'purchase-request': pair({ signature: el({ x: -30, scale: 0.8 }) }),
    };
    expect(getBrandingLayoutForDocument(stored, 'salary-certificate').signature.x).toBe(10);
    expect(getBrandingLayoutForDocument(stored, 'purchase-request').signature.x).toBe(-30);
  });

  it('التوقيع والختم مستقلّان داخل النموذج نفسه', () => {
    const layout = pair({ signature: el({ x: 20 }), stamp: el({ y: 15 }) });
    expect(layout.signature.y).toBe(0);
    expect(layout.stamp.x).toBe(0);
  });

  it('التخطيط لا يذكر أي صورة — فتغيير التوقيع لا يفقد الموضع والحجم', () => {
    const layout = pair({ signature: el({ x: 25, scale: 1.6 }) });
    const first = render(<ApprovalSection signatureUrl={SIG} layout={layout} />);
    const t1 = (first.container.querySelector('img[data-bd-type="signature"]') as HTMLElement).style.transform;
    cleanup();
    // نفس التخطيط، صورة مختلفة تمامًا
    const second = render(<ApprovalSection signatureUrl="data:image/png;base64,OTHER" layout={layout} />);
    const t2 = (second.container.querySelector('img[data-bd-type="signature"]') as HTMLElement).style.transform;
    expect(t2).toBe(t1);
    expect(t2).toContain('translate(25px, 0px) scale(1.6)');
  });
});

// ── 3 · التخزين: نفس مفتاح Setting المركزي ─────────────────────────────────────
describe('التخزين — print.brandingLayout الموجود، بلا مفتاح جديد', () => {
  it('يقرأ مدخلات النماذج ويحافظ على invoice/quotation', () => {
    const raw = serializeBrandingLayout({
      invoice: pair({ signature: el({ x: 5 }) }),
      quotation: pair(),
      'leave-request': pair({ stamp: el({ y: 10 }) }),
    });
    const parsed = parseBrandingLayout(raw);
    expect(parsed.invoice.signature.x).toBe(5);
    expect(parsed['leave-request']?.stamp.y).toBe(10);
  });

  it('قيمة قديمة (invoice/quotation فقط) تُقرأ بلا مدخلات نماذج — لا شيء يُختلق', () => {
    const parsed = parseBrandingLayout(JSON.stringify({ invoice: pair(), quotation: pair() }));
    expect(parsed['salary-certificate']).toBeUndefined();
    expect(parsed.invoice).toEqual(pair());
  });

  it('مدخل نموذج تالف يُهمَل ولا يُستبدل بمحايد مُصطنَع — فلا يحجب موضع القالب', () => {
    const parsed = parseBrandingLayout(JSON.stringify({
      invoice: pair(), quotation: pair(), 'resignation': { signature: 'nope' },
    }));
    expect(parsed.resignation).toBeUndefined();
  });

  it('JSON تالف كليًّا يرجع للافتراضي بلا استثناء', () => {
    const parsed = parseBrandingLayout('{{{');
    expect(parsed.invoice).toBeDefined();
    expect(parsed.quotation).toBeDefined();
  });

  it('سجل التواقيع/الأختام منفصل عن سجل التخطيط — مفتاحان مختلفان', () => {
    const layoutSrc = readFileSync('src/print-templates/hooks/useBrandingDesigner.ts', 'utf8');
    expect(layoutSrc).toContain("key: 'print.brandingLayout'");
    expect(layoutSrc).not.toContain('print.signatures');
    expect(layoutSrc).not.toContain('print.stamps');
  });
});

// ── 4 · الحدود المركزية الموحَّدة ──────────────────────────────────────────────
describe('حدود الحركة — مجموعة واحدة لكل المستندات', () => {
  it('المدى المعتمد: ‎±150 أفقيًا ورأسيًا، والحجم 0.2 إلى 4', () => {
    expect(BRANDING_LAYOUT_BOUNDS).toEqual({
      minX: -150, maxX: 150,
      minY: -150, maxY: 150,
      minScale: 0.2, maxScale: 4,
    });
  });

  it('القيم الخارجة عن المدى تُقصّ لا تُقبل', () => {
    const clamped = clampBrandingElementLayout(el({ x: 999, y: 999, scale: 99 }));
    expect(clamped.x).toBe(150);
    expect(clamped.y).toBe(150);
    expect(clamped.scale).toBe(4);
  });

  it('القصّ يُطبَّق في التحويل نفسه — فلا مسار يتجاوزه', () => {
    expect(brandingElementTransform(el({ x: 999, y: -999 })))
      .toBe('translate(150px, -150px) scale(1)');
  });

  it('مفتاح غير مسجَّل ليس مفتاح نموذج', () => {
    expect(isFormBrandingDocKey('payment-voucher')).toBe(false);
    expect(isFormBrandingDocKey(undefined)).toBe(false);
    expect(isFormBrandingDocKey('salary-certificate')).toBe(true);
  });
});

// ── 5 · الحجم: النسبة محفوظة بنيويًا ───────────────────────────────────────────
describe('تغيير الحجم يحفظ نسبة الأبعاد', () => {
  it('الحجم عامل واحد موحَّد — لا عرض/ارتفاع منفصلين', () => {
    expect(brandingElementTransform(el({ scale: 1.75 }))).toContain('scale(1.75)');
    expect(brandingElementTransform(el({ scale: 1.75 }))).not.toMatch(/scale\([^)]*,/);
  });

  it('نموذج التخطيط لا يحتوي عرضًا أو ارتفاعًا إطلاقًا', () => {
    expect(Object.keys(DEFAULT_ELEMENT_LAYOUT).sort()).toEqual(
      ['opacity', 'scale', 'x', 'y', 'zIndex'].sort(),
    );
  });

  it('مقبض الحجم يستدعي startResize الذي يعدّل scale وحده', () => {
    const src = readFileSync('src/print-templates/designer/DesignableBrandingImage.tsx', 'utf8');
    expect(src).toContain('designer.startResize(');
    const hookSrc = readFileSync('src/print-templates/hooks/useBrandingDesigner.ts', 'utf8');
    const resizeBody = hookSrc.slice(hookSrc.indexOf('function continueResize'), hookSrc.indexOf('function endResize'));
    expect(resizeBody).toContain('scale:');
    expect(resizeBody).not.toContain('width');
    expect(resizeBody).not.toContain('height');
  });
});

// ── 6 · وضع التصميم: التفاعل والمعاينة/الطباعة ─────────────────────────────────
describe('وضع التصميم — التفاعل ومصدر الحقيقة', () => {
  const layoutSrc = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
  const rcvSrc = readFileSync('src/pages/ReceiptVoucher.tsx', 'utf8');

  it('يستخدم خطّاف عرض السعر نفسه — لا محرّر موازٍ', () => {
    expect(layoutSrc).toContain("useBrandingDesigner");
    expect(layoutSrc).toContain('BrandingDesignerPanel');
    expect(rcvSrc).toContain("useBrandingDesigner");
  });

  it('مفتاح المستند هو نوع النموذج — منه يأتي استقلال التخطيط', () => {
    expect(layoutSrc).toContain('isFormBrandingDocKey(formType)');
  });

  it('أثناء التصميم يقود التخطيط الحيّ، وبعده المحفوظ — ونفس العقدة تُطبع وتُصدَّر', () => {
    expect(layoutSrc).toContain('designer.isActive ? designer.localLayout : (savedLayout ?? branding.brandingLayout)');
  });

  it('اللوحة خارج PrintWorkspace — لأن تحويل التكبير يفسد position:fixed', () => {
    const panel = layoutSrc.indexOf('<BrandingDesignerPanel');
    const closeWorkspace = layoutSrc.indexOf('</PrintWorkspace>');
    expect(closeWorkspace).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(closeWorkspace);
  });

  it('زرّ التصميم لا يظهر إلا مع أصل مختار فعليًا', () => {
    expect(layoutSrc).toContain('const canDesignApproval =');
    expect(layoutSrc).toContain('brandingSelection.showSignature && !!brandingSelection.signatureUrl');
  });

  it('إعادة الضبط ترجع للتخطيط المحايد لا لقيمة أخرى', () => {
    const hookSrc = readFileSync('src/print-templates/hooks/useBrandingDesigner.ts', 'utf8');
    expect(hookSrc).toContain("updateElement(type, { ...DEFAULT_ELEMENT_LAYOUT })");
  });

  it('عرض السعر لا يعرّف حدودًا ولا يستدعي السحب بنفسه — الطبقة المشتركة تفعل', () => {
    const quotation = readFileSync('src/pages/Quotation.tsx', 'utf8');
    expect(quotation).not.toContain('BOUNDS');
    expect(quotation).not.toContain('startDrag(');
  });
});

// ── 7 · التفاعل داخل المستند ───────────────────────────────────────────────────
describe('وضع التصميم فعّال داخل المستند', () => {
  const fakeDesigner = (over: Record<string, unknown> = {}) => ({
    isActive: true,
    selected: 'signature',
    inkMode: 'original',
    startDrag: () => {},
    continueDrag: () => {},
    endDrag: () => {},
    startResize: () => {},
    continueResize: () => {},
    endResize: () => {},
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  it('يظهر مقبض حجم لكل صورة عند التفعيل', () => {
    const { container } = render(
      <ApprovalSection signatureUrl={SIG} stampUrl={STAMP} stampInline designer={fakeDesigner()} />,
    );
    expect(container.querySelectorAll('[role="slider"]')).toHaveLength(2);
  });

  it('العنصر المحدَّد بإطار متّصل وغير المحدَّد بإطار متقطّع', () => {
    const { container } = render(
      <ApprovalSection signatureUrl={SIG} stampUrl={STAMP} stampInline designer={fakeDesigner()} />,
    );
    const sig = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    const stamp = container.querySelector('img[data-bd-type="stamp"]') as HTMLElement;
    expect(sig.style.outline).toContain('solid');
    expect(stamp.style.outline).toContain('dashed');
    expect(sig.style.cursor).toBe('move');
  });

  it('التفعيل لا يغيّر تحويل العنصر — التخطيط وحده يحدّده', () => {
    const { container } = render(
      <ApprovalSection signatureUrl={SIG} designer={fakeDesigner()} layout={pair()} />,
    );
    const img = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    expect(img.style.transform).toBe('translateX(-50%) translate(0px, 0px) scale(1)');
  });

  it('مقبض الحجم يحمل مدى الحجم المركزي', () => {
    const { container } = render(
      <ApprovalSection signatureUrl={SIG} designer={fakeDesigner()} />,
    );
    const handle = container.querySelector('[role="slider"]')!;
    expect(handle.getAttribute('aria-valuemax')).toBe(String(BRANDING_LAYOUT_BOUNDS.maxScale * 100));
  });
});
