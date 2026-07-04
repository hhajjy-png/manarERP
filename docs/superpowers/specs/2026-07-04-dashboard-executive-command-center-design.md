# Design Spec — Executive Command Center (Home Dashboard Redesign)

**Date:** 2026-07-04
**Scope:** Frontend-only visual/layout redesign of the General tab of the Home dashboard (`frontend/src/pages/Dashboard.tsx` → `GeneralDashboardContent`) to match the provided reference image (~95–100% visual match) while preserving 100% of existing functionality.
**Mode:** Feature (per CLAUDE.md development workflow).

---

## 1. Hard Constraints (non-negotiable)

- **NO** backend / Prisma / API / migration changes.
- **NO** changes to financial calculations, business logic, or permissions.
- **NO** fake/placeholder data — every value renders from a real existing endpoint or an honest derivation of real fields.
- **NO** renaming existing components without a concrete reason.
- **Preserve:** routing, React architecture, state management, existing APIs, localization (Arabic-first/RTL), dark/light mode, ExplorerKit tokens, and the `عام`/`مالي` tab bar.
- Only the **General** tab is redesigned. The **Financial** tab (`FinancialDashboardTab`, permission-gated) is untouched.

---

## 1a. Architecture & Extensibility Principles (approved 2026-07-04 addendum)

These are first-class design requirements, not nice-to-haves. Where a pixel-match to the
reference image conflicts with any of these, **these win**.

1. **Content-driven, not image-driven.** The reference image is a visual *reference* only.
   The layout is built as a flexible section grid so new widgets can be added later **without
   re-architecting the page**. No hard-coded absolute positions; sections flow in a
   responsive grid/stack.

2. **Independent components.** Every widget/section is a self-contained React component with
   a well-defined props interface. **No widget imports or depends on another widget's internals
   or state.** Each receives its data via props and renders independently (own skeleton/empty
   state). `Dashboard.tsx` / `GeneralDashboardContent` becomes a **composition layer only** —
   it fetches data and arranges components; it holds no widget-specific rendering logic inline.

3. **No fixed heights.** Use `auto`, `min-height`, and responsive layouts so cards grow with
   their content. Fixed heights only where genuinely unavoidable (e.g. chart canvas), and even
   then via `min-height` where possible.

4. **Reorder/hide/show ready.** Each major section is rendered from a **section list/registry**
   (`{ id, title, permission?, render() }[]`) that the composition layer maps over. This makes
   future hide / show / reorder (Dashboard Personalization) a data change, not an architectural
   one. Phase 1 renders the list in a fixed order; the registry shape is what enables later
   personalization without rework.

5. **Executive Command Center is the real goal.** Each section must answer at least one of:
   *What is happening now? · Why is it happening? · What needs my attention? · What is the next
   action?* If matching the image degrades the executive's ability to answer these, favor the
   executive experience.

---

## 2. Data Sources (all existing — no new permissions; `dashboard.read` covers all)

| Widget | Endpoint | Field(s) |
|---|---|---|
| Health gauge + reasons | `GET /executive/decision-center` | `healthScore {total,label,labelAr,explanation,components}` |
| KPI row + monthly trend % | `GET /executive/decision-center` | `financialSummary {totalRevenue,totalExpenses,netProfit,totalCollected,totalOutstanding,monthOnMonthChanges,thisMonth,lastMonth,topCustomersByRevenue}` |
| Action Center (احتاج إجراء الآن) | `GET /executive/decision-center` | `decisionCards[]` |
| Financial performance chart (6m) | `GET /dashboard/executive` | `trend[] {label,revenue,expense}` |
| Recent Activity feed | `GET /dashboard/activity?limit=8` | auditLog rows `{action,createdAt,user.fullName,...}` |
| Smart Recommendations | `GET /executive/decision-center` | `recommendations[]` |
| Operational summary + attendance | `GET /dashboard/executive` | `kpis`, `attendance` |
| (Existing lower panels) | current calls unchanged | `/dashboard/operational`, `/dashboard/executive-financial-v2`, `/dashboard/executive-intelligence-v2`, `/equipment/expiring`, `/employees/expiring-documents` |

### Locked data decisions (approved 2026-07-04)
1. **Revenue-distribution donut** → real **revenue by customer** from `financialSummary.topCustomersByRevenue` (top N + aggregated "أخرى"). No synthetic "source category".
2. **Cash-Flow KPI** → honest derivation **`thisMonth.collections − thisMonth.expenses`** (both real `financialSummary.thisMonth` fields). Labeled التدفق النقدي (صافي الشهر).
3. **Existing rich panels** → **kept in full**, re-ordered below the new Command Center. Nothing removed; no functionality lost.

---

## 3. Component Reuse Map

