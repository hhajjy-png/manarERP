// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { flushAsyncUpdates } from './helpers/flush';
import { readFileSync } from 'node:fs';
import { PrintPreviewDialog } from '../printing';

/**
 * Universal Print Preview — UX Polish v1.
 *
 * هذه اختبارات **هندسية**، لا نصية: تقيس أبعاد الورقة الفعلية التي يصدرها المكوّن.
 *
 * الخلل الذي تحرسه: `transform: scale()` لا يغيّر صندوق التخطيط. كانت الورقة تُعطى
 * عرضًا مقيسًا (pageW × scale) بينما ارتفاعها يتبع الـ iframe **غير المقيَّس**
 * (1123px × عدد الصفحات) — فعند 25% صار العرض ‎198px‎ والارتفاع ‎1123px‎:
 * **مستطيل أبيض طويل**. الحلّ: صندوق الورقة مقيس في البُعدين، والـ iframe مطلق
 * الموضع فلا يمدّه.
 *
 * jsdom لا يحسب تخطيطًا، فنزوّد الـ canvas بمقاس صريح ونقيس ما يبنيه المكوّن عليه.
 */

const CSS = readFileSync('src/printing/components/PrintCenter.css', 'utf8');
const MM_TO_PX = 96 / 25.4;
const PAGE_W = 210 * MM_TO_PX; // ≈ 793.7
const PAGE_H = 297 * MM_TO_PX; // ≈ 1122.5
const A4_RATIO = PAGE_H / PAGE_W;
const PAD_WIDE = 56;
const PAD_NARROW = 40;

/** مقاس الـ canvas المعروض — jsdom يعيد 0، فنفرضه. */
let canvasSize = { w: 1200, h: 800 };

beforeEach(() => {
  canvasSize = { w: 1200, h: 800 };
  for (const prop of ['clientWidth', 'clientHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        if (!this.classList.contains('pc-canvas')) return 0;
        return prop === 'clientWidth' ? canvasSize.w : canvasSize.h;
      },
    });
  }
});

