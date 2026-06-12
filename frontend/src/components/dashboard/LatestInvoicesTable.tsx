import { money, dateText } from '../../config/modules';
import { TableRowSkeletons } from './Skeleton';
import { useT } from '../../lib/i18n';

const STATUS_COLOR: Record<string, string> = {
  UNPAID:    'red',
  PARTIAL:   'amber',
  PAID:      'green',
  OVERDUE:   'red',
  CANCELLED: 'gray',
};

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  invoices: any[];
  loading: boolean;
}

export default function LatestInvoicesTable({ invoices, loading }: Props) {
  const { t } = useT();
  return (
    <table className="db-table">
      <thead>
        <tr>
          <th>{t('col.inv.number')}</th>
          <th>{t('col.inv.party')}</th>
          <th>{t('col.inv.total')}</th>
          <th>{t('col.db.status')}</th>
          <th>{t('col.date')}</th>
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
                <div className="db-empty-text">{t('empty.no_invoices')}</div>
              </div>
            </td>
          </tr>
        ) : (
          invoices.map((inv, i) => {
            const statusCls = STATUS_COLOR[inv.status] ?? 'gray';
            const statusLabel = t('inv.status.' + inv.status.toLowerCase());
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
