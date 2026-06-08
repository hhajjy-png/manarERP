# manar-ui-lab — Design Spec

**Date:** 2026-06-08  
**Status:** Approved  
**Location:** `c:\Users\hhajj\Claude\Projects\manar-ui-lab` (standalone, not inside manarERP)

---

## Purpose

A standalone React + TypeScript + Vite + Tailwind UI prototype laboratory for manarERP.
Design and test pages here, then copy them into the real project.

**No backend. No database. No authentication. No Electron. No state library.**

---

## Constraints

| Constraint | Value |
|---|---|
| Language direction | RTL-always (`dir="rtl"` on `<html>`) |
| Primary font | Cairo (Arabic) |
| UI language | Arabic |
| Color system | manarERP CSS custom properties (copied verbatim) |
| Dark mode | `html[data-theme="dark"]` — identical to manarERP |
| Tailwind version | v3 (not v4) |
| Routing | `react-router-dom` v6, BrowserRouter |
| Mock data | Static, in dedicated `src/data/` files |
| Complexity | Minimal — no Redux, Zustand, SaaS patterns, or enterprise abstractions |

---

## Project Structure

```
manar-ui-lab/
├── src/
│   ├── app/
│   │   ├── theme.css          # CSS custom property tokens — copied from manarERP
│   │   └── globals.css        # Tailwind @tailwind directives + body base reset
│   ├── components/
│   │   ├── Layout.tsx         # Sidebar + header shell, wraps all pages via <Outlet />
│   │   ├── Sidebar.tsx        # Collapsible nav with NavLink / button items
│   │   └── Header.tsx         # Top bar: page title, theme toggle, avatar placeholder
│   ├── data/
│   │   └── dashboard.ts       # Mock data for Dashboard (KPIs, chart labels, table rows)
│   ├── pages/
│   │   └── Dashboard.tsx      # First prototype page — imports from src/data/dashboard.ts
│   ├── App.tsx                # BrowserRouter, route definitions
│   └── main.tsx               # Entry — restore saved theme before first render
├── index.html                 # <html lang="ar" dir="rtl"> — RTL set at HTML level
├── tailwind.config.js         # content glob only, no color config, no darkMode config
├── tsconfig.json
├── vite.config.ts
└── package.json
```

---

## Design Token System

`src/app/theme.css` is copied verbatim from manarERP's `frontend/src/app/theme.css`.

The following CSS variables are defined on `:root` and overridden under `html[data-theme="dark"]`:

```
--primary, --primary-hover
--accent
--bg, --surface
--text, --text-muted
--border
--green, --red, --amber, --blue
--shadow
--radius
--transition
```

**Rule:** No color values in `tailwind.config.js`. Colors are referenced via Tailwind's arbitrary value syntax:

```tsx
className="bg-[var(--surface)] text-[var(--text)] border-[var(--border)]"
```

Tailwind is used for spacing (`p-4`, `gap-6`), layout (`flex`, `grid`, `grid-cols-4`), typography (`text-sm`, `font-semibold`), and responsive breakpoints (`md:hidden`, `lg:grid-cols-4`). Nothing else.

---

## Theme Toggle

`Header.tsx` provides a sun/moon button that toggles `document.documentElement.dataset.theme`:

```ts
const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
document.documentElement.dataset.theme = next;
localStorage.setItem('theme', next);
```

`main.tsx` restores the saved theme before the first React render:

```ts
const saved = localStorage.getItem('theme');
if (saved) document.documentElement.dataset.theme = saved;
```

This is identical to manarERP's theme mechanism.

---

## Layout Shell

```
┌─────────────────────────────────────────────────────┐
│                     Header                          │
├─────────────┬───────────────────────────────────────┤
│             │                                       │
│   Sidebar   │          <Outlet />                   │
│  (260px)    │       (page content area)             │
│             │                                       │
└─────────────┴───────────────────────────────────────┘
```

- **Sidebar**: 260px wide, `position: fixed`, `inset-inline-start: 0` (RTL-safe). Collapses at <900px viewport. Contains: app logo/title + nav items.
- **Header**: Full-width top bar, `padding-inline-start` offset matches sidebar width. Contains: current page title (RTL-right natural position), theme toggle button, avatar placeholder.
- **Content area**: `margin-inline-start: 260px`, vertically scrollable.
- Sidebar background: `var(--surface)`. Border: `var(--border)`.
- Sidebar collapse toggle: hamburger icon in Header.

### Sidebar Navigation

Nav items use `NavLink` from `react-router-dom` when a route exists. For placeholder items that don't have a route yet, use a `<button>` element — never `<a href="#">` to avoid scroll jumps.

Active link styling: `NavLink` receives `isActive` prop; active state uses `var(--primary)` background.

Initial nav items: لوحة التحكم, العملاء, المعدات, العقود, الموظفون.
Only لوحة التحكم has a real route (`/`) in v1 — the rest use `<button>` placeholders.

---

## Mock Data Pattern

All mock data lives in `src/data/`. Pages import from there — no inline mock arrays in component files.

**`src/data/dashboard.ts`** exports:

```ts
export const kpis: KPI[]          // { label, value, icon, color }
export const chartAreas: ChartArea[]  // { title } — placeholder labels only
export const recentRows: RecentRow[]  // { id, client, amount, status, date }
```

This separation ensures that when a page is migrated to manarERP, the data layer is replaced with API calls in one place without touching the component.

---

## Dashboard Page

`src/pages/Dashboard.tsx` renders three sections:

1. **KPI row** — 4 cards in a responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`). Each card: icon, label, value. Mock data from `kpis`.
2. **Chart row** — 2 side-by-side placeholder boxes (`grid-cols-1 lg:grid-cols-2`). Each box: title, centered "مخطط" label in muted text. Background `var(--surface)`.
3. **Recent activity table** — 5 mock rows. Columns: الرقم, العميل, المبلغ, الحالة, التاريخ. Responsive: horizontal scroll on narrow viewports.

---

## Dev Setup

**`index.html`**:
- `<html lang="ar" dir="rtl">` — RTL set statically, no JS needed at startup.
- Google Fonts link for Cairo (weights 400, 500, 600, 700).

**`tailwind.config.js`**:
```js
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

**`vite.config.ts`**: `@vitejs/plugin-react` only, no extras.

**`globals.css`**:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

*, *::before, *::after { box-sizing: border-box; }
body {
  font-family: 'Cairo', sans-serif;
  background-color: var(--bg);
  color: var(--text);
  min-height: 100vh;
}
```

**`main.tsx`** imports CSS files separately (Vite-idiomatic — avoids `@import` ordering issues with PostCSS):
```ts
import './app/theme.css';
import './app/globals.css';
```

---

## Dependencies

**Runtime**: `react`, `react-dom`, `react-router-dom`  
**Dev**: `typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`

No other dependencies. No chart library in v1 — charts are placeholder divs.

---

## What This Is Not

- Not a production app
- Not a component library
- Not shared with manarERP's repository or git history
- Not a replacement for manarERP's frontend

It is a fast visual scratchpad. Pages built here are manually ported to manarERP when ready.
