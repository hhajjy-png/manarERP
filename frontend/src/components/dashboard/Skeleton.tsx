interface SkeletonProps {
  height?: number | string;
  width?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ height = 18, width = '100%', style }: SkeletonProps) {
  return <span className="db-skeleton" style={{ height, width, ...style }} />;
}

/** Full KPI row skeleton — 4 cards */
export function KPISkeletons() {
  return (
    <div className="db-kpi-grid" style={{ marginBottom: 16 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="db-kpi" style={{ gap: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Skeleton height={46} width="46px" style={{ borderRadius: 13 }} />
            <Skeleton height={22} width="58px" style={{ borderRadius: 20 }} />
          </div>
          <Skeleton height={13} width="55%" style={{ marginBottom: 8 }} />
          <Skeleton height={28} width="80%" />
        </div>
      ))}
    </div>
  );
}

/** Operational stats row skeleton — 3 cards */
export function StatsSkeletons() {
  return (
    <div className="db-stats-grid" style={{ marginBottom: 22 }}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="db-stat">
          <Skeleton height={52} width="52px" style={{ borderRadius: 14, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Skeleton height={13} width="60%" style={{ marginBottom: 8 }} />
            <Skeleton height={28} width="40%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Generic card body skeleton rows */
export function TableRowSkeletons({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <Skeleton height={14} width={j === 0 ? '80px' : '100%'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Generic list item skeletons (contracts / alerts) */
export function ListSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'rgba(255,255,255,0.035)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '13px 15px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <Skeleton height={14} width="160px" style={{ marginBottom: 6 }} />
              <Skeleton height={11} width="100px" />
            </div>
            <Skeleton height={22} width="58px" style={{ borderRadius: 20 }} />
          </div>
          <Skeleton height={5} style={{ borderRadius: 999 }} />
        </div>
      ))}
    </div>
  );
}
