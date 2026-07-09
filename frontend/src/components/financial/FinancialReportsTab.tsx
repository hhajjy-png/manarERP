import { useState, useEffect } from 'react';
import { financialApi } from '../../api/financial';
import { exportReportAsPdf } from '../../utils/pdfExport';
import { generateExportFileName, ReportName } from '../../utils/exportFilename';
import { downloadBlob } from '../../utils/exportUtils';
import { fcCurrency } from './financialLabels';
import { formatDate } from '../../lib/date';
import { FilterBar } from './FilterBar';
import { ExportBar } from './ExportBar';

function fmt(n?: number) {
  return fcCurrency(n ?? 0);
}

interface Props {
  fromDate?: string;
  toDate?: string;
  onFromDate: (v: string) => void;
  onToDate: (v: string) => void;
}

export function FinancialReportsTab({ fromDate, toDate, onFromDate, onToDate }: Props) {
  const [data, setData]       = useState<{ metadata?: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    financialApi.getFinancialSummary({ fromDate: fromDate || undefined, toDate: toDate || undefined })
      .then(d => setData(d))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [fromDate, toDate]);

  async function handleExport(format: 'pdf' | 'excel') {
    if (format === 'pdf') {
      await exportReportAsPdf(
        '/financial/summary/export',
        { fromDate: fromDate || undefined, toDate: toDate || undefined },
        generateExportFileName({ reportName: ReportName.FinancialSummary, extension: 'pdf' }),
      );
      return;
    }
    const blob = await financialApi.exportFinancialSummary({
      fromDate: fromDate || undefined,
      toDate:   toDate   || undefined,
      format,
    });
    downloadBlob(blob, generateExportFileName({ reportName: ReportName.FinancialSummary, extension: 'xlsx' }));
  }

  const meta = data?.metadata ?? {};

  return (
    <div className="financial-reports-tab" dir="rtl">
      <FilterBar fromDate={fromDate} toDate={toDate} onFromDate={onFromDate} onToDate={onToDate} />

      <div className="fc-statement-context" aria-label="فترة التقارير المالية">
        <span className="fc-statement-context-entity">
          <span className="material-symbols-outlined" aria-hidden="true">summarize</span>
          التقارير المالية
        </span>
        <span className="fc-statement-context-period">
          <span className="material-symbols-outlined" aria-hidden="true">event</span>
          {fromDate ? formatDate(fromDate) : 'من البداية'} — {toDate ? formatDate(toDate) : 'حتى اليوم'}
        </span>
      </div>

      {loading && (
        <div className="loading-state">
          <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">hourglass_top</span>
          جارٍ تحميل الملخص المالي…
        </div>
      )}
      {error && (
        <div className="error-state" role="alert">
          <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">error</span>
          {error}
        </div>
      )}

      {data && (
        <div className="financial-summary-section">
          <h3 className="section-title">الملخص المالي</h3>
          <div className="financial-summary-cards">
            <div className="summary-card green">
              <div className="card-label">الإيرادات</div>
              <div className="card-value">{fmt(meta.totalRevenue as number)}</div>
            </div>
            <div className="summary-card blue">
              <div className="card-label">التحصيلات</div>
              <div className="card-value">{fmt(meta.totalCollected as number)}</div>
            </div>
            <div className="summary-card red">
              <div className="card-label">المصاريف</div>
              <div className="card-value">{fmt(meta.totalExpenses as number)}</div>
            </div>
            <div className="summary-card neutral">
              <div className="card-label">صافي الدخل</div>
              <div className="card-value">{fmt(meta.netIncome as number)}</div>
            </div>
          </div>
          <div className="accounting-disclaimer">
            ⓘ {meta.disclaimer as string}
          </div>
          <ExportBar onExcelExport={() => handleExport('excel')} onPdfExport={() => handleExport('pdf')} />
        </div>
      )}

      <div className="future-reports-section">
        <h3 className="section-title">تقارير قادمة</h3>
        <div className="future-reports-grid">
          {[
            { name: 'الميزانية العمومية', icon: 'account_balance' },
            { name: 'التدفقات النقدية',   icon: 'water_drop' },
            { name: 'الأرباح والخسائر',   icon: 'trending_up' },
            { name: 'مقارنة الميزانية',   icon: 'compare_arrows' },
          ].map(r => (
            <div key={r.name} className="future-report-card disabled" aria-disabled="true">
              <span className="material-symbols-outlined future-report-icon" aria-hidden="true">{r.icon}</span>
              <div className="future-report-name">{r.name}</div>
              <div className="coming-soon-badge">قريباً</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
