import { useMemo, useState } from 'react';
import AnalysisSection from '../financialAnalysis/AnalysisSection';
import AnalysisTable, { MoneyCell, type AnalysisColumn } from '../financialAnalysis/AnalysisTable';
import { useT } from '../../lib/i18n';
import CollectionInvoiceList from './CollectionInvoiceList';
import type { CollectionDrilldownRequest, CollectionFilters, CollectionMatrix } from './collectionTypes';

/* ════════════════════════════════════════════════════════════════════════════
   الجدول ٣ — مصفوفة انتقال التحصيل (الجدول الإلزامي).

       الصفوف  = سنة إصدار الفاتورة
       الأعمدة = سنة التحصيل
       الخليّة = المبلغ المحصَّل من فواتير تلك السنة في تلك السنة

   **المحوران ديناميكيان بالكامل**: يُشتقّان من البيانات في الخادم، بلا أي سنة
   مكتوبة في الكود ولا حدّ أعلى لعددها. الأعمدة هنا تُبنى من `collectionYears`
   القادمة مع التقرير، فتتّسع المصفوفة تلقائيًا مع كل سنة جديدة.

   الخلايا الواقعة على القُطر (سنة الإصدار = سنة التحصيل) تُميَّز بصريًا: هي
   «حُصِّل في سنته»، وما عداها ترحيل بين السنوات — وهو جوهر ما تقيسه الصفحة.
   ════════════════════════════════════════════════════════════════════════════ */

/** صفّ المصفوفة كما يراه الجدول: سنة + موضعها، والقيم تُقرأ من المصفوفة بالفهرس. */
interface MatrixRow {
  invoiceYear: number;
  index: number;
}

interface CollectionMatrixTableProps {
  matrix: CollectionMatrix;
  filters: CollectionFilters;
  onDrill: (request: CollectionDrilldownRequest) => void;
}

export default function CollectionMatrixTable({ matrix, filters, onDrill }: CollectionMatrixTableProps) {
  const { t } = useT();
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  const rows = useMemo<MatrixRow[]>(
    () => matrix.invoiceYears.map((invoiceYear, index) => ({ invoiceYear, index })),
    [matrix.invoiceYears],
  );

  /** الأعمدة تُبنى من محور سنوات التحصيل — تذكيرها يمنع إعادة بنائها في كل رسم. */
  const columns = useMemo<AnalysisColumn<MatrixRow>[]>(() => {
    const head: AnalysisColumn<MatrixRow> = {
      key: 'invoiceYear',
      label: t('ca.col.invoice_year'),
      align: 'center',
      render: (r) => <span className="fac-mono ca-matrix-head">{r.invoiceYear}</span>,
    };

    const yearColumns = matrix.collectionYears.map<AnalysisColumn<MatrixRow>>((collectionYear, c) => ({
      key: `y${collectionYear}`,
      label: String(collectionYear),
      align: 'end',
      render: (r) => {
        const value = matrix.cells[r.index]?.[c] ?? 0;
        const diagonal = collectionYear === r.invoiceYear;
        if (value === 0) return <span className="fac-muted">—</span>;
        return (
          <span className={diagonal ? 'ca-matrix-diagonal' : undefined}>
            <MoneyCell
              value={value}
              onClick={() =>
                onDrill({
                  title: t('ca.section.matrix'),
                  subtitle: `${r.invoiceYear} → ${collectionYear}`,
                  scopeInvoiceYear: r.invoiceYear,
                  scopeCollectionYear: collectionYear,
                })
              }
            />
          </span>
        );
      },
      total: <MoneyCell value={matrix.columnTotals[c] ?? 0} />,
    }));

    const tail: AnalysisColumn<MatrixRow>[] = [
      {
        key: 'rowTotal',
        label: t('ca.col.row_total'),
        align: 'end',
        render: (r) => <MoneyCell value={matrix.rowTotals[r.index] ?? 0} />,
        total: <MoneyCell value={matrix.grandTotal} />,
      },
      {
        key: 'invoiceValue',
        label: t('ca.col.invoice_value'),
        align: 'end',
        render: (r) => <MoneyCell value={matrix.rowInvoiceValue[r.index] ?? 0} />,
        total: <MoneyCell value={matrix.rowInvoiceValue.reduce((s, v) => s + v, 0)} />,
      },
      {
        key: 'rowOutstanding',
        label: t('ca.col.outstanding'),
        align: 'end',
        render: (r) => <MoneyCell value={matrix.rowOutstanding[r.index] ?? 0} />,
        total: <MoneyCell value={matrix.rowOutstanding.reduce((s, v) => s + v, 0)} />,
      },
    ];

    return [head, ...yearColumns, ...tail];
  }, [matrix, onDrill, t]);

  return (
    <AnalysisSection index={4} icon="grid_on" title={t('ca.section.matrix')}>
      <div className="ca-matrix">
        <AnalysisTable
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.invoiceYear)}
          showTotals
          emptyLabel={t('ca.empty.matrix')}
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
      </div>
      <p className="fac-note">{t('ca.note.matrix')}</p>
    </AnalysisSection>
  );
}
