import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useT } from '../../lib/i18n';

interface Summary {
  expired: number;
  days7:   number;
  days30:  number;
  days60:  number;
  days90:  number;
  total:   number;
}

export default function ExpirationWidget() {
  const { t } = useT();
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
    { label: t('decx.filter.expired'),    count: data.expired, color: 'var(--db-red)' },
    { label: t('expwidget.le_7'), count: data.days7,   color: 'var(--db-orange, #f97316)' },
    { label: t('expwidget.le_30'), count: data.days30,  color: 'var(--db-amber)' },
    { label: t('expwidget.le_90'), count: data.days90,  color: 'var(--db-blue)' },
  ].filter(i => i.count > 0);

  return (
    <div className="db-card db-exp-widget">
      <div className="db-exp-widget-head">
        <strong className="db-exp-widget-title">{t('expwidget.title')}</strong>
        <Link to="/expirations" className="db-exp-widget-link">{t('page.dashboard.view_all')}</Link>
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
