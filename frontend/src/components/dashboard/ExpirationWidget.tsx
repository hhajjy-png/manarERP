import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

interface Summary {
  expired: number;
  days7:   number;
  days30:  number;
  days60:  number;
  days90:  number;
  total:   number;
}

export default function ExpirationWidget() {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    api
      .get<{ data: Summary }>('/expirations/summary')
      .then(r => setData(r.data.data))
      .catch(() => {});
  }, []);

  if (!data) return null;
  if (data.total === 0) return null; // hide widget when nothing is urgent

  const items = [
    { label: 'منتهية',    count: data.expired, color: 'var(--db-red)' },
    { label: '≤ 7 أيام', count: data.days7,   color: 'var(--db-orange, #f97316)' },
    { label: '≤ 30 يوم', count: data.days30,  color: 'var(--db-amber)' },
    { label: '≤ 90 يوم', count: data.days90,  color: 'var(--db-blue)' },
  ].filter(i => i.count > 0);

  return (
    <div className="db-card db-exp-widget">
      <div className="db-exp-widget-head">
        <strong className="db-exp-widget-title">وثائق تنتهي قريبًا</strong>
        <Link to="/expirations" className="db-exp-widget-link">عرض الكل</Link>
      </div>
      <div className="db-exp-chips">
        {items.map(item => (
          <div
            key={item.label}
            className="db-exp-chip"
            style={{ '--chip': item.color } as CSSProperties}
          >
            <div className="db-exp-chip-val">{item.count}</div>
            <div className="db-exp-chip-label">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
