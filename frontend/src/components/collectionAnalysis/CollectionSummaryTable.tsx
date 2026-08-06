import { useState } from 'react';
import AnalysisSection from '../financialAnalysis/AnalysisSection';
import AnalysisTable, { MoneyCell, PercentCell, type AnalysisColumn } from '../financialAnalysis/AnalysisTable';
import { useT } from '../../lib/i18n';
import CollectionInvoiceList from './CollectionInvoiceList';
import type {
  CollectionDrilldownRequest,
  CollectionFilters,
  CollectionSummaryRow,
  CollectionSummaryTotals,
} from './collectionTypes';

/* ════════════════════════════════════════════════════════════════════════════
   الجدول ١ — ملخص التحصيل حسب سنة إصدار الفاتورة.

   هوية العمود «المؤجَّل عن سنته» (variance):
       قيمة الفواتير − المحصَّل داخل سنتها
     = المحصَّل في سنوات أخرى + الرصيد القائم
   فالأعمدة تتوازن بالتعريف لا بالمصادفة، ولا يمكن أن يظهر فارق غير مفسَّر.
   ════════════════════════════════════════════════════════════════════════════ */

interface CollectionSummaryTableProps {
  rows: CollectionSummaryRow[];
  totals: CollectionSummaryTotals;
  filters: CollectionFilters;
  onDrill: (request: CollectionDrilldownRequest) => void;
}

export default function CollectionSummaryTable({ rows, totals, filters, onDrill }: CollectionSummaryTableProps) {
  const { t } = useT();
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  const drill = (year: number, labelKey: string) =>
    onDrill({ title: t(labelKey), subtitle: String(year), scopeInvoiceYear: year });

  const columns: AnalysisColumn<CollectionSummaryRow>[] = [
    {
      key: 'year',
      label: t('ca.col.invoice_year'),
      sortValue: (r) => r.invoiceYear,
      render: (r) => <span className="fac-mono">{r.invoiceYear}</span>,
    },
    {
      key: 'invoiceValue',
      label: t('ca.col.invoice_value'),
      align: 'end',
      sortValue: (r) => r.invoiceValue,
      render: (r) => <MoneyCell value={r.invoiceValue} onClick={() => drill(r.invoiceYear, 'ca.col.invoice_value')} />,
      total: <MoneyCell value={totals.invoiceValue} />,
    },
    {
      key: 'sameYear',
      label: t('ca.col.collected_same_year'),
      align: 'end',
      sortValue: (r) => r.collectedSameYear,
      render: (r) => (
        <MoneyCell
          value={r.collectedSameYear}
          onClick={() =>
            onDrill({
              title: t('ca.col.collected_same_year'),
              subtitle: String(r.invoiceYear),
              scopeInvoiceYear: r.invoiceYear,
              scopeCollectionYear: r.invoiceYear,
            })
          }
        />
      ),
      total: <MoneyCell value={totals.collectedSameYear} />,
    },
    {
      key: 'otherYears',
      label: t('ca.col.collected_other_years'),
      align: 'end',
      sortValue: (r) => r.collectedOtherYears,
      render: (r) => <MoneyCell value={r.collectedOtherYears} onClick={() => drill(r.invoiceYear, 'ca.col.collected_other_years')} />,
      total: <MoneyCell value={totals.collectedOtherYears} />,
    },
    {
      key: 'outstanding',
      label: t('ca.col.outstanding'),
      align: 'end',
      sortValue: (r) => r.outstanding,
      render: (r) => <MoneyCell value={r.outstanding} onClick={() => drill(r.invoiceYear, 'ca.col.outstanding')} />,
      total: <MoneyCell value={totals.outstanding} />,
    },
    {
      key: 'rate',
      label: t('ca.col.collection_rate'),
      align: 'end',
      sortValue: (r) => r.collectionRate,
      render: (r) => <PercentCell value={r.collectionRate} />,
      total: <PercentCell value={totals.collectionRate} />,
    },
    {
      key: 'days',
      label: t('ca.col.average_days'),
      align: 'end',
      sortValue: (r) => r.averageDays,
      render: (r) => (r.averageDays == null ? <span className="fac-muted">—</span> : <span className="fac-num">{r.averageDays}</span>),
      total: <span className="fac-num">{totals.averageDays ?? '—'}</span>,
    },
    {
      key: 'variance',
      label: t('ca.col.variance'),
      align: 'end',
      sortValue: (r) => r.variance,
      render: (r) => <MoneyCell value={r.variance} />,
      total: <MoneyCell value={totals.variance} />,
    },
  ];

  return (
    <AnalysisSection index={2} icon="summarize" title={t('ca.section.summary')}>
      <AnalysisTable
        columns={columns}
        rows={rows}
        rowKey={(r) => String(r.invoiceYear)}
        sortKey="ca:summary"
        showTotals
        emptyLabel={t('ca.empty.summary')}
        expandable={{
          label: t('ca.expand.invoices'),
          isExpanded: (r) => open.has(r.invoiceYear),
          onToggle: (r) =>
            setOpen((prev) => {
              const next = new Set(prev);
              if (!next.delete(r.invoiceYear)) next.add(r.invoiceYear);
              return next;
            }),
          render: (r) => <CollectionInvoiceList filters={filters} scope={{ scopeInvoiceYear: r.invoiceYear }} />,
        }}
      />
      <p className="fac-note">{t('ca.note.summary')}</p>
    </AnalysisSection>
  );
}
