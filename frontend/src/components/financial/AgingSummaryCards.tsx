import type { FinancialSummary } from '../../types/financial.types';
import PrivateAmount from '../PrivateAmount';

interface Props { summary: FinancialSummary; type: 'ar' | 'ap'; }

function fmt(n?: number) {
  if (n === undefined || n === null) return '0.000';
  return n.toLocaleString('ar-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function AgingSummaryCards({ summary, type }: Props) {
  const label = type === 'ar' ? 'ذمم العملاء' : 'ذمم الموردين';
  return (
    <div className="financial-summary-cards aging-summary-cards">
      <div className="summary-card blue">
        <div className="card-label">إجمالي {label}</div>
        <div className="card-value">
          <PrivateAmount value={summary.totalOutstanding ?? 0} />
        </div>
      </div>
      <div className="summary-card red">
        <div className="card-label">حرج (+90 يوم)</div>
        <div className="card-value">
          <PrivateAmount value={summary.criticalOver90 ?? 0} />
        </div>
      </div>
      <div className="summary-card neutral">
        <div className="card-label">عدد الجهات</div>
        <div className="card-value">{summary.entityCount ?? 0}</div>
      </div>
    </div>
  );
}
