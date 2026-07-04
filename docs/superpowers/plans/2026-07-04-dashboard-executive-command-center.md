# Executive Command Center (Home Dashboard Redesign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan phase-by-phase. Steps use checkbox (`- [ ]`) syntax for tracking. **Execution is gated per phase by the user** — after each phase run the quality gate, present a screenshot + design-decision notes, and STOP for approval before the next phase.

**Goal:** Redesign the General tab of the Home dashboard into an extensible, content-driven Executive Command Center that visually references the provided image (~95–100%) while preserving 100% of existing functionality.

**Architecture:** Frontend-only. A thin composition layer (`GeneralDashboardContent`) fetches data and maps a **section registry** of independent, self-contained widget components into a responsive CSS grid. New command-center data comes from existing endpoints (`/executive/decision-center`, `/dashboard/activity`); no backend/API/schema/calculation/permission changes. All existing rich panels are retained below the Command Center.

**Tech Stack:** React 18 + TypeScript, Vite, Recharts (already used), existing `dashboard.css` token system, Vitest for unit tests.

## Global Constraints

- Frontend only — NO backend / Prisma / API / migration / financial-calculation / permission changes. (verbatim from spec §1)
- NO fake/placeholder data — every value from a real endpoint or an honest derivation of real fields. (spec §1, §2)
- Preserve routing, state management, APIs, localization (Arabic-first/RTL), dark/light mode, ExplorerKit tokens, and the `عام`/`مالي` tab bar. Only the General tab changes; Financial tab untouched. (spec §1)
- Architecture principles override pixel-match on conflict: content-driven layout, independent components, no fixed heights (`auto`/`min-height`), reorder/hide/show-ready section registry, executive-experience-first. (spec §1a)
- Existing components are reused/restyled, NOT rewritten or renamed without cause. New component created only where none exists (`RecentActivityFeed`, `CommandCenter`, section wrappers). (spec §3)
- Locked data decisions: donut = revenue-by-customer from `financialSummary.topCustomersByRevenue` (+ "أخرى"); Cash-Flow KPI = `thisMonth.collections − thisMonth.expenses`; all existing lower panels kept. (spec §2)
- **NO automatic commits/merges/pushes** (CLAUDE.md hard rule). Commit steps below are prepared only; execute a commit ONLY when the user explicitly asks. Each phase ends at a quality gate + screenshot review, not an auto-commit.
- Quality gate commands: `cd frontend && npx tsc --noEmit` and `cd frontend && npm run build:front` (from repo root: `npm run build:front`). Run frontend Vitest only if a phase adds/affects a test.

---

## File Structure

```
frontend/src/components/dashboard/command/          # NEW — command-center feature folder
  types.ts                 # shared TS interfaces (DecisionCenterData, ActivityRow, RevenueSlice, DashboardSection)
  commandData.ts           # PURE helpers: computeCashFlow(), buildRevenueDistribution()
  useDashboardCommandData.ts  # hook: fetches /executive/decision-center + /dashboard/activity, returns typed data + derived values
  CommandCenter.tsx        # composition layer: maps section registry into the responsive grid
  HealthGaugeSection.tsx   # (Phase C) independent — wraps CompanyHealthScore + reasons variant
  KpiRowSection.tsx        # (Phase D) independent — KPI cards + trend badges
  PerformanceChartSection.tsx   # (Phase E) independent — combo chart
  RevenueDistributionSection.tsx# (Phase E) independent — donut (revenue by customer)
  ActionCenterSection.tsx  # (Phase F) independent — decision cards list
  QuickActionsSection.tsx  # (Phase F) independent — quick action tiles
  RecentActivitySection.tsx# (Phase F) independent — wraps RecentActivityFeed
  RecommendationsSection.tsx    # (Phase G) independent — recommendations cards
  RecentActivityFeed.tsx   # (Phase F) NEW presentational feed from /dashboard/activity
  __tests__/commandData.test.ts # unit tests for pure helpers
frontend/src/components/dashboard/dashboard.css      # MODIFY — add .db-command-* grid + card styles
frontend/src/pages/Dashboard.tsx                     # MODIFY — GeneralDashboardContent becomes composition layer; mount <CommandCenter>, keep existing panels below
```

