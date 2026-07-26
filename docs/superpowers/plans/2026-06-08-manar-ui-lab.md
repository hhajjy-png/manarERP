# manar-ui-lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a standalone React + TypeScript + Vite + Tailwind v3 UI prototype lab at `c:\Users\hhajj\Claude\Projects\manar-ui-lab`, visually aligned with manarERP, for designing pages before copying them into the real project.

**Architecture:** Vite-scaffolded React app with BrowserRouter. Layout uses manarERP's existing CSS class system (copied theme.css) plus Tailwind utilities. Colors are 100% CSS custom properties — no Tailwind color config. Dark mode toggled via `html[data-theme="dark"]`, matching manarERP exactly.

**Tech Stack:** React 18, TypeScript 5, Vite 5, Tailwind CSS v3, react-router-dom v6, Cairo font (Google Fonts)

---

## Location Confirmation

> This project is created at `c:\Users\hhajj\Claude\Projects\manar-ui-lab`.
> It is a **sibling** of `manarERP`, not inside it.
> **Do NOT modify any manarERP files during implementation.**
> **Do NOT commit to the manarERP git repository** (spec doc already committed there is the only exception).

---

## Rollback Plan

Since this is a brand-new directory with no prior state, rollback is:

```powershell
Remove-Item -Recurse -Force "c:\Users\hhajj\Claude\Projects\manar-ui-lab"
```

No manarERP changes exist to revert. This is safe at any point.

---

## Files to Create

All inside `c:\Users\hhajj\Claude\Projects\manar-ui-lab\`:

| File | Purpose |
|---|---|
| `index.html` | Entry HTML — sets `lang="ar" dir="rtl"`, loads Cairo font |
| `tailwind.config.js` | Tailwind v3 config — content glob only, no colors |
| `postcss.config.js` | PostCSS config for Tailwind |
| `src/main.tsx` | Entry point — imports CSS, restores saved theme |
| `src/App.tsx` | BrowserRouter + route definitions |
| `src/app/theme.css` | Copied verbatim from manarERP — all CSS variables + layout classes |
| `src/app/globals.css` | Tailwind directives + `.nav-btn` style (mirrors `.nav a` for placeholder buttons) |
| `src/data/dashboard.ts` | Mock data: KPIs, chart areas, recent rows |
| `src/components/Sidebar.tsx` | Fixed nav sidebar with NavLink + button placeholders |
| `src/components/Header.tsx` | Topbar with menu toggle + theme toggle + avatar |
| `src/components/Layout.tsx` | Shell: Sidebar + Header + `<Outlet />` |
| `src/pages/Dashboard.tsx` | Dashboard page: KPI cards, chart placeholders, recent table |

## Files to Modify (in manarERP)

**None.** Zero manarERP files are touched.

---

## Task 1: Scaffold the Project

**Files:**
- Create: `c:\Users\hhajj\Claude\Projects\manar-ui-lab\` (entire project directory)

- [ ] **Step 1.1: Scaffold with Vite react-ts template**

Run from `c:\Users\hhajj\Claude\Projects\`:

```bash
cd "c:/Users/hhajj/Claude/Projects"
npm create vite@latest manar-ui-lab -- --template react-ts
```

Expected output ends with:
```
Done. Now run:
  cd manar-ui-lab
  npm install
  npm run dev
```

- [ ] **Step 1.2: Install runtime dependencies**

```bash
cd "c:/Users/hhajj/Claude/Projects/manar-ui-lab"
npm install
npm install react-router-dom
```

- [ ] **Step 1.3: Install Tailwind v3 and PostCSS**

```bash
npm install -D tailwindcss@3 postcss autoprefixer
```

Verify exact version installed:

```bash
npm list tailwindcss
```

Expected: `tailwindcss@3.x.x` (not 4.x).

- [ ] **Step 1.4: Initialize Tailwind (generates base config files)**

```bash
npx tailwindcss init -p
```

This creates `tailwind.config.js` and `postcss.config.js`. Both will be overwritten in Task 2.

- [ ] **Step 1.5: Delete Vite template files we don't need**

```bash
rm src/App.css
rm src/index.css
```

`src/App.tsx`, `src/main.tsx`, and `vite.config.ts` will be overwritten in later tasks.

- [ ] **Step 1.6: Commit project scaffold**

```bash
git init
git add .
git commit -m "chore: scaffold manar-ui-lab with Vite react-ts template"
```

---

## Task 2: Configure Tailwind and PostCSS

**Files:**
- Modify: `tailwind.config.js` (overwrite generated file)
- Modify: `postcss.config.js` (overwrite generated file)

- [ ] **Step 2.1: Write tailwind.config.js**

> **Important:** Vite 5 projects have `"type": "module"` in `package.json`. Use ESM syntax.

Replace the generated `tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

