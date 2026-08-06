import { useState } from 'react';
import AnalysisSection from '../financialAnalysis/AnalysisSection';
import AnalysisTable, { MoneyCell, PercentCell, type AnalysisColumn } from '../financialAnalysis/AnalysisTable';
import { Icon } from '../explorer/ExplorerKit';
import { useT } from '../../lib/i18n';
import CollectionInvoiceList from './CollectionInvoiceList';
import type { CollectionDrilldownRequest, CollectionFilters, CollectionTransferRow } from './collectionTypes';

/* ════════════════════════════════════════════════════════════════════════════
   الجدول ٢ — ترحيل التحصيل بين السنوات.

   صفّ واحد لكل زوج (سنة إصدار ⇢ سنة تحصيل) له مبلغ فعلي. النسبة محسوبة **داخل
   سنة الإصدار**: «كم من تحصيلات فواتير 2023 وقع في 2024؟» لا نسبة من الكل.
   ════════════════════════════════════════════════════════════════════════════ */

interface CollectionTransferTableProps {
  rows: CollectionTransferRow[];
  grandTotal: number;
  filters: CollectionFilters;
  onDrill: (request: CollectionDrilldownRequest) => void;
}

/** مفتاح الصفّ والتوسيع معًا — زوج السنتين هو هويّته. */
const pairKey = (r: CollectionTransferRow) => `${r.invoiceYear}:${r.collectionYear}`;

export default function CollectionTransferTable({ rows, grandTotal, filters, onDrill }: CollectionTransferTableProps) {
  const { t } = useT();
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const columns: AnalysisColumn<CollectionTransferRow>[] = [
    {
      key: 'invoiceYear',
      label: t('ca.col.invoice_year'),
      align: 'center',
      sortValue: (r) => r.invoiceYear,
      render: (r) => <span className="fac-mono">{r.invoiceYear}</span>,
    },
    {
      key: 'arrow',
      label: '',
      align: 'center',
      render: (r) => (
        // السهم يقرأ «من سنة الإصدار إلى سنة التحصيل»؛ اللون يميّز المُرحَّل عن
        // المحصَّل داخل سنته بلا نصّ إضافي في جدول مزدحم أصلًا.
        <span className={`ca-transfer-arrow${r.collectionYear === r.invoiceYear ? '' : ' ca-deferred'}`}>
          <Icon name={r.collectionYear === r.invoiceYear ? 'sync_alt' : 'trending_flat'} />
        </span>
      ),
    },
    {
      key: 'collectionYear',
      label: t('ca.col.collection_year'),
      align: 'center',
      sortValue: (r) => r.collectionYear,
      render: (r) => <span className="fac-mono">{r.collectionYear}</span>,
    },
    {
      key: 'amount',
      label: t('ca.col.amount'),
      align: 'end',
      sortValue: (r) => r.amount,
      render: (r) => (
        <MoneyCell
          value={r.amount}
          onClick={() =>
            onDrill({
              title: t('ca.section.transfer'),
              subtitle: `${r.invoiceYear} → ${r.collectionYear}`,
              scopeInvoiceYear: r.invoiceYear,
              scopeCollectionYear: r.collectionYear,
            })
          }
        />
      ),
      total: <MoneyCell value={grandTotal} />,
    },
    {
      key: 'percent',
      label: t('ca.col.percent_of_year'),
      align: 'end',
      sortValue: (r) => r.percent,
      render: (r) => <PercentCell value={r.percent} />,
    },
    {
      key: 'invoiceCount',
      label: t('ca.col.invoice_count'),
      align: 'end',
      sortValue: (r) => r.invoiceCount,
      render: (r) => <span className="fac-num">{r.invoiceCount}</span>,
    },
    {
      key: 'paymentCount',
      label: t('ca.col.payment_count'),
      align: 'end',
      sortValue: (r) => r.paymentCount,
      render: (r) => <span className="fac-num">{r.paymentCount}</span>,
      total: <span className="fac-num">{rows.reduce((s, r) => s + r.paymentCount, 0)}</span>,
    },
  ];

  return (
    <AnalysisSection index={3} icon="move_down" title={t('ca.section.transfer')}>
      <AnalysisTable
        columns={columns}
        rows={rows}
        rowKey={pairKey}
        sortKey="ca:transfer"
        showTotals
        emptyLabel={t('ca.empty.transfer')}
        expandable={{
          label: t('ca.expand.invoices'),
          isExpanded: (r) => open.has(pairKey(r)),
          onToggle: (r) =>
            setOpen((prev) => {
              const next = new Set(prev);
              if (!next.delete(pairKey(r))) next.add(pairKey(r));
              return next;
            }),
          render: (r) => (
            <CollectionInvoiceList
              filters={filters}
              scope={{ scopeInvoiceYear: r.invoiceYear, scopeCollectionYear: r.collectionYear }}
            />
          ),
        }}
      />
      <p className="fac-note">{t('ca.note.transfer')}</p>
    </AnalysisSection>
  );
}
