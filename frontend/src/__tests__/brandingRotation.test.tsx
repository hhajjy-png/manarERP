// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import ApprovalSection from '../forms/shared/ApprovalSection';
import {
  BLANK_A4_LAYOUT_BOUNDS,
  DEFAULT_ELEMENT_LAYOUT,
  ROTATION_MAX,
  ROTATION_MIN,
  applyBrandingElementStyle,
  brandingElementTransform,
  clampBrandingElementLayout,
  normalizeRotation,
  parseBrandingLayout,
  serializeBrandingLayout,
} from '../print-templates/utils/brandingLayout';
import { useBrandingDesigner } from '../print-templates/hooks/useBrandingDesigner';
import type { BrandingElementLayout, PrintBrandingLayoutSettings } from '../print-templates/engine/types';

/**
 * Branding Designer Rotation v1 — DELTA ONLY.
 *
 * كل ما يختبره هذا الملف جديد على النظام: الزاوية نفسها، وتطبيعها، وموضعها في سلسلة
 * التحويل، وبقاؤها عبر الحفظ/الاسترجاع/التراجع، وأنّ غيابها يعني حرفيًا سلوك ما قبلها.
 * الاختبارات القائمة للموضع/الحجم/اللون لم تُمَسّ — هي غير متأثرة.
 */

const SIG = 'data:image/png;base64,SIG';
const STAMP = 'data:image/png;base64,STAMP';

const el = (over: Partial<BrandingElementLayout> = {}): BrandingElementLayout => ({
  ...DEFAULT_ELEMENT_LAYOUT,
  ...over,
});

afterEach(cleanup);

// ── 1 · التوافق الخلفي: الغياب = 0° = السلوك القديم حرفيًا ────────────────────
describe('غياب الزاوية = السلوك القديم حرفيًا', () => {
  it('عنصر بلا rotation لا يبثّ rotate إطلاقًا — ولا حتى rotate(0deg)', () => {
    const t = brandingElementTransform(el());
    expect(t).toBe('translate(0px, 0px) scale(1)');
    expect(t).not.toContain('rotate');
  });

  it('نفس الضمان في applyBrandingElementStyle — المسار الآخر الوحيد للزاوية', () => {
    const css = applyBrandingElementStyle(el({ x: 10, y: -5, scale: 1.5 }));
    expect(css.transform).toBe('translate(10px, -5px) scale(1.5)');
    expect(css.transform).not.toContain('rotate');
  });

  it('زاوية 0° صريحة تُعامَل معاملة الغياب — لا rotate ولا مفتاح مخزَّن', () => {
    expect(brandingElementTransform(el({ rotation: 0 }))).toBe('translate(0px, 0px) scale(1)');
    expect(clampBrandingElementLayout(el({ rotation: 0 }))).not.toHaveProperty('rotation');
  });

  it('دورة كاملة 360° تعود إلى حالة "لم يُدوَّر قط" — لا أثر باقٍ', () => {
    expect(clampBrandingElementLayout(el({ rotation: 360 }))).not.toHaveProperty('rotation');
    expect(brandingElementTransform(el({ rotation: -360 }))).not.toContain('rotate');
  });

  it('صورة التوقيع بتخطيط قديم تُرسم بنفس سلسلة التحويل السابقة', () => {
    const { container } = render(<ApprovalSection signatureUrl={SIG} />);
    const img = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    expect(img.style.transform).toBe('translateX(-50%) translate(0px, 0px) scale(1)');
  });
});

