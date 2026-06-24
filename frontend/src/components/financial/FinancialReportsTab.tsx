import { useState, useEffect } from 'react';
import { financialApi } from '../../api/financial';
import { FilterBar } from './FilterBar';
import { ExportBar } from './ExportBar';

function fmt(n?: number) {
  return (n ?? 0).toLocaleString('ar-KW', { minimumFractionDigits: 3 });
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
    const blob = await financialApi.exportFinancialSummary({
      fromDate: fromDate || undefined,
      toDate:   toDate   || undefined,
      format,
    });
    const ext = format === 'pdf' ? 'pdf' : 'xlsx';
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: `financial-summary.${ext}` }).click();
    URL.revokeObjectURL(url);
  }

  const meta = data?.metadata ?? {};

  return (
    <div className="financial-reports-tab" dir="rtl">
      <FilterBar fromDate={fromDate} toDate={toDate} onFromDate={onFromDate} onToDate={onToDate} />

      {loading && <div className="loading-state">جاري التحميل...</div>}
      {error   && <div className="error-state">{error}</div>}

      {data && (
        <div className="financial-summary-section">
          <h3 className="section-title">الملخص المالي</h3>
          <div className="financial-summary-cards">
            <div className="summary-card green">
              <div className="card-label">الإيرادات</div>
              <div className="card-value">{fmt(meta.totalRevenue as number)} <span className="currency">د.ك</span></div>
            </div>
            <div className="summary-card blue">
              <div className="card-label">التحصيلات</div>
              <div className="card-value">{fmt(meta.totalCollected as number)} <span className="currency">د.ك</span></div>
            </div>
            <div className="summary-card red">
              <div className="card-label">المصاريف</div>
              <div className="card-value">{fmt(meta.totalExpenses as number)} <span className="currency">د.ك</span></div>
            </div>
            <div className="summary-card neutral">
              <div className="card-label">صافي الدخل</div>
              <div className="card-value">{fmt(meta.netIncome as number)} <span className="currency">د.ك</span></div>
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
          {['الميزانية العمومية', 'التدفقات النقدية', 'الأرباح والخسائر', 'مقارنة الميزانية'].map(name => (
            <div key={name} className="future-report-card disabled">
              <div className="future-report-name">{name}</div>
              <div className="coming-soon-badge">قريباً</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
