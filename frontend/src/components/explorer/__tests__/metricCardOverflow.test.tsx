// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MetricCard } from '../ExplorerKit';
import { computeFittedFontSize, FIT_MIN_FONT_PX } from '../useFitText';

/* ════════════════════════════════════════════════════════════════════════════
   عقد بطاقة المؤشّر: لا فيض، ولا رقم مقصوص.

   العيب الأصلي: مبلغ طويل مثل `9,999,999,999.999 KWD` رمزٌ واحد بلا موضع
   التفاف، فكان المتصفّح يرسمه بعرضه الطبيعي ويسيل خارج إطار البطاقة — لأن
   `.xpl-metric` لم تكن تقصّ شيئًا و`.xpl-metric-value` بلا أي قيد عرض.

   الإصلاح طبقتان، وهذا الملف يحرس كلتيهما:
     • بنيوية (CSS) — البطاقة تقصّ، والوصف يقبل «…»، والقيمة **لا** تقبلها.
     • قياسية (JS) — الخطّ يُصغَّر حتى يتّسع الرقم كاملًا فلا يصل إلى حافّة القصّ.
   ════════════════════════════════════════════════════════════════════════════ */

const CSS = readFileSync(resolve(__dirname, '../explorer-kit.css'), 'utf8');

/** كتلة قاعدة CSS بمُنتقٍ بعينه — للتحقّق من خصائصها دون افتراض ترتيبها. */
function ruleBlock(selector: string): string {
  const start = CSS.indexOf(`\n${selector} `);
  const open = CSS.indexOf('{', start);
  return start === -1 ? '' : CSS.slice(open, CSS.indexOf('}', open));
}

afterEach(cleanup);

/* ── الطبقة البنيوية ────────────────────────────────────────────────────── */

describe('بطاقة المؤشّر — القيود البنيوية', () => {
  it('البطاقة تقصّ ما يتجاوز حدودها', () => {
    expect(ruleBlock('.xpl-metric')).toMatch(/overflow:\s*hidden/);
  });

  it('الجسم يتقلّص فعلًا: min-width صفري وflex-shrink مسموح', () => {
    const body = ruleBlock('.xpl-metric-body');
    expect(body).toMatch(/min-width:\s*0/);
    expect(body).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(body).toMatch(/overflow:\s*hidden/);
  });

  it('الأيقونة لا تتقلّص — وإلا انضغطت بدل أن يتقلّص النصّ', () => {
    expect(ruleBlock('.xpl-metric-icon')).toMatch(/flex-shrink:\s*0/);
  });

  it('التسمية والوصف يقبلان «…»', () => {
    for (const selector of ['.xpl-metric-label', '.xpl-metric-sub']) {
      const block = ruleBlock(selector);
      expect(block, selector).toMatch(/white-space:\s*nowrap/);
      expect(block, selector).toMatch(/overflow:\s*hidden/);
      expect(block, selector).toMatch(/text-overflow:\s*ellipsis/);
    }
  });

  it('**القيمة المالية لا تقبل «…» إطلاقًا** — هذا هو جوهر العقد', () => {
    const value = ruleBlock('.xpl-metric-value');
    expect(value).toMatch(/white-space:\s*nowrap/); // شرط قياس الفيض
    expect(value).toMatch(/overflow:\s*hidden/); // شبكة أمان
    expect(value).not.toMatch(/text-overflow/); // ولا نقطة واحدة
  });

  it('لم يتغيّر أي شيء بصري: الحشو والحوافّ والمقاسات كما كانت', () => {
    const card = ruleBlock('.xpl-metric');
    expect(card).toMatch(/padding:\s*14px 16px/);
    expect(card).toMatch(/border-radius:\s*14px/);
    expect(card).toMatch(/gap:\s*12px/);
    expect(ruleBlock('.xpl-metric-icon')).toMatch(/width:\s*40px/);
    expect(ruleBlock('.xpl-metric-value')).toMatch(/font-size:\s*19px/);
    expect(ruleBlock('.xpl-metric-label')).toMatch(/font-size:\s*11\.5px/);
    // ولا ارتفاع مفروض على البطاقة — الشبكة تبقى كما هي.
    expect(card).not.toMatch(/(^|;|\{)\s*height:/);
  });

  it('محاذاة RTL محفوظة: البداية المنطقية لا اليسار', () => {
    expect(ruleBlock('.xpl-metric')).toMatch(/text-align:\s*start/);
    expect(CSS).not.toMatch(/\.xpl-metric[^{]*\{[^}]*text-align:\s*left/);
  });
});

/* ── الطبقة القياسية ────────────────────────────────────────────────────── */

describe('computeFittedFontSize — الحساب النقيّ', () => {
  it('يترك الحجم كما هو حين تتّسع القيمة أصلًا', () => {
    expect(computeFittedFontSize(19, 200, 150)).toBe(19);
    expect(computeFittedFontSize(19, 200, 200)).toBe(19);
  });

  it('يُصغّر بنسبة (المتاح ÷ المطلوب) — والنتيجة تتّسع', () => {
    // 19px تحتاج 272px، والمتاح 136px ⇒ النصف تقريبًا.
    const size = computeFittedFontSize(19, 136, 272);
    expect(size).toBeCloseTo(9.5, 1);
    expect((size * 272) / 19).toBeLessThanOrEqual(136);
  });

  it('لا ينزل تحت الحدّ الأدنى مهما طالت القيمة', () => {
    expect(computeFittedFontSize(19, 10, 10000)).toBe(FIT_MIN_FONT_PX);
  });

  it('يتحمّل القياسات الشاذّة بلا NaN', () => {
    expect(computeFittedFontSize(19, 0, 0)).toBe(19);
    expect(computeFittedFontSize(19, 100, 0)).toBe(19);
    expect(computeFittedFontSize(0, 100, 200)).toBe(0);
  });

  /**
   * حالات الاختبار المطلوبة نصًّا في المواصفة، بأسوأ عرض ممكن: أضيق عمود في
   * الشبكة (200px) يبقى منه ~116px بعد الأيقونة (40) والفجوة (12) والحشو (32).
   */
  it.each([
    ['149,955.600 KWD', 15],
    ['9,999,999,999.999 KWD', 21],
    ['999,999,999,999.999 KWD', 23],
  ])('%s يتّسع داخل أضيق بطاقة بحجم مقروء', (_value, chars) => {
    const AVAILABLE = 116;
    // تقدير متحفّظ لعرض المحرف في خطّ ثقيل بأرقام جدولية.
    const perCharAt19 = 11;
    const needed = chars * perCharAt19;
    const size = computeFittedFontSize(19, AVAILABLE, needed);
    expect((size / 19) * needed).toBeLessThanOrEqual(AVAILABLE);
    expect(size).toBeGreaterThanOrEqual(FIT_MIN_FONT_PX);
  });
});

/* ── السلوك داخل المكوّن ────────────────────────────────────────────────── */

/**
 * jsdom بلا تخطيط: نزرع قياسات حقيقية لمحاكاة الفيض.
 *
 * وتُحقن قاعدة `font-size` كذلك — لا زينةً بل ضرورة: الخطّاف يقرأ الحجم الأساس
 * من `getComputedStyle`، وjsdom يعيد `"medium"` لعنصر بلا ورقة أنماط، فيتوقّف
 * الخطّاف (وهو تصرّفه الصحيح: بلا حجم رقمي لا قياس ممكن). حقن القاعدة يجعل
 * البيئة تشبه المتصفّح حيث `explorer-kit.css` محمَّلة فعلًا.
 */
function stubLayout(clientWidth: number, naturalWidthAt19: number) {
  const style = document.createElement('style');
  style.setAttribute('data-fit-test', '');
  style.textContent = '.xpl-metric-value { font-size: 19px; }';
  document.head.appendChild(style);

  const client = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockReturnValue(clientWidth);
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    // العرض المطلوب يتناسب طرديًا مع حجم الخطّ المفروض.
    const size = Number.parseFloat(this.style.fontSize) || 19;
    return Math.round((naturalWidthAt19 * size) / 19);
  });
  return () => {
    client.mockRestore();
    scroll.mockRestore();
    style.remove();
  };
}