// ── 2 · التطبيع ضمن (-180, 180] ───────────────────────────────────────────────
describe('تطبيع الزاوية — التفاف لا قصّ', () => {
  it.each([
    [0, 0],
    [45, 45],
    [180, 180],
    [-180, 180],   // النصف المفتوح: تمثيل واحد لكل زاوية
    [190, -170],
    [270, -90],
    [-270, 90],
    [360, 0],
    [720, 0],
    [-450, -90],
  ])('%s° ⇒ %s°', (input, expected) => {
    expect(normalizeRotation(input)).toBe(expected);
  });

  it('يلتفّ ولا يتوقّف عند الحد — سحب دائري متواصل عبر ±180', () => {
    // القصّ كان سيعيد 180 هنا ويجمّد العنصر تحت سحب مستمر.
    expect(normalizeRotation(181)).toBe(-179);
    expect(normalizeRotation(-181)).toBe(179);
  });

  it('يُقرّب إلى 0.1° فيبقى ناتج atan2 قصيرًا وحتميًّا', () => {
    expect(normalizeRotation(37.42180896)).toBe(37.4);
    expect(brandingElementTransform(el({ rotation: 37.42180896 }))).toContain('rotate(37.4deg)');
  });

  it('يفكّ -0 إلى 0 فلا يوجد تمثيلان لنفس الزاوية', () => {
    expect(Object.is(normalizeRotation(-0), 0)).toBe(true);
    expect(Object.is(normalizeRotation(-360), 0)).toBe(true);
  });

  it('قيمة غير رقمية تسقط إلى 0° بدل أن تنتج transform فاسدًا', () => {
    expect(normalizeRotation(NaN)).toBe(0);
    expect(normalizeRotation(Infinity)).toBe(0);
    expect(brandingElementTransform(el({ rotation: NaN }))).toBe('translate(0px, 0px) scale(1)');
  });

  it('مدى المنزلق يطابق مدى التطبيع', () => {
    expect([ROTATION_MIN, ROTATION_MAX]).toEqual([-180, 180]);
  });
});

// ── 3 · ترتيب سلسلة التحويل ───────────────────────────────────────────────────
describe('ترتيب التحويل translate → rotate → scale', () => {
  it('الترتيب حرفيًّا كما هو مطلوب', () => {
    expect(brandingElementTransform(el({ x: 12, y: -8, scale: 1.5, rotation: 30 })))
      .toBe('translate(12px, -8px) rotate(30deg) scale(1.5)');
  });

  it('applyBrandingElementStyle يبثّ الترتيب ذاته — لا مسار ثانٍ للزاوية', () => {
    expect(applyBrandingElementStyle(el({ x: 12, y: -8, scale: 1.5, rotation: 30 })).transform)
      .toBe('translate(12px, -8px) rotate(30deg) scale(1.5)');
  });

  it('translate يسبق rotate — وإلا فُسِّرت الإزاحة في إطار العنصر المُدوَّر فانحرف السحب', () => {
    const t = brandingElementTransform(el({ x: 20, rotation: 90 }));
    expect(t.indexOf('translate(')).toBeLessThan(t.indexOf('rotate('));
    expect(t.indexOf('rotate(')).toBeLessThan(t.indexOf('scale('));
  });

  it('الإزاحة لا تتأثر بالزاوية — نفس x/y عند أي دوران', () => {
    for (const r of [0, 45, 90, 180, -135]) {
      expect(brandingElementTransform(el({ x: 20, y: -30, rotation: r })))
        .toContain('translate(20px, -30px)');
    }
  });

  it('نقطة الارتكاز تبقى المركز فيصحّ توسيط translateX(-50%) عند أي زاوية', () => {
    expect(applyBrandingElementStyle(el({ rotation: 45 })).transformOrigin).toBe('center');
  });

  it('التحويل داخل المستند يركّب البادئة قبل الزاوية', () => {
    const layout = { signature: el({ rotation: 15 }), stamp: el() };
    const { container } = render(<ApprovalSection signatureUrl={SIG} layout={layout} />);
    const img = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    expect(img.style.transform).toBe('translateX(-50%) translate(0px, 0px) rotate(15deg) scale(1)');
  });
});

