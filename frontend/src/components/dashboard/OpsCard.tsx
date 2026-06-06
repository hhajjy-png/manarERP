interface OpsCardProps {
  label: string;
  value: string | number;
  icon: string;
  iconBg: string;
  sub?: string;
}

export default function OpsCard({ label, value, icon, iconBg, sub }: OpsCardProps) {
  return (
    <div className="db-stat">
      <div className="db-stat-icon" style={{ background: iconBg }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="db-stat-label">{label}</div>
        <div className="db-stat-val">{value}</div>
        {sub && <div className="db-stat-sub">{sub}</div>}
      </div>
    </div>
  );
}
