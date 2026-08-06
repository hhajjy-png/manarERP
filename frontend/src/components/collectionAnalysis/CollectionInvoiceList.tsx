import { useState } from 'react';
import PrivateAmount from '../PrivateAmount';
import { EmptyState, ErrorBanner, SkeletonRows, StatusChip } from '../explorer/ExplorerKit';
import AnalysisTable, { DateCell, MoneyCell, type AnalysisColumn } from '../financialAnalysis/AnalysisTable';
import { useT } from '../../lib/i18n';
import { useCollectionDrilldown } from './useCollectionDrilldown';
import type {
  CollectionDrilldownResult,
  CollectionFilters,
  DrilldownInvoice,
  DrilldownPayment,
  DrilldownScope,
  SettlementStatus,
} from './collectionTypes';

/* ════════════════════════════════════════════════════════════════════════════
   قائمة فواتير خليّة — جسم توسيع الصفّ داخل كل جدول.

   المستوى الثاني من التوسيع (فاتورة ⇐ حركات تحصيلها) يعيش هنا أيضًا: **كل شيء
   داخل الصفحة، بلا أي حوار**، حسب المواصفة.

   تُبنى بنفس `AnalysisTable` المعتمد لا بجدول ثانٍ، فترث المحاذاة والاقتطاع
   وصفّ المجاميع وسلوك الطباعة بلا سطر CSS جديد.
   ════════════════════════════════════════════════════════════════════════════ */

const STATUS_TONE: Record<SettlementStatus, 'green' | 'orange' | 'red'> = {
  PAID: 'green',
  PARTIAL: 'orange',
  UNPAID: 'red',
};

const STATUS_LABEL_KEY: Record<SettlementStatus, string> = {
  PAID: 'ca.settlement.paid',
  PARTIAL: 'ca.settlement.partial',
  UNPAID: 'ca.settlement.unpaid',
};

interface CollectionInvoiceListProps {
  filters: CollectionFilters;
  scope: DrilldownScope;
  /** حدّ صفوف الجدول الداخلي قبل زرّ «عرض الكل». */
  maxRows?: number;
}

/**
 * الحاوية: تجلب ثم تعرض. تستخدمها الجداول الخمسة عند توسيع الصفّ.
 *
 * الدرج **لا** يستخدمها: هو يجلب مرّة واحدة لبطاقات ترويسته ثم يمرّر النتيجة
 * إلى {@link CollectionInvoiceTable} مباشرةً — طلب واحد لا طلبان لنفس البيانات.
 */
export default function CollectionInvoiceList({ filters, scope, maxRows = 8 }: CollectionInvoiceListProps) {
  const { t } = useT();
  const { data, loading, errorKey } = useCollectionDrilldown(filters, scope);

  if (loading) return <SkeletonRows rows={4} withAvatar={false} />;
  if (errorKey) return <ErrorBanner>{t(errorKey)}</ErrorBanner>;
  return <CollectionInvoiceTable data={data} maxRows={maxRows} />;
}