// ── 4 · الحدود: سياسة AABB لم تتغيّر ─────────────────────────────────────────
describe('سياسة الحدود لم تتغيّر بسبب الدوران', () => {
  it('الزاوية لا تُقصّ بحدود المستند ولا تغيّر قصّ x/y', () => {
    const clamped = clampBrandingElementLayout(el({ x: 9999, y: 9999, rotation: 45 }));
    expect(clamped.x).toBe(150);
    expect(clamped.y).toBe(150);
    expect(clamped.rotation).toBe(45);
  });

  it('ظرف Blank A4 يبقى كما هو — الزاوية لا تدخل في الظرف', () => {
    // 400px داخل ظرف الورقة البيضاء الأوسع فيمرّ كما هو، و9999 خارجه فيُقصّ عند حدّه —
    // الزاوية لا تغيّر أيًّا من الحالتين.
    expect(clampBrandingElementLayout(el({ x: 400, rotation: 90 }), BLANK_A4_LAYOUT_BOUNDS).x).toBe(400);
    const clamped = clampBrandingElementLayout(el({ x: 9999, rotation: 90 }), BLANK_A4_LAYOUT_BOUNDS);
    expect(clamped.x).toBe(BLANK_A4_LAYOUT_BOUNDS.maxX);
    expect(clamped.rotation).toBe(90);
  });

  it('الظرف لا يعرّف مدى دوران إطلاقًا', () => {
    expect(BLANK_A4_LAYOUT_BOUNDS).not.toHaveProperty('minRotation');
    expect(BLANK_A4_LAYOUT_BOUNDS).not.toHaveProperty('maxRotation');
  });
});

// ── 5 · التخزين والاسترجاع ────────────────────────────────────────────────────
describe('الحفظ والاسترجاع — نفس السجل، بلا مخزن ثانٍ', () => {
  const pair = (over: Partial<Record<'signature' | 'stamp', BrandingElementLayout>> = {}) => ({
    signature: el(),
    stamp: el(),
    ...over,
  });

  it('الزاوية تدور ذهابًا وإيابًا عبر serialize/parse', () => {
    const stored: PrintBrandingLayoutSettings = {
      invoice: pair({ signature: el({ rotation: -37.5 }) }),
      quotation: pair(),
      'salary-certificate': pair({ stamp: el({ rotation: 90 }) }),
    };
    const round = parseBrandingLayout(serializeBrandingLayout(stored));
    expect(round.invoice.signature.rotation).toBe(-37.5);
    expect(round['salary-certificate']?.stamp.rotation).toBe(90);
  });

  it('تخطيط محفوظ قبل وجود الميزة يُقرأ بلا زاوية — لا صفر مُقحَم', () => {
    const legacy = JSON.stringify({
      invoice: { signature: { x: 5, y: 5, scale: 1, opacity: 1, zIndex: 1 }, stamp: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 1 } },
      quotation: { signature: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 1 }, stamp: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 1 } },
    });
    const parsed = parseBrandingLayout(legacy);
    expect(parsed.invoice.signature).not.toHaveProperty('rotation');
    expect(brandingElementTransform(parsed.invoice.signature)).toBe('translate(5px, 5px) scale(1)');
  });

  it('زاوية غير رقمية في سجل تالف تُسقط المدخل بدل أن تُقبل', () => {
    const bad = JSON.stringify({
      invoice: { signature: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 1, rotation: 'أفقي' }, stamp: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 1 } },
      quotation: { signature: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 1 }, stamp: { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 1 } },
    });
    expect(parseBrandingLayout(bad).invoice.signature).toEqual(DEFAULT_ELEMENT_LAYOUT);
  });

  it('العنصر المُعاد ضبطه لا يحمل مفتاح rotation في JSON المحفوظ', () => {
    const json = serializeBrandingLayout({
      invoice: pair({ signature: { ...DEFAULT_ELEMENT_LAYOUT, rotation: undefined } }),
      quotation: pair(),
    });
    expect(json).not.toContain('rotation');
  });

  it('لا مفتاح إعدادات جديد — الزاوية تسكن print.brandingLayout وحده', () => {
    const hook = readFileSync('src/print-templates/hooks/useBrandingDesigner.ts', 'utf8');
    expect(hook).toContain("key: 'print.brandingLayout'");
    expect(hook).not.toContain('print.brandingRotation');
  });
});

