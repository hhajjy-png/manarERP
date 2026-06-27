import { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;
  icon: string;
  color: string;
  bg: string;
  sub?: string;
  dir?: 'up' | 'down' | '';
}

export default function StatCard({ label, value, icon, color, bg, sub, dir = '' }: Props) {
  return (
    <div className="card stat">
      <div className="si" style={{ background: bg, color }}>{icon}</div>
      <div>
        <div className="lbl">{label}</div>
        <div className="val">{value}</div>
        {sub && <div className={`sub ${dir}`}>{dir === 'up' ? '↗ ' : dir === 'down' ? '↘ ' : ''}{sub}</div>}
      </div>
    </div>
  );
}
