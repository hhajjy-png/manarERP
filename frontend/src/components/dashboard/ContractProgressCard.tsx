import { money } from '../../config/modules';
import { ListSkeletons } from './Skeleton';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calcProgress(c: any): number {
  const start = c.startDate ? new Date(c.startDate).getTime() : null;
  const end   = c.endDate   ? new Date(c.endDate).getTime()   : null;
  if (!start || !end || end <= start) return 0;
  const pct = ((Date.now() - start) / (end - start)) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

function progressColor(pct: number, status: string): string {
  if (status === 'EXPIRED' || status === 'SUSPENDED') return 'red';
  if (pct >= 85) return 'amber';
  return 'green';
}

const STATUS_MAP: Record<string, [string, string]> = {
  ACTIVE:    ['ساري',        'green'],
  EXPIRED:   ['منتهٍ',       'gray'],
  RENEWING:  ['قيد التجديد', 'amber'],
  SUSPENDED: ['موقوف',       'red'],
};

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contracts: any[];
  loading: boolean;
}

export default function ContractProgressList({ contracts, loading }: Props) {
  if (loading) return <ListSkeletons count={4} />;

  if (!contracts.length) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">📄</div>
        <div className="db-empty-text">لا توجد عقود نشطة</div>
      </div>
    );
  }

  return (
    <div className="db-contract-list">
      {contracts.map((c, i) => {
        const pct = calcProgress(c);
        const color = progressColor(pct, c.status);
        const [statusLabel, statusCls] = STATUS_MAP[c.status] ?? [c.status, 'gray'];
        const hasProgress = c.startDate && c.endDate;

        const pctColor =
          color === 'green' ? '#10B981' :
          color === 'amber' ? '#F59E0B' : '#EF4444';

        return (
          <div key={i} className="db-contract-item">
            <div className="db-contract-top">
              <div style={{ minWidth: 0 }}>
                <div className="db-contract-name">
                  {c.asphaltPlant || c.code}
                </div>
                {c.location && (
                  <div className="db-contract-client">{c.location}</div>
                )}
              </div>
              <span className={`db-pill ${statusCls}`}>{statusLabel}</span>
            </div>

            <div className="db-contract-footer">
              <span className="db-contract-meta">
                {c.monthlyTransportValue
                  ? `${money(c.monthlyTransportValue)} / شهر`
                  : c.code}
              </span>
              {hasProgress && (
                <span className="db-contract-pct" style={{ color: pctColor }}>
                  {pct}%
                </span>
              )}
            </div>

            {hasProgress && (
              <div className="db-progress">
                <div
                  className={`db-progress-bar ${color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
