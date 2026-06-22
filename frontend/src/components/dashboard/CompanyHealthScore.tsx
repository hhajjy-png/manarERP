interface HealthScoreData {
  total: number;
  label: 'EXCELLENT' | 'GOOD' | 'WATCH' | 'RISK';
  labelAr: string;
  explanation: string;
  components: {
    collections: number;
    profitability: number;
    outstanding: number;
    cashFlow: number;
    contracts: number;
    stability: number;
  };
}

const LABEL_COLOR: Record<string, string> = {
  EXCELLENT: '#10B981',
  GOOD:      '#3B82F6',
  WATCH:     '#F59E0B',
  RISK:      '#EF4444',
};

const COMPONENT_LABELS: Record<string, { label: string; max: number }> = {
  collections:   { label: 'التحصيلات',    max: 20 },
  profitability: { label: 'الربحية',       max: 20 },
  outstanding:   { label: 'الذمم',         max: 20 },
  cashFlow:      { label: 'التدفق النقدي', max: 20 },
  contracts:     { label: 'العقود',        max: 10 },
  stability:     { label: 'الاستقرار',     max: 10 },
};

interface Props { data: HealthScoreData }

export default function CompanyHealthScore({ data }: Props) {
  const color = LABEL_COLOR[data.label] ?? '#9CA3AF';
  const pct = Math.min(100, Math.max(0, data.total));

  return (
    <div style={{ background: 'var(--db-card)', borderRadius: 'var(--db-radius)', padding: '20px', border: '1px solid var(--db-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--db-text)' }}>🏥 مؤشر صحة الشركة</h3>
        <span style={{
          background: `${color}22`, color, padding: '3px 12px',
          borderRadius: 20, fontSize: 13, fontWeight: 700, border: `1px solid ${color}55`,
        }}>{data.labelAr}</span>
      </div>

      {/* Score ring */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width={120} height={120} viewBox="0 0 120 120">
            <circle cx={60} cy={60} r={50} fill="none" stroke="var(--db-border)" strokeWidth={12} />
            <circle
              cx={60} cy={60} r={50} fill="none" stroke={color} strokeWidth={12}
              strokeDasharray={`${2 * Math.PI * 50}`}
              strokeDashoffset={`${2 * Math.PI * 50 * (1 - pct / 100)}`}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{data.total}</div>
            <div style={{ fontSize: 11, color: 'var(--db-muted)' }}>/ 100</div>
          </div>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--db-muted)', maxWidth: 280, marginInline: 'auto' }}>
          {data.explanation}
        </p>
      </div>

      {/* Component bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(data.components).map(([key, score]) => {
          const meta = COMPONENT_LABELS[key];
          if (!meta) return null;
          const barPct = (score / meta.max) * 100;
          const barColor = barPct >= 75 ? '#10B981' : barPct >= 50 ? '#3B82F6' : barPct >= 30 ? '#F59E0B' : '#EF4444';
          return (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: 'var(--db-muted)' }}>{meta.label}</span>
                <span style={{ color: 'var(--db-text)', fontWeight: 600 }}>{score} / {meta.max}</span>
              </div>
              <div style={{ height: 6, background: 'var(--db-border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${barPct}%`, background: barColor, borderRadius: 3, transition: 'width 0.5s ease' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