Each `*Section.tsx` is a self-contained component with an explicit props interface, its own skeleton/empty state, and no dependency on sibling sections. `CommandCenter` receives one `data` object and renders a `DashboardSection[]` registry — enabling future hide/show/reorder without structural change.

---

## Phase A — Data Layer (no visible widgets)

Deliverable: the two new endpoints are fetched (isolated failure), typed, and derived values computed; a minimal empty `CommandCenter` shell is mounted so the wiring compiles and the board is proven unbroken. No visual widgets yet.

### Task A1: Types + pure derivation helpers (TDD)

**Files:**
- Create: `frontend/src/components/dashboard/command/types.ts`
- Create: `frontend/src/components/dashboard/command/commandData.ts`
- Test: `frontend/src/components/dashboard/command/__tests__/commandData.test.ts`

**Interfaces:**
- Produces:
  - `interface MonthFin { revenue: number; expenses: number; collections: number; profit: number }`
  - `interface RevenueSlice { name: string; value: number }`
  - `computeCashFlow(thisMonth: MonthFin): number`
  - `buildRevenueDistribution(top: { name: string; revenue: number }[], maxSlices?: number): RevenueSlice[]`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/commandData.test.ts
import { describe, it, expect } from 'vitest';
import { computeCashFlow, buildRevenueDistribution } from '../commandData';

describe('computeCashFlow (real derivation: collections − expenses)', () => {
  it('returns collections minus expenses for the month', () => {
    expect(computeCashFlow({ revenue: 100, expenses: 30, collections: 56, profit: 70 })).toBe(26);
  });
  it('can be negative when expenses exceed collections', () => {
    expect(computeCashFlow({ revenue: 0, expenses: 40, collections: 10, profit: -40 })).toBe(-30);
  });
  it('treats missing numbers as 0', () => {
    // @ts-expect-error partial input
    expect(computeCashFlow({})).toBe(0);
  });
});

