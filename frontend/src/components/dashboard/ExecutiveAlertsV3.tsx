import { formatCurrency } from '../../lib/format';
import { MoneyText } from '../../config/modules';
import { useT } from '../../lib/i18n';

export interface AlertV3 {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  type: string;
  title: string;
  description: string;
  amount: number | null;
  relatedId?: number;
  relatedType?: string;
  actionLabel: string;
}

const SEV_COLOR = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#9CA3AF' };
const SEV_BG    = { HIGH: 'rgba(239,68,68,0.08)', MEDIUM: 'rgba(245,158,11,0.08)', LOW: 'rgba(156,163,175,0.06)' };
const SEV_LABEL_KEY = { HIGH: 'intelv2.sev.high', MEDIUM: 'intelv2.sev.medium', LOW: 'intelv2.sev.low' };
const SEV_ICON  = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🔵' };

interface Props { alerts: AlertV3[]; maxVisible?: number }

export default function ExecutiveAlertsV3({ alerts, maxVisible = 12 }: Props) {
  const { t } = useT();
  const visible = alerts.slice(0, maxVisible);
  const highCount = alerts.filter(a => a.severity === 'HIGH').length;
  const medCount  = alerts.filter(a => a.severity === 'MEDIUM').length;

  if (alerts.length === 0) {
    return (
      <div style={{ background: 'var(--db-card)', borderRadius: 'var(--db-radius)', padding: '20px', border: '1px solid var(--db-border)' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--db-text)' }}>🔔 {t('alertsv3.title')}</h3>
        <div style={{ color: '#10B981', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          ✅ {t('alertsv3.empty')}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--db-card)', borderRadius: 'var(--db-radius)', padding: '20px', border: '1px solid var(--db-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--db-text)' }}>🔔 {t('alertsv3.title')}</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {highCount > 0 && (
            <span style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
              {t('alertsv3.high_count', { count: highCount })}
            </span>
          )}
          {medCount > 0 && (
            <span style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
              {t('alertsv3.medium_count', { count: medCount })}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(alert => {
          const color = SEV_COLOR[alert.severity];
          const bg    = SEV_BG[alert.severity];
          return (
            <div key={alert.id} style={{
              background: bg, border: `1px solid ${color}33`,
              borderRadius: 8, padding: '10px 14px',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <span style={{ fontSize: 14, lineHeight: '20px', flexShrink: 0 }}>{SEV_ICON[alert.severity]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--db-text)' }}>{alert.title}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color,
                    background: `${color}22`, padding: '1px 7px', borderRadius: 10,
                  }}>{t(SEV_LABEL_KEY[alert.severity])}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--db-muted)', marginTop: 2 }}>{alert.description}</div>
                {alert.amount != null && (
                  <div style={{ fontSize: 11, color, fontWeight: 700, marginTop: 3 }}>
                    <span className="money-cell">{<MoneyText value={alert.amount} />}</span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#60A5FA', marginTop: 4 }}>→ {alert.actionLabel}</div>
              </div>
            </div>
          );
        })}
      </div>

      {alerts.length > maxVisible && (
        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: 'var(--db-muted)' }}>
          {t('alertsv3.more_alerts', { count: alerts.length - maxVisible })}
        </div>
      )}
    </div>
  );
}
