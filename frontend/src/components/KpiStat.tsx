import type { ReactNode } from 'react';
import './KpiStat.css';

// ─────────────────────────────────────────────────────────────────────────
//  KpiStat — the Bank Account Explorer KPI card, promoted to a small shared
//  component so a fixed set of modules (currently Invoices + Expenses) can
//  adopt the exact same visual baseline. The card box, icon, typography, and
//  responsive grid replicate `.bae-kpi-card` / `.bae-kpi-grid--secondary`
//  one-to-one (see KpiStat.css). The currency label is rendered INLINE beside
//  the amount via the optional `unit` slot ("17,097.620 KWD"), never stacked.
//
//  Scope is opt-in per page via <KpiStatGrid>; it does NOT touch the shared
//  ExplorerKit MetricCard, so no other module is affected.
// ─────────────────────────────────────────────────────────────────────────

export type KpiStatTone = 'green' | 'red' | 'blue' | 'orange' | 'indigo';

export function KpiStat({
  label, value, unit, icon, tone, sub,
}: {
  label: string;
  value: string;
  /** Currency/unit label shown inline beside the value (e.g. "KWD"). */
  unit?: string;
  icon: string;
  tone?: KpiStatTone;
  sub?: ReactNode;
}) {
  const cls = ['kpistat-card', tone ? `kpistat-card--${tone}` : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="kpistat-head">
        <span className="kpistat-label">{label}</span>
        <span className="kpistat-icon">
          <span className="material-symbols-outlined">{icon}</span>
        </span>
      </div>
      <span className="kpistat-value">
        {value}{unit && <span className="kpistat-unit">{unit}</span>}
      </span>
      {sub != null && <span className="kpistat-sub">{sub}</span>}
    </div>
  );
}

/** Responsive grid wrapper — mirrors `.bae-kpi-grid--secondary`. */
export function KpiStatGrid({ children }: { children: ReactNode }) {
  return <div className="kpistat-grid">{children}</div>;
}
