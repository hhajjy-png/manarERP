# DateInput Calendar Picker (shadcn/react-day-picker) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `DateInput`'s internal picker (a hidden native `<input type="date">` triggered via `showPicker()`) with the official shadcn Calendar (built on `react-day-picker`), without changing `DateInput`'s public API, so all 34+ existing call sites need zero changes.

**Architecture:** Install the full official shadcn toolchain (Tailwind v4 with Preflight disabled, Radix Popover, lucide-react) scoped to a new component subtree. A new ERP-specific wrapper, `DateCalendarPicker.tsx`, composes the untouched vendor `ui/{calendar,popover,button}.tsx` files (ISO⇄Date conversion, year-range/min-max/weekend/today-button/reopen-month logic all live in the wrapper, not the vendor files). `DateInput.tsx` swaps only its calendar-icon-button + hidden-native-input block for this wrapper.

**Tech Stack:** React 18 + TypeScript (Vite, non-Next.js), `react-day-picker` v9, `date-fns`, Tailwind CSS v4, Radix UI (`@radix-ui/react-popover`, `@radix-ui/react-slot`), `lucide-react`, `class-variance-authority` + `clsx` + `tailwind-merge`, Vitest + Testing Library.

## Global Constraints

- No business logic, API, database, permission, or accounting-behavior change — this is a picker-mechanism swap only.
- `DateInputProps` (the public interface) must not change. No existing call site may need edits.
- Official shadcn component files (`frontend/src/components/ui/*.tsx`) are imported as-is and never edited directly; ERP-specific behavior goes through wrappers/composition/props (`formatters`, `modifiers`, `className` overrides), per the standing architectural rule in the design spec.
- No hardcoded z-index — reuse/extend the documented numeric hierarchy in `frontend/src/app/theme.css` (Drawer 400/401 < Dialog 410 < Modal 500 < toast 9999) via one new named CSS custom property.
- Tailwind's Preflight (global element reset) must be disabled — only the `theme` + `utilities` layers are imported.
- Default year-range fallback is **[1940, current year + 10]** (explicit years, not date arithmetic), overridden by the field's `min`/`max` when given.
- Popup width follows the field's width by default (Radix's `--radix-popover-trigger-width`), expanding only via a `min-width` floor.
- Reopening the picker always shows the current value's month (or today's month if empty) — never a stale previously-navigated month.
- All conversions between the ISO `'YYYY-MM-DD'` contract and JS `Date` must use local-component construction/getters (`new Date(y, m-1, d)`, `getFullYear()/getMonth()/getDate()`) — never `.toISOString()` / `new Date(isoString)` (UTC parsing can shift a day in Kuwait's UTC+3).
- Spec reference: `docs/superpowers/specs/2026-07-15-shadcn-calendar-datepicker-design.md`.

---

### Task 1: Tailwind v4 + shadcn scaffolding (button, popover, calendar), verified building

**Files:**
- Modify: `frontend/package.json` (new deps)
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.json`
- Modify: `frontend/src/app/theme.css` (append `--z-popover` token)
- Create: `frontend/components.json`
- Create: `frontend/src/app/tailwind.css`
- Create: `frontend/src/lib/utils.ts` (via shadcn CLI)
- Create: `frontend/src/components/ui/button.tsx`, `frontend/src/components/ui/popover.tsx`, `frontend/src/components/ui/calendar.tsx` (via shadcn CLI)
- Modify: `frontend/src/main.tsx` (import the new stylesheet)
- Modify: `frontend/src/__tests__/setup.ts` (Radix jsdom polyfills)
- Test: `frontend/src/__tests__/radixPopoverSmoke.test.tsx` (new, throwaway smoke test proving the toolchain actually works end-to-end under Vitest+jsdom)

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: `cn()` from `frontend/src/lib/utils.ts` (`cn(...inputs: ClassValue[]): string`); `Button`/`buttonVariants` from `frontend/src/components/ui/button.tsx`; `Popover`/`PopoverTrigger`/`PopoverContent` from `frontend/src/components/ui/popover.tsx`; `Calendar` from `frontend/src/components/ui/calendar.tsx` — all consumed by Task 3's `DateCalendarPicker.tsx`. The CSS custom property `--z-popover` (defined in `theme.css`) is consumed by Task 3.

- [ ] **Step 1: Install Tailwind v4 + Node types**

Run:
```bash
cd frontend && npm install tailwindcss @tailwindcss/vite && npm install -D @types/node
```
Expected: `frontend/package.json` gains `tailwindcss` and `@tailwindcss/vite` under `dependencies`, `@types/node` under `devDependencies`.

- [ ] **Step 2: Register the Tailwind Vite plugin and the `@` path alias**

Modify `frontend/vite.config.ts` — add the `path` import, the `tailwindcss` import, `tailwindcss()` to the plugins array, and a `resolve.alias`:

```typescript
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // مسارات نسبية ليعمل التطبيق من ملفات Electron المحلية (file://)
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Force ONLY the Cairo TTF used by the form PDF export to inline as a base64
    // data URI, so the standalone HTML handed to the hidden-window printToPDF
    // pipeline (window.manar.exportPdfFromHtml) is fully self-contained — no
    // file:// font resolution, works offline exactly like the backend report
    // engine's embedded @font-face. Every other asset keeps the default 4 KB
    // inline threshold (return undefined → Vite's normal size-based decision).
    assetsInlineLimit(filePath) {
      if (filePath.endsWith('Cairo-Regular.ttf')) return true;
      return undefined;
    },
    rollupOptions: {
      output: {
        // Split large, stable third-party libraries into dedicated cacheable
        // chunks so they are downloaded/parsed once and shared across the
        // lazy-loaded route chunks instead of being duplicated or bundled into
        // the initial load. App code updates no longer invalidate these.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router')) return 'vendor-react';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'vendor-charts';
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('mammoth')) return 'vendor-docx';
          if (id.includes('jszip')) return 'vendor-zip';
          if (id.includes('qrcode')) return 'vendor-qrcode';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
```

- [ ] **Step 3: Add the matching TypeScript path alias**

Modify `frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create the Tailwind entry stylesheet with Preflight disabled**

Create `frontend/src/app/tailwind.css`:

```css
/* Tailwind v4 — theme + utilities only. Preflight (the global element reset)
   is deliberately OMITTED: loading it over 295+ releases of hand-rolled CSS
   would reset margins/headings/buttons/inputs app-wide via bare-tag
   selectors and regress unrelated pages. Scoped to the shadcn component
   subtree (Calendar/Popover/Button) that actually needs Tailwind utilities.
   See docs/superpowers/specs/2026-07-15-shadcn-calendar-datepicker-design.md */
@layer theme, base, components, utilities;

@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
```

- [ ] **Step 5: Hand-author `components.json` (skips the interactive `shadcn init` wizard)**

Create `frontend/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/tailwind.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 6: Run the shadcn CLI to scaffold Button, Popover, and Calendar**

Run (requires network access to the shadcn registry):
```bash
cd frontend && npx shadcn@latest add button popover calendar
```
Expected: creates `frontend/src/lib/utils.ts`, `frontend/src/components/ui/button.tsx`, `frontend/src/components/ui/popover.tsx`, `frontend/src/components/ui/calendar.tsx`; adds `react-day-picker`, `date-fns`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-slot`, `@radix-ui/react-popover` to `frontend/package.json`; appends a `:root { --background: ...; ... }` (+ typically a `.dark { ... }` block) CSS-variable theme to `frontend/src/app/tailwind.css`.

If the CLI prompts interactively (it shouldn't, since `components.json` already exists), answer with the defaults matching the file above (style: New York, base color: Neutral, CSS variables: yes).

- [ ] **Step 7: Verify Preflight is still disabled after the CLI ran**

Run:
```bash
cd frontend && grep -n "tailwindcss/preflight\|^@import \"tailwindcss\";$" src/app/tailwind.css
```
Expected: **no output** (no full-bundle `@import "tailwindcss";` and no `preflight.css` import was reintroduced). If the CLI DID add either, edit `frontend/src/app/tailwind.css` to remove that line — the `@layer theme, base, components, utilities;` line plus the two granular imports from Step 4 must remain the only Tailwind import mechanism, with the CLI's appended `:root {...}`/`.dark {...}` variable block(s) kept below them.

- [ ] **Step 8: Align the generated dark-mode selector with the app's own dark-mode convention**

The app toggles dark mode via `:root[data-theme='dark']` (see `frontend/src/components/DateInput.css`), not shadcn's default `.dark` class. Open `frontend/src/app/tailwind.css` and find the block the CLI generated for dark mode (selector `.dark { ... }` or `.dark, :is(.dark *) { ... }`). Change its selector to also match the app's convention, e.g.:

```css
.dark,
:root[data-theme='dark'] {
  /* ...CLI-generated dark variable values, unchanged... */
}
```

(Exact CLI-generated variable names/values are not reproduced here since they come from the live shadcn registry at execution time — only the selector needs editing.)

- [ ] **Step 9: Add the `--z-popover` token, extending the existing documented z-index hierarchy**

Modify `frontend/src/app/theme.css` — extend the existing comment block right before `.modal-overlay` (around line 182-188):

```css
/* Modal */
/* z-index 500: the legacy Modal / ConfirmModal is used as a secondary/confirm
   surface on top of ExplorerKit Drawer (400) and Dialog (410) — e.g. the
   "unsaved changes" confirmation when cancelling an add/edit form. It must
   out-stack those overlays so its buttons stay clickable. Stays below toasts
   (9999) and the skip link (10000).
   z-index 550: DateCalendarPicker's Popover (shadcn Calendar) — must
   out-stack the legacy Modal (500) since DateInput renders inside
   Modal/Dialog/Drawer-hosted forms. Stays below toasts (9999). */
:root {
  --z-popover: 550;
}
.modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.45); display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; z-index: 500; overflow-y: auto; }
```

- [ ] **Step 10: Import the new stylesheet in the app entry point**

Modify `frontend/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import RootErrorBoundary from './components/RootErrorBoundary';
// Offline fonts — no CDN required
import './styles/fonts.css';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import 'material-symbols/outlined.css';
import './app/theme.css';
import './app/tailwind.css';
import './styles/stitch-full.css';
import './styles/financial.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary scope="root">
      <App />
    </RootErrorBoundary>
  </React.StrictMode>,
);
```

- [ ] **Step 11: Add Radix jsdom polyfills to the test setup**

Radix UI's Popper-based positioning (used by `Popover`) calls browser APIs jsdom doesn't implement. Modify `frontend/src/__tests__/setup.ts`:

```typescript
import '@testing-library/jest-dom';

// Radix UI (Popover/Popper positioning) calls browser APIs jsdom doesn't
// implement. Minimal polyfills so Radix components can render/interact in
// Vitest+jsdom component tests.
if (typeof window !== 'undefined') {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
```

- [ ] **Step 12: Write a throwaway smoke test proving the toolchain works end-to-end**

Create `frontend/src/__tests__/radixPopoverSmoke.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';

afterEach(cleanup);

describe('shadcn toolchain smoke test (Task 1 scaffolding)', () => {
  it('Popover opens on trigger click and renders the vendor Calendar inside', () => {
    render(
      <Popover>
        <PopoverTrigger>افتح</PopoverTrigger>
        <PopoverContent>
          <Calendar mode="single" />
        </PopoverContent>
      </Popover>,
    );
    // Queried against document.body, not the RTL `container` — Radix's
    // PopoverContent renders through a Portal into document.body, so it is
    // never a descendant of `container`. Queried structurally (table
    // presence), not by an assumed ARIA role/label — the exact role
    // react-day-picker's MonthGrid renders isn't pinned down by its docs, but
    // it is guaranteed to render as a <table> per its documented anatomy
    // (MonthGrid > Weeks (tbody) > Week (tr) > Day (td)).
    expect(document.body.querySelector('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('افتح'));
    expect(document.body.querySelector('table')).toBeInTheDocument();
  });
});
```

- [ ] **Step 13: Run the smoke test**

Run: `cd frontend && npx vitest run src/__tests__/radixPopoverSmoke.test.tsx`
Expected: `PASS` — 1 test passed. If it fails on a missing browser API, add the specific missing polyfill to `setup.ts` (Step 11) and re-run.

- [ ] **Step 14: Verify the whole frontend still type-checks and builds**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

Run: `cd frontend && npm run build`
Expected: `✓ built in ...` with no errors.

- [ ] **Step 15: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tsconfig.json frontend/components.json frontend/src/app/tailwind.css frontend/src/app/theme.css frontend/src/lib/utils.ts frontend/src/components/ui frontend/src/main.tsx frontend/src/__tests__/setup.ts frontend/src/__tests__/radixPopoverSmoke.test.tsx
git commit -m "feat(calendar): scaffold shadcn Calendar/Popover/Button toolchain (Tailwind v4, Preflight disabled)"
```

---

### Task 2: `lib/date.ts` — export Arabic month names, add Arabic weekday names

**Files:**
- Modify: `frontend/src/lib/date.ts`
- Test: `frontend/src/__tests__/date.test.ts` (extend if it exists, else create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `export const ARABIC_MONTHS: string[]` (12 entries, index 0 = January); `export const WEEKDAY_SHORT_AR: string[]` (7 entries, index 0 = Sunday, matching `Date.getDay()`) — both consumed by Task 3's `DateCalendarPicker.tsx` `formatters`.

- [ ] **Step 1: Check for an existing date.ts test file**

Run: `ls frontend/src/__tests__/date.test.ts 2>&1 || echo NOT_FOUND`

- [ ] **Step 2: Write the failing test**

If `NOT_FOUND`, create `frontend/src/__tests__/date.test.ts` with this content. If it exists, add this `describe` block to the existing file (keep all existing tests untouched):

```typescript
import { describe, it, expect } from 'vitest';
import { ARABIC_MONTHS, WEEKDAY_SHORT_AR } from '../lib/date';

describe('ARABIC_MONTHS (exported for the Calendar picker)', () => {
  it('has 12 entries, January first', () => {
    expect(ARABIC_MONTHS).toHaveLength(12);
    expect(ARABIC_MONTHS[0]).toBe('يناير');
    expect(ARABIC_MONTHS[11]).toBe('ديسمبر');
  });
});

describe('WEEKDAY_SHORT_AR', () => {
  it('has 7 entries indexed like Date.getDay() (0 = Sunday)', () => {
    expect(WEEKDAY_SHORT_AR).toHaveLength(7);
    expect(WEEKDAY_SHORT_AR[0]).toBe('أحد');
    expect(WEEKDAY_SHORT_AR[6]).toBe('سبت');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/date.test.ts`
Expected: FAIL — `ARABIC_MONTHS`/`WEEKDAY_SHORT_AR` are not exported yet.

- [ ] **Step 4: Export `ARABIC_MONTHS` and add `WEEKDAY_SHORT_AR`**

Modify `frontend/src/lib/date.ts` — change the top of the file from:

```typescript
const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
```

to:

```typescript
/** Index 0 = January. Exported so the Calendar picker's dropdown/caption
 *  formatters reuse the same Arabic month names as the rest of the app,
 *  instead of pulling in date-fns's Arabic locale strings. */
export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** Index 0 = Sunday, matching `Date.getDay()` — used by the Calendar
 *  picker's weekday-header formatter. */
export const WEEKDAY_SHORT_AR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
```

Every other line in the file is unchanged.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/date.test.ts`
Expected: `PASS` — both new tests green.

- [ ] **Step 6: Run the full existing test file(s) touching `lib/date.ts` to confirm no regression**

Run: `cd frontend && npx vitest run src/__tests__/date.test.ts && npx tsc --noEmit`
Expected: all pass, no type errors (adding `export` to an existing const cannot break any existing internal usage in the same file).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/date.ts frontend/src/__tests__/date.test.ts
git commit -m "feat(calendar): export Arabic month/weekday names for the Calendar picker's formatters"
```

---

### Task 3: `DateCalendarPicker.tsx` — the ERP-specific wrapper

**Files:**
- Create: `frontend/src/components/DateCalendarPicker.tsx`
- Create: `frontend/src/components/DateCalendarPicker.css`
- Test: `frontend/src/__tests__/DateCalendarPicker.test.tsx`

**Interfaces:**
- Consumes: `Calendar` from `frontend/src/components/ui/calendar.tsx`; `Popover`/`PopoverTrigger`/`PopoverContent` from `frontend/src/components/ui/popover.tsx`; `cn` from `frontend/src/lib/utils.ts`; `ARABIC_MONTHS`/`WEEKDAY_SHORT_AR` from `frontend/src/lib/date.ts`; `--z-popover` CSS custom property from `frontend/src/app/theme.css`.
- Produces: `export interface DateCalendarPickerProps { value: string; onChange: (value: string) => void; min?: string; max?: string; disabled?: boolean; }` and `export default function DateCalendarPicker(props: DateCalendarPickerProps): JSX.Element` — consumed by Task 4's `DateInput.tsx`.

- [ ] **Step 1: Write failing tests for the ISO⇄Date conversion helpers and basic open/select behavior**

Create `frontend/src/__tests__/DateCalendarPicker.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import DateCalendarPicker from '../components/DateCalendarPicker';

afterEach(cleanup);

function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: 'اختيار من التقويم' }));
}

// react-day-picker's exact ARIA roles for the month table aren't pinned down
// by its own docs, and a day button's accessible name defaults to a FULL
// formatted date (not the bare day number) per its `labelDayButton()` default.
// So day cells are found by their visible text (the day number), and "is the
// calendar open" is checked structurally (a <table> renders) — both
// guaranteed by react-day-picker's documented anatomy regardless of exact
// ARIA wording. Queried against `document.body`, not RTL's `container`:
// PopoverContent renders through a Portal into document.body (confirmed
// during Task 1), so it is never a descendant of `container`.
function dayButton(day: string): HTMLElement {
  const table = document.body.querySelector('table') as HTMLElement;
  const match = Array.from(table.querySelectorAll('button')).find((b) => b.textContent?.trim() === day);
  if (!match) throw new Error(`day button "${day}" not found`);
  return match;
}

describe('DateCalendarPicker', () => {
  it('renders a trigger button and no calendar table until opened', () => {
    render(<DateCalendarPicker value="" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'اختيار من التقويم' })).toBeInTheDocument();
    expect(document.body.querySelector('table')).not.toBeInTheDocument();
  });

  it('opens the calendar table on trigger click', () => {
    render(<DateCalendarPicker value="" onChange={() => {}} />);
    openPicker();
    expect(document.body.querySelector('table')).toBeInTheDocument();
  });

  it('selecting a day emits the correct ISO value and closes the popover', () => {
    const onChange = vi.fn();
    render(<DateCalendarPicker value="2026-07-01" onChange={onChange} />);
    openPicker();
    fireEvent.click(dayButton('15'));
    expect(onChange).toHaveBeenCalledWith('2026-07-15');
    expect(document.body.querySelector('table')).not.toBeInTheDocument();
  });

  it('disabled prop renders a disabled trigger button', () => {
    render(<DateCalendarPicker value="" onChange={() => {}} disabled />);
    expect(screen.getByRole('button', { name: 'اختيار من التقويم' })).toBeDisabled();
  });

  it('reopening shows the current value\'s month, not a previously-navigated month (rule 4)', () => {
    render(<DateCalendarPicker value="2026-03-10" onChange={() => {}} />);
    openPicker();
    // The month/year dropdowns render as native <select> elements inside the
    // popover, in that order (month first) per captionLayout="dropdown".
    const selects = () => Array.from(document.body.querySelectorAll('select')) as HTMLSelectElement[];
    expect(selects()).toHaveLength(2);
    const monthSelectBefore = selects()[0];
    expect(monthSelectBefore.value).toBe('2'); // March, 0-indexed
    fireEvent.change(monthSelectBefore, { target: { value: '10' } }); // navigate to November
    expect(selects()[0].value).toBe('10');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    // Reopen — must show March (the value's month) again, not the navigated-to November.
    openPicker();
    expect(selects()[0].value).toBe('2');
  });

  it('weekend (Friday/Saturday) columns carry the weekend modifier class', () => {
    render(<DateCalendarPicker value="2026-07-01" onChange={() => {}} />);
    openPicker();
    expect(document.body.querySelectorAll('.mnr-cal-weekend').length).toBeGreaterThan(0);
  });

  it('"Today" button jumps the visible month to today without changing the selected value', () => {
    const onChange = vi.fn();
    render(<DateCalendarPicker value="2020-01-01" onChange={onChange} />);
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'اليوم' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/DateCalendarPicker.test.tsx`
Expected: FAIL — `../components/DateCalendarPicker` does not exist yet.

- [ ] **Step 3: Write `DateCalendarPicker.tsx`**

Create `frontend/src/components/DateCalendarPicker.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import { ARABIC_MONTHS, WEEKDAY_SHORT_AR } from '../lib/date';
import './DateCalendarPicker.css';

export interface DateCalendarPickerProps {
  /** Canonical date-only value: 'YYYY-MM-DD' or '' (empty). */
  value: string;
  /** Emits the canonical 'YYYY-MM-DD' value on day selection. */
  onChange: (value: string) => void;
  /** Inclusive bounds, canonical 'YYYY-MM-DD'. */
  min?: string;
  max?: string;
  disabled?: boolean;
}

const FALLBACK_START_YEAR = 1940;

/**
 * 'YYYY-MM-DD' -> local Date. Never parses via `new Date(iso)` (UTC midnight
 * can shift a day in Kuwait's UTC+3) — see lib/date.ts's `toLocalDateOnly`.
 * Rejects calendar-invalid strings (e.g. '2026-02-30') instead of letting
 * JS Date silently roll them into the next month.
 */
function parseIsoLocal(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return undefined;
  return d;
}

/** Local Date -> 'YYYY-MM-DD'. Never `.toISOString()` — same day-shift risk. */
function formatIsoLocal(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function DateCalendarPicker({ value, onChange, min, max, disabled }: DateCalendarPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseIsoLocal(value) : undefined;
  const minDate = min ? parseIsoLocal(min) : undefined;
  const maxDate = max ? parseIsoLocal(max) : undefined;

  // Rule 1: explicit years, not date arithmetic — avoids "today + 10" ambiguity.
  const fallbackEndYear = new Date().getFullYear() + 10;
  const startMonth = minDate ?? new Date(FALLBACK_START_YEAR, 0, 1);
  const endMonth = maxDate ?? new Date(fallbackEndYear, 11, 31);

  const disabledMatcher = minDate || maxDate
    ? { ...(minDate ? { before: minDate } : {}), ...(maxDate ? { after: maxDate } : {}) }
    : undefined;

  const [month, setMonth] = useState<Date>(selected ?? new Date());

  // Rule 4: never reopen on a stale previously-navigated month — recompute
  // fresh from the current value (or today) every time the popover opens.
  useEffect(() => {
    if (open) setMonth(selected ?? new Date());
    // Only the open transition should trigger this, not every `value` edit
    // while already open (that would fight the user's in-progress navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mnr-dateinput__cal"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          title="اختيار من التقويم"
        >
          <span className="material-symbols-outlined">calendar_month</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="end"
        className={cn('mnr-cal-pop w-[var(--radix-popover-trigger-width)] min-w-[19rem] z-[var(--z-popover)] p-2')}
      >
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(formatIsoLocal(date));
              setOpen(false);
            }
          }}
          month={month}
          onMonthChange={setMonth}
          startMonth={startMonth}
          endMonth={endMonth}
          disabled={disabledMatcher}
          modifiers={{ weekend: { dayOfWeek: [5, 6] } }}
          modifiersClassNames={{ weekend: 'mnr-cal-weekend' }}
          formatters={{
            formatMonthDropdown: (date) => ARABIC_MONTHS[date.getMonth()],
            formatWeekdayName: (date) => WEEKDAY_SHORT_AR[date.getDay()],
          }}
        />
        <button type="button" className="mnr-cal-today" onClick={() => setMonth(new Date())}>
          اليوم
        </button>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Create the wrapper's own CSS (weekend muting + Today button)**

Create `frontend/src/components/DateCalendarPicker.css`:

```css
/* DateCalendarPicker — ERP-specific styling layered on top of the untouched
   shadcn Calendar/Popover (see the standing architectural rule: extend via
   composition/CSS, never edit components/ui/*.tsx directly). */

.mnr-cal-weekend {
  opacity: 0.55;
}

.mnr-cal-today {
  margin-top: 6px;
  width: 100%;
  padding: 6px 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--xpl-primary, #4f46e5);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.mnr-cal-today:hover {
  background: rgba(79, 70, 229, 0.08);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/DateCalendarPicker.test.tsx`
Expected: `PASS` — all 7 tests green. These tests query structurally (`<table>`/`<select>`/`<button>` presence and text content) rather than assumed ARIA roles or labels, so they should hold regardless of the exact accessible-name wording the vendor `Calendar` produces. If a query still doesn't match (e.g. the vendor renders more or fewer `<select>` elements than expected), inspect the DOM with `screen.debug()` and adjust the test's structural query to match reality — do not change the component to fit a wrong test assumption.

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/DateCalendarPicker.tsx frontend/src/components/DateCalendarPicker.css frontend/src/__tests__/DateCalendarPicker.test.tsx
git commit -m "feat(calendar): add DateCalendarPicker wrapper composing the shadcn Calendar"
```

---

### Task 4: Integrate into `DateInput.tsx`, replacing the native picker

**Files:**
- Modify: `frontend/src/components/DateInput.tsx`
- Modify: `frontend/src/__tests__/DateInput.test.tsx` (one test replaced, all others unchanged)

**Interfaces:**
- Consumes: `DateCalendarPicker` (default export) + `DateCalendarPickerProps` from Task 3.
- Produces: no change to `DateInputProps` — this task's whole point is zero interface change.

- [ ] **Step 1: Update the one test that asserted the old native-picker mechanism**

The existing test `'the calendar trigger opens the native picker (interaction preserved)'` in `frontend/src/__tests__/DateInput.test.tsx` spies on `showPicker` — that mechanism is being removed by design, so this test must be replaced (not "kept passing unchanged"). Replace it with:

```tsx
  it('the calendar trigger opens the shadcn Calendar popover', () => {
    render(<Host initial="2026-07-01" />);
    // Structural check (table presence) against document.body, not RTL's
    // `container` — Radix's PopoverContent renders through a Portal into
    // document.body (confirmed during Task 1), and not by an assumed ARIA
    // role — see the note in DateCalendarPicker.test.tsx on why.
    expect(document.body.querySelector('table')).not.toBeInTheDocument();
    fireEvent.click(wrapper().querySelector('.mnr-dateinput__cal') as HTMLElement);
    expect(document.body.querySelector('table')).toBeInTheDocument();
  });
```

(Replace only this one `it(...)` block, in place, inside the existing `describe('DateInput — calendar icon layout (overlap fix)', ...)` block. Every other test in the file stays untouched.)

- [ ] **Step 2: Run the full DateInput test file to verify the new test fails (component not updated yet) and all others still pass**

Run: `cd frontend && npx vitest run src/__tests__/DateInput.test.tsx`
Expected: the new "opens the shadcn Calendar popover" test FAILS (no `.mnr-dateinput__native`/`showPicker` behavior wired to a Radix Popover yet); every other test still PASSES.

- [ ] **Step 3: Replace `DateInput.tsx`'s picker mechanism**

Modify `frontend/src/components/DateInput.tsx` in full:

```tsx
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isoToDisplay, displayToIso, isWithinRange, sanitizeDateTyping } from '../lib/dateInput';
import DateCalendarPicker from './DateCalendarPicker';
import './DateInput.css';

// Local alias to keep the JSX readable.
const fmt = isoToDisplay;

export interface DateInputProps {
  /** Canonical date-only value: 'YYYY-MM-DD' or '' (empty). */
  value: string;
  /** Emits the canonical 'YYYY-MM-DD' value, or '' for empty/invalid. */
  onChange: (value: string) => void;
  id?: string;
  /** Applied to the visible text field so it inherits the surrounding design system
   *  (e.g. 'xpl-input'). The calendar affordance is layered on top. */
  className?: string;
  ariaLabel?: string;
  /** Native title tooltip; also used as the accessible name when no ariaLabel is given. */
  title?: string;
  /** Inline style forwarded to the visible text field (parity with the inputs being replaced). */
  style?: CSSProperties;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Inclusive bounds, canonical 'YYYY-MM-DD'. */
  min?: string;
  max?: string;
  autoFocus?: boolean;
  /** Visible hint; defaults to the DD/MM/YYYY mask. */
  placeholder?: string;
  /** Form-level error flag (adds the invalid styling on top of internal parse errors). */
  invalid?: boolean;
  onBlur?: () => void;
}

/**
 * Standardized date input for manarERP.
 *
 * Displays and accepts DD/MM/YYYY with Western digits, deterministically in
 * Electron/Chromium (a masked text field — NOT the OS-locale-formatted native
 * widget). The calendar icon opens `DateCalendarPicker` (the shadcn Calendar).
 * The value contract is date-only 'YYYY-MM-DD' in and out, converted by pure
 * string helpers, so a business date can never shift a day across timezones.
 */
export default function DateInput({
  value,
  onChange,
  id,
  className,
  ariaLabel,
  title,
  style,
  required,
  disabled,
  readOnly,
  min,
  max,
  autoFocus,
  placeholder = 'يوم/شهر/سنة',
  invalid,
  onBlur,
}: DateInputProps) {
  const [text, setText] = useState(() => fmt(value));
  const [parseError, setParseError] = useState(false);
  // Tracks the value we last emitted so an external change (rehydrate/reset) can be told
  // apart from our own echo — the former re-syncs the visible text, the latter must not.
  const valueRef = useRef(value);

  useEffect(() => {
    if (value !== valueRef.current) {
      valueRef.current = value;
      setText(fmt(value));
      setParseError(false);
    }
  }, [value]);

  function emit(iso: string) {
    valueRef.current = iso;
    onChange(iso);
  }

  function commit() {
    const raw = text.trim();
    if (raw === '') {
      setParseError(false);
      if (value !== '') emit('');
      return;
    }
    const iso = displayToIso(raw);
    if (iso && isWithinRange(iso, min, max)) {
      setParseError(false);
      setText(fmt(iso));
      emit(iso);
    } else {
      // Invalid or out-of-range — surface the error and do NOT save a bad date.
      setParseError(true);
      if (value !== '') emit('');
    }
  }

  const showError = invalid || parseError;

  return (
    // dir="ltr" pins the whole control to one inline axis so the calendar icon
    // and the input's reserved padding both resolve to the SAME physical side
    // (trailing the LTR date value) in both RTL and LTR forms — otherwise,
    // inside an RTL form, the icon lands on the left while the padding is
    // reserved on the right and the icon overlaps the leading digits.
    <div className={`mnr-dateinput${disabled ? ' is-disabled' : ''}`} dir="ltr">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        dir="ltr"
        className={className}
        style={style}
        title={title}
        aria-label={ariaLabel ?? title}
        aria-invalid={showError || undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(sanitizeDateTyping(e.target.value));
          if (parseError) setParseError(false);
        }}
        onBlur={() => { commit(); onBlur?.(); }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          const asDisplay = fmt(pasted); // handles a pasted ISO 'YYYY-MM-DD'
          if (asDisplay) {
            e.preventDefault();
            setText(asDisplay);
            setParseError(false);
            emit(displayToIso(asDisplay)!);
          }
          // Otherwise let onChange sanitize a pasted DD/MM/YYYY string.
        }}
      />
      {!readOnly && (
        <DateCalendarPicker value={value} onChange={emit} min={min} max={max} disabled={disabled} />
      )}
    </div>
  );
}
```

Changes from the previous version: removed `nativeRef`, the `PickerInput` type alias, `openPicker()`, and the hidden native `<input type="date">` JSX block; added the `DateCalendarPicker` import and its usage inside the existing `{!readOnly && (...)}` guard (preserving the exact prior "hidden entirely when read-only, otherwise present" behavior). `valueRef`'s `useRef` usage is untouched, so the `useRef` import stays. Every prop, every typing/paste/blur/commit code path, and the entire `DateInputProps` interface are unchanged.

- [ ] **Step 4: Run the full DateInput test file — everything must pass now**

Run: `cd frontend && npx vitest run src/__tests__/DateInput.test.tsx`
Expected: `PASS` — all tests green, including the replaced popover test.

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DateInput.tsx frontend/src/__tests__/DateInput.test.tsx
git commit -m "feat(calendar): swap DateInput's native picker for DateCalendarPicker (shadcn Calendar), zero API change"
```

---

### Task 5: Full-suite validation

**Files:** none (verification only).

**Interfaces:** none — this task consumes the completed feature from Tasks 1-4 and verifies no regression across the rest of the app.

- [ ] **Step 1: Run the entire frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: all tests pass (no failures introduced in any of the 34+ `DateInput`-consuming pages/forms — none of them have their own `DateInput`-specific tests beyond `DateInput.test.tsx` itself per the Task 1-era exploration, but this confirms nothing elsewhere broke incidentally, e.g. via a global CSS collision from Tailwind).

- [ ] **Step 2: Type-check the whole frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build the whole frontend**

Run: `cd frontend && npm run build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 4: Spot-check the z-index integration in a live DOM (Drawer/Modal context)**

Run: `cd frontend && npx vitest run src/__tests__/explorerKitDialogConfirmStacking.test.tsx`
Expected: still `PASS` (this task adds a new, separate `--z-popover: 550` value — it must not alter the existing `.modal-overlay` (500) vs `.xpl-dialog-overlay`/`.xpl-drawer-overlay` (410/400) relationship this test asserts).

- [ ] **Step 5: Final commit (if any working-tree changes remain from validation fixes)**

```bash
git status --short
```
If clean, no further commit needed — Tasks 1-4 already committed everything. If any fix was made during this task, commit it with a clear message describing exactly what regression it fixed.
