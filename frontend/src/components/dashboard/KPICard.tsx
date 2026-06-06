interface KPICardProps {
  label: string;
  value: string;
  icon: string;
  color: 'green' | 'red' | 'blue' | 'amber';
  badge?: { dir: 'up' | 'down'; text: string };
  sub?: string;
}

export default function KPICard({ label, value, icon, color, badge, sub }: KPICardProps) {
  return (
    <div className={`db-kpi c-${color}`}>
      <div className="db-kpi-top">
        <div className="db-kpi-icon">{icon}</div>
        {badge && (
          <span className={`db-kpi-badge ${badge.dir}`}>
            {badge.dir === 'up' ? '↑' : '↓'} {badge.text}
          </span>
        )}
      </div>
      <div>
        <div className="db-kpi-label">{label}</div>
        <div className="db-kpi-val">{value}</div>
        {sub && <div className="db-kpi-sub">{sub}</div>}
      </div>
    </div>
  );
}