| Reference section | Reused component | Change |
|---|---|---|
| حالة الشركة اليوم (gauge + reasons) | `CompanyHealthScore.tsx` | add a "reasons checklist" presentation variant (derive ✓/⚠ rows from `healthScore.components` + `financialSummary`); keep ring |
| المؤشرات المالية الرئيسية (KPIs) | `KPICard.tsx` | add optional trend badge (arrow + % from `monthOnMonthChanges`) |
| احتاج إجراء الآن | `ExecutiveDecisionCards.tsx` | list/compact styling variant with action buttons |
| الأداء المالي (6 أشهر) | `RevenueChart.tsx` | upgrade `BarChart` → `ComposedChart` (bars + line), Recharts already used |
| توزيع الإيرادات | pattern from `ContractStatusChart.tsx` (Recharts Pie) | new small donut fed by real customer-revenue data |
| كل الإجراءات (quick actions) | existing `.db-action-btn` + `navigate` + `hasPermission` | icon-tile styling |
| إجراءات سريعة (recent activity) | — | new small `RecentActivityFeed.tsx` from `/dashboard/activity` |
| التوصيات الذكية | `ExecutiveRecommendationsPanel.tsx` | card styling variant matching reference |

New components introduced: `RecentActivityFeed.tsx` (small, presentational). Everything else is reuse/restyle.

---

## 4. Layout (RTL, desktop-first)

Command Center grid at top, then existing panels below:

```
┌───────────────────────── Page title: لوحة التحكم / نظرة عامة ─────────────────────────┐
│ RIGHT COLUMN (~28%)          │ MAIN AREA (~72%)                                       │
│ ┌ حالة الشركة اليوم ┐        │ ┌ المؤشرات المالية الرئيسية (4 KPI cards + trend) ┐    │
│ │ gauge 87/100      │        │ └──────────────────────────────────────────────┘    │
│ │ أسباب التقييم      │        │ ┌ الأداء المالي (combo) ┐ ┌ توزيع الإيرادات (donut) ┐ │
│ ├ احتاج إجراء الآن  ┤        │ └──────────────────────┘ └────────────────────────┘  │
│ │ decision cards    │        │ ┌ كل الإجراءات (quick action tiles) ──────────────┐  │
│ └───────────────────┘        │ ┌ إجراءات سريعة (recent activity feed) ───────────┐  │
│                              │ ┌ التوصيات الذكية (recommendation cards) ─────────┐  │
└──────────────────────────────┴────────────────────────────────────────────────────┘
── below: existing operational stats, alerts, contracts/invoices/expenses tables, V2 panels (reordered, unchanged) ──
```

- 8px spacing system; card radius ~16px; soft shadows; green primary; generous whitespace.
- Responsive breakpoints verified at **1920×1080, 1600×900, 1366×768** (grid collapses right column under main below ~1200px).
- All colors via existing CSS tokens (`--db-card`, `--db-border`, `--db-radius`, `--text`, etc.) so dark mode is automatic.
- **Composition model:** the grid is driven by a **section registry** — the composition layer
  maps over `sections: { id, title?, permission?, node }[]` and places each into a CSS grid
  area / flow slot. Adding a widget later = pushing one entry. No fixed heights: sections use
  `min-height`/`auto` and grow with content.

---

## 5. Implementation Phases (each ends with a gate; stop for review between phases)

- **Phase A — Data layer (no UI):** add `/executive/decision-center` + `/dashboard/activity` to the parallel fetch in `GeneralDashboardContent` with isolated failure (must not break the board); type the responses; `useMemo` derived cash-flow + donut data. Gate: `tsc` + `build:front`.
- **Phase B — Layout shell + section registry + CSS grid** in `dashboard.css` (tokens + dark mode + 1920/1600/1366). Establish the `sections[]` registry composition pattern (id/title/permission/node) and the responsive grid with `min-height`/`auto` (no fixed heights). Gate: `build:front`.
- **Phase C — Hero title + Health gauge column** (reuse `CompanyHealthScore` + reasons variant). Gate: `tsc` + `build:front`.
- **Phase D — KPI row** (reuse `KPICard` + trend badges; includes derived Cash-Flow KPI). Gate: `tsc` + `build:front`.
- **Phase E — Financial analytics** (combo chart upgrade + real revenue-by-customer donut). Gate: `tsc` + `build:front`.
- **Phase F — Action Center + Quick Actions + Recent Activity** (`ExecutiveDecisionCards` restyle + tiles + new `RecentActivityFeed`). Gate: `tsc` + `build:front`.
- **Phase G — Recommendations + preserve rich panels** (`ExecutiveRecommendationsPanel` restyle; re-order all existing panels below, unchanged). Gate: `tsc` + `build:front` + backend/frontend `tests` if any dashboard test is affected.
- **Phase H — Responsive + polish** (dark mode, a11y roles/aria/keyboard, memoization, no extra re-renders; confirm every section is an independent component driven by the registry and free of fixed heights). Final gate: `tsc` (frontend + electron) + `build:front` + full test suite.

---

## 6. Out of Scope
- App topbar/sidebar in the reference (that is `Layout.tsx`, already implemented — not part of the dashboard body).
- Financial tab redesign.
- Any backend aggregation for a true "revenue source" taxonomy (would require schema/API work — deferred).

---

## 7. Risks & Mitigations
- **`/executive/decision-center` latency/failure** → fetched in parallel with isolated `.catch(() => null)`; Command Center degrades gracefully (skeletons/empty states), main board still renders.
- **Reference has data the DB lacks (revenue source)** → resolved via approved real-data substitution (customer revenue).
- **Page length growth** → mitigated by clean sectioning; lower panels retained per approval but visually calmer.
- **Regression risk** → existing components reused (not rewritten); Gemini review mandatory before merge (Feature mode).
