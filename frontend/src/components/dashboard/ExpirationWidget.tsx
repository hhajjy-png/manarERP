import { useEffect, useState } from 'react';
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
    { label: 'منتهية',    count: data.expired, color: '#EF4444' },
    { label: '≤ 7 أيام', count: data.days7,   color: '#F97316' },
    { label: '≤ 30 يوم', count: data.days30,  color: '#F59E0B' },
    { label: '≤ 90 يوم', count: data.days90,  color: '#3B82F6' },
  ].filter(i => i.count > 0);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ fontSize: 14 }}>وثائق تنتهي قريبًا</strong>
        <Link to="/expirations" style={{ fontSize: 12 }}>عرض الكل</Link>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {items.map(item => (
          <div
            key={item.label}
            style={{
              background: item.color + '18',
              border: `1px solid ${item.color}40`,
              borderRadius: 8,
              padding: '6px 14px',
              textAlign: 'center',
              minWidth: 70,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.count}</div>
            <div style={{ fontSize: 11, color: 'var(--db-muted)' }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