describe('MetricCard — التصغير عند الفيض', () => {
  it('يُصغّر خطّ القيمة حتى تتّسع، ولا يمسّ التسمية', () => {
    const restore = stubLayout(136, 272);
    const { container } = render(
      <MetricCard icon="payments" label="إجمالي المحصَّل" value="9,999,999,999.999 KWD" />,
    );

    const value = container.querySelector<HTMLElement>('.xpl-metric-value')!;
    const applied = Number.parseFloat(value.style.fontSize);
    expect(applied).toBeGreaterThan(0);
    expect(applied).toBeLessThan(19);
    expect(applied).toBeGreaterThanOrEqual(FIT_MIN_FONT_PX);
    // النصّ كاملٌ في الشجرة — لم يُقصّ ولم يُستبدل.
    expect(value.textContent).toBe('9,999,999,999.999 KWD');
    expect(container.querySelector<HTMLElement>('.xpl-metric-label')!.style.fontSize).toBe('');
    restore();
  });

  it('القيمة التي تتّسع أصلًا تبقى بحجم ورقة الأنماط — لا أثر بصري', () => {
    const restore = stubLayout(200, 90);
    const { container } = render(<MetricCard icon="payments" label="الرصيد" value="1,200.000" />);
    expect(container.querySelector<HTMLElement>('.xpl-metric-value')!.style.fontSize).toBe('');
    restore();
  });

  it('بلا تخطيط (عرض صفري) لا يفرض حجمًا — فلا ينكسر أي اختبار قائم', () => {
    const { container } = render(<MetricCard icon="payments" label="الرصيد" value="1,200.000" />);
    expect(container.querySelector<HTMLElement>('.xpl-metric-value')!.style.fontSize).toBe('');
  });

  it('بلا حجم أساس رقمي (ورقة أنماط غائبة) يتوقّف بأمان بدل فرض تخمين', () => {
    // قياسات فيض حقيقية، لكن `getComputedStyle` يعيد `medium` بلا القاعدة.
    const client = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(136);
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(272);
    const { container } = render(<MetricCard icon="payments" label="المحصَّل" value="9,999,999,999.999" />);
    expect(container.querySelector<HTMLElement>('.xpl-metric-value')!.style.fontSize).toBe('');
    client.mockRestore();
    scroll.mockRestore();
  });

  it('لا يبقى الحجم المصغَّر عالقًا حين تقصر القيمة', () => {
    const restore = stubLayout(136, 272);
    const { container, rerender } = render(
      <MetricCard icon="payments" label="المحصَّل" value="999,999,999,999.999 KWD" />,
    );
    expect(Number.parseFloat(container.querySelector<HTMLElement>('.xpl-metric-value')!.style.fontSize)).toBeLessThan(19);
    restore();

    const restoreShort = stubLayout(136, 80);
    rerender(<MetricCard icon="payments" label="المحصَّل" value="12.000" />);
    expect(container.querySelector<HTMLElement>('.xpl-metric-value')!.style.fontSize).toBe('');
    restoreShort();
  });
});
