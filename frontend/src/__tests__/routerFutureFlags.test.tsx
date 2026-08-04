// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { lazy, Suspense } from 'react';
import { fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

/**
 * React Router — أعلام المستقبل.
 *
 * `v7_relativeSplatPath` مُفعَّل: أثره هنا **صفر** — الـ splat الوحيد لا يحوي إلا
 * `<Navigate to="/">` المطلق، ولا يوجد في المشروع تنقّل نسبي واحد.
 *
 * `v7_startTransition` مُفعَّل أيضًا: تحديثات التوجيه تصبح **غير عاجلة**. لذلك تختبر
 * هذه الملفات **النتيجة النهائية** للتنقّل (`findBy…`) لا لقطةً زمنية هشّة — فتوقيت
 * ظهور `<Suspense fallback>` صار مسموحًا له بالتغيّر، وهذا هو المقصود من العلم.
 *
 * الحارس هنا يثبت أن العلمين مفعّلان في الإنتاج **وفي الاختبارات معًا**: اختبارٌ يعمل
 * بأعلام مختلفة عن التطبيق يختبر تطبيقًا آخر.
 */

const appSrc = readFileSync('src/App.tsx', 'utf8');

/** يُملأ عند تركيب الصفحة الكسولة؛ استدعاؤه يُكمل الاستيراد. */
let heavyResolver: (() => void) | null = null;
const TESTS_DIR = 'src/__tests__';

afterEach(cleanup);

describe('العلم في الإنتاج (HashRouter)', () => {
  it('العلمان مُفعَّلان على الـ Router الإنتاجي الوحيد', () => {
    // تحقّق بنيوي على وسم الـ Router نفسه — لا على مسافات أو تنسيق.
    const tag = appSrc.match(/<HashRouter[^>]*>/)?.[0] ?? '';
    expect(tag).toMatch(/v7_relativeSplatPath:\s*true/);
    expect(tag).toMatch(/v7_startTransition:\s*true/);
    expect((appSrc.match(/<HashRouter/g) ?? []).length).toBe(1); // Router إنتاجي واحد
  });

  it('الاختبارات تعمل بنفس أعلام الإنتاج (لا أعلام محلية متفرّقة)', () => {
    expect(ROUTER_FUTURE).toEqual({ v7_relativeSplatPath: true, v7_startTransition: true });
    // ولا ملف اختبار يعرّف أعلامًا بنفسه بدل الـ helper المشترك.
    const offenders = readdirSync(TESTS_DIR)
      .filter((f) => f.endsWith('.tsx') && f !== 'routerFutureFlags.test.tsx')
      .filter((f) => /future=\{\{/.test(readFileSync(`${TESTS_DIR}/${f}`, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('لا startTransition يدوي في أي مكان — التفعيل عبر العلم الرسمي وحده', () => {
    const walk = (dir: string): string[] => {
      const hits: string[] = [];
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (e.name !== '__tests__') hits.push(...walk(path)); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        // الكود وحده — التعليقات تشرح العلم ولا تُحسب استخدامًا يدويًا له.
        const code = readFileSync(path, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
          .replace(/\/\/.*$/gm, '');
        if (/React\.startTransition|startTransition\(|useTransition\(/.test(code)) {
          hits.push(path);
        }
      }
      return hits;
    };
    expect(walk('src')).toEqual([]);
  });

  it('لم يتغيّر Router ولا الـ Suspense ولا التحميل الكسول', () => {
    expect(appSrc).not.toContain('BrowserRouter');
    expect(appSrc).not.toContain('createHashRouter');
    expect(appSrc).not.toContain('RouterProvider');
    expect(appSrc).toContain('<Suspense fallback={<PageLoader />}>');
    expect((appSrc.match(/lazy\(/g) ?? []).length).toBe(54); // +1: FinancialAnalysisCenter (Financial Analysis Center v1) — still lazy, still HashRouter
    expect(appSrc).toContain('<Route path="*" element={<Navigate to="/" replace />} />');
  });
});

describe('العلم في الاختبارات — مطابقة للإنتاج', () => {
  it('كل MemoryRouter في الاختبارات يحمل نفس أعلام الإنتاج', () => {
    const offenders: string[] = [];
    // يُستثنى ملف الحارس نفسه: نصّه يذكر الوسم داخل تعبير نمطي، لا كاستخدام حقيقي.
    const files = readdirSync(TESTS_DIR)
      .filter((f) => f.endsWith('.tsx') && f !== 'routerFutureFlags.test.tsx');
    for (const file of files) {
      const src = readFileSync(`${TESTS_DIR}/${file}`, 'utf8');
      for (const tag of src.match(/<MemoryRouter[^>]*>/g) ?? []) {
        if (!tag.includes('future={ROUTER_FUTURE}')) offenders.push(`${file}: ${tag}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ── سلوك التوجيه لم يتغيّر ───────────────────────────────────────────────────────
function Home() {
  return <div>الرئيسية</div>;
}
function Contract() {
  const { employeeId } = useParams();
  return <div>عقد الموظف {employeeId}</div>;
}

/** نفس شكل شجرة المسارات في App: صفحات + splat مطلق في النهاية. */
function TestRoutes({ entry }: { entry: string }) {
  return (
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/forms/employment-contract/:employeeId" element={<Contract />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('التوجيه مع العلم مُفعَّلًا', () => {
  it('مسار غير موجود يعيد التوجيه إلى / (الـ splat المطلق كما هو)', () => {
    render(<TestRoutes entry="/no/such/page" />);
    expect(screen.getByText('الرئيسية')).toBeInTheDocument();
  });

  it('مسار ديناميكي قائم ما زال يعمل ويقرأ معامله', () => {
    render(<TestRoutes entry="/forms/employment-contract/42" />);
    expect(screen.getByText('عقد الموظف 42')).toBeInTheDocument();
  });

  it('لا حلقة توجيه: الجذر يعرض الرئيسية مباشرة', () => {
    render(<TestRoutes entry="/" />);
    expect(screen.getByText('الرئيسية')).toBeInTheDocument();
  });
});

describe('لا تنقّل نسبي في المشروع — ولهذا أثر العلم صفر', () => {
  it('كل navigate/Link يستخدم مسارًا مطلقًا أو رقمًا (رجوع)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(path);
          continue;
        }
        if (!entry.name.endsWith('.tsx')) continue;
        const src = readFileSync(path, 'utf8');
        // navigate('x') / navigate(`x`) بمسار لا يبدأ بـ / ولا بقالب متغيّر
        for (const m of src.match(/navigate\((['`])(?!\/|\$\{)[^'`)]+\1/g) ?? []) {
          offenders.push(`${path}: ${m}`);
        }
        // <Link to="x"> / <NavLink to="x"> بمسار لا يبدأ بـ /
        for (const m of src.match(/<(?:Nav)?Link[^>]*\sto=(['"])(?!\/|\{)[^'"]+\1/g) ?? []) {
          offenders.push(`${path}: ${m}`);
        }
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
});

// ── التنقّل إلى صفحة كسولة مع startTransition مُفعَّلًا ──────────────────────────
/**
 * مع `v7_startTransition` تصبح تحديثات التوجيه **غير عاجلة**، فقد يُبقي React الصفحة
 * الحالية معروضة حتى يجهز الاستيراد الكسول بدل إظهار الـ fallback فورًا.
 *
 * لذلك نختبر **النتيجة النهائية** — أن الوجهة تظهر فعلًا — لا لقطةً زمنية عن ظهور
 * الـ fallback أو غيابه: توقيته صار مسموحًا له بالتغيّر، وتثبيته في اختبار يجعله هشًّا
 * ويعاند المقصود من العلم.
 */
describe('التحميل الكسول مع startTransition', () => {
  function LazyApp({ resolve }: { resolve: () => void }) {
    const Heavy = lazy(
      () =>
        new Promise<{ default: () => JSX.Element }>((res) => {
          resolve = () => res({ default: () => <div>الصفحة الثقيلة</div> });
          heavyResolver = resolve;
        }),
    );
    return (
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/']}>
        <Suspense fallback={<div>جارٍ التحميل…</div>}>
          <Routes>
            <Route path="/" element={<NavToHeavy />} />
            <Route path="/heavy" element={<Heavy />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    );
  }

  function NavToHeavy() {
    const navigate = useNavigate();
    return (
      <button type="button" onClick={() => navigate('/heavy')}>
        اذهب إلى الثقيلة
      </button>
    );
  }

  it('التنقّل يكتمل: الصفحة الكسولة تظهر بعد اكتمال استيرادها — بلا صفحة بيضاء ولا حلقة', async () => {
    render(<LazyApp resolve={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'اذهب إلى الثقيلة' }));

    // الاستيراد لم يكتمل بعد: لا نُثبّت هل ظهر الـ fallback أم بقيت الصفحة السابقة —
    // هذا بالضبط ما يسمح العلم بتغييره. لكن **لا صفحة بيضاء**: شيءٌ ما معروض دائمًا.
    expect(document.body.textContent?.trim()).not.toBe('');

    heavyResolver!(); // اكتمل الاستيراد الكسول

    // النتيجة النهائية هي المعيار.
    expect(await screen.findByText('الصفحة الثقيلة')).toBeInTheDocument();
    expect(screen.queryByText('جارٍ التحميل…')).toBeNull(); // لا يبقى الـ fallback عالقًا
    expect(screen.queryByRole('button', { name: 'اذهب إلى الثقيلة' })).toBeNull(); // ولا الصفحة السابقة
  });
});