// ── 6 · الخطّاف: الإيماءة، Snap، Undo/Redo، Reset ─────────────────────────────
describe('خطّاف التصميم — إيماءة الدوران', () => {
  const setup = () =>
    renderHook(() =>
      useBrandingDesigner({ docType: 'salary-certificate', initialLayout: undefined }),
    );

  /** ربع دورة: المؤشر من يمين المركز (0°) إلى أسفله (+90°). */
  const quarterTurn = (h: ReturnType<typeof setup>['result'], snap = false) => {
    act(() => h.current.startRotate('signature', 100, 100, 200, 100));
    act(() => h.current.continueRotate(100, 200, snap));
    act(() => h.current.endRotate());
  };

  it('السحب حول المركز يدوّر بمقدار زاوية المؤشر', () => {
    const { result } = setup();
    quarterTurn(result);
    expect(result.current.docLayout.signature.rotation).toBe(90);
  });

  it('الإمساك لا يقفز بالعنصر إلى المؤشر — الدلتا هي المطبَّقة', () => {
    const { result } = setup();
    act(() => result.current.startRotate('signature', 100, 100, 200, 100));
    expect(result.current.docLayout.signature.rotation).toBeUndefined();
    act(() => result.current.endRotate());
  });

  it('الدوران يبدأ من الزاوية الحالية لا من الصفر — دوران ثانٍ تراكمي', () => {
    const { result } = setup();
    quarterTurn(result);
    quarterTurn(result);
    expect(result.current.docLayout.signature.rotation).toBe(180);
  });

  it('Shift يثبّت على مضاعفات 15° مطلقة', () => {
    const { result } = setup();
    act(() => result.current.startRotate('signature', 0, 0, 100, 0));
    act(() => result.current.continueRotate(100, 18, true)); // ‎~10.2°
    expect(result.current.docLayout.signature.rotation).toBe(15);
    act(() => result.current.continueRotate(100, 40, true)); // ‎~21.8°
    expect(result.current.docLayout.signature.rotation).toBe(15);
    act(() => result.current.continueRotate(100, 60, true)); // ‎~31°
    expect(result.current.docLayout.signature.rotation).toBe(30);
    act(() => result.current.endRotate());
  });

  it('بدون Shift تبقى الزاوية حرّة', () => {
    const { result } = setup();
    act(() => result.current.startRotate('signature', 0, 0, 100, 0));
    act(() => result.current.continueRotate(100, 18, false));
    expect(result.current.docLayout.signature.rotation).toBe(10.2);
    act(() => result.current.endRotate());
  });

  it('الإيماءة تدفع خطوة تراجع واحدة — لا خطوة لكل حركة مؤشر', () => {
    const { result } = setup();
    act(() => result.current.startRotate('signature', 100, 100, 200, 100));
    act(() => result.current.continueRotate(100, 200, false));
    act(() => result.current.continueRotate(0, 100, false));
    act(() => result.current.endRotate());
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(result.current.docLayout.signature.rotation).toBeUndefined();
    act(() => result.current.redo());
    expect(result.current.docLayout.signature.rotation).toBe(180);
  });

  it('resetRotation يمسح الزاوية ويُبقي الموضع والحجم', () => {
    const { result } = setup();
    act(() => result.current.updateElement('signature', { x: 25, scale: 1.4, rotation: 40 }));
    act(() => result.current.resetRotation('signature'));
    const sig = result.current.docLayout.signature;
    expect(sig).not.toHaveProperty('rotation');
    expect(sig.x).toBe(25);
    expect(sig.scale).toBe(1.4);
  });

  it('resetElement يمسح الزاوية أيضًا — لا زاوية عالقة بعد إعادة الضبط', () => {
    const { result } = setup();
    act(() => result.current.updateElement('signature', { rotation: 40, inkMode: 'black' }));
    act(() => result.current.resetElement('signature'));
    expect(result.current.docLayout.signature).not.toHaveProperty('rotation');
    expect(brandingElementTransform(result.current.docLayout.signature))
      .toBe('translate(0px, 0px) scale(1)');
  });

  it('resetDoc يمسح زاويتَي التوقيع والختم معًا', () => {
    const { result } = setup();
    act(() => result.current.updateElement('signature', { rotation: 40 }));
    act(() => result.current.updateElement('stamp', { rotation: -25 }));
    act(() => result.current.resetDoc());
    expect(result.current.docLayout.signature.rotation).toBeUndefined();
    expect(result.current.docLayout.stamp.rotation).toBeUndefined();
  });

  it('الدوران يخصّ العنصر المحدَّد وحده — الختم لا يتبع التوقيع', () => {
    const { result } = setup();
    quarterTurn(result);
    expect(result.current.docLayout.stamp.rotation).toBeUndefined();
  });
});

