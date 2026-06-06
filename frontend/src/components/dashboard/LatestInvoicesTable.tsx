import { money, dateText } from '../../config/modules';
import { TableRowSkeletons } from './Skeleton';

const STATUS_PILL: Record<string, [string, string]> = {
  UNPAID:    ['غير مدفوعة', 'red'],
  PARTIAL:   ['جزئية',      'amber'],
  PAID:      ['مدفوعة',     'green'],
  OVERDUE:   ['متأخرة',     'red'],
  CANCELLED: ['ملغاة',      'gray'],
};

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoices: any[];
  loading: boolean;
}

export default function LatestInvoicesTable({ invoices, loading }: Props) {
  return (
    <table className="db-table">
      <thead>
        <tr>
          <th>رقم الفاتورة</th>
          <th>الجهة</th>
          <th>الإجمالي</th>
          <th>الحالة</th>
          <th>التاريخ</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <TableRowSkeletons rows={4} cols={5} />
        ) : invoices.length === 0 ? (
          <tr>
            <td colSpan={5}>
              <div className="db-empty">
                <div className="db-empty-icon">🧾</div>
                <div className="db-empty-text">لا توجد فواتير</div>
              </div>
            </td>
          </tr>
        ) : (
          invoices.map((inv, i) => {
            const [statusLabel, statusCls] = STATUS_PILL[inv.status] ?? ['—', 'gray'];
            const party = inv.customer?.name ?? inv.supplier?.name ?? '—';
            return (
              <tr key={i}>
                <td>
                  <span className="db-table-mono">
                    {inv.invoiceNumber ?? inv.number ?? '—'}
                  </span>
                </td>
                <td style={{ fontWeight: 700 }}>{party}</td>
                <td>{money(inv.total)}</td>
                <td>
                  <span className={`db-pill ${statusCls}`}>{statusLabel}</span>
                </td>
                <td className="db-table-mono">{dateText(inv.issueDate)}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
