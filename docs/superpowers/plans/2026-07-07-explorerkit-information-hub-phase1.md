# ExplorerKit Information Hub — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable "Information Hub" drawer primitives to ExplorerKit and realize them on three reference entities (Customer, Equipment, Invoice), using only existing data and handlers.

**Architecture:** Six additive presentation-only primitives go into `ExplorerKit.tsx` + `explorer-kit.css` (existing `--xpl-*` tokens). Per-entity `CustomerHub`/`EquipmentHub` components (the `EmployeeFinancialTab` pattern) lazy-load related/activity data and compose the primitives; a tiny `ResourcePage` registry renders a hub when one exists, else falls back to today's flat section. The Invoice drawer in `Invoices.tsx` is recomposed onto the same primitives with its existing handlers untouched.

**Tech Stack:** React 18 + TypeScript + Vite, Vitest + @testing-library/react + jsdom (`npm test` → `vitest run`), react-router-dom HashRouter, axios `api` client.

**Spec:** `docs/superpowers/specs/2026-07-07-explorerkit-information-hub-phase1-design.md`

## Global Constraints

- **Presentation/UX only.** NO backend, database, API, business-logic, routing-behavior, permission, validation, calculation, or workflow changes. No new endpoints. No new API routes.
- **Only show data/actions backed by existing endpoints/handlers.** Do NOT invent data or add fake placeholders to match the reference screenshots. If a section has no real available data, **hide the section entirely**.
- No customer pre-select deep-links. Customer create actions navigate **un-seeded** to the existing route.
- Additive & backward-compatible: existing ExplorerKit exports (`Drawer`, `DrawerSection`, `DrawerField`, `MetricCard`, `Button`, `StatusChip`, `SkeletonRows`, `ErrorBanner`, …) and all non-hub ResourcePage modules stay unchanged. New primitives are opt-in.
- Offline-first; preserve responsive behavior, keyboard nav, focus states, color contrast. New CSS uses existing `--xpl-*` tokens only — no new color identity — and honors `prefers-reduced-motion`.
- Reuse existing helpers: `money()` (`config/modules.tsx`), `formatDate`/`formatDateTime`/`dateText` (`lib/date.ts`).
- Validate before done: `cd frontend && npx tsc --noEmit` and `cd frontend && npm test`. Do NOT commit/merge/push without explicit user approval.
- 2 pre-existing `printWorkspace.test.tsx` failures are unrelated and out of scope.

---

## File Structure

- **Modify** `frontend/src/components/explorer/ExplorerKit.tsx` — add 6 primitives + their exported interfaces (append after `DrawerField`, before the `// ─── Dialog` block).
- **Modify** `frontend/src/components/explorer/explorer-kit.css` — append the hub-primitive style block.
- **Create** `frontend/src/__tests__/explorerHubPrimitives.test.tsx` — RTL tests for the 6 primitives.
- **Create** `frontend/src/components/explorer/hubs/CustomerHub.tsx` — customer Information Hub body.
- **Create** `frontend/src/components/explorer/hubs/EquipmentHub.tsx` — equipment Information Hub body.
- **Create** `frontend/src/components/explorer/hubs/hubTypes.ts` — shared `EntityHubProps` type + a tiny helper.
- **Create** `frontend/src/__tests__/explorerHubs.test.tsx` — smoke tests for the two hubs.
- **Modify** `frontend/src/pages/ResourcePage.tsx` — hub registry + conditional drawer body/footer (fallback unchanged).
- **Modify** `frontend/src/pages/Invoices.tsx` — recompose the detail drawer onto the primitives (handlers/data untouched).

Note on `Tone`: ExplorerKit.tsx already uses a tone string-union for `StatusChip`/`MetricCard` (`'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo'`). The new primitives live in the same file — reuse that existing type. If it is not already a named `type Tone`, add `export type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';` near the top and use it for both old and new (non-breaking).

---

## Task 1: Static drawer primitives (HeaderCard, QuickActions, InfoGrid)

**Files:**
- Modify: `frontend/src/components/explorer/ExplorerKit.tsx` (append after `DrawerField`, ~line 444)
- Modify: `frontend/src/components/explorer/explorer-kit.css` (append at end)
- Test: `frontend/src/__tests__/explorerHubPrimitives.test.tsx` (create; this task adds the first 3 describe blocks)

**Interfaces:**
- Consumes: existing `Icon` (internal), `StatusChip`, `DrawerSection`, `DrawerField`, and the `Tone` union — all in ExplorerKit.tsx.
- Produces:
  - `export interface DrawerKpi { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }`
  - `export function DrawerHeaderCard(props: { icon: string; title: ReactNode; subtitle?: ReactNode; status?: { tone?: Tone; icon?: string; label: string }; kpis?: DrawerKpi[] }): JSX.Element`
  - `export interface QuickAction { key: string; icon: string; label: string; onClick: () => void; tone?: 'default' | 'primary' | 'danger'; disabled?: boolean }`
  - `export function DrawerQuickActions(props: { actions: QuickAction[] }): JSX.Element | null`
  - `export interface InfoItem { label: string; value: ReactNode; mono?: boolean }`
  - `export function DrawerInfoGrid(props: { title?: string; items: InfoItem[] }): JSX.Element | null`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/explorerHubPrimitives.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  DrawerHeaderCard,
  DrawerQuickActions,
  DrawerInfoGrid,
} from '../components/explorer/ExplorerKit';

describe('DrawerHeaderCard', () => {
  it('renders title, status and KPI tiles', () => {
    render(
      <DrawerHeaderCard
        icon="person"
        title="عميل تجريبي"
        status={{ tone: 'green', label: 'نشط' }}
        kpis={[
          { label: 'الرصيد الحالي', value: 'KWD 100.000' },
          { label: 'عدد الفواتير', value: 8 },
        ]}
      />,
    );
    expect(screen.getByText('عميل تجريبي')).toBeInTheDocument();
    expect(screen.getByText('نشط')).toBeInTheDocument();
    expect(screen.getByText('الرصيد الحالي')).toBeInTheDocument();
    expect(screen.getByText('KWD 100.000')).toBeInTheDocument();
    expect(screen.getByText('عدد الفواتير')).toBeInTheDocument();
  });

  it('omits the status chip when no status is given', () => {
    const { container } = render(<DrawerHeaderCard icon="person" title="بدون حالة" />);
    expect(container.querySelector('.xpl-chip')).toBeNull();
    expect(container.querySelector('.xpl-drawer-kpis')).toBeNull();
  });
});

