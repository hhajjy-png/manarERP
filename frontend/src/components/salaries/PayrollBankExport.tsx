import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  getExportProfiles, getExportPreview,
  type PayrollBankExportResult, type ExportProfileInfo,
} from '../../api/payrollBankExport';
import { downloadBankExportXls } from '../../utils/payrollBankExportXls';
import { ARABIC_MONTHS, billingYearOptions } from '../../utils/dateUtils';
import { formatNumber } from '../../lib/format';
import { money } from '../../config/modules';
import { useT } from '../../lib/i18n';
import { SectionCard, Button, ErrorBanner, EmptyState, SkeletonRows } from '../explorer/ExplorerKit';

// ─────────────────────────────────────────────────────────────────────────
//  Payroll Bank Export — generate a bank-ready monthly salary transfer file
//  from an APPROVED payroll month. v1: NBK Salary XLS only. Read-only: it never
//  mutates payroll/approval/accounting — it previews server-validated rows and
//  serialises them to a legacy .xls on the client. Isolated component so other
//  bank profiles slot in without touching payroll logic. Arabic / RTL / dark.
// ─────────────────────────────────────────────────────────────────────────

export default function PayrollBankExport() {
  const { t } = useT();
  const now = new Date();
  const [profiles, setProfiles] = useState<ExportProfileInfo[]>([]);
  const [profile, setProfile] = useState('nbk_salary_xls');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [result, setResult] = useState<PayrollBankExportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getExportProfiles().then(setProfiles).catch(() => {});
  }, []);

  async function runPreview() {
    setLoading(true); setError(''); setResult(null);
    try {
      setResult(await getExportPreview(profile, month, year));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function generate() {
    if (result && result.valid) downloadBankExportXls(result);
  }

  const details = result?.sheets.find((s) => s.name === 'Salary Details');

  return (
    <div className="xpl-stack" dir="rtl">
      <SectionCard title={t('payroll_bank.export.title')} icon="account_balance">
        <p className="xpl-help" style={{ marginTop: 0 }}>
          {t('payroll_bank.export.help_intro')} <strong>{t('payroll_bank.export.help_approved')}</strong>{t('payroll_bank.export.help_outro')}
        </p>

        <div className="pbx-controls">
          <div className="xpl-field">
            <label>{t('payroll_bank.export.field.bank_file')}</label>
            <select className="xpl-select" value={profile} onChange={(e) => setProfile(e.target.value)} aria-label={t('payroll_bank.export.field.bank_file')}>
              {profiles.length === 0 && <option value="nbk_salary_xls">{t('payroll_bank.export.profile_fallback_nbk')}</option>}
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="xpl-field">
            <label>{t('payroll_bank.export.field.month')}</label>
            <select className="xpl-select" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label={t('payroll_bank.export.field.month')}>
              {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>
          <div className="xpl-field">
            <label>{t('payroll_bank.export.field.year')}</label>
            <select className="xpl-select" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t('payroll_bank.export.field.year')}>
              {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <Button variant="primary" icon="visibility" busy={loading} onClick={runPreview}>{t('btn.inv.preview')}</Button>
        </div>
      </SectionCard>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading && <div style={{ padding: 16 }}><SkeletonRows rows={5} /></div>}

      {!loading && result && (
        <>
          {/* Validation panel */}
          {result.valid ? (
            <div className="pbx-validation pbx-validation--ok">
              <span className="material-symbols-outlined">check_circle</span>
              {t('payroll_bank.export.data_ready', { count: result.summary.employeeCount })}
            </div>
          ) : (
            <div className="pbx-validation pbx-validation--err">
              <div className="pbx-validation-head">
                <span className="material-symbols-outlined">error</span>
                {t('payroll_bank.export.validation_error_intro', { count: result.errors.length })}
              </div>
              <ul className="pbx-errors">
                {result.errors.map((e, i) => <li key={i}>{e.message}</li>)}
              </ul>
            </div>
          )}

          {/* Totals */}
          <div className="pbx-totals">
            <div className="pbx-total-cell">
              <span className="pbx-total-label">{t('payroll_bank.export.total.employee_count')}</span>
              <span className="pbx-total-value">{result.summary.employeeCount.toLocaleString('en-US')}</span>
            </div>
            <div className="pbx-total-cell">
              <span className="pbx-total-label">{t('payroll_bank.export.total.total_salaries')}</span>
              <span className="pbx-total-value">{money(result.summary.totalAmount)}</span>
            </div>
            <Button variant="primary" icon="download" onClick={generate} disabled={!result.valid}>
              {t('payroll_bank.export.generate_btn')}
            </Button>
          </div>

          {/* Preview table (Salary Details) */}
          <SectionCard title={t('payroll_bank.export.preview_table_title')} icon="table_view">
            {details && details.rows.length > 0 ? (
              <div className="xpl-table-wrap">
                <table className="xpl-table pbx-table">
                  <thead>
                    <tr>{details.columns.map((c) => <th key={c.key}>{c.header}</th>)}</tr>
                  </thead>
                  <tbody>
                    {details.rows.map((r, i) => (
                      <tr key={i}>
                        {details.columns.map((c) => (
                          <td key={c.key} className={c.key === 'amount' ? 'pbx-num' : undefined}>
                            {c.key === 'amount' ? formatNumber(r[c.key]) : String(r[c.key] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="receipt_long" tone="neutral" title={t('payroll_bank.export.empty.title')}
                message={t('payroll_bank.export.empty.message')} />
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