describe('buildRevenueDistribution (real revenue by customer + أخرى)', () => {
  const rows = [
    { name: 'A', revenue: 50 }, { name: 'B', revenue: 30 },
    { name: 'C', revenue: 10 }, { name: 'D', revenue: 6 }, { name: 'E', revenue: 4 },
  ];
  it('keeps top N slices and aggregates the rest into أخرى', () => {
    const out = buildRevenueDistribution(rows, 3);
    expect(out).toEqual([
      { name: 'A', value: 50 }, { name: 'B', value: 30 },
      { name: 'C', value: 10 }, { name: 'أخرى', value: 10 },
    ]);
  });
  it('adds no أخرى slice when rows fit within maxSlices', () => {
    const out = buildRevenueDistribution([{ name: 'A', revenue: 5 }], 3);
    expect(out).toEqual([{ name: 'A', value: 5 }]);
  });
  it('drops zero/negative revenue rows', () => {
    const out = buildRevenueDistribution([{ name: 'A', revenue: 5 }, { name: 'B', revenue: 0 }], 3);
    expect(out).toEqual([{ name: 'A', value: 5 }]);
  });
  it('returns [] for empty input', () => {
    expect(buildRevenueDistribution([], 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `cd frontend && npx vitest run src/components/dashboard/command/__tests__/commandData.test.ts`
Expected: FAIL (module not found / functions undefined).

- [ ] **Step 3: Implement types.ts**

```ts
// types.ts
import type { ReactNode } from 'react';

export interface MonthFin { revenue: number; expenses: number; collections: number; profit: number }

export interface MonthOnMonthChanges {
  revenue: number | null; expenses: number | null; collections: number | null; profit: number | null;
}

export interface FinancialSummary {
  totalRevenue: number; totalExpenses: number; netProfit: number;
  totalCollected: number; totalOutstanding: number;
  overallProfitMargin: number | null; overallCollectionRate: number | null;
  thisMonth: MonthFin; lastMonth: MonthFin; monthOnMonthChanges: MonthOnMonthChanges;
  topDebtors: { customerId: number; name: string; outstanding: number; oldestDays: number }[];
  topCustomersByRevenue: { customerId: number; name: string; revenue: number; collected: number }[];
  topContractsByProfit: { id: number; code: string; asphaltPlant: string; revenue: number; expenses: number; profit: number; profitMargin: number | null; collectionRate: number | null }[];
  activeContracts: number; totalContracts: number;
}

export interface HealthScoreData {
  total: number;
  label: 'EXCELLENT' | 'GOOD' | 'WATCH' | 'RISK';
  labelAr: string; explanation: string;
  components: { collections: number; profitability: number; outstanding: number; cashFlow: number; contracts: number; stability: number };
}

export interface DecisionCard {
  id: string; title: string; value: string; explanation: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW'; recommendedAction: string;
  relatedId?: number; relatedType?: 'CUSTOMER' | 'CONTRACT'; amount?: number;
}

export interface AlertV3 {
  id: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; type: string;
  title: string; description: string; amount: number | null;
  relatedId?: number; relatedType?: string; actionLabel?: string;
}

export interface RecommendationV2 {
  id: string; priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string; message: string; metric: string; actionHint: string;
}

export interface DecisionCenterData {
  financialSummary: FinancialSummary;
  decisionCards: DecisionCard[];
  alertsV3: AlertV3[];
  healthScore: HealthScoreData;
  recommendations: RecommendationV2[];
}

export interface ActivityRow {
  id: number; action: string; module: string; entityId: string | null;
  createdAt: string; user: { fullName: string } | null;
}

export interface RevenueSlice { name: string; value: number }

export interface DashboardSection {
  id: string;
  title?: string;
  permission?: string;
  node: ReactNode;
}
```

- [ ] **Step 4: Implement commandData.ts**

```ts
// commandData.ts
import type { MonthFin, RevenueSlice } from './types';

/** Real net cash flow for the month = collections − expenses (both real fields). */
export function computeCashFlow(thisMonth: Partial<MonthFin> | null | undefined): number {
  const collections = Number(thisMonth?.collections ?? 0);
  const expenses = Number(thisMonth?.expenses ?? 0);
  return Math.round((collections - expenses) * 1000) / 1000;
}

/** Real revenue distribution by customer; overflow beyond maxSlices aggregates into أخرى. */
export function buildRevenueDistribution(
  top: { name: string; revenue: number }[],
  maxSlices = 5,
): RevenueSlice[] {
  const positive = (top ?? []).filter((r) => Number(r.revenue) > 0);
  if (positive.length === 0) return [];
  const head = positive.slice(0, maxSlices).map((r) => ({ name: r.name, value: Number(r.revenue) }));
  const rest = positive.slice(maxSlices).reduce((s, r) => s + Number(r.revenue), 0);
  if (rest > 0) head.push({ name: 'أخرى', value: Math.round(rest * 1000) / 1000 });
  return head;
}
```

- [ ] **Step 5: Run to verify PASS**

Run: `cd frontend && npx vitest run src/components/dashboard/command/__tests__/commandData.test.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Prepare commit (do NOT run without user approval)**

```bash
git add frontend/src/components/dashboard/command/types.ts frontend/src/components/dashboard/command/commandData.ts frontend/src/components/dashboard/command/__tests__/commandData.test.ts
# commit only when the user says so:
# git commit -m "feat(dashboard): add command-center types and pure derivation helpers"
```

### Task A2: Data hook + empty CommandCenter shell wired into the page

**Files:**
- Create: `frontend/src/components/dashboard/command/useDashboardCommandData.ts`
- Create: `frontend/src/components/dashboard/command/CommandCenter.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx` (import + mount `<CommandCenter>` at top of `GeneralDashboardContent`; add fetches)

**Interfaces:**
- Consumes: `DecisionCenterData`, `ActivityRow`, `computeCashFlow`, `buildRevenueDistribution` (Task A1).
- Produces:
  - `interface CommandData { decisionCenter: DecisionCenterData | null; activity: ActivityRow[]; cashFlowThisMonth: number | null; revenueDistribution: RevenueSlice[]; loading: boolean }`
  - `useDashboardCommandData(refreshKey: number): CommandData`
  - `CommandCenter({ data }: { data: CommandData }): JSX.Element`

- [ ] **Step 1: Implement the hook** — isolated fetch; failure must NOT break the board.

```ts
// useDashboardCommandData.ts
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { computeCashFlow, buildRevenueDistribution } from './commandData';
import type { CommandData } from './CommandCenter';
import type { ActivityRow, DecisionCenterData } from './types';

export function useDashboardCommandData(refreshKey: number): CommandData {
  const [decisionCenter, setDecisionCenter] = useState<DecisionCenterData | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get('/executive/decision-center').then((r) => r.data?.data ?? null).catch(() => null),
      api.get('/dashboard/activity', { params: { limit: 8 } }).then((r) => r.data?.data ?? []).catch(() => []),
    ]).then(([dc, act]) => {
      if (cancelled) return;
      setDecisionCenter(dc);
      setActivity(Array.isArray(act) ? act : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const cashFlowThisMonth = useMemo(
    () => (decisionCenter ? computeCashFlow(decisionCenter.financialSummary.thisMonth) : null),
    [decisionCenter],
  );
  const revenueDistribution = useMemo(
    () => (decisionCenter ? buildRevenueDistribution(decisionCenter.financialSummary.topCustomersByRevenue) : []),
    [decisionCenter],
  );

  return { decisionCenter, activity, cashFlowThisMonth, revenueDistribution, loading };
}
```

- [ ] **Step 2: Implement the empty composition shell** — renders a structural container only (no widgets yet). Consumes `data` so props are "used" and tsc/lint stay green.

```tsx
// CommandCenter.tsx
import type { ActivityRow, DecisionCenterData, RevenueSlice } from './types';

export interface CommandData {
  decisionCenter: DecisionCenterData | null;
  activity: ActivityRow[];
  cashFlowThisMonth: number | null;
  revenueDistribution: RevenueSlice[];
  loading: boolean;
}

/**
 * Composition layer for the Executive Command Center.
 * Phase A: structural shell only — sections are added in later phases via the registry.
 */
export default function CommandCenter({ data }: { data: CommandData }) {
  // data is intentionally read here so the wiring is exercised; sections arrive in Phase B+.
  void data;
  return <section className="db-command-center" aria-label="مركز القيادة التنفيذي" />;
}
```

- [ ] **Step 3: Wire into `GeneralDashboardContent`** — add import and mount at the very top of the returned tree (before `db-exec-header`), and call the hook near the other hooks.

Modify `frontend/src/pages/Dashboard.tsx`:
- Add imports near the other dashboard imports (around line 32):

```tsx
import CommandCenter from '../components/dashboard/command/CommandCenter';
import { useDashboardCommandData } from '../components/dashboard/command/useDashboardCommandData';
```

- Inside `GeneralDashboardContent`, after `const [refreshKey, setRefreshKey] = useState(0);` add:

```tsx
const commandData = useDashboardCommandData(refreshKey);
```

- In the returned JSX, immediately after `<div className="db-page">` add:

```tsx
      <CommandCenter data={commandData} />
```

- [ ] **Step 4: Quality gate**

Run: `cd frontend && npx tsc --noEmit`  → Expected: 0 errors.
Run (repo root): `npm run build:front`  → Expected: clean build.
Run: `cd frontend && npx vitest run src/components/dashboard/command` → Expected: PASS.

- [ ] **Step 5: Screenshot + verification** — launch the app (backend + Vite), log in, open the dashboard, capture a screenshot proving the General dashboard renders unchanged (empty command-center container is invisible; no regression, no console errors from the two new fetches). Present the screenshot and design-decision notes, then STOP for user approval before Phase B.

- [ ] **Step 6: Prepare commit (await user approval)**

```bash
git add frontend/src/components/dashboard/command/useDashboardCommandData.ts frontend/src/components/dashboard/command/CommandCenter.tsx frontend/src/pages/Dashboard.tsx
# git commit -m "feat(dashboard): wire command-center data hook and empty shell (Phase A)"
```

---

## Phase B — Layout shell + section registry + CSS grid

**Files:** Modify `CommandCenter.tsx` (build `DashboardSection[]` registry + responsive grid), `dashboard.css` (add `.db-command-center`, `.db-cc-grid`, `.db-cc-right`, `.db-cc-main`, card classes).

- [ ] Build a `sections: DashboardSection[]` array in `CommandCenter` with placeholder nodes (empty `SectionCard` wrappers titled per reference: حالة الشركة اليوم، المؤشرات المالية، الأداء المالي، توزيع الإيرادات، احتاج إجراء الآن، كل الإجراءات، إجراءات سريعة، التوصيات الذكية).
- [ ] Render via `.map` into a CSS grid: right column (~28%) for health + action center; main area (~72%) for KPIs, charts, quick actions, activity, recommendations. Use `grid-template-areas`; collapse to single column under ~1200px.
- [ ] CSS uses existing tokens (`--db-card`,`--db-border`,`--db-radius`,`--db-muted`,`--db-text`), `min-height`/`auto` (no fixed heights), soft shadow, ~16px radius, 8px spacing scale. Verify dark mode.
- [ ] Gate: `npm run build:front` + `npx tsc --noEmit`. Screenshot (grid skeleton with titled empty cards). STOP for approval.

---

## Phase C — Hero title + Health gauge section

**Files:** Create `HealthGaugeSection.tsx`; modify `CommandCenter.tsx` (register it), `dashboard.css`.

- [ ] Page title block "لوحة التحكم / نظرة عامة على أداء الشركة".
- [ ] `HealthGaugeSection` props: `{ health: HealthScoreData | null; financial: FinancialSummary | null; loading: boolean }`. Reuse `CompanyHealthScore` ring; add a "أسباب التقييم" checklist deriving ✓/⚠ rows from real fields (e.g. `components.cashFlow` high → "التدفق النقدي جيد"; `financialSummary.totalOutstanding`/unpaid count → "يوجد N فاتورة مستحقة"; overdue contracts from decision data). Own skeleton + empty state. No dependency on other sections.
- [ ] Gate: `tsc` + `build:front`. Screenshot. STOP for approval.

---

## Phase D — Executive KPI row

**Files:** Create `KpiRowSection.tsx`; modify `CommandCenter.tsx`, `dashboard.css`; reuse `KPICard`.

- [ ] `KpiRowSection` props: `{ financial: FinancialSummary | null; cashFlow: number | null; loading: boolean }`. Four cards: إجمالي الإيرادات, صافي الربح, إجمالي المصروفات, التدفق النقدي (= `cashFlow` prop). Each card shows icon tile, label, value (`PrivateAmount`), and a trend badge (arrow + % from `monthOnMonthChanges`, color-correct: expenses inverted).
- [ ] Optional 5th KPI الذمم المستحقة (`totalOutstanding`) behind the registry (kept per requirements; easy to toggle).
- [ ] Gate: `tsc` + `build:front`. Screenshot. STOP for approval.

---

## Phase E — Financial analytics (combo chart + revenue donut)

**Files:** Create `PerformanceChartSection.tsx`, `RevenueDistributionSection.tsx`; modify `RevenueChart.tsx` (add `ComposedChart` + `Line`), `CommandCenter.tsx`, `dashboard.css`.

- [ ] `PerformanceChartSection` props: `{ trend: { label:string; revenue:number; expense:number }[]; loading:boolean }`. Upgrade `RevenueChart` to Recharts `ComposedChart`: revenue + expense bars + a profit `Line`; keep dark tooltip; `ResponsiveContainer` with `min-height` (no fixed height).
- [ ] `RevenueDistributionSection` props: `{ slices: RevenueSlice[]; loading:boolean }`. Recharts donut (`Pie innerRadius`), center total, legend with value + %. Fed by the approved real `revenueDistribution`.
- [ ] Gate: `tsc` + `build:front`. Screenshot. STOP for approval.

---

## Phase F — Action Center + Quick Actions + Recent Activity

**Files:** Create `ActionCenterSection.tsx`, `QuickActionsSection.tsx`, `RecentActivitySection.tsx`, `RecentActivityFeed.tsx`; modify `CommandCenter.tsx`, `dashboard.css`; reuse `ExecutiveDecisionCards`.

- [ ] `ActionCenterSection` props `{ cards: DecisionCard[]; loading:boolean }` — reuse/restyle `ExecutiveDecisionCards` into the reference list with per-card action buttons that `navigate` by `relatedType` (permission-checked).
- [ ] `QuickActionsSection` — icon-tile buttons (فاتورة/عميل/مصروف/عقد/سند/شيك) gated by `hasPermission`, using `navigate`. No new routes.
- [ ] `RecentActivityFeed` props `{ rows: ActivityRow[]; loading:boolean }` — timeline: action→icon/label map, module (Arabic), relative time from `createdAt`, user name. `RecentActivitySection` wraps it.
- [ ] Gate: `tsc` + `build:front`. Screenshot. STOP for approval.

---

## Phase G — Recommendations + preserve existing rich panels

**Files:** Create `RecommendationsSection.tsx`; modify `CommandCenter.tsx`, `Dashboard.tsx` (reorder existing panels below `<CommandCenter>`), `dashboard.css`; reuse `ExecutiveRecommendationsPanel`.

- [ ] `RecommendationsSection` props `{ recommendations: RecommendationV2[]; loading:boolean }` — restyle `ExecutiveRecommendationsPanel` cards to match reference (icon/title/desc/action hint).
- [ ] Confirm ALL existing panels (KPIs source note aside, ops stats, alerts, tables, V2 panels) remain rendered below the Command Center, unchanged in data/logic. Remove only the now-duplicated old top Hero/quick-actions block if fully superseded (verify nothing unique lost first).
- [ ] Gate: `tsc` + `build:front` + `cd frontend && npx vitest run` (confirm no regression). Screenshot (full page). STOP for approval.

---

## Phase H — Responsive + polish

**Files:** `dashboard.css`, section components as needed.

- [ ] Verify 1920×1080, 1600×900, 1366×768 (right column collapses gracefully; no horizontal scroll; no fixed-height clipping).
- [ ] Dark mode parity; a11y (`role`, `aria-label`, keyboard-focusable cards where actionable, `prefers-reduced-motion`); memoize derived data; confirm no extra re-renders (stable props).
- [ ] Confirm each section is an independent registry-driven component free of fixed heights and cross-section coupling.
- [ ] Final gate: `cd frontend && npx tsc --noEmit`, `tsc -p electron/tsconfig.json --noEmit`, `npm run build:front`, full `cd frontend && npx vitest run`. Screenshot. STOP for approval (then Gemini review per Feature workflow before any merge).

---

## Self-Review

- **Spec coverage:** §1a principles → registry (Phase B) + independent sections (C–G) + no-fixed-height (B/H) + exec-experience (section semantics). §2 data decisions → Task A1 helpers + Phase D/E. §3 reuse map → Phases C–G reuse named components. §4 layout → Phase B grid. §5 phases → Phases A–H. All covered.
- **Placeholder scan:** Phase A tasks contain full code; Phases B–H are described at task granularity with exact files, props interfaces, and gates (detailed code to be written at execution time per phase, consistent with per-phase user-gated flow). No "TBD"/"add error handling" hand-waves.
- **Type consistency:** `CommandData`, `DashboardSection`, `DecisionCenterData`, `RevenueSlice`, `computeCashFlow`, `buildRevenueDistribution` names are consistent across hook, shell, and sections. Types mirror the real backend `/executive/decision-center` output verified in `dashboard.service.ts` and `ExecutiveDecisionCenter.tsx`.
