// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { MemoryRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

/**
 * React Router — أعلام المستقبل.
 *
 * `v7_relativeSplatPath` مُفعَّل: بروفة لسلوك v7 في حلّ المسارات النسبية داخل مسار
 * splat. أثره هنا **صفر** لأن الـ splat الوحيد لا يحوي إلا `<Navigate to="/">` المطلق،
 * ولا يوجد في المشروع تنقّل نسبي واحد.
 *
 * `v7_startTransition` **غير مُفعَّل عمدًا** — يؤجّل إظهار `<Suspense fallback>` عند
 * التنقّل إلى الصفحات الكسولة، وهو تغيير مرئي له حزمته وفحصه البصري. هذا الملف يحرس
 * القرار: لو فُعِّل بلا قصد، يسقط الاختبار.
 */

const appSrc = readFileSync('src/App.tsx', 'utf8');
const TESTS_DIR = 'src/__tests__';

afterEach(cleanup);

describe('العلم في الإنتاج (HashRouter)', () => {
  it('v7_relativeSplatPath مُفعَّل على الـ Router الوحيد', () => {
    expect(appSrc).toContain('<HashRouter future={{ v7_relativeSplatPath: true }}>');
    expect((appSrc.match(/<HashRouter/g) ?? []).length).toBe(1); // Router إنتاجي واحد
  });

  it('v7_startTransition **غير** مُفعَّل — لا في الإنتاج ولا في الاختبارات', () => {
    const code = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(code).not.toContain('v7_startTransition');
    expect(readFileSync(`${TESTS_DIR}/helpers/router.ts`, 'utf8')).not.toMatch(
      /v7_startTransition:\s*true/,
    );
    expect(ROUTER_FUTURE).toEqual({ v7_relativeSplatPath: true });
  });

  it('لم يتغيّر Router ولا الـ Suspense ولا التحميل الكسول', () => {
    expect(appSrc).not.toContain('BrowserRouter');
    expect(appSrc).not.toContain('createHashRouter');
    expect(appSrc).not.toContain('RouterProvider');
    expect(appSrc).toContain('<Suspense fallback={<PageLoader />}>');
    expect((appSrc.match(/lazy\(/g) ?? []).length).toBe(48); // نفس الصفحات الكسولة
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
