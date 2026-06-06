import { money, dateText, expenseCategoryAr } from '../../config/modules';
import { TableRowSkeletons } from './Skeleton';

const STATUS_PILL: Record<string, [string, string]> = {
  PENDING:  ['معلّق',  'amber'],
  APPROVED: ['معتمد',  'green'],
  REJECTED: ['مرفوض', 'red'],
};

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expenses: any[];
  loading: boolean;
}

export default function LatestExpensesTable({ expenses, loading }: Props) {
  return (
    <table className="db-table">
      <thead>
        <tr>
          <th>الوصف</th>
          <th>المبلغ</th>
          <th>الفئة</th>
          <th>الحالة</th>
          <th>التاريخ</th>
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
                <div className="db-empty-text">لا توجد مصروفات</div>
              </div>
            </td>
          </tr>
        ) : (
          expenses.map((exp, i) => {
            const [statusLabel, statusCls] = STATUS_PILL[exp.status] ?? ['—', 'gray'];
            return (
              <tr key={i}>
                <td style={{ fontWeight: 700 }}>{exp.description ?? '—'}</td>
                <td>{money(exp.amount)}</td>
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
