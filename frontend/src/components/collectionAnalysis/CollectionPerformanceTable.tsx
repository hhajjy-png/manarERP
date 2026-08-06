import { useState } from 'react';
import AnalysisSection from '../financialAnalysis/AnalysisSection';
import AnalysisTable, { MoneyCell, PercentCell, type AnalysisColumn } from '../financialAnalysis/AnalysisTable';
import { Tabs } from '../explorer/ExplorerKit';
import { useT } from '../../lib/i18n';
import CollectionInvoiceList from './CollectionInvoiceList';
import type {
  CollectionDrilldownRequest,
  CollectionFilters,
  PerformanceDimension,
  PerformanceRow,
  PerformanceSection,
} from './collectionTypes';

/* ════════════════════════════════════════════════════════════════════════════
   الجدول ٥ — أداء التحصيل حسب العميل / العقد / المشروع.

   جدول واحد بثلاثة محاور لا ثلاثة جداول: الأعمدة والسلوك متطابقة، والمحور يبدّل
   مصدر الصفوف فقط — أقلّ ضجيجًا على الشاشة وبلا تكرار مكوّن.

   ملاحظة على محور المشروع: المشروع في هذا النظام اتفاقية سعر تعيش على **بنود**
   الفاتورة، فتُوزَّع قيمة الفاتورة وتحصيلاتها على مشاريعها بنسبة قيم بنودها.
   لذلك قد يظهر مجموع «عدد الفواتير» في هذا المحور أكبر من عددها الحقيقي: فاتورة
   واحدة تخصّ مشروعين تُعدّ في كلٍّ منهما.
   ════════════════════════════════════════════════════════════════════════════ */

const HEADER_KEY: Record<PerformanceDimension, string> = {
  customer: 'ca.col.customer',
  contract: 'ca.col.contract',
  project: 'ca.col.project',
};

interface CollectionPerformanceTableProps {
  performance: PerformanceSection;
  filters: CollectionFilters;
  onDrill: (request: CollectionDrilldownRequest) => void;
}

export default function CollectionPerformanceTable({ performance, filters, onDrill }: CollectionPerformanceTableProps) {
  const { t } = useT();
  const [dimension, setDimension] = useState<PerformanceDimension>('customer');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const rows = performance[dimension];

  const columns: AnalysisColumn<PerformanceRow>[] = [
    {
      key: 'name',
      label: t(HEADER_KEY[dimension]),
      truncate: true,
      title: (r) => r.name,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: 'count',
      label: t('ca.col.invoice_count'),
      align: 'end',
      sortValue: (r) => r.invoiceCount,
      render: (r) => <span className="fac-num">{r.invoiceCount}</span>,
      total: <span className="fac-num">{rows.reduce((s, r) => s + r.invoiceCount, 0)}</span>,
    },
    {
      key: 'invoiced',
      label: t('ca.col.invoice_value'),
      align: 'end',
      sortValue: (r) => r.invoiced,
      render: (r) => <MoneyCell value={r.invoiced} onClick={() => drill(r)} />,
      total: <MoneyCell value={rows.reduce((s, r) => s + r.invoiced, 0)} />,
    },
    {
      key: 'collected',
      label: t('ca.col.collected'),
      align: 'end',
      sortValue: (r) => r.collected,
      render: (r) => <MoneyCell value={r.collected} onClick={() => drill(r)} />,
      total: <MoneyCell value={rows.reduce((s, r) => s + r.collected, 0)} />,
    },
    {
      key: 'outstanding',
      label: t('ca.col.outstanding'),
      align: 'end',
      sortValue: (r) => r.outstanding,
      render: (r) => <MoneyCell value={r.outstanding} />,
      total: <MoneyCell value={rows.reduce((s, r) => s + r.outstanding, 0)} />,
    },
    {
      key: 'rate',
      label: t('ca.col.collection_rate'),
      align: 'end',
      sortValue: (r) => r.collectionRate,
      render: (r) => <PercentCell value={r.collectionRate} />,
    },
    {
      key: 'days',
      label: t('ca.col.average_days'),
      align: 'end',
      sortValue: (r) => r.averageDays,
      render: (r) =>
        r.averageDays == null ? <span className="fac-muted">—</span> : <span className="fac-num">{r.averageDays}</span>,
    },
  ];

  function drill(row: PerformanceRow) {
    onDrill({
      title: row.name,
      subtitle: t(HEADER_KEY[dimension]),
      dimension,
      dimensionId: row.id ?? 0,
    });
  }

  return (
    <AnalysisSection
      index={6}
      icon="leaderboard"
      title={t('ca.section.performance')}
      actions={
        <Tabs<PerformanceDimension>
          active={dimension}
          onChange={(key) => {
            setDimension(key);
            // التوسيع مفاتيحه مقيَّدة بالمحور (`customer:12`)، لكن الطيّ عند
            // التبديل يمنع أن يبدأ المحور الجديد بصفوف مفتوحة تخصّ سابقه.
            setOpen(new Set());
          }}
          tabs={[
            { key: 'customer', label: t('ca.dim.customer'), icon: 'groups' },
            { key: 'contract', label: t('ca.dim.contract'), icon: 'description' },
            { key: 'project', label: t('ca.dim.project'), icon: 'construction' },
          ]}
        />
      }
    >
      <AnalysisTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        sortKey={`ca:performance:${dimension}`}
        searchable
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('ca.performance.search')}
        showTotals
        emptyLabel={t('ca.empty.performance')}
        expandable={{
          label: t('ca.expand.invoices'),
          isExpanded: (r) => open.has(r.key),
          onToggle: (r) =>
            setOpen((prev) => {
              const next = new Set(prev);
              if (!next.delete(r.key)) next.add(r.key);
              return next;
            }),
          render: (r) => (
            <CollectionInvoiceList filters={filters} scope={{ dimension, dimensionId: r.id ?? 0 }} />
          ),
        }}
      />
      {dimension === 'project' && <p className="fac-note">{t('ca.note.project_split')}</p>}
    </AnalysisSection>
  );
}