/** العرض البحت: نتيجة جاهزة داخل ⇒ جدول قابل للتوسيع خارج. بلا أي جلب. */
export function CollectionInvoiceTable({
  data,
  maxRows = 8,
}: {
  data: CollectionDrilldownResult | null;
  maxRows?: number;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  if (!data || data.rows.length === 0) {
    return <EmptyState icon="search_off" title={t('msg.empty')} message={t('ca.drill.empty')} tone="neutral" />;
  }

  const columns: AnalysisColumn<DrilldownInvoice>[] = [
    {
      key: 'number',
      label: t('ca.col.invoice_number'),
      sortValue: (r) => r.invoiceNumber,
      render: (r) => <span className="fac-mono">{r.invoiceNumber}</span>,
    },
    { key: 'issueDate', label: t('ca.col.issue_date'), align: 'center', render: (r) => <DateCell value={r.issueDate} /> },
    {
      key: 'customer',
      label: t('ca.col.customer'),
      truncate: true,
      title: (r) => r.customerName,
      sortValue: (r) => r.customerName,
      render: (r) => r.customerName,
    },
    { key: 'total', label: t('ca.col.invoice_value'), align: 'end', render: (r) => <MoneyCell value={r.total} /> },
    {
      key: 'collected',
      label: t('ca.col.collected'),
      align: 'end',
      render: (r) => <MoneyCell value={r.collectedInScope} />,
    },
    { key: 'remaining', label: t('ca.col.remaining'), align: 'end', render: (r) => <MoneyCell value={r.remaining} /> },
    {
      key: 'days',
      label: t('ca.col.days_to_collect'),
      align: 'end',
      render: (r) =>
        r.averageDaysToCollect == null ? <span className="fac-muted">—</span> : <span className="fac-num">{r.averageDaysToCollect}</span>,
    },
    {
      key: 'status',
      label: t('ca.col.status'),
      align: 'center',
      render: (r) => (
        <StatusChip tone={r.overdue ? 'red' : STATUS_TONE[r.status]} icon={r.overdue ? 'priority_high' : undefined}>
          {r.overdue ? t('ca.settlement.overdue') : t(STATUS_LABEL_KEY[r.status])}
        </StatusChip>
      ),
    },
  ];

  return (
    <div className="ca-inline-list">
      {data.truncated && (
        <p className="fac-drill-note">{t('ca.drill.truncated', { shown: data.rows.length, total: data.count })}</p>
      )}
      <AnalysisTable
        compact
        columns={columns}
        rows={data.rows}
        rowKey={(r) => String(r.invoiceId)}
        maxRows={maxRows}
        expanded={showAll}
        onToggleExpand={() => setShowAll((v) => !v)}
        expandLabel={t('ca.expand.invoices')}
        emptyLabel={t('ca.drill.empty')}
        expandable={{
          label: t('ca.expand.payments'),
          isExpanded: (row) => expanded.has(row.invoiceId),
          onToggle: (row) =>
            setExpanded((prev) => {
              const next = new Set(prev);
              if (!next.delete(row.invoiceId)) next.add(row.invoiceId);
              return next;
            }),
          render: (row) => <PaymentTimeline invoice={row} />,
        }}
      />
    </div>
  );
}

/* ── المستوى الثاني: خطّ زمن التحصيلات ─────────────────────────────────────── */

function PaymentTimeline({ invoice }: { invoice: DrilldownInvoice }) {
  const { t } = useT();

  if (invoice.payments.length === 0) {
    return <p className="fac-empty">{t('ca.drill.no_payments')}</p>;
  }

  const columns: AnalysisColumn<DrilldownPayment>[] = [
    { key: 'date', label: t('ca.col.collection_date'), align: 'center', render: (p) => <DateCell value={p.date} /> },
    {
      key: 'year',
      label: t('ca.col.collection_year'),
      align: 'center',
      render: (p) => (
        <span className={`fac-mono${p.collectionYear !== invoice.invoiceYear ? ' ca-deferred' : ''}`}>
          {p.collectionYear}
        </span>
      ),
    },
    { key: 'amount', label: t('ca.col.amount'), align: 'end', render: (p) => <MoneyCell value={p.amount} /> },
    {
      key: 'remaining',
      label: t('ca.col.remaining_after'),
      align: 'end',
      render: (p) => (
        <span className="fac-money">
          <PrivateAmount value={p.remainingAfter} level={1} />
        </span>
      ),
    },
    {
      key: 'days',
      label: t('ca.col.days_to_collect'),
      align: 'end',
      render: (p) => <span className="fac-num">{p.daysToCollect}</span>,
    },
    { key: 'method', label: t('ca.col.method'), align: 'center', render: (p) => p.method },
    {
      key: 'reference',
      label: t('ca.col.reference'),
      truncate: true,
      title: (p) => p.reference ?? '',
      render: (p) => p.reference || <span className="fac-muted">—</span>,
    },
  ];

  return (
    <div className="ca-timeline">
      <span className="ca-timeline-title">
        {t('ca.timeline.title', { invoice: invoice.invoiceNumber })}
        {invoice.projectName && <span className="ca-timeline-meta">{invoice.projectName}</span>}
        {invoice.contractCode && <span className="ca-timeline-meta">{invoice.contractCode}</span>}
      </span>
      <AnalysisTable
        compact
        columns={columns}
        rows={invoice.payments}
        rowKey={(p) => String(p.id)}
        emptyLabel={t('ca.drill.no_payments')}
      />
    </div>
  );
}
