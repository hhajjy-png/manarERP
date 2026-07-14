import { money, dateText, expenseCategoryAr, MoneyText, MoneyCell } from '../../config/modules';
import { TableRowSkeletons } from './Skeleton';
import { useT } from '../../lib/i18n';
import { fcMoneyHeader } from '../../components/financial/financialLabels';

const STATUS_COLOR: Record<string, string> = {
  PENDING:  'amber',
  APPROVED: 'green',
  REJECTED: 'red',
};

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expenses: any[];
  loading: boolean;
}

export default function LatestExpensesTable({ expenses, loading }: Props) {
  const { t } = useT();
  return (
    <table className="db-table">
      <thead>
        <tr>
          <th>{t('col.description')}</th>
          <th>{fcMoneyHeader(t('col.amount'))}</th>
          <th>{t('col.category')}</th>
          <th>{t('col.db.status')}</th>
          <th>{t('col.date')}</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <TableRowSkeletons rows={4} cols={5} />
        ) : expenses.length === 0 ? (
          <tr>
            <td colSpan={5}>
              <div className="db-empty">
                <div className="db-empty-icon">💸</div>
                <div className="db-empty-text">{t('empty.expenses')}</div>
              </div>
            </td>
          </tr>
        ) : (
          expenses.map((exp, i) => {
            const statusCls = STATUS_COLOR[exp.status] ?? 'gray';
            const statusLabel = t('exp.status.' + exp.status.toLowerCase());
            return (
              <tr key={i}>
                <td style={{ fontWeight: 700 }}>{exp.description ?? '—'}</td>
                <td>{<MoneyCell value={exp.amount} />}</td>
                <td>{expenseCategoryAr[exp.category] ?? exp.category ?? '—'}</td>
                <td>
                  <span className={`db-pill ${statusCls}`}>{statusLabel}</span>
                </td>
                <td className="db-table-mono">{dateText(exp.date)}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
