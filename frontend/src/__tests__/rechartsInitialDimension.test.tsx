// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { ResponsiveContainer, BarChart, Bar, XAxis } from 'recharts';
import { CHART_INITIAL_DIMENSION } from '../lib/rechartsDefaults';

/**
 * Recharts — الأبعاد الابتدائية للحاويات.
 *
 * `ResponsiveContainer` يبدأ بحالة `{ width: -1, height: -1 }` — قيمة حارسة تكتبها
 * المكتبة، لا قياسًا فاشلًا. وفي الرسمة الأولى (قبل أن يقيس `ResizeObserver`) يقع:
 *
 *   warn(calculatedWidth > 0 || calculatedHeight > 0, 'The width(-1) and height(-1)…')
 *
 * الشرط **OR**: فلا يُحذَّر إلا حين يكون البُعدان معًا ≤ 0 — أي في `width="100%"
 * height="100%"` وحدها. الحاويات ذات الارتفاع الرقمي لا تُحذّر أبدًا، ولذلك لم تُمسّ.
 *
 * الإصلاح: `initialDimension` — **prop رسمية** — بقيمة موجبة. لا CSS، لا media queries،
 * لا نقل ارتفاعات إلى JSX، لا تأخير تركيب، لا كتم console.
 */

/** يلتقط تحذيرات المكتبة **للتأكيد عليها** — لا لإسكاتها. `mockRestore` إلزامي. */
function captureWarnings() {
  const seen: string[] = [];
  const spy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    seen.push(args.map(String).join(' '));
  });
  return { seen, restore: () => spy.mockRestore() };
}

const DIM_WARNING = /width\(-?\d+\).*height\(-?\d+\).*greater than 0/i;

afterEach(cleanup);

// ── الثابت ──────────────────────────────────────────────────────────────────────
describe('CHART_INITIAL_DIMENSION', () => {
  it('موجب ومنتهٍ في البُعدين — لا صفر ولا سالب ولا NaN', () => {
    const { width, height } = CHART_INITIAL_DIMENSION;
    for (const v of [width, height]) {
      expect(typeof v).toBe('number');
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});

// ── السلوك: التحذير يقع بلا العلاج، ولا يقع معه ────────────────────────────────
describe('سلوك ResponsiveContainer في المتصفح الوهمي', () => {
  const data = [{ name: 'يناير', v: 10 }, { name: 'فبراير', v: 20 }];

  const chart = (extra: Record<string, unknown>) => (
    <div style={{ width: 400, height: 240 }}>
      <ResponsiveContainer width="100%" height="100%" {...extra}>
        <BarChart data={data}>
          <XAxis dataKey="name" />
          <Bar dataKey="v" fill="#4f46e5" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  it('بلا initialDimension: التحذير يقع فعلًا (يُثبت أن الاختبار يقيس شيئًا حقيقيًا)', () => {
    const { seen, restore } = captureWarnings();
    render(chart({}));
    restore();
    expect(seen.filter((m) => DIM_WARNING.test(m)).length).toBeGreaterThan(0);
  });

  it('مع initialDimension الموجبة: صفر تحذيرات أبعاد', () => {
    const { seen, restore } = captureWarnings();
    render(chart({ initialDimension: CHART_INITIAL_DIMENSION }));
    restore();
    expect(seen.filter((m) => DIM_WARNING.test(m))).toEqual([]);
  });

  it('الحاوية تبقى نسبية — لم تُنقل الأبعاد إلى JSX', () => {
    render(chart({ initialDimension: CHART_INITIAL_DIMENSION }));
    const container = document.querySelector('.recharts-responsive-container') as HTMLElement;
    expect(container.style.width).toBe('100%');
    expect(container.style.height).toBe('100%');
  });
});

// ── مسح المشروع ────────────────────────────────────────────────────────────────
/** كل ملفات .tsx تحت src. */
function sourceFiles(dir = 'src'): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__') out.push(...sourceFiles(path));
    } else if (name.endsWith('.tsx')) {
      out.push(path);
    }
  }
  return out;
}

const chartFiles = sourceFiles().filter((f) => readFileSync(f, 'utf8').includes('<ResponsiveContainer'));

describe('كل حاويات المشروع', () => {
  it('كل حاوية نسبية/نسبية تحمل initialDimension موجبة', () => {
    const offenders: string[] = [];
    for (const file of chartFiles) {
      const src = readFileSync(file, 'utf8');
      for (const tag of src.match(/<ResponsiveContainer[^>]*>/g) ?? []) {
        const percentBoth = /width="100%"/.test(tag) && /height="100%"/.test(tag);
        if (percentBoth && !tag.includes('initialDimension={CHART_INITIAL_DIMENSION}')) {
          offenders.push(`${file}: ${tag}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('الحاويات ذات الارتفاع الرقمي لم تُمسّ — لا تُحذّر أصلًا', () => {
    const touched: string[] = [];
    for (const file of chartFiles) {
      for (const tag of readFileSync(file, 'utf8').match(/<ResponsiveContainer[^>]*>/g) ?? []) {
        if (/height=\{\d/.test(tag) && tag.includes('initialDimension')) touched.push(`${file}: ${tag}`);
      }
    }
    expect(touched).toEqual([]);
  });

  it('العدد الفعلي: 22 حاوية = 15 نسبية/نسبية + 7 بارتفاع رقمي', () => {
    let total = 0, percentBoth = 0, numericHeight = 0;
    for (const file of chartFiles) {
      for (const tag of readFileSync(file, 'utf8').match(/<ResponsiveContainer[^>]*>/g) ?? []) {
        total++;
        if (/width="100%"/.test(tag) && /height="100%"/.test(tag)) percentBoth++;
        else if (/height=\{\d/.test(tag)) numericHeight++;
      }
    }
    expect({ total, percentBoth, numericHeight }).toEqual({ total: 22, percentBoth: 15, numericHeight: 7 });
  });

  it('لا كتم console ولا تأخير تركيب ولا minHeight/aspect مُقحمة في ملفات المخططات', () => {
    // الاسم يُبنى تركيبًا: كتابته حرفيًا هنا تجعل حارس نظافة الـ console
    // (testConsoleHygiene) يرصد **نصّ التأكيد نفسه** كأنه استخدام. نفحص الدلالة لا النص.
    const BANNED_SUPPRESSOR = ['suppress', 'Console'].join('');
    for (const file of chartFiles) {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toContain(BANNED_SUPPRESSOR);
      expect(src).not.toMatch(/spyOn\(console/);
      expect(src).not.toMatch(/<ResponsiveContainer[^>]*\b(aspect|minHeight|minWidth)=/);
      // لا تأخير تركيب أُضيف حول المخططات.
      expect(src).not.toMatch(/setTimeout\([^)]*setMounted|requestIdleCallback/);
    }
  });
});