No colors. No darkMode config. Content glob only.

- [ ] **Step 2.2: Write postcss.config.js**

Replace the generated `postcss.config.js` with:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 2.3: Verify Tailwind is wired**

```bash
npx tailwindcss --input src/app/globals.css --output /tmp/test-out.css --content "./src/**/*.tsx"
```

Expected: no errors. (globals.css does not exist yet — that's OK, this is just checking the config parses.)

---

## Task 3: Configure index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 3.1: Replace index.html**

```html
<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>نظام المنار — مختبر الواجهة</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

RTL is set statically at the HTML level — no JavaScript needed.

---

## Task 4: Set Up CSS Files

**Files:**
- Create: `src/app/` directory
- Create: `src/app/theme.css`
- Create: `src/app/globals.css`

- [ ] **Step 4.1: Create src/app/ directory**

```bash
mkdir src/app
```

- [ ] **Step 4.2: Create src/app/theme.css**

Copy manarERP's CSS token system verbatim. This is the source of all color, spacing, and component tokens:

```css
:root {
  --primary: #0f172a; --primary-hover: #1e293b;
  --accent: #3b82f6; --accent-hover: #2563eb; --accent-light: #eff6ff;
  --bg: #f8fafc; --surface: #ffffff; --surface-2: #f1f5f9; --surface-hover: #f8fafc;
  --text: #0f172a; --text-muted: #64748b; --border: #e2e8f0;
  --green: #10b981; --green-light: #d1fae5;
  --red: #ef4444; --red-light: #fee2e2;
  --amber: #f59e0b; --amber-light: #fef3c7;
  --blue: #3b82f6; --blue-light: #dbeafe;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.05);
  --radius: 16px; --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
html[data-theme="dark"] {
  --primary: #020617; --primary-hover: #0f172a; --accent: #3b82f6; --accent-light: #1e3a8a;
  --bg: #0f172a; --surface: #1e293b; --surface-2: #334155; --surface-hover: #2dd4bf0a;
  --text: #f8fafc; --text-muted: #94a3b8; --border: #334155;
  --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3); --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.4);
  --green-light: rgba(16,185,129,.15); --red-light: rgba(239,68,68,.15);
  --amber-light: rgba(245,158,11,.15); --blue-light: rgba(59,130,246,.15);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Cairo', sans-serif; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; transition: background .3s, color .3s; }
a { color: inherit; text-decoration: none; }
.app { display: flex; min-height: 100vh; }

/* Sidebar */
.sidebar { width: 260px; background: var(--primary); color: #fff; display: flex; flex-direction: column; position: fixed; inset-block: 0; inset-inline-start: 0; transition: transform .3s; z-index: 30; box-shadow: 4px 0 24px rgba(0,0,0,.05); }
.brand { padding: 24px 20px; display: flex; align-items: center; gap: 14px; border-bottom: 1px solid rgba(255,255,255,.08); }
.brand .logo { width: 44px; height: 44px; border-radius: 12px; background: var(--accent); display: grid; place-items: center; font-weight: 800; color: #fff; font-size: 22px; flex: none; box-shadow: 0 4px 12px rgba(59,130,246,.4); }
.brand h1 { font-size: 17px; font-weight: 800; }
.brand span { font-size: 12px; color: #94a3b8; font-weight: 600; }
.nav { padding: 16px 12px; overflow-y: auto; flex: 1; }
.nav::-webkit-scrollbar { width: 5px; } .nav::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 10px; }
.nav .group { font-size: 12px; color: #64748b; font-weight: 700; padding: 16px 12px 8px; }
.nav a { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; color: #cbd5e1; font-size: 14.5px; font-weight: 600; cursor: pointer; transition: var(--transition); margin-bottom: 4px; }
.nav a:hover { background: var(--primary-hover); color: #fff; transform: translateX(-4px); }
.nav a.active { background: var(--accent); color: #fff; font-weight: 700; box-shadow: 0 4px 12px rgba(59,130,246,.3); }
.nav a .ic { width: 22px; text-align: center; font-size: 18px; }

/* Main */
.main { flex: 1; margin-inline-start: 260px; display: flex; flex-direction: column; min-width: 0; }
.topbar { height: 70px; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 20px; padding: 0 28px; position: sticky; top: 0; z-index: 20; }
.top-actions { display: flex; align-items: center; gap: 12px; margin-inline-start: auto; }
.icon-btn { width: 42px; height: 42px; border: 1px solid var(--border); background: var(--surface); border-radius: 12px; cursor: pointer; font-size: 18px; color: var(--text); transition: var(--transition); display: grid; place-items: center; }
.icon-btn:hover { background: var(--surface-2); transform: translateY(-2px); }
.user { display: flex; align-items: center; gap: 12px; cursor: pointer; }
.avatar { width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, var(--accent), #2563eb); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 18px; }
.user-info { display: flex; flex-direction: column; text-align: start; }
.user-info strong { font-weight: 700; font-size: 14px; }
.user-info small { color: var(--text-muted); font-size: 12px; font-weight: 600; }

.content { padding: 32px; animation: fadeIn .4s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.page-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; flex-wrap: wrap; gap: 16px; }
.page-head h2 { font-size: 26px; font-weight: 800; }
.page-head p { color: var(--text-muted); font-size: 14.5px; margin-top: 4px; font-weight: 600; }

.btn { background: var(--accent); color: #fff; border: none; padding: 12px 20px; border-radius: 12px; font-weight: 700; font-size: 14.5px; font-family: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: var(--transition); box-shadow: 0 4px 12px rgba(59,130,246,.25); }
.btn:hover { background: var(--accent-hover); transform: translateY(-2px); }
.btn:disabled { opacity: .6; cursor: not-allowed; transform: none; }
.btn.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); box-shadow: var(--shadow-sm); }
.btn.secondary:hover { background: var(--surface-2); }
.btn.danger { background: var(--red); box-shadow: none; }
.btn.sm { padding: 6px 12px; font-size: 12px; }

.stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; margin-bottom: 28px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); transition: var(--transition); }
.card:hover { box-shadow: var(--shadow-lg); }
.stat { padding: 22px; display: flex; align-items: center; gap: 18px; }
.stat .si { width: 58px; height: 58px; border-radius: 14px; display: grid; place-items: center; font-size: 26px; flex: none; }
.stat .lbl { color: var(--text-muted); font-size: 14px; font-weight: 700; margin-bottom: 4px; }
.stat .val { font-size: 26px; font-weight: 800; }

.grid-2 { display: grid; grid-template-columns: 1.6fr 1fr; gap: 20px; margin-bottom: 28px; }
@media (max-width: 1000px) { .grid-2 { grid-template-columns: 1fr; } }
.panel { padding: 24px; }
.panel h3 { font-size: 18px; font-weight: 800; margin-bottom: 4px; }
.panel .ph-sub { color: var(--text-muted); font-size: 13.5px; font-weight: 600; margin-bottom: 20px; }

.table-responsive { overflow-x: auto; }
table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; }
thead th { text-align: start; color: var(--text-muted); font-weight: 700; font-size: 13px; padding: 14px 16px; border-bottom: 1px solid var(--border); white-space: nowrap; }
tbody td { padding: 16px; border-bottom: 1px solid var(--border); font-weight: 600; }
tbody tr:hover td { background: var(--surface-hover); }
tbody tr:last-child td { border-bottom: none; }

.pill { padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; }
.pill.green { background: var(--green-light); color: var(--green); } .pill.green::before { background: var(--green); }
.pill.amber { background: var(--amber-light); color: var(--amber); } .pill.amber::before { background: var(--amber); }
.pill.red { background: var(--red-light); color: var(--red); } .pill.red::before { background: var(--red); }
.pill.blue { background: var(--blue-light); color: var(--blue); } .pill.blue::before { background: var(--blue); }
.pill.gray { background: var(--surface-2); color: var(--text-muted); } .pill.gray::before { background: var(--text-muted); }

.menu-toggle { display: none; }
@media (max-width: 900px) {
  .sidebar { transform: translateX(100%); } .sidebar.open { transform: none; }
  .main { margin-inline-start: 0; } .menu-toggle { display: grid !important; } .content { padding: 20px; }
}

html[dir="ltr"] .nav a:hover {
  transform: translateX(4px);
}
```

- [ ] **Step 4.3: Create src/app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Sidebar button items — mirrors .nav a from theme.css for placeholder nav items */
.nav .nav-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  color: #cbd5e1;
  font-size: 14.5px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
  margin-bottom: 4px;
  width: 100%;
  border: none;
  background: transparent;
  text-align: start;
  font-family: 'Cairo', sans-serif;
}
.nav .nav-btn:hover {
  background: var(--primary-hover);
  color: #fff;
  transform: translateX(-4px);
}
html[dir="ltr"] .nav .nav-btn:hover {
  transform: translateX(4px);
}
```

---

## Task 5: Update main.tsx

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 5.1: Replace src/main.tsx**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './app/theme.css';
import './app/globals.css';
import App from './App';

const saved = localStorage.getItem('theme');
if (saved) document.documentElement.dataset.theme = saved;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

CSS files are imported separately (not via `@import` inside CSS) — this is Vite-idiomatic and avoids PostCSS `@import` ordering issues with `@tailwind` directives.

---

## Task 6: Create Mock Data

**Files:**
- Create: `src/data/dashboard.ts`

- [ ] **Step 6.1: Create src/data/ directory**

```bash
mkdir src/data
```

- [ ] **Step 6.2: Create src/data/dashboard.ts**

```ts
export interface KPI {
  label: string;
  value: string;
  icon: string;
  bgStyle: string;
  iconColor: string;
}

export interface ChartArea {
  title: string;
  subtitle: string;
}

export interface RecentRow {
  id: string;
  client: string;
  amount: string;
  status: 'active' | 'pending' | 'cancelled';
  date: string;
}

export const kpis: KPI[] = [
  { label: 'إجمالي العملاء', value: '148', icon: '👥', bgStyle: 'var(--blue-light)', iconColor: 'var(--blue)' },
  { label: 'إجمالي العقود', value: '32', icon: '📋', bgStyle: 'var(--green-light)', iconColor: 'var(--green)' },
  { label: 'الموظفون النشطون', value: '64', icon: '👤', bgStyle: 'var(--amber-light)', iconColor: 'var(--amber)' },
  { label: 'المعدات', value: '27', icon: '🚜', bgStyle: 'var(--blue-light)', iconColor: 'var(--blue)' },
];

export const chartAreas: ChartArea[] = [
  { title: 'الإيرادات الشهرية', subtitle: 'آخر 12 شهراً' },
  { title: 'توزيع المعدات', subtitle: 'حسب الحالة' },
];

export const recentRows: RecentRow[] = [
  { id: '#1001', client: 'شركة الخليج للإنشاء', amount: '450.000 د.ك', status: 'active', date: '2026/06/01' },
  { id: '#1002', client: 'مؤسسة النور التجارية', amount: '218.500 د.ك', status: 'pending', date: '2026/06/03' },
  { id: '#1003', client: 'شركة الرافدين للمقاولات', amount: '890.000 د.ك', status: 'active', date: '2026/06/04' },
  { id: '#1004', client: 'مجموعة السلام العقارية', amount: '120.000 د.ك', status: 'cancelled', date: '2026/06/05' },
  { id: '#1005', client: 'شركة البنية للتطوير', amount: '335.250 د.ك', status: 'active', date: '2026/06/07' },
];
```

---

## Task 7: Create Sidebar Component

**Files:**
- Create: `src/components/Sidebar.tsx`

- [ ] **Step 7.1: Create src/components/ directory**

```bash
mkdir src/components
```

- [ ] **Step 7.2: Create src/components/Sidebar.tsx**

```tsx
import { NavLink } from 'react-router-dom';

interface NavItem {
  label: string;
  icon: string;
  to: string | null;
}

const navItems: NavItem[] = [
  { label: 'لوحة التحكم', icon: '📊', to: '/' },
  { label: 'العملاء', icon: '👥', to: null },
  { label: 'المعدات', icon: '🚜', to: null },
  { label: 'العقود', icon: '📋', to: null },
  { label: 'الموظفون', icon: '👤', to: null },
];

interface SidebarProps {
  isOpen: boolean;
}

export default function Sidebar({ isOpen }: SidebarProps) {
  return (
    <aside className={`sidebar${isOpen ? ' open' : ''}`}>
      <div className="brand">
        <div className="logo">م</div>
        <div>
          <h1>نظام المنار</h1>
          <span>مختبر الواجهة</span>
        </div>
      </div>
      <nav className="nav">
        {navItems.map((item) =>
          item.to !== null ? (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span className="ic">{item.icon}</span>
              {item.label}
            </NavLink>
          ) : (
            <button key={item.label} type="button" className="nav-btn">
              <span className="ic">{item.icon}</span>
              {item.label}
            </button>
          )
        )}
      </nav>
    </aside>
  );
}
```

Note: `item.to !== null` (not `item.to`) is used because `to` is typed `string | null` — an empty string `''` would also be falsy, so explicit null check is safer.

---

## Task 8: Create Header Component

**Files:**
- Create: `src/components/Header.tsx`

- [ ] **Step 8.1: Create src/components/Header.tsx**

```tsx
import { useState } from 'react';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.dataset.theme === 'dark',
  );

  const toggleTheme = () => {
    const next = !isDark;
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setIsDark(next);
  };

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn menu-toggle"
        onClick={onToggleSidebar}
        aria-label="تبديل القائمة الجانبية"
      >
        ☰
      </button>
      <div className="top-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label="تبديل وضع الإضاءة"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
        <div className="user">
          <div className="avatar">م</div>
          <div className="user-info">
            <strong>المدير</strong>
            <small>مسؤول النظام</small>
          </div>
        </div>
      </div>
    </header>
  );
}
```

---

## Task 9: Create Layout Component

**Files:**
- Create: `src/components/Layout.tsx`

- [ ] **Step 9.1: Create src/components/Layout.tsx**

```tsx
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app">
      <Sidebar isOpen={sidebarOpen} />
      <div className="main">
        <Header onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
        <Outlet />
      </div>
    </div>
  );
}
```

---

## Task 10: Create Dashboard Page

**Files:**
- Create: `src/pages/Dashboard.tsx`

- [ ] **Step 10.1: Create src/pages/ directory**

```bash
mkdir src/pages
```

- [ ] **Step 10.2: Create src/pages/Dashboard.tsx**

```tsx
import { kpis, chartAreas, recentRows } from '../data/dashboard';

const statusLabel: Record<string, string> = {
  active: 'نشط',
  pending: 'معلق',
  cancelled: 'ملغى',
};

const statusColor: Record<string, string> = {
  active: 'green',
  pending: 'amber',
  cancelled: 'red',
};

export default function Dashboard() {
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <h2>لوحة التحكم</h2>
          <p>نظرة عامة على حالة النظام</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="stats">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="card">
            <div className="stat">
              <div
                className="si"
                style={{ backgroundColor: kpi.bgStyle, color: kpi.iconColor }}
              >
                {kpi.icon}
              </div>
              <div>
                <div className="lbl">{kpi.label}</div>
                <div className="val">{kpi.value}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart Placeholders */}
      <div className="grid-2">
        {chartAreas.map((area) => (
          <div key={area.title} className="card panel">
            <h3>{area.title}</h3>
            <p className="ph-sub">{area.subtitle}</p>
            <div
              className="flex items-center justify-center rounded-xl"
              style={{ height: 200, background: 'var(--surface-2)', color: 'var(--text-muted)' }}
            >
              مخطط
            </div>
          </div>
        ))}
      </div>

      {/* Recent Activity Table */}
      <div className="card panel">
        <h3>آخر العمليات</h3>
        <p className="ph-sub">أحدث العقود والمعاملات المسجلة</p>
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>الرقم</th>
                <th>العميل</th>
                <th>المبلغ</th>
                <th>الحالة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.client}</td>
                  <td>{row.amount}</td>
                  <td>
                    <span className={`pill ${statusColor[row.status]}`}>
                      {statusLabel[row.status]}
                    </span>
                  </td>
                  <td>{row.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

---

## Task 11: Wire Up App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 11.1: Replace src/App.tsx**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

---

## Task 12: TypeScript Validation

**Files:** None modified — validation only.

- [ ] **Step 12.1: Run TypeScript type check**

```bash
npx tsc --noEmit
```

Expected: no errors, no output.

If errors appear, fix them before proceeding. Common issues:
- Missing `react-router-dom` types: `npm install -D @types/react-router-dom` (not needed for v6 — types are bundled)
- Import path errors: verify all filenames match exactly (case-sensitive)

- [ ] **Step 12.2: Run production build**

```bash
npm run build
```

Expected output ends with:
```
dist/index.html        x.xx kB
dist/assets/index-xxx.js   xxx kB
✓ built in x.xxs
```

No TypeScript errors, no Vite build errors.

---

## Task 13: Run Dev Server and Validate

**Files:** None modified — visual validation only.

- [ ] **Step 13.1: Start development server**

```bash
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: ...
```

- [ ] **Step 13.2: Open browser and validate checklist**

Open `http://localhost:5173/` and verify each item:

| Check | Expected |
|---|---|
| Direction | Text flows right-to-left; sidebar on the right side of viewport |
| Font | Arabic text uses Cairo (rounded, clean) |
| Sidebar | Visible at full width, shows 5 nav items, "لوحة التحكم" has blue active state |
| Header | Topbar at top, moon icon on left (RTL natural), avatar on left |
| Dark mode | Clicking moon/sun icon toggles dark/light; refreshing preserves choice |
| KPI cards | 4 cards in a row, icon background colors match spec |
| Chart placeholders | 2 gray boxes with "مخطط" centered |
| Recent table | 5 rows with status pills (green/amber/red) |
| Responsive: <900px | Sidebar disappears; hamburger button appears in topbar; clicking it shows sidebar |
| No console errors | Browser DevTools console shows no red errors |

- [ ] **Step 13.3: Commit working state**

```bash
git add .
git commit -m "feat: implement manar-ui-lab v1 — layout, theme, dashboard"
```

---

## Validation Summary

| Step | Command | Pass Condition |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | No output (zero errors) |
| Build | `npm run build` | Exits 0, dist/ created |
| Dev server | `npm run dev` | Loads at localhost:5173 |
| Visual RTL | Browser check | Sidebar on right, text right-aligned |
| Dark mode | Toggle in browser | Theme persists on refresh |
| Responsive | Resize to <900px | Sidebar collapses, hamburger appears |

---

## Self-Review Notes

**Spec coverage:**
- ✓ RTL-always: `dir="rtl"` in `index.html`; `inset-inline-start` in sidebar CSS
- ✓ Cairo font: Google Fonts link in `index.html`; `font-family: 'Cairo'` in `theme.css` body
- ✓ CSS token system: `theme.css` copied verbatim from manarERP
- ✓ Dark mode: `html[data-theme="dark"]` in `theme.css`; toggled in `Header.tsx`
- ✓ Theme restore: `main.tsx` reads localStorage before first render
- ✓ Tailwind v3: installed with `tailwindcss@3`; no color config; used for layout utils
- ✓ NavLink for real routes: `لوحة التحكم` → `to="/"`
- ✓ Button for placeholders: remaining 4 nav items use `<button type="button">`
- ✓ Mock data in `src/data/dashboard.ts`: typed interfaces + exported constants
- ✓ KPI cards, chart placeholders, recent table: all in `Dashboard.tsx`
- ✓ No state library, no auth, no backend, no Electron
- ✓ Sidebar collapses at 900px: handled by media query in `theme.css`
- ✓ Standalone location confirmed: `c:\Users\hhajj\Claude\Projects\manar-ui-lab`
- ✓ Zero manarERP files modified

**Type consistency across tasks:**
- `KPI`, `ChartArea`, `RecentRow` defined in Task 6 (`dashboard.ts`) — used in Task 10 (`Dashboard.tsx`)
- `SidebarProps.isOpen: boolean` defined in Task 7 — passed from Task 9 (`Layout.tsx`)
- `HeaderProps.onToggleSidebar: () => void` defined in Task 8 — called from Task 9
- `statusLabel` and `statusColor` keyed on `'active' | 'pending' | 'cancelled'` — matches `RecentRow.status` type
- `.nav-btn` class defined in `globals.css` (Task 4) — used in `Sidebar.tsx` (Task 7)
