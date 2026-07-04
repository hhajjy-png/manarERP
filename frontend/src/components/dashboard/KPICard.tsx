import { ReactNode } from 'react';

interface KPICardProps {
  label: string;
  value: ReactNode;
  icon: string;
  color: 'green' | 'red' | 'blue' | 'amber';
  badge?: { dir: 'up' | 'down'; text: string };
  /**
   * Invert only the badge COLOUR (not the arrow) for cost-type metrics where an
   * increase is negative — e.g. expenses rising should read red, not green.
   */
  badgeInvert?: boolean;
  sub?: string;
}

export default function KPICard({ label, value, icon, color, badge, badgeInvert, sub }: KPICardProps) {
  // Arrow always reflects the real direction; colour class flips when badgeInvert is set.
  const toneClass = badge ? (badgeInvert ? (badge.dir === 'up' ? 'down' : 'up') : badge.dir) : '';
  return (
    <div className={`db-kpi c-${color}`}>
      <div className="db-kpi-top">
        <div className="db-kpi-icon">{icon}</div>
        {badge && (
          <span className={`db-kpi-badge ${toneClass}`}>
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