// ── 7 · السحب والتحجيم لم ينكسرا ──────────────────────────────────────────────
describe('الدوران لا يكسر السحب ولا التحجيم', () => {
  const setup = () =>
    renderHook(() =>
      useBrandingDesigner({ docType: 'salary-certificate', initialLayout: undefined }),
    );

  it('السحب يتبع المؤشر ١:١ عند أي زاوية — الإزاحة في إطار الأب', () => {
    for (const rotation of [0, 45, 90, 180, -90]) {
      const { result, unmount } = setup();
      act(() => result.current.updateElement('signature', { rotation }));
      act(() => result.current.startDrag('signature', 0, 0, 1));
      act(() => result.current.continueDrag(30, -20));
      act(() => result.current.endDrag());
      expect(result.current.docLayout.signature.x).toBe(30);
      expect(result.current.docLayout.signature.y).toBe(-20);
      unmount();
    }
  });

  it('السحب لا يغيّر الزاوية', () => {
    const { result } = setup();
    act(() => result.current.updateElement('signature', { rotation: 45 }));
    act(() => result.current.startDrag('signature', 0, 0, 1));
    act(() => result.current.continueDrag(30, 30));
    act(() => result.current.endDrag());
    expect(result.current.docLayout.signature.rotation).toBe(45);
  });

  it('التحجيم بلا دوران يبقى كما كان بالضبط', () => {
    const { result } = setup();
    act(() => result.current.startResize('signature', 0, 0, 1));
    act(() => result.current.continueResize(120, 120)); // قطر 120px = مضاعفة
    act(() => result.current.endResize());
    expect(result.current.docLayout.signature.scale).toBeCloseTo(2, 5);
  });

  it('فكّ دوران الدلتا يجعل الشدّ للخارج تكبيرًا عند 90° بدل أن ينعكس', () => {
    const { result } = setup();
    act(() => result.current.updateElement('signature', { rotation: 90 }));
    act(() => result.current.startResize('signature', 0, 0, 1));
    // عند 90° يقع قطر العنصر البصري على المحور (‎-x, +y‎)؛ الشدّ للخارج على ذلك القطر
    // كان بلا فكّ الدوران يعطي متوسطًا صفريًّا (تحجيم ميت).
    act(() => result.current.continueResize(-120, 120));
    act(() => result.current.endResize());
    expect(result.current.docLayout.signature.scale).toBeGreaterThan(1);
  });

  it('التحجيم لا يغيّر الزاوية ولا يمسّ عرضًا/ارتفاعًا', () => {
    const { result } = setup();
    act(() => result.current.updateElement('signature', { rotation: 30 }));
    act(() => result.current.startResize('signature', 0, 0, 1));
    act(() => result.current.continueResize(60, 60));
    act(() => result.current.endResize());
    expect(result.current.docLayout.signature.rotation).toBe(30);
    expect(result.current.docLayout.signature).not.toHaveProperty('width');
    expect(result.current.docLayout.signature).not.toHaveProperty('height');
  });
});