describe('DrawerQuickActions', () => {
  it('renders nothing when the action list is empty', () => {
    const { container } = render(<DrawerQuickActions actions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders actions and fires onClick', () => {
    const onClick = vi.fn();
    render(
      <DrawerQuickActions
        actions={[{ key: 'edit', icon: 'edit', label: 'تعديل', onClick }]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'تعديل' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('honors disabled', () => {
    render(
      <DrawerQuickActions
        actions={[{ key: 'x', icon: 'delete', label: 'حذف', onClick: () => {}, disabled: true }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'حذف' })).toBeDisabled();
  });
});

describe('DrawerInfoGrid', () => {
  it('drops empty items and renders the rest', () => {
    render(
      <DrawerInfoGrid
        title="معلومات"
        items={[
          { label: 'الكود', value: 'C-1' },
          { label: 'الهاتف', value: '' },
          { label: 'النوع', value: null },
          { label: 'المدينة', value: '—' },
        ]}
      />,
    );
    expect(screen.getByText('الكود')).toBeInTheDocument();
    expect(screen.getByText('C-1')).toBeInTheDocument();
    expect(screen.queryByText('الهاتف')).toBeNull();
    expect(screen.queryByText('النوع')).toBeNull();
    expect(screen.queryByText('المدينة')).toBeNull();
  });

  it('renders nothing when every item is empty', () => {
    const { container } = render(
      <DrawerInfoGrid items={[{ label: 'أ', value: '' }, { label: 'ب', value: null }]} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/explorerHubPrimitives.test.tsx`
Expected: FAIL — `DrawerHeaderCard`/`DrawerQuickActions`/`DrawerInfoGrid` are not exported.

- [ ] **Step 3: Add the three primitives to ExplorerKit.tsx**

In `frontend/src/components/explorer/ExplorerKit.tsx`, immediately after the `DrawerField` function (ends ~line 444) and before the `// ─── Dialog` comment, insert:

```tsx
// ─── Information Hub drawer primitives (presentation-only, additive) ──────────

export interface DrawerKpi { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; }

export function DrawerHeaderCard({
  icon, title, subtitle, status, kpis,
}: {
  icon: string;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: { tone?: Tone; icon?: string; label: string };
  kpis?: DrawerKpi[];
}) {
  return (
    <div className="xpl-drawer-headcard">
      <div className="xpl-drawer-headcard-top">
        <div className="xpl-drawer-headcard-icon"><Icon name={icon} /></div>
        <div className="xpl-drawer-headcard-id">
          <span className="xpl-drawer-headcard-title">{title}</span>
          {subtitle != null && <span className="xpl-drawer-headcard-sub">{subtitle}</span>}
        </div>
        {status && <StatusChip tone={status.tone} icon={status.icon}>{status.label}</StatusChip>}
      </div>
      {kpis && kpis.length > 0 && (
        <div className="xpl-drawer-kpis">
          {kpis.map((k, i) => (
            <div className={`xpl-drawer-kpi${k.tone ? ` xpl-drawer-kpi--${k.tone}` : ''}`} key={i}>
              <span className="xpl-drawer-kpi-label">{k.label}</span>
              <span className="xpl-drawer-kpi-value">{k.value}</span>
              {k.sub != null && <span className="xpl-drawer-kpi-sub">{k.sub}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface QuickAction {
  key: string;
  icon: string;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
}

export function DrawerQuickActions({ actions }: { actions: QuickAction[] }) {
  if (!actions.length) return null;
  return (
    <div className="xpl-quick-actions">
      {actions.map((a) => (
        <button
          type="button"
          key={a.key}
          className={`xpl-quick-action${a.tone && a.tone !== 'default' ? ` xpl-quick-action--${a.tone}` : ''}`}
          onClick={a.onClick}
          disabled={a.disabled}
          aria-label={a.label}
        >
          <span className="xpl-quick-action-icon"><Icon name={a.icon} /></span>
          <span className="xpl-quick-action-label">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

export interface InfoItem { label: string; value: ReactNode; mono?: boolean; }

function infoValueIsEmpty(v: ReactNode): boolean {
  return v == null || v === '' || v === '—';
}

export function DrawerInfoGrid({ title, items }: { title?: string; items: InfoItem[] }) {
  const shown = items.filter((it) => !infoValueIsEmpty(it.value));
  if (!shown.length) return null;
  return (
    <DrawerSection title={title}>
      <div className="xpl-info-grid">
        {shown.map((it, i) => (
          <DrawerField key={i} label={it.label} value={it.value} mono={it.mono} />
        ))}
      </div>
    </DrawerSection>
  );
}
```

If `Tone` is not already a named type in this file, also add near the top (after imports): `export type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';` and ensure `StatusChip`/`MetricCard`/`MetricChip` tone props reference it (non-breaking — same literals).

- [ ] **Step 4: Append CSS for the three primitives**

Append to the end of `frontend/src/components/explorer/explorer-kit.css`:

```css
/* ── Information Hub drawer primitives ────────────────────────────── */
.xpl-drawer-headcard {
  background: var(--xpl-surface);
  border: 1px solid var(--xpl-border);
  border-radius: 14px;
  padding: 14px;
  box-shadow: var(--xpl-shadow-sm);
  margin-bottom: 12px;
}
.xpl-drawer-headcard-top { display: flex; align-items: center; gap: 12px; }
.xpl-drawer-headcard-icon {
  width: 44px; height: 44px; flex: 0 0 44px;
  display: grid; place-items: center;
  border-radius: 12px;
  background: var(--xpl-faint); color: var(--xpl-primary);
}
.xpl-drawer-headcard-icon .material-symbols-outlined { font-size: 24px; }
.xpl-drawer-headcard-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.xpl-drawer-headcard-title { font-weight: 700; font-size: 15px; color: var(--xpl-text); }
.xpl-drawer-headcard-sub { font-size: 12.5px; color: var(--xpl-muted); }
.xpl-drawer-kpis {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 8px; margin-top: 12px;
}
.xpl-drawer-kpi {
  background: var(--xpl-surface-2); border: 1px solid var(--xpl-border);
  border-radius: 10px; padding: 8px 10px;
  display: flex; flex-direction: column; gap: 2px;
}
.xpl-drawer-kpi-label { font-size: 11px; color: var(--xpl-muted); }
.xpl-drawer-kpi-value { font-size: 14px; font-weight: 700; color: var(--xpl-text); }
.xpl-drawer-kpi-sub { font-size: 11px; color: var(--xpl-muted); }
.xpl-drawer-kpi--green .xpl-drawer-kpi-value { color: var(--xpl-green); }
.xpl-drawer-kpi--red .xpl-drawer-kpi-value { color: var(--xpl-red); }
.xpl-drawer-kpi--orange .xpl-drawer-kpi-value { color: var(--xpl-orange); }
.xpl-drawer-kpi--blue .xpl-drawer-kpi-value { color: var(--xpl-blue); }

.xpl-quick-actions {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
  gap: 8px; margin-bottom: 12px;
}
.xpl-quick-action {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 6px; border-radius: 12px;
  background: var(--xpl-surface); border: 1px solid var(--xpl-border);
  color: var(--xpl-text); cursor: pointer; font: inherit;
  transition: background .15s, border-color .15s, transform .05s;
}
.xpl-quick-action:hover { background: var(--xpl-faint); border-color: var(--xpl-primary); }
.xpl-quick-action:active { transform: translateY(1px); }
.xpl-quick-action:disabled { opacity: .5; cursor: not-allowed; }
.xpl-quick-action:focus-visible { outline: 2px solid var(--xpl-primary); outline-offset: 2px; }
.xpl-quick-action-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 9px; background: var(--xpl-faint); color: var(--xpl-primary); }
.xpl-quick-action-icon .material-symbols-outlined { font-size: 20px; }
.xpl-quick-action-label { font-size: 11.5px; text-align: center; line-height: 1.2; }
.xpl-quick-action--primary .xpl-quick-action-icon { background: var(--xpl-primary); color: #fff; }
.xpl-quick-action--danger .xpl-quick-action-icon { background: color-mix(in srgb, var(--xpl-red) 14%, transparent); color: var(--xpl-red); }

.xpl-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; }
@media (max-width: 520px) { .xpl-info-grid { grid-template-columns: 1fr; } }
```

If `color-mix` is a concern for the target Chromium (Electron 31 / modern Chromium supports it), it is safe here; otherwise fall back to a static tint. Electron 31 supports `color-mix`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/explorerHubPrimitives.test.tsx`
Expected: PASS (the 3 describe blocks added in this task).

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/explorer/ExplorerKit.tsx frontend/src/components/explorer/explorer-kit.css frontend/src/__tests__/explorerHubPrimitives.test.tsx
git commit -m "feat(explorer): add static Information Hub drawer primitives"
```

---

## Task 2: Dynamic drawer primitives (Related, Activity, ActionBar)

**Files:**
- Modify: `frontend/src/components/explorer/ExplorerKit.tsx` (append after `DrawerInfoGrid`)
- Modify: `frontend/src/components/explorer/explorer-kit.css` (append)
- Test: `frontend/src/__tests__/explorerHubPrimitives.test.tsx` (add 3 more describe blocks)

**Interfaces:**
- Consumes: `Icon`, `DrawerSection`, `SkeletonRows`, `ErrorBanner`, `Button`, `Tone`.
- Produces:
  - `export interface RelatedItem { key: string; icon?: string; primary: ReactNode; secondary?: ReactNode; trailing?: ReactNode; tone?: Tone; onClick?: () => void }`
  - `export function DrawerRelated(props: { title: string; loading?: boolean; error?: string; items?: RelatedItem[]; onSeeAll?: () => void }): JSX.Element | null`
  - `export interface ActivityItem { key: string; icon?: string; tone?: Tone; title: ReactNode; meta?: ReactNode; timestamp?: string }`
  - `export function DrawerActivity(props: { title?: string; loading?: boolean; items?: ActivityItem[] }): JSX.Element | null`
  - `export interface ActionBtn { key: string; label: string; icon?: string; onClick: () => void; busy?: boolean; disabled?: boolean }`
  - `export function DrawerActionBar(props: { primary?: ActionBtn; secondary?: ActionBtn[]; danger?: ActionBtn[] }): JSX.Element`

- [ ] **Step 1: Add the failing tests**

Append to `frontend/src/__tests__/explorerHubPrimitives.test.tsx` (add these imports to the existing import line and these describe blocks):

```tsx
// add to the ExplorerKit import: DrawerRelated, DrawerActivity, DrawerActionBar

describe('DrawerRelated', () => {
  it('renders nothing when not loading and items are empty', () => {
    const { container } = render(<DrawerRelated title="فواتير" items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a skeleton while loading', () => {
    const { container } = render(<DrawerRelated title="فواتير" loading />);
    expect(container.querySelector('.xpl-skeleton-row')).not.toBeNull();
  });

  it('renders rows and fires onClick', () => {
    const onClick = vi.fn();
    render(
      <DrawerRelated
        title="فواتير"
        items={[{ key: '1', primary: 'INV-1', secondary: '2026-07-07', trailing: 'KWD 5.000', onClick }]}
      />,
    );
    expect(screen.getByText('INV-1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('INV-1'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('DrawerActivity', () => {
  it('renders nothing when empty', () => {
    const { container } = render(<DrawerActivity items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders timeline items in order', () => {
    render(
      <DrawerActivity
        items={[
          { key: 'a', title: 'أُنشئت', timestamp: '2026-07-01' },
          { key: 'b', title: 'دفعة', timestamp: '2026-07-05' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('أُنشئت');
    expect(items[1]).toHaveTextContent('دفعة');
  });
});

describe('DrawerActionBar', () => {
  it('renders primary, secondary and danger in order', () => {
    render(
      <DrawerActionBar
        primary={{ key: 'edit', label: 'تعديل', onClick: () => {} }}
        secondary={[{ key: 'print', label: 'طباعة', onClick: () => {} }]}
        danger={[{ key: 'del', label: 'حذف', onClick: () => {} }]}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('تعديل');
    expect(buttons[1]).toHaveTextContent('طباعة');
    expect(buttons[2]).toHaveTextContent('حذف');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/explorerHubPrimitives.test.tsx`
Expected: FAIL — the 3 new components are undefined imports.

- [ ] **Step 3: Add the three primitives to ExplorerKit.tsx**

Immediately after `DrawerInfoGrid`, insert:

```tsx
export interface RelatedItem {
  key: string;
  icon?: string;
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
}

export function DrawerRelated({
  title, loading, error, items, onSeeAll,
}: {
  title: string;
  loading?: boolean;
  error?: string;
  items?: RelatedItem[];
  onSeeAll?: () => void;
}) {
  if (!loading && !error && (!items || items.length === 0)) return null; // hide when empty
  return (
    <DrawerSection title={title}>
      {error ? (
        <ErrorBanner>{error}</ErrorBanner>
      ) : loading ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="xpl-related">
          {items!.map((it) =>
            it.onClick ? (
              <button type="button" key={it.key} className="xpl-related-row xpl-related-row--click" onClick={it.onClick}>
                {it.icon && <span className={`xpl-related-icon${it.tone ? ` xpl-dot--${it.tone}` : ''}`}><Icon name={it.icon} /></span>}
                <span className="xpl-related-text">
                  <span className="xpl-related-primary">{it.primary}</span>
                  {it.secondary != null && <span className="xpl-related-secondary">{it.secondary}</span>}
                </span>
                {it.trailing != null && <span className="xpl-related-trailing">{it.trailing}</span>}
              </button>
            ) : (
              <div key={it.key} className="xpl-related-row">
                {it.icon && <span className={`xpl-related-icon${it.tone ? ` xpl-dot--${it.tone}` : ''}`}><Icon name={it.icon} /></span>}
                <span className="xpl-related-text">
                  <span className="xpl-related-primary">{it.primary}</span>
                  {it.secondary != null && <span className="xpl-related-secondary">{it.secondary}</span>}
                </span>
                {it.trailing != null && <span className="xpl-related-trailing">{it.trailing}</span>}
              </div>
            ),
          )}
          {onSeeAll && <button type="button" className="xpl-related-seeall" onClick={onSeeAll}>عرض الكل</button>}
        </div>
      )}
    </DrawerSection>
  );
}

export interface ActivityItem {
  key: string;
  icon?: string;
  tone?: Tone;
  title: ReactNode;
  meta?: ReactNode;
  timestamp?: string;
}

export function DrawerActivity({
  title = 'آخر النشاط', loading, items,
}: {
  title?: string;
  loading?: boolean;
  items?: ActivityItem[];
}) {
  if (!loading && (!items || items.length === 0)) return null;
  return (
    <DrawerSection title={title}>
      {loading ? (
        <SkeletonRows rows={3} />
      ) : (
        <ul className="xpl-timeline">
          {items!.map((it) => (
            <li className="xpl-timeline-item" key={it.key}>
              <span className={`xpl-timeline-dot${it.tone ? ` xpl-dot--${it.tone}` : ''}`}>
                {it.icon && <Icon name={it.icon} />}
              </span>
              <div className="xpl-timeline-body">
                <span className="xpl-timeline-title">{it.title}</span>
                {it.meta != null && <span className="xpl-timeline-meta">{it.meta}</span>}
              </div>
              {it.timestamp && <span className="xpl-timeline-time">{it.timestamp}</span>}
            </li>
          ))}
        </ul>
      )}
    </DrawerSection>
  );
}

export interface ActionBtn {
  key: string;
  label: string;
  icon?: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}

export function DrawerActionBar({
  primary, secondary, danger,
}: {
  primary?: ActionBtn;
  secondary?: ActionBtn[];
  danger?: ActionBtn[];
}) {
  return (
    <div className="xpl-actionbar">
      <div className="xpl-actionbar-main">
        {primary && (
          <Button variant="primary" icon={primary.icon} busy={primary.busy} disabled={primary.disabled} onClick={primary.onClick}>
            {primary.label}
          </Button>
        )}
        {secondary?.map((b) => (
          <Button key={b.key} variant="secondary" icon={b.icon} busy={b.busy} disabled={b.disabled} onClick={b.onClick}>
            {b.label}
          </Button>
        ))}
      </div>
      {danger && danger.length > 0 && (
        <div className="xpl-actionbar-danger">
          {danger.map((b) => (
            <Button key={b.key} variant="danger" icon={b.icon} busy={b.busy} disabled={b.disabled} onClick={b.onClick}>
              {b.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Append CSS for the three primitives**

Append to `frontend/src/components/explorer/explorer-kit.css`:

```css
.xpl-related { display: flex; flex-direction: column; gap: 6px; }
.xpl-related-row {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 10px; border-radius: 10px;
  background: var(--xpl-surface-2); border: 1px solid var(--xpl-border);
  font: inherit; color: var(--xpl-text); text-align: start;
}
.xpl-related-row--click { cursor: pointer; }
.xpl-related-row--click:hover { background: var(--xpl-faint); border-color: var(--xpl-primary); }
.xpl-related-row--click:focus-visible { outline: 2px solid var(--xpl-primary); outline-offset: 2px; }
.xpl-related-icon { width: 30px; height: 30px; flex: 0 0 30px; display: grid; place-items: center; border-radius: 8px; background: var(--xpl-faint); color: var(--xpl-primary); }
.xpl-related-icon .material-symbols-outlined { font-size: 18px; }
.xpl-related-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.xpl-related-primary { font-size: 13px; font-weight: 600; color: var(--xpl-text); }
.xpl-related-secondary { font-size: 11.5px; color: var(--xpl-muted); }
.xpl-related-trailing { font-size: 12.5px; font-weight: 600; color: var(--xpl-text); white-space: nowrap; }
.xpl-related-seeall { align-self: flex-start; background: none; border: none; color: var(--xpl-primary); font: inherit; font-size: 12.5px; cursor: pointer; padding: 4px 2px; }

.xpl-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.xpl-timeline-item { display: flex; align-items: flex-start; gap: 10px; padding: 4px 0; position: relative; }
.xpl-timeline-dot {
  width: 24px; height: 24px; flex: 0 0 24px; display: grid; place-items: center;
  border-radius: 999px; background: var(--xpl-faint); color: var(--xpl-primary);
  z-index: 1;
}
.xpl-timeline-dot .material-symbols-outlined { font-size: 15px; }
.xpl-timeline-item:not(:last-child) .xpl-timeline-dot::after {
  content: ''; position: absolute; top: 24px; inset-inline-start: 11px;
  width: 2px; height: calc(100% - 20px); background: var(--xpl-border);
}
.xpl-timeline-body { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; padding-top: 2px; }
.xpl-timeline-title { font-size: 13px; color: var(--xpl-text); }
.xpl-timeline-meta { font-size: 11.5px; color: var(--xpl-muted); }
.xpl-timeline-time { font-size: 11px; color: var(--xpl-muted); white-space: nowrap; padding-top: 3px; }

.xpl-actionbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; flex-wrap: wrap; }
.xpl-actionbar-main { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.xpl-actionbar-danger { display: flex; align-items: center; gap: 8px; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/explorerHubPrimitives.test.tsx`
Expected: PASS (all 6 describe blocks).

- [ ] **Step 6: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/explorer/ExplorerKit.tsx frontend/src/components/explorer/explorer-kit.css frontend/src/__tests__/explorerHubPrimitives.test.tsx
git commit -m "feat(explorer): add dynamic Information Hub drawer primitives"
```

---

## Task 3: CustomerHub + ResourcePage registry (with fallback)

**Files:**
- Create: `frontend/src/components/explorer/hubs/hubTypes.ts`
- Create: `frontend/src/components/explorer/hubs/CustomerHub.tsx`
- Modify: `frontend/src/pages/ResourcePage.tsx` (drawer body/footer at ~504–545; import + registry)
- Test: `frontend/src/__tests__/explorerHubs.test.tsx` (create; CustomerHub smoke tests)

**Interfaces:**
- Consumes: primitives from Tasks 1–2; `api` from `../../api/client`; `useNavigate`; `money` + `ModuleConfig` from `../../config/modules`; `formatDate` from `../../lib/date`.
- Produces:
  - `hubTypes.ts`: `export interface EntityHubProps { entity: Record<string, any>; cfg: ModuleConfig; onEdit: () => void; onDelete: () => void; canUpdate: boolean; canDelete: boolean; busy: boolean; }` and `export type HubComponent = (props: EntityHubProps) => JSX.Element;` plus `export function buildInfoItems(cfg: ModuleConfig, entity: Record<string, any>, t: (k: string) => string): InfoItem[]` (reuses column renderers where present, falls back to raw field values).
  - `CustomerHub.tsx`: `export default function CustomerHub(props: EntityHubProps): JSX.Element`
- Registry consumed by ResourcePage: `DRAWER_HUBS: Record<string, HubComponent>`.

- [ ] **Step 1: Read the current ResourcePage drawer + confirm handlers**

Read `frontend/src/pages/ResourcePage.tsx` lines 383–394 (`basicSection`) and 504–545 (the `Drawer`). Confirm the exact edit/delete wiring already in the footer: `setEditing(viewing); setViewing(null)` (edit) and `onDelete(viewing)` (delete), plus `canUpdate`/`canDelete`/`busy` in scope. The hub will receive these as callbacks — do not change their behavior.

- [ ] **Step 2: Create `hubTypes.ts`**

Create `frontend/src/components/explorer/hubs/hubTypes.ts`:

```tsx
import type { ReactNode } from 'react';
import type { ModuleConfig } from '../../../config/modules';
import type { InfoItem } from '../ExplorerKit';

export interface EntityHubProps {
  entity: Record<string, any>;
  cfg: ModuleConfig;
  onEdit: () => void;
  onDelete: () => void;
  canUpdate: boolean;
  canDelete: boolean;
  busy: boolean;
}

export type HubComponent = (props: EntityHubProps) => JSX.Element;

/**
 * Build drawer info-grid items for an entity. Prefers a column's `render()` (so
 * enum/currency values read exactly like the table) and falls back to the raw
 * field value. Empty values are dropped downstream by DrawerInfoGrid.
 */
export function buildInfoItems(
  cfg: ModuleConfig,
  entity: Record<string, any>,
  t: (k: string) => string,
): InfoItem[] {
  const renderByKey = new Map<string, (row: any) => ReactNode>();
  cfg.columns.forEach((c) => { if (c.render) renderByKey.set(c.key, c.render); });
  return cfg.fields
    .filter((f) => f.name !== 'name' && f.name !== 'fullName') // shown as the header title
    .map((f) => ({
      label: t(f.label),
      value: renderByKey.has(f.name) ? renderByKey.get(f.name)!(entity) : (entity[f.name] ?? null),
    }));
}
```

If `ModuleConfig`'s `fields` entries do not carry `name`/`label` exactly, adjust to the actual `FormField` shape (read `config/modules.tsx` `FormField` interface, ~lines 44–68, before writing). Do NOT guess field property names.

- [ ] **Step 3: Add CustomerHub smoke tests (failing)**

Create `frontend/src/__tests__/explorerHubs.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  api: { get: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
import { api } from '../api/client';
import CustomerHub from '../components/explorer/hubs/CustomerHub';
import type { EntityHubProps } from '../components/explorer/hubs/hubTypes';

const cfg = {
  key: 'customers', title: 'nav.customers', explorerIcon: 'groups',
  columns: [{ key: 'type', label: 'col.type', render: () => 'خاص' }],
  fields: [
    { name: 'code', label: 'field.code' },
    { name: 'type', label: 'field.type' },
    { name: 'phone', label: 'field.phone' },
  ],
} as any;

function renderHub(over: Partial<EntityHubProps> = {}) {
  const props: EntityHubProps = {
    entity: { id: 1, name: 'عميل تجريبي', code: 'C-1', phone: '', type: 'PRIVATE' },
    cfg, onEdit: vi.fn(), onDelete: vi.fn(), canUpdate: true, canDelete: true, busy: false,
    ...over,
  };
  return render(<MemoryRouter><CustomerHub {...props} /></MemoryRouter>);
}

describe('CustomerHub', () => {
  beforeEach(() => { (api.get as any).mockReset(); });

  it('hides Related/Activity when all fetches return empty', async () => {
    (api.get as any).mockResolvedValue({ data: { data: [] } });
    renderHub();
    expect(await screen.findByText('عميل تجريبي')).toBeInTheDocument(); // header title
    await waitFor(() => {
      expect(screen.queryByText('أحدث الفواتير')).toBeNull();
      expect(screen.queryByText('العقود')).toBeNull();
    });
  });

  it('renders recent invoices when the invoices endpoint returns rows', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url.startsWith('/invoices?') || url === '/invoices')
        return Promise.resolve({ data: { data: { data: [{ id: 9, invoiceNumber: 'INV-9', issueDate: '2026-07-07', total: 5, status: 'UNPAID' }] } } });
      return Promise.resolve({ data: { data: [] } });
    });
    renderHub();
    expect(await screen.findByText('INV-9')).toBeInTheDocument();
  });

  it('does not crash when a fetch rejects (shows no thrown error)', async () => {
    (api.get as any).mockRejectedValue(new Error('boom'));
    renderHub();
    expect(await screen.findByText('عميل تجريبي')).toBeInTheDocument();
  });
});
```

Run: `cd frontend && npx vitest run src/__tests__/explorerHubs.test.tsx` → FAIL (CustomerHub missing).

Note: the exact `api.get` URL shapes and response envelope (`res.data.data.data` for paginated lists vs `res.data.data`) must match the real client. Before writing CustomerHub, read one existing caller (e.g. `Invoices.tsx` around the `/invoices?customerId=` and `/invoices/stats` calls, and `api/statements.ts`) and mirror the exact URL + response unwrapping. Adjust the mock in this test to match what you implement.

- [ ] **Step 4: Implement CustomerHub**

Create `frontend/src/components/explorer/hubs/CustomerHub.tsx`. Structure (fill URLs/unwrapping to match the real client verified in Step 3):

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import { useT } from '../../../lib/i18n';
import { money } from '../../../config/modules';
import { formatDate } from '../../../lib/date';
import {
  DrawerHeaderCard, DrawerQuickActions, DrawerInfoGrid, DrawerRelated, DrawerActivity,
  type DrawerKpi, type QuickAction, type RelatedItem, type ActivityItem,
} from '../ExplorerKit';
import { buildInfoItems, type EntityHubProps } from './hubTypes';

export default function CustomerHub({ entity, cfg, onEdit, onDelete, canUpdate, canDelete }: EntityHubProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const id = entity.id as number;

  const [stats, setStats] = useState<{ count?: number; totalRemaining?: number } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [invoices, setInvoices] = useState<any[] | null>(null);
  const [contracts, setContracts] = useState<any[] | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // Use only endpoints already called elsewhere; unwrap exactly as the real client does.
    Promise.allSettled([
      api.get(`/invoices/stats`, { params: { customerId: id } }),
      api.get(`/statements/customers/${id}`),
      api.get(`/invoices`, { params: { customerId: id, pageSize: 5 } }),
      api.get(`/contracts`, { params: { customerId: id, pageSize: 5 } }),
    ]).then((results) => {
      if (!alive) return;
      // Map each settled result to state; on rejection leave the section empty (hidden).
      // (Implement unwrapping to match the verified response envelope.)
      // stats -> setStats; statement.closingBalance -> setBalance; statement.entries -> activity;
      // invoices.data -> setInvoices; contracts.data -> setContracts.
      setLoading(false);
    });
    return () => { alive = false; };
  }, [id]);

  const kpis: DrawerKpi[] = [
    ...(balance != null ? [{ label: 'الرصيد الحالي', value: money(balance) }] : []),
    ...(stats?.count != null ? [{ label: 'عدد الفواتير', value: stats.count }] : []),
    ...(stats?.totalRemaining != null ? [{ label: 'المتبقي', value: money(stats.totalRemaining), tone: 'red' as const }] : []),
  ];

  const actions: QuickAction[] = [
    { key: 'statement', icon: 'receipt_long', label: 'كشف حساب', onClick: () => navigate(`/financial?tab=statement&entityType=customer&entityId=${id}`) },
    { key: 'new-invoice', icon: 'note_add', label: 'إنشاء فاتورة', onClick: () => navigate('/invoices') },
    { key: 'add-contract', icon: 'description', label: 'إضافة عقد', onClick: () => navigate('/contracts') },
    ...(canUpdate ? [{ key: 'edit', icon: 'edit', label: 'تعديل', tone: 'primary' as const, onClick: onEdit }] : []),
    ...(canDelete ? [{ key: 'delete', icon: 'delete', label: 'حذف', tone: 'danger' as const, onClick: onDelete }] : []),
  ];

  const invoiceItems: RelatedItem[] = (invoices ?? []).map((inv) => ({
    key: String(inv.id),
    icon: 'receipt',
    primary: inv.invoiceNumber ?? inv.number ?? `#${inv.id}`,
    secondary: formatDate(inv.issueDate),
    trailing: money(inv.total),
  }));
  const contractItems: RelatedItem[] = (contracts ?? []).map((c) => ({
    key: String(c.id), icon: 'description', primary: c.code ?? `#${c.id}`, secondary: formatDate(c.startDate),
  }));

  return (
    <>
      <DrawerHeaderCard
        icon={cfg.explorerIcon ?? 'groups'}
        title={String(entity.name ?? entity.code ?? '')}
        subtitle={entity.code}
        kpis={kpis}
      />
      <DrawerQuickActions actions={actions} />
      <DrawerInfoGrid title={t('nav.customers')} items={buildInfoItems(cfg, entity, t)} />
      <DrawerRelated title="أحدث الفواتير" loading={loading} items={invoiceItems} />
      <DrawerRelated title="العقود" loading={loading} items={contractItems} />
      <DrawerActivity loading={loading} items={activity ?? []} />
    </>
  );
}
```

Implement the `useEffect` unwrapping concretely against the verified envelope (Step 3). Keep KPI/related/activity arrays empty when their fetch fails or returns nothing so the corresponding sections hide. Do not fabricate values.

- [ ] **Step 5: Wire the registry into ResourcePage (fallback unchanged)**

In `frontend/src/pages/ResourcePage.tsx`:

Add imports near the top (with other component imports):
```tsx
import CustomerHub from '../components/explorer/hubs/CustomerHub';
import type { HubComponent } from '../components/explorer/hubs/hubTypes';
```
Add the registry above the component (module scope):
```tsx
const DRAWER_HUBS: Record<string, HubComponent> = { customers: CustomerHub };
```
In the `Drawer` render (currently ~504–545), compute the hub once inside the component render (near where `basicSection` is defined):
```tsx
const Hub = DRAWER_HUBS[cfg.key];
```
Change the drawer so that when a hub exists it renders the hub body and suppresses the slim `hero` (the hub draws its own header card), while everything else stays exactly as today:
- Pass `hero={Hub ? undefined : (<the existing xpl-drawer-hero block>)}`.
- Body: `{Hub ? <Hub entity={viewing} cfg={cfg} onEdit={() => { setEditing(viewing); setViewing(null); }} onDelete={() => onDelete(viewing)} canUpdate={canUpdate} canDelete={canDelete} busy={busy} /> : (cfg.key === 'employees' ? (<the existing employees Tabs/EmployeeFinancialTab block>) : basicSection)}`.
- Footer: unchanged (edit/delete Buttons already present). The hub renders its own quick actions; the footer edit/delete remain as the bottom action row, matching the reference (quick-action tiles + bottom bar both present).

Do not alter the employees branch, the contracts financial-summary footer button, permissions, or `onDelete`.

- [ ] **Step 6: Run tests**

Run: `cd frontend && npx vitest run src/__tests__/explorerHubs.test.tsx`
Expected: PASS.
Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/explorer/hubs/hubTypes.ts frontend/src/components/explorer/hubs/CustomerHub.tsx frontend/src/pages/ResourcePage.tsx frontend/src/__tests__/explorerHubs.test.tsx
git commit -m "feat(explorer): CustomerHub information-hub drawer + ResourcePage registry"
```

---

## Task 4: EquipmentHub

**Files:**
- Create: `frontend/src/components/explorer/hubs/EquipmentHub.tsx`
- Modify: `frontend/src/pages/ResourcePage.tsx` (add `equipment` to `DRAWER_HUBS`)
- Test: `frontend/src/__tests__/explorerHubs.test.tsx` (add EquipmentHub smoke tests)

**Interfaces:**
- Consumes: primitives, `EntityHubProps`, `buildInfoItems`, `api`, `useNavigate`, `money`, `formatDate`.
- Produces: `export default function EquipmentHub(props: EntityHubProps): JSX.Element`.

- [ ] **Step 1: Add EquipmentHub smoke tests (failing)**

Append to `frontend/src/__tests__/explorerHubs.test.tsx`:

```tsx
import EquipmentHub from '../components/explorer/hubs/EquipmentHub';

const eqCfg = {
  key: 'equipment', title: 'nav.equipment', explorerIcon: 'construction',
  columns: [{ key: 'status', label: 'col.status', render: () => 'تعمل' }],
  fields: [
    { name: 'code', label: 'field.code' },
    { name: 'type', label: 'field.type' },
    { name: 'plateNumber', label: 'field.plate' },
  ],
} as any;

describe('EquipmentHub', () => {
  beforeEach(() => { (api.get as any).mockReset(); });

  it('hides Related/Activity when maintenance & fuel are empty', async () => {
    (api.get as any).mockResolvedValue({ data: { data: [] } });
    render(<MemoryRouter><EquipmentHub
      entity={{ id: 5, code: 'EQ-5', type: 'شاحنة', status: 'WORKING', registration: { remainingText: '183 يوم', expiry: '2027-01-06' } }}
      cfg={eqCfg} onEdit={vi.fn()} onDelete={vi.fn()} canUpdate canDelete busy={false}
    /></MemoryRouter>);
    expect(await screen.findByText('EQ-5')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('سجل الصيانة')).toBeNull();
      expect(screen.queryByText('سجل الوقود')).toBeNull();
    });
  });

  it('renders maintenance records when the endpoint returns rows', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url.includes('/maintenance/records'))
        return Promise.resolve({ data: { data: { data: [{ id: 3, type: 'زيت', date: '2026-06-17', status: 'DONE' }] } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter><EquipmentHub
      entity={{ id: 5, code: 'EQ-5', status: 'WORKING', registration: { remainingText: '183 يوم' } }}
      cfg={eqCfg} onEdit={vi.fn()} onDelete={vi.fn()} canUpdate canDelete busy={false}
    /></MemoryRouter>);
    expect(await screen.findByText('سجل الصيانة')).toBeInTheDocument();
  });
});
```

Run → FAIL (EquipmentHub missing). Adjust URL/envelope in the mock to match the real Maintenance calls (read `Maintenance.tsx` `/maintenance/records` + `/maintenance/fuel` before implementing).

- [ ] **Step 2: Implement EquipmentHub**

Create `frontend/src/components/explorer/hubs/EquipmentHub.tsx`, mirroring CustomerHub's structure. Verified data only:
- **KPIs:** Status (via a small WORKING/NOT_WORKING → label+tone map, matching the app's `equipmentStatus` renderer semantics), Registration Remaining (`entity.registration?.remainingText`), Registration Expiry (`formatDate(entity.registration?.expiry)`). Each KPI included only when its value exists.
- **Quick actions:** Request Maintenance → `navigate('/maintenance')`; Log Fuel → `navigate('/maintenance')`; Edit (if canUpdate, tone primary); Delete (if canDelete, tone danger). No Transfer/Update-km/Print-card.
- **Info grid:** `buildInfoItems(cfg, entity, t)`.
- **Related (lazy):** `سجل الصيانة` from `GET /maintenance/records?equipmentId=<id>` (primary=type, secondary=formatDate(date), trailing=status/cost); `سجل الوقود` from `GET /maintenance/fuel?equipmentId=<id>` (primary=liters/date, secondary=odometer, trailing=cost). Empty ⇒ hidden.
- **Activity (lazy):** merge maintenance + fuel entries, sort by date desc, map to `ActivityItem` (reuse the two fetches; no extra calls). Empty ⇒ hidden.
- `useEffect` uses the `alive` guard keyed by `entity.id`, `Promise.allSettled`, and leaves sections empty on rejection.

- [ ] **Step 3: Register equipment**

In `ResourcePage.tsx`, extend the registry:
```tsx
import EquipmentHub from '../components/explorer/hubs/EquipmentHub';
const DRAWER_HUBS: Record<string, HubComponent> = { customers: CustomerHub, equipment: EquipmentHub };
```

- [ ] **Step 4: Run tests + type-check**

Run: `cd frontend && npx vitest run src/__tests__/explorerHubs.test.tsx` → PASS.
Run: `cd frontend && npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/explorer/hubs/EquipmentHub.tsx frontend/src/pages/ResourcePage.tsx frontend/src/__tests__/explorerHubs.test.tsx
git commit -m "feat(explorer): EquipmentHub information-hub drawer"
```

---

## Task 5: Invoice drawer recomposition

**Files:**
- Modify: `frontend/src/pages/Invoices.tsx` (detail drawer ~400–490)

**Interfaces:**
- Consumes: the primitives from Tasks 1–2 + the invoice page's EXISTING handlers/state (do not rename or change them): the payment opener (`setPaying`), print navigation (`navigate('/invoices/:id/preview?print=1')`), edit opener (`setEditing`), cancel (`cancel()`/`executeCancel`), force-delete (`setForceDeleteId`), and the per-row permission gates (`canCollectRow`, `canEditRow`, `canCancelRow`). The detail fetch `GET /invoices/:id` (already used) supplies `items[]`/`payments[]`.

- [ ] **Step 1: Read the current invoice drawer + handlers**

Read `frontend/src/pages/Invoices.tsx` ~400–490 (the `viewing && (() => {...})()` drawer) and the surrounding handler/state declarations. Write down the EXACT names of: the collect-payment opener, print action, edit opener, cancel handler, force-delete setter, and the permission booleans used to gate each. You will reuse these verbatim.

- [ ] **Step 2: Add the imports**

Ensure `Invoices.tsx` imports the new primitives from `../components/explorer/ExplorerKit`:
```tsx
DrawerHeaderCard, DrawerQuickActions, DrawerActivity, DrawerActionBar,
type DrawerKpi, type QuickAction, type ActivityItem, type ActionBtn,
```
(plus keep existing `Drawer`, `DrawerSection`, `DrawerField`, `StatusChip`, `Button`, etc.)

- [ ] **Step 3: Recompose the drawer body**

Replace the drawer's hero + body composition with the primitives, keeping the bespoke financial summary + line-items table as-is:
- **Header:** `DrawerHeaderCard` with `icon="receipt_long"`, title = invoice number, subtitle = party name, status via the existing `invStatusChip` tone/label, and `kpis = [ {label:'الإجمالي', value: money(total)}, {label:'المحصل', value: money(paidAmount), tone:'green'}, {label:'المتبقي', value: money(remaining), tone:'red'}, {label:'العمر', value: <days from issueDate> + ' يوم'} ]`. Compute `remaining = Math.max(0, total - paidAmount)` and age from `issueDate` (reuse the existing computation already in the file — do not add new logic).
- **Quick actions** (existing handlers only; gate with the existing permission booleans; omit any whose handler is absent — Email PDF, Duplicate, View-log are omitted):
  - Receive Payment → open payment (gated by collect permission)
  - Print → `navigate('/invoices/:id/preview?print=1')`
  - PDF → `navigate('/invoices/:id/preview')` (the preview page hosts the existing Save-PDF handler)
  - Edit → edit opener (gated), tone primary
  - Cancel → cancel handler (gated)
  - Delete → force-delete setter (SYSTEM_ADMIN only), tone danger
- **Info:** keep the existing `DrawerSection`/`DrawerField` "المعلومات الأساسية", the bespoke `invcx-fin` financial summary, the `invcx-detail-table` line-items, notes, technical sections — unchanged.
- **Related:** `DrawerRelated` "الدفعات" from the already-fetched `payments[]` (primary = amount, secondary = formatDate(date) + method, trailing may be omitted); hidden when no payments. A Customer related row/link may be added ONLY as a display row (no new route needed) — otherwise omit.
- **Activity:** `DrawerActivity` synthesized from `issueDate` (أُنشئت) → each `payments[]` entry (دفعة) → CANCELLED status (أُلغيت). No audit fetch.

- [ ] **Step 4: Recompose the footer with DrawerActionBar**

Replace the footer `<>...</>` with `DrawerActionBar`:
- `primary` = Receive Payment (when collectible) else Edit;
- `secondary` = [Print, Edit] (Edit here if not primary);
- `danger` = [Cancel (if cancellable), Delete (if SYSTEM_ADMIN)].
Wire each to the SAME existing handlers. Preserve every existing permission gate exactly.

- [ ] **Step 5: Verify no logic/data/payload changed**

Confirm by diff that only presentation/markup changed: no change to `POST /invoices/:id/payments`, `PUT /invoices/:id`, `PATCH /invoices/:id/cancel`, the create/edit payloads, the detail fetch, or any permission expression. The financial summary numbers and line-items render identically.

- [ ] **Step 6: Type-check + full test run**

Run: `cd frontend && npx tsc --noEmit` → no errors.
Run: `cd frontend && npm test` → all pass except the 2 pre-existing `printWorkspace.test.tsx` failures.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Invoices.tsx
git commit -m "feat(explorer): recompose invoice drawer as an information hub"
```

---

## Task 6: Full validation, manual verification, report

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `cd frontend && npm test`
Expected: all pass except the 2 pre-existing `printWorkspace.test.tsx` failures.

- [ ] **Step 2: Type-check + build**

Run: `cd frontend && npx tsc --noEmit` → no errors.
Run: `cd frontend && npm run build` → succeeds.

- [ ] **Step 3: Manual verification against the references**

Launch the app (`npm run dev` at repo root) and open the drawers for a Customer, an Equipment item, and an Invoice. Confirm: header card + KPIs, quick-actions grid, grouped info, related records (or hidden when the entity has none), activity timeline (or hidden), and the bottom action bar — visually consistent with the three reference screenshots. Confirm empty sections are hidden (e.g. a customer with no contracts shows no Contracts section). Confirm keyboard focus trap + Escape still work in the drawer.

- [ ] **Step 4: Confirm no business-logic change**

Grep the diff for any change under backend/, any endpoint string change, any permission expression change, any create/edit payload change — expect none. All changes are in `components/explorer/*`, `components/explorer/hubs/*`, `pages/ResourcePage.tsx` (drawer render only), and `pages/Invoices.tsx` (drawer render only), plus tests.

- [ ] **Step 5: Write the final report**

Produce a report: shared components added (the 6 primitives + CSS), pages affected (ResourcePage customers/equipment, Invoices), reusable improvements (primitives now available for later rollout), before/after screenshots of the three reference drawers, and explicit confirmation that no backend/API/business-logic/workflow changed and that all shown fields/actions/related/activity are backed by existing data/handlers (with the honest omissions listed).

- [ ] **Step 6: (No auto-commit/merge)** Stop and hand back for the Gemini review + merge per the project workflow. Do NOT merge or push automatically.

---

## Self-Review

**Spec coverage:**
- 6 additive primitives → Tasks 1–2. ✔
- CustomerHub (KPIs/actions/info/related/activity, existing data only) → Task 3. ✔
- EquipmentHub → Task 4. ✔
- Invoice drawer recomposition → Task 5. ✔
- ResourcePage registry with fallback → Task 3 (+ Task 4 entry). ✔
- Lazy-loaded related/activity, hide-when-empty → primitives (Task 2) + hubs (Tasks 3–4). ✔
- Honest omissions (Last Update, Purchase Date, Transfer/km/Print-card, Email-PDF/Duplicate, Contract/PO) → encoded by simply not adding those actions/fields (Tasks 3–5). ✔
- No backend/API/workflow/deep-link changes → Global Constraints + Task 5 Step 5 + Task 6 Step 4. ✔
- Deferrals (other pages, global polish, Bank Explorer) → not in any task. ✔
- Tests (primitive render + hub smoke) → Tasks 1–4. ✔
- Final report → Task 6. ✔

**Placeholder scan:** Tasks 1–2 contain full primitive + CSS + test code. Tasks 3–5 intentionally instruct the implementer to *read and mirror the exact existing endpoint envelope/handlers before writing* (the response-unwrapping and handler names must match real code, which the plan must not guess) — the structure, section list, data sources, and constraints are fully specified; the only deferred detail is the exact `res.data.data(.data)` unwrapping, which is a verification step, not a vague requirement.

**Type consistency:** `DrawerHeaderCard`/`DrawerKpi`, `DrawerQuickActions`/`QuickAction`, `DrawerInfoGrid`/`InfoItem`, `DrawerRelated`/`RelatedItem`, `DrawerActivity`/`ActivityItem`, `DrawerActionBar`/`ActionBtn`, `EntityHubProps`, `HubComponent`, `buildInfoItems`, `DRAWER_HUBS` are named identically across all tasks that consume them.
