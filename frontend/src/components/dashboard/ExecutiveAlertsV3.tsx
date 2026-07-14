import { formatCurrency } from '../../lib/format';
import { MoneyText } from '../../config/modules';

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
const SEV_LABEL = { HIGH: 'عالٍ', MEDIUM: 'متوسط', LOW: 'منخفض' };
const SEV_ICON  = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🔵' };

interface Props { alerts: AlertV3[]; maxVisible?: number }

export default function ExecutiveAlertsV3({ alerts, maxVisible = 12 }: Props) {
  const visible = alerts.slice(0, maxVisible);
  const highCount = alerts.filter(a => a.severity === 'HIGH').length;
  const medCount  = alerts.filter(a => a.severity === 'MEDIUM').length;

  if (alerts.length === 0) {
    return (
      <div style={{ background: 'var(--db-card)', borderRadius: 'var(--db-radius)', padding: '20px', border: '1px solid var(--db-border)' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--db-text)' }}>🔔 التنبيهات التنفيذية V3</h3>
        <div style={{ color: '#10B981', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          ✅ لا توجد تنبيهات نشطة — الوضع سليم
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--db-card)', borderRadius: 'var(--db-radius)', padding: '20px', border: '1px solid var(--db-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--db-text)' }}>🔔 التنبيهات التنفيذية V3</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {highCount > 0 && (
            <span style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
              {highCount} عالية
            </span>
          )}
          {medCount > 0 && (
            <span style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
              {medCount} متوسطة
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
                  }}>{SEV_LABEL[alert.severity]}</span>
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
          + {alerts.length - maxVisible} تنبيهات إضافية
        </div>
      )}
    </div>
  );
}
