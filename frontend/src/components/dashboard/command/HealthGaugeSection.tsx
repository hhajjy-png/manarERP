import { Skeleton } from '../Skeleton';
import type { HealthScoreData } from './types';

// Ring colour per health band (matches CompanyHealthScore for visual consistency).
const LABEL_COLOR: Record<HealthScoreData['label'], string> = {
  EXCELLENT: '#10B981',
  GOOD: '#3B82F6',
  WATCH: '#F59E0B',
  RISK: '#EF4444',
};

// Maximum points per component in the backend's rule-based composite
// (see backend _computeHealthScore: 20/20/20/20/10/10 → total 100).
const COMPONENT_MAX: Record<keyof HealthScoreData['components'], number> = {
  collections: 20,
  profitability: 20,
  outstanding: 20,
  cashFlow: 20,
  contracts: 10,
  stability: 10,
};

// Plain-language reading of each real component score (good vs weak).
const COMPONENT_META: Record<keyof HealthScoreData['components'], { good: string; bad: string }> = {
  cashFlow:      { good: 'تدفق نقدي إيجابي هذا الشهر',   bad: 'ضغط على التدفق النقدي هذا الشهر' },
  profitability: { good: 'ربحية صحية',                    bad: 'الربحية ضعيفة أو سالبة' },
  collections:   { good: 'تحصيل جيد من العملاء',          bad: 'التحصيل من العملاء منخفض' },
  outstanding:   { good: 'الذمم المستحقة تحت السيطرة',    bad: 'ذمم مستحقة مرتفعة مقارنة بالإيرادات' },
  contracts:     { good: 'محفظة العقود سليمة',            bad: 'عقود خاسرة تحتاج مراجعة' },
  stability:     { good: 'أداء مستقر شهرياً',             bad: 'تذبذب في الأداء الشهري' },
};

// Order used to break ties when surfacing the single most important risk
// (earlier = more urgent for an executive: liquidity → profit → collection → …).
const RISK_ORDER: (keyof HealthScoreData['components'])[] = [
  'cashFlow', 'profitability', 'collections', 'outstanding', 'contracts', 'stability',
];

// A component counts as a strength when it earns ≥ 60% of its possible points.
const OK_RATIO = 0.6;

interface Reason {
  key: keyof HealthScoreData['components'];
  ratio: number;
  ok: boolean;
  label: string;
}

/**
 * "حالة الشركة اليوم" — company health gauge.
 *
 * Answers three executive questions from REAL data only (decisionCenter.healthScore,
 * which is the backend's rule-based composite — no fabricated numbers):
 *   • هل الوضع جيد؟  → the 0–100 score + Arabic band label + ring colour.
 *   • لماذا؟         → an explanation line + a ✓/⚠ checklist derived from each real
 *                      component score (ratio = score / max; ✓ when ratio ≥ 0.6).
 *   • أهم سبب خطر؟   → the weakest component (min ratio; ties broken by RISK_ORDER),
 *                      surfaced as a single highlighted line — or "لا مخاطر جوهرية".
 */
export default function HealthGaugeSection({
  health,
  loading,
}: {
  health: HealthScoreData | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="db-hg">
        <Skeleton height={132} width="132px" style={{ borderRadius: '50%', margin: '0 auto' }} />
        <Skeleton height={14} width="70%" style={{ margin: '14px auto 0' }} />
        <div className="db-hg-reasons">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={20} style={{ borderRadius: 6 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">🩺</div>
        <div className="db-empty-text">لا تتوفر بيانات صحة الشركة حالياً</div>
      </div>
    );
  }

  const color = LABEL_COLOR[health.label] ?? '#9CA3AF';
  const pct = Math.min(100, Math.max(0, health.total));
  const R = 56;
  const circumference = 2 * Math.PI * R;

  // ── Reasons: one row per real component; strength when it earns ≥60% of its max ──
  const keys = Object.keys(COMPONENT_MAX) as (keyof HealthScoreData['components'])[];
  const reasons: Reason[] = keys.map((k) => {
    const ratio = (health.components[k] ?? 0) / COMPONENT_MAX[k];
    const ok = ratio >= OK_RATIO;
    return { key: k, ratio, ok, label: ok ? COMPONENT_META[k].good : COMPONENT_META[k].bad };
  });

  // ── Top risk: the weakest failing component (lowest ratio; ties → RISK_ORDER) ──
  const topRisk = reasons
    .filter((r) => !r.ok)
    .sort((a, b) => a.ratio - b.ratio || RISK_ORDER.indexOf(a.key) - RISK_ORDER.indexOf(b.key))[0];

  return (
    <div className="db-hg">
      {/* Q1 — is the company doing well? score + band label + colour */}
      <div className="db-hg-top">
        <div className="db-hg-ring" style={{ ['--hg-color' as string]: color }}>
          <svg width={132} height={132} viewBox="0 0 132 132" aria-hidden="true">
            <circle cx={66} cy={66} r={R} fill="none" stroke="var(--db-border)" strokeWidth={12} />
            <circle
              cx={66} cy={66} r={R} fill="none" stroke={color} strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - pct / 100)}
              transform="rotate(-90 66 66)"
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          <div className="db-hg-ring-center">
            <div className="db-hg-score" style={{ color }}>{health.total}</div>
            <div className="db-hg-outof">/ 100</div>
          </div>
        </div>
        <span className="db-hg-badge" style={{ color, background: `${color}1f`, borderColor: `${color}55` }}>
          {health.labelAr}
        </span>
        {/* Q2 (part 1) — why: one-line explanation */}
        <p className="db-hg-explain">{health.explanation}</p>
      </div>

      {/* Q2 (part 2) — why: reasons checklist from real component scores */}
      <div className="db-hg-reasons">
        {reasons.map((r) => (
          <div key={r.key} className={`db-hg-reason ${r.ok ? 'ok' : 'warn'}`}>
            <span className="db-hg-reason-icon">{r.ok ? '✓' : '⚠'}</span>
            <span className="db-hg-reason-label">{r.label}</span>
          </div>
        ))}
      </div>

      {/* Q3 — the single most important risk (or all-clear) */}
      <div className={`db-hg-risk ${topRisk ? 'has-risk' : 'clear'}`}>
        {topRisk ? (
          <>
            <span className="db-hg-risk-tag">أهم ما يحتاج انتباهك</span>
            <span className="db-hg-risk-text">{COMPONENT_META[topRisk.key].bad}</span>
          </>
        ) : (
          <>
            <span className="db-hg-risk-tag ok">جيد</span>
            <span className="db-hg-risk-text">لا مخاطر جوهرية على المؤشرات الحالية</span>
          </>
        )}
      </div>
    </div>
  );
}