afterEach(() => {
  cleanup();
  for (const prop of ['clientWidth', 'clientHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, value: 0 });
  }
});

async function open() {
  render(
    <PrintPreviewDialog
      open
      onClose={vi.fn()}
      onPrint={vi.fn()}
      compose={() => '<!DOCTYPE html><html dir="rtl"><body>مستند</body></html>'}
      documentLabel="فاتورة · INV-2026-001"
    />,
  );
  await flushAsyncUpdates(); // تحميل الـ iframe يقع بعد render (jsdom يؤجّله)
}

const sheet = () => document.querySelector('.pc-sheet') as HTMLElement;
const frame = () => document.querySelector('.pc-frame') as HTMLIFrameElement;
const px = (v: string) => Number.parseFloat(v);
const sheetBox = () => ({ w: px(sheet().style.width), h: px(sheet().style.height) });
const pad = () => (canvasSize.w < 900 ? PAD_NARROW : PAD_WIDE);

describe('Fit Width — يحسب عرض الصفحة فعلًا', () => {
  it('عرض الورقة = العرض المتاح كاملًا (لا نسبة ثابتة)', async () => {
    await open();
    const avail = canvasSize.w - pad() * 2; // 1200 − 112 = 1088
    expect(sheetBox().w).toBeCloseTo(avail, 0);
  });

  it('نسبة A4 محفوظة — لا تشويه', async () => {
    await open();
    const { w, h } = sheetBox();
    expect(h / w).toBeCloseTo(A4_RATIO, 2);
  });

  it('هو الوضع الافتراضي', async () => {
    await open();
    expect(screen.getByRole('button', { name: /ملاءمة العرض/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('لا شريط تمرير أفقي: الورقة + الحشوتان ≤ عرض الـ canvas', async () => {
    await open();
    expect(sheetBox().w + pad() * 2).toBeLessThanOrEqual(canvasSize.w);
    // ومسار الشريط الرأسي محجوز دائمًا، فالعرض المقيس لا يتذبذب بين ظهوره واختفائه.
    expect(CSS).toMatch(/\.pc-canvas\s*\{[\s\S]*?scrollbar-gutter:\s*stable/);
  });

  it('نافذة أضيق ⇒ ورقة أضيق — القيمة محسوبة لا محفوظة', async () => {
    canvasSize = { w: 700, h: 800 };
    await open();
    expect(sheetBox().w).toBeCloseTo(700 - PAD_NARROW * 2, 0);
  });
});

describe('Fit Page — معادلة مستقلة (البُعدان)', () => {
  const fitPage = () => fireEvent.click(screen.getByRole('button', { name: /ملاءمة الصفحة/ }));

  it('الصفحة كاملة داخل مساحة العرض: العرض والارتفاع معًا', async () => {
    await open();
    fitPage();
    const { w, h } = sheetBox();
    expect(w).toBeLessThanOrEqual(canvasSize.w - pad() * 2 + 1);
    expect(h).toBeLessThanOrEqual(canvasSize.h - pad() * 2 + 1); // ← القيد الذي يميّزه
  });

  it('يختلف عن Fit Width حين يكون الارتفاع هو القيد', async () => {
    await open();
    const width = sheetBox();
    fitPage();
    const page = sheetBox();
    // canvas 1200×800: العرض يسمح بـ 1088 لكن الارتفاع لا يسمح إلا بـ 688 ⇒ أصغر.
    expect(page.h).toBeLessThan(width.h);
    expect(page.h).toBeCloseTo(canvasSize.h - pad() * 2, 0);
  });

  it('نسبة A4 محفوظة — لا تشويه', async () => {
    await open();
    fitPage();
    const { w, h } = sheetBox();
    expect(h / w).toBeCloseTo(A4_RATIO, 2);
  });
});

describe('نسب التكبير حقيقية', () => {
  it('100% = مقاس A4 الفعلي عند 96dpi (794×1123px)', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('مستوى التكبير'), { target: { value: '1' } });
    const { w, h } = sheetBox();
    expect(w).toBeCloseTo(PAGE_W, 0);
    expect(h).toBeCloseTo(PAGE_H, 0);
  });

  it('كل نسبة تُنتج مقاسًا = مقاس الورقة × النسبة (لا مقاسات قديمة عالقة)', async () => {
    await open();
    const select = screen.getByLabelText('مستوى التكبير');
    for (const z of [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]) {
      fireEvent.change(select, { target: { value: String(z) } });
      const { w, h } = sheetBox();
      expect(w).toBeCloseTo(PAGE_W * z, 0);
      expect(h).toBeCloseTo(PAGE_H * z, 0);
    }
  });

  it('عند 25% تبقى ورقة — لا «مستطيل أبيض طويل»', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('مستوى التكبير'), { target: { value: '0.25' } });
    const { w, h } = sheetBox();
    expect(h / w).toBeCloseTo(A4_RATIO, 2); // ← الانحدار: كانت النسبة تنفجر إلى ‎5.7
    expect(h).toBeLessThan(PAGE_H); // ولا ترث ارتفاع الـ iframe غير المقيَّس
  });

  it('صندوق الورقة مقيس في البُعدين — لا minHeight ولا اعتماد على أثر transform', async () => {
    await open();
    expect(sheet().style.height).not.toBe('');
    expect(sheet().style.minHeight).toBe('');
    // والـ iframe خارج التدفّق، فمقاسه الأصلي لا يمدّ الورقة.
    expect(CSS).toMatch(/\.pc-frame\s*\{[\s\S]*?position:\s*absolute/);
    expect(CSS).toMatch(/\.pc-sheet\s*\{[\s\S]*?overflow:\s*hidden/);
  });

  it('الـ iframe يرسم دائمًا بمقاس A4 الحقيقي ويُقيَّس بصريًا فقط', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('مستوى التكبير'), { target: { value: '0.5' } });
    expect(px(frame().style.width)).toBeCloseTo(PAGE_W, 0); // لا يتغيّر
    expect(frame().style.transform).toBe('scale(0.5)');
  });

  it('التكبير خطوة بخطوة يبدأ من النسبة المعروضة فعلًا — لا قفزة', async () => {
    await open(); // Fit Width عند 1200px ⇒ ‎1088/794 ≈ 1.37
    const shown = () => sheetBox().w / PAGE_W;
    expect(shown()).toBeGreaterThan(1.25);
    fireEvent.click(screen.getByRole('button', { name: 'تصغير' }));
    expect(shown()).toBeCloseTo(1.25, 2); // الخطوة الأدنى مباشرةً، لا رجوع إلى 100%
    fireEvent.click(screen.getByRole('button', { name: 'تكبير' }));
    expect(shown()).toBeCloseTo(1.5, 2);
  });
});

describe('إعادة الحساب عند تغيير الحجم', () => {
  it('تغيّر حجم النافذة يعيد حساب Fit Width فورًا', async () => {
    await open();
    const before = sheetBox().w;
    canvasSize = { w: 1600, h: 900 };
    act(() => {
      window.dispatchEvent(new Event('resize')); // jsdom بلا ResizeObserver → المسار الاحتياطي
    });
    const after = sheetBox().w;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeCloseTo(1600 - PAD_WIDE * 2, 0);
  });

  it('المكوّن يراقب الحاوية نفسها حين يتوفّر ResizeObserver', () => {
    const src = readFileSync('src/printing/components/PrintPreviewDialog.tsx', 'utf8');
    expect(src).toContain('new ResizeObserver');
    expect(src).toContain('ro.observe(el)');
  });

  it('نسبة ثابتة لا تتأثر بتغيّر الحجم', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('مستوى التكبير'), { target: { value: '0.5' } });
    canvasSize = { w: 1600, h: 900 };
    act(() => window.dispatchEvent(new Event('resize')));
    expect(sheetBox().w).toBeCloseTo(PAGE_W * 0.5, 0); // 50% تعني 50%
  });
});

describe('Canvas والتمرير والتوسيط', () => {
  it('الورقة متوسّطة أفقيًا ورأسيًا بأمان (لا تلتصق بالأعلى، ولا تُقصّ حافتها)', () => {
    expect(CSS).toMatch(/\.pc-canvas\s*\{[\s\S]*?justify-content:\s*safe center/);
    expect(CSS).toMatch(/\.pc-canvas\s*\{[\s\S]*?align-items:\s*safe center/);
  });

  it('الـ canvas وحده هو القابل للتمرير', () => {
    expect(CSS).toMatch(/\.pc-body\s*\{[\s\S]*?overflow:\s*hidden/);
    expect(CSS).toMatch(/\.pc-canvas\s*\{[\s\S]*?overflow:\s*auto/);
    expect(CSS).toMatch(/overscroll-behavior:\s*contain/);
    const src = readFileSync('src/printing/components/PrintPreviewDialog.tsx', 'utf8');
    expect(src).toContain('lockScroll()'); // الصفحة خلفه مقفلة (عبر العدّاد المشترك)
  });

  it('حشوة 40–60px حول الورقة، تتقلّص تدريجيًا', () => {
    expect(CSS).toMatch(/\.pc-canvas\s*\{[\s\S]*?padding:\s*56px/);
    expect(CSS).toMatch(/max-width:\s*1200px[\s\S]{0,60}padding:\s*48px/);
    expect(CSS).toMatch(/max-width:\s*900px[\s\S]{0,60}padding:\s*40px/);
  });

  it('الورقة: بيضاء، حدّ خفيف، ظل هادئ', () => {
    expect(CSS).toMatch(/\.pc-sheet\s*\{[\s\S]*?background:\s*#fff/);
    expect(CSS).toMatch(/\.pc-sheet\s*\{[\s\S]*?border:\s*1px solid/);
    expect(CSS).toMatch(/\.pc-sheet\s*\{[\s\S]*?box-shadow/);
  });
});

describe('شريط الأدوات والتذييل', () => {
  it('الترتيب: إغلاق · تصغير · النسبة · تكبير · ملاءمة العرض · ملاءمة الصفحة · الصفحات · طباعة', async () => {
    await open();
    const bar = document.querySelector('.pc-toolbar') as HTMLElement;
    const labels = [...bar.querySelectorAll('button, select, .pc-pages')].map(
      (el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '',
    );
    const order = ['إغلاق', 'تصغير', 'مستوى التكبير', 'تكبير', 'ملاءمة العرض', 'ملاءمة الصفحة'];
    const idx = order.map((l) => labels.findIndex((x) => x.includes(l)));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(idx.every((i) => i >= 0)).toBe(true);
    const pages = labels.findIndex((l) => l.includes('الصفحات التقديرية'));
    const print = labels.findIndex((l) => l === 'طباعة');
    expect(pages).toBeGreaterThan(idx[idx.length - 1]);
    expect(print).toBeGreaterThan(pages); // الطباعة آخر الشريط، الأبرز
  });

  it('«طباعة» هو الإجراء الأبرز', async () => {
    await open();
    expect(screen.getByRole('button', { name: 'طباعة' })).toHaveClass('pc-btn--primary');
    // وأزرار الملاءمة أخفّ منه.
    expect(CSS).toMatch(/\.pc-btn--toggle\s*\{\s*font-weight:\s*600/);
  });

  it('الشريط يلتف بانتظام — لا تداخل ولا اختفاء', () => {
    expect(CSS).toMatch(/\.pc-toolbar\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  });

  it('عدّاد الصفحات ظاهر ومقروء، وبلا أزرار تنقّل وهمية', async () => {
    await open();
    expect(screen.getAllByText(/الصفحات التقديرية/).length).toBeGreaterThan(0);
    expect(CSS).toMatch(/\.pc-pages\s*\{[\s\S]*?font-size:\s*13px/);
    expect(screen.queryByLabelText('الصفحة التالية')).toBeNull();
  });

  it('التذييل يبقى ظاهرًا ومقروءًا (اسم المستند + الصفحات + الحالة)', async () => {
    await open();
    const footer = document.querySelector('.pc-statusbar') as HTMLElement;
    expect(footer).toBeInTheDocument();
    expect(footer.textContent).toContain('فاتورة · INV-2026-001');
    expect(footer.textContent).toContain('الصفحات التقديرية');
    expect(CSS).toMatch(/\.pc-statusbar\s*\{[\s\S]*?font-size:\s*13px/); // كان 12px
    expect(CSS).toMatch(/\.pc-statusbar\s*\{[\s\S]*?flex-shrink:\s*0/); // لا ينضغط
  });
});

describe('المعمار Baseline — بلا مساس', () => {
  it('المعاينة ما زالت لا تعرف IPC ولا تطبع بنفسها', () => {
    // نفحص الكود لا التعليقات — التعليقات تشرح ما لا نفعله، فلا تُحسب ضده.
    const src = readFileSync('src/printing/components/PrintPreviewDialog.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const banned of ['window.manar', 'webContents', 'pdfjs', 'printCurrentView', 'submitPrintJob']) {
      expect(src).not.toContain(banned);
    }
    open();
    expect(frame().getAttribute('sandbox')).toBe('allow-same-origin');
    expect(frame().getAttribute('srcdoc')).toContain('مستند');
  });
});
