# Stability & UX Safety Pack — Phase 1: Error Boundaries

**Status:** Shipped · **Tag:** `stable-error-boundary-phase1-v1`
**Scope:** Frontend resilience only. No business logic, DB, API, auth, RBAC, or Electron changes.

## Goal

Prevent a synchronous render error in any page from white-screening the offline
Electron renderer. A crash now degrades gracefully into a professional, themed,
Arabic-first fallback with recovery actions.

## Components

### `frontend/src/components/RootErrorBoundary.tsx` (new)

Application-level class error boundary rendering an ExplorerKit fallback card.

| Feature | Detail |
| --- | --- |
| Retry | Soft-resets boundary state; re-renders children (recovers transient render errors). |
| العودة للرئيسية (Back to Home) | HashRouter-safe navigation via `window.location.hash = '#/'`, then reset. Works with or without router context. |
| نسخ التفاصيل الفنية (Copy details) | Copies a structured report (scope, time, message, stack, component stack) via `navigator.clipboard`; shows "تم النسخ" confirmation. Fails silently if clipboard is denied. |
| Developer details | Native `<details>` disclosure with message, stack, and component stack (LTR monospace). |
| Console logging | `componentDidCatch` → `console.error('[ErrorBoundary:<scope>] …', error, componentStack)`. |
| Dark / light | Styled with theme tokens (`--bg`, `--surface`, `--text`, `--text-muted`, `--border`, `--red`, `--surface-2`) in `RootErrorBoundary.css`. |
| Accessibility | `role="alert"`, `aria-live="assertive"`, focus moved to the region on crash, `aria-hidden` icons, labelled copy button. |
| Auto-recovery | When `resetKey` changes, the boundary resets automatically. |

**Props:** `scope?: 'root' | 'page'` (full-screen vs. content-area variant), `resetKey?: unknown`.

### `frontend/src/components/ErrorBoundary.tsx` (unchanged)

The pre-existing **scoped inline** boundary (`.bae-boundary`) used inside
`BankAccountExplorer` tab content. Left untouched — different concern, different
placement. Not to be confused with `RootErrorBoundary`.

## Placement

| Where | File | Purpose |
| --- | --- | --- |
| Root | `main.tsx` — wraps `<App/>` (`scope="root"`) | Catches catastrophic errors and crashes in standalone routes outside the layout (print, forms, login). |
| Page | `Layout.tsx` — wraps `<Outlet/>` (`scope="page"`, `resetKey={location.pathname}`) | Isolates crashes to the content area (sidebar/topbar preserved) and auto-recovers when the user navigates to another route. |

One page-level edit covers all authenticated routes; no per-route wrapping.

## Tests

`frontend/src/__tests__/RootErrorBoundary.test.tsx` — renders children, renders
fallback on throw, exposes the three actions, recovers via Retry, auto-recovers
on `resetKey` change, and copies the report to the clipboard.

## Validation

`npx tsc --noEmit` · `npm test` · `npm run build` — all frontend. Backend and
Electron were not touched, so their validation is not required for this pack.
