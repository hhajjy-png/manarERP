import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { financialApi } from '../../api/financial';
import { exportReportAsPdf } from '../../utils/pdfExport';
import { generateExportFileName, ReportName } from '../../utils/exportFilename';
import { downloadBlob } from '../../utils/exportUtils';
import { fcCurrency } from './financialLabels';
import { formatDate } from '../../lib/date';
import { FilterBar } from './FilterBar';
import { ExportBar } from './ExportBar';
import { useT } from '../../lib/i18n';

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
  const navigate = useNavigate();
  const { t } = useT();
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

      <div className="fc-statement-context" aria-label={t('fc.aria.reports_period')}>
        <span className="fc-statement-context-entity">
          <span className="material-symbols-outlined" aria-hidden="true">summarize</span>
          {t('fc.tab.finreport')}
        </span>
        <span className="fc-statement-context-period">
          <span className="material-symbols-outlined" aria-hidden="true">event</span>
          {fromDate ? formatDate(fromDate) : t('fc.period.from_start')} — {toDate ? formatDate(toDate) : t('fc.period.until_today')}
        </span>
      </div>

      {loading && (
        <div className="loading-state">
          <span className="material-symbols-outlined fc-state-icon" aria-hidden="true">hourglass_top</span>
          {t('fc.msg.loading_summary')}
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
          <h3 className="section-title">{t('action.financial_summary')}</h3>
          <div className="financial-summary-cards">
            <div className="summary-card green">
              <div className="card-label">{t('col.acc.revenue_lbl')}</div>
              <div className="card-value money-cell">{fmt(meta.totalRevenue as number)}</div>
            </div>
            <div className="summary-card blue">
              <div className="card-label">{t('today.collections')}</div>
              <div className="card-value money-cell">{fmt(meta.totalCollected as number)}</div>
            </div>
            <div className="summary-card red">
              <div className="card-label">{t('fc.expenses_alt')}</div>
              <div className="card-value money-cell">{fmt(meta.totalExpenses as number)}</div>
            </div>
            <div className="summary-card neutral">
              <div className="card-label">{t('fc.net_income')}</div>
              <div className="card-value money-cell">{fmt(meta.netIncome as number)}</div>
            </div>
          </div>
          <div className="accounting-disclaimer">
            ⓘ {meta.disclaimer as string}
          </div>
          <ExportBar onExcelExport={() => handleExport('excel')} onPdfExport={() => handleExport('pdf')} />
        </div>
      )}

      {/* ── تقارير متاحة ──────────────────────────────────────────────────────
          «الأرباح والخسائر» كان يُعرض بطاقةَ «قريباً» بينما التقرير **منفَّذ ويعمل** منذ
          زمن (`reports.service.profitLoss` + مساراه preview/export). البطاقة كانت تكذب على
          المستخدم وتُخفي ميزة يملكها. الآن تفتحه في مركز التقارير — بنفس فترة الشاشة، وبلا
          تنفيذ ثانٍ للتقرير. */}
      <div className="future-reports-section">
        <h3 className="section-title">{t('fc.reports.available')}</h3>
        <div className="future-reports-grid">
          <button
            type="button"
            className="future-report-card"
            onClick={() => {
              const q = new URLSearchParams({ type: 'profit-loss' });
              if (fromDate) q.set('from', fromDate);
              if (toDate) q.set('to', toDate);
              navigate(`/reports?${q.toString()}`);
            }}
          >
            <span className="material-symbols-outlined future-report-icon" aria-hidden="true">trending_up</span>
            <div className="future-report-name">{t('report.type.profit_loss')}</div>
            <div className="future-report-open">{t('fc.reports.open_report')}</div>
          </button>
        </div>
      </div>

      {/* التقارير غير المنفَّذة تبقى معلنةً بصدق — لا وعد بما لا وجود له، ولا إخفاء لخطة قائمة. */}
      <div className="future-reports-section">
        <h3 className="section-title">{t('fc.reports.upcoming')}</h3>
        <div className="future-reports-grid">
          {[
            { name: 'الميزانية العمومية', labelKey: 'fc.reports.balance_sheet', icon: 'account_balance' },
            { name: 'التدفقات النقدية',   labelKey: 'fc.reports.cash_flow',     icon: 'water_drop' },
            { name: 'مقارنة الميزانية',   labelKey: 'fc.reports.budget_comparison', icon: 'compare_arrows' },
          ].map(r => (
            <div key={r.name} className="future-report-card disabled" aria-disabled="true">
              <span className="material-symbols-outlined future-report-icon" aria-hidden="true">{r.icon}</span>
              <div className="future-report-name">{t(r.labelKey)}</div>
              <div className="coming-soon-badge">{t('fc.coming_soon')}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