// ── 8 · أدوات الدوران في وضع التصميم فقط ─────────────────────────────────────
describe('أدوات الدوران تظهر في وضع التصميم فقط', () => {
  const fakeDesigner = (over: Record<string, unknown> = {}) => ({
    isActive: true,
    selected: 'signature',
    startDrag: () => {}, continueDrag: () => {}, endDrag: () => {},
    startResize: () => {}, continueResize: () => {}, endResize: () => {},
    startRotate: () => {}, continueRotate: () => {}, endRotate: () => {},
    resetRotation: () => {},
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  it('خارج وضع التصميم: لا مقبض دوران في المستند', () => {
    const { container } = render(<ApprovalSection signatureUrl={SIG} stampUrl={STAMP} stampInline />);
    expect(container.querySelectorAll('[aria-label^="تدوير"]')).toHaveLength(0);
  });

  it('داخل وضع التصميم: مقبض دوران لكل صورة', () => {
    const { container } = render(
      <ApprovalSection signatureUrl={SIG} stampUrl={STAMP} stampInline designer={fakeDesigner()} />,
    );
    expect(container.querySelectorAll('[aria-label^="تدوير"]')).toHaveLength(2);
  });

  it('نقر مزدوج على المقبض يعيد الزاوية إلى 0°', () => {
    const resetRotation = vi.fn();
    const { container } = render(
      <ApprovalSection signatureUrl={SIG} designer={fakeDesigner({ resetRotation })} />,
    );
    const handle = container.querySelector('[aria-label^="تدوير"]') as HTMLElement;
    fireEvent.doubleClick(handle);
    expect(resetRotation).toHaveBeenCalledWith('signature');
  });

  it('المقبض يعلن الزاوية الحالية لقارئ الشاشة', () => {
    const layout = { signature: el({ rotation: -30 }), stamp: el() };
    const { container } = render(
      <ApprovalSection signatureUrl={SIG} layout={layout} designer={fakeDesigner()} />,
    );
    const handle = container.querySelector('[aria-label^="تدوير"]') as HTMLElement;
    expect(handle.getAttribute('aria-valuenow')).toBe('-30');
    expect(handle.getAttribute('aria-valuemin')).toBe('-180');
    expect(handle.getAttribute('aria-valuemax')).toBe('180');
  });

  it('المقبضان شقيقان للصورة لا أبناء لها — وإلا فسد قياس مقياس العرض', () => {
    const { container } = render(
      <ApprovalSection signatureUrl={SIG} designer={fakeDesigner()} />,
    );
    const img = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    const handles = container.querySelectorAll('[role="slider"]');
    expect(handles.length).toBe(2);
    handles.forEach((h) => expect(img.contains(h)).toBe(false));
  });
});

// ── 9 · تطابق الشاشة/المعاينة/الطباعة/PDF ────────────────────────────────────
describe('مسار واحد للزاوية — تطابق الشاشة والمعاينة والطباعة و PDF', () => {
  it('لا يوجد سوى دالتين تبثّان rotate للتوقيع/الختم', () => {
    const utils = readFileSync('src/print-templates/utils/brandingLayout.ts', 'utf8');
    expect(utils.match(/rotate\(\$\{/g) ?? []).toHaveLength(1); // rotationTerm وحدها
    expect(utils).toContain('rotationTerm(c.rotation)');
    expect(utils).toContain('rotationTerm(clamped.rotation)');
  });

  it('لا يكتب أي مستهلك rotate بنفسه — الزاوية تمرّ بالدوال المركزية', () => {
    for (const f of [
      'src/print-templates/designer/DesignableBrandingImage.tsx',
      'src/forms/shared/ApprovalSection.tsx',
      'src/print-templates/reference/quotations/QuotationBase.tsx',
      'src/pages/InvoicePreview.tsx',
      'src/pages/BlankA4Print.tsx',
    ]) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/transform:.*rotate\(/);
    }
  });

  it('لون الحبر والزاوية مستقلّان — فلتر على الصورة وتحويل عليها معًا', () => {
    const layout = { signature: el({ rotation: 25, inkMode: 'black' as const }), stamp: el() };
    const { container } = render(<ApprovalSection signatureUrl={SIG} layout={layout} />);
    const img = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    expect(img.style.transform).toContain('rotate(25deg)');
    expect(img.style.filter).not.toBe('');
  });
});
