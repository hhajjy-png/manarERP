import { useState } from 'react';
import AnalysisSection from '../financialAnalysis/AnalysisSection';
import AnalysisTable, { DateCell, MoneyCell, PercentCell, type AnalysisColumn } from '../financialAnalysis/AnalysisTable';
import { useT } from '../../lib/i18n';
import CollectionInvoiceList from './CollectionInvoiceList';
import type {
  CollectionDrilldownRequest,
  CollectionFilters,
  OutstandingRow,
  OutstandingTotals,
} from './collectionTypes';

/* ════════════════════════════════════════════════════════════════════════════
   الجدول ٤ — تحليل الأرصدة القائمة حسب سنة الإصدار.

   الرصيد هنا **حقيقي**: قيمة الفاتورة ناقص تحصيلاتها كلها مهما وقعت، لا ناقص
   ما وقع داخل نطاق التحصيل المختار. نطاق التحصيل يحصر ما يُعدّ تحصيلًا في
   الفترة، ولا يمكنه أن يُنشئ رصيدًا على فاتورة مسدَّدة فعلًا.
   ════════════════════════════════════════════════════════════════════════════ */

interface OutstandingTableProps {
  rows: OutstandingRow[];
  totals: OutstandingTotals;
  asOf: string | null;
  filters: CollectionFilters;
  onDrill: (request: CollectionDrilldownRequest) => void;
}

export default function OutstandingTable({ rows, totals, asOf, filters, onDrill }: OutstandingTableProps) {
  const { t } = useT();
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  const columns: AnalysisColumn<OutstandingRow>[] = [
    {
      key: 'year',
      label: t('ca.col.invoice_year'),
      sortValue: (r) => r.invoiceYear,
      render: (r) => <span className="fac-mono">{r.invoiceYear}</span>,
    },
    {
      key: 'outstanding',
      label: t('ca.col.outstanding'),
      align: 'end',
      sortValue: (r) => r.outstanding,
      render: (r) => (
        <MoneyCell
          value={r.outstanding}
          onClick={() =>
            onDrill({
              title: t('ca.col.outstanding'),
              subtitle: String(r.invoiceYear),
              scopeInvoiceYear: r.invoiceYear,
            })
          }
        />
      ),
      total: <MoneyCell value={totals.outstanding} />,
    },
    {
      key: 'percent',
      label: t('ca.col.percent_of_outstanding'),
      align: 'end',
      sortValue: (r) => r.percent,
      render: (r) => <PercentCell value={r.percent} decimals={1} />,
    },
    {
      key: 'count',
      label: t('ca.col.invoice_count'),
      align: 'end',
      sortValue: (r) => r.invoiceCount,
      render: (r) => <span className="fac-num">{r.invoiceCount}</span>,
      total: <span className="fac-num">{totals.invoiceCount}</span>,
    },
    {
      key: 'oldest',
      label: t('ca.col.oldest_outstanding'),
      align: 'center',
      sortValue: (r) => r.oldestOutstandingDate,
      title: (r) => r.oldestOutstandingNumber ?? '',
      render: (r) => <DateCell value={r.oldestOutstandingDate} />,
      total: <DateCell value={totals.oldestOutstandingDate} />,
    },
    {
      key: 'age',
      label: t('ca.col.average_age'),
      align: 'end',
      sortValue: (r) => r.averageAgeDays,
      render: (r) =>
        r.averageAgeDays == null ? <span className="fac-muted">—</span> : <span className="fac-num">{r.averageAgeDays}</span>,
      total: <span className="fac-num">{totals.averageAgeDays ?? '—'}</span>,
    },
  ];

  return (
    <AnalysisSection index={5} icon="account_balance_wallet" title={t('ca.section.outstanding')}>
      <AnalysisTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.invoiceYear)}
        sortKey="ca:outstanding"
        showTotals
        emptyLabel={t('ca.empty.outstanding')}
        expandable={{
          label: t('ca.expand.invoices'),
          isExpanded: (r) => open.has(r.invoiceYear),
          onToggle: (r) =>
            setOpen((prev) => {
              const next = new Set(prev);
              if (!next.delete(r.invoiceYear)) next.add(r.invoiceYear);
              return next;
            }),
          // التوسيع هنا يعرض **الفواتير ذات الرصيد وحدها** — مطابقةً للعمود الذي
          // فُتح منه، لا لكل فواتير السنة.
          render: (r) => (
            <CollectionInvoiceList
              filters={{ ...filters, outstandingOnly: true }}
              scope={{ scopeInvoiceYear: r.invoiceYear }}
            />
          ),
        }}
      />
      <p className="fac-note">
        {asOf ? t('ca.note.outstanding_as_of', { date: asOf }) : t('ca.note.outstanding')}
      </p>
    </AnalysisSection>
  );
}
