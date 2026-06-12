import { Skeleton } from './Skeleton';
import { useT } from '../../lib/i18n';

export interface DashAlert {
  title: string;
  desc: string;
  status: 'red' | 'amber' | 'blue';
  icon: string;
}

interface Props {
  alerts: DashAlert[];
  loading: boolean;
}

export default function AlertPanel({ alerts, loading }: Props) {
  const { t } = useT();
  if (loading) {
    return (
      <div className="db-alert-list">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="db-alert-item priority-amber">
            <Skeleton height={36} width="36px" style={{ borderRadius: 10, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Skeleton height={13} width="50%" style={{ marginBottom: 6 }} />
              <Skeleton height={11} width="75%" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!alerts.length) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">✅</div>
        <div className="db-empty-text">{t('empty.no_alerts')}</div>
      </div>
    );
  }

  return (
    <div className="db-alert-list">
      {alerts.map((a, i) => (
        <div key={i} className={`db-alert-item priority-${a.status}`}>
          <div className="db-alert-icon">{a.icon}</div>
          <div style={{ minWidth: 0 }}>
            <div className="db-alert-title">{a.title}</div>
            <div className="db-alert-desc">{a.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
