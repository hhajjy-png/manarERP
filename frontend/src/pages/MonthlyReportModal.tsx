import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useT } from '../lib/i18n';
import { useAuth } from '../stores/authStore';
import Modal from '../components/Modal';
import { MoneyCell } from '../config/modules';
import ExportExcelButton from '../components/ExportExcelButton';
import { downloadBlob } from '../utils/exportUtils';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { ARABIC_MONTHS } from '../utils/dateUtils';
import { fcMoneyHeader } from '../components/financial/financialLabels';

interface MonthlyRow { year: number | null; month: number | null; count: number; totalSales: number; totalCollected: number; totalRemaining: number; }

// ===== التقرير الشهري =====
export default function MonthlyReportModal({
  filters,
  onClose,
}: {
  filters: { direction?: string; status?: string; customerId?: string; billingYear?: string };
  onClose: () => void;
}) {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    api.get('/invoices/monthly-report', { params: filters })
      .then((res) => setRows(res.data.data ?? []))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportMonthlyExcel() {
    setExportBusy(true);
    try {
      const res = await api.get('/invoices/monthly-report/export', {
        params: filters,
        responseType: 'blob',
      });
      downloadBlob(res.data as Blob, generateExportFileName({ reportName: ReportName.MonthlyReport, extension: 'xlsx' }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExportBusy(false);
    }
  }

  const thStyle: React.CSSProperties = { padding: '8px 12px', borderBottom: '2px solid var(--border)', textAlign: 'start', background: 'var(--surface-2)', fontWeight: 700, fontSize: 13 };
  const tdStyle: React.CSSProperties = { padding: '7px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 };

  return (
    <Modal title={t('inv.monthly_report')} size="xl" onClose={onClose} footer={
      <>
        {rows.length > 0 && hasPermission('invoices.read') && <ExportExcelButton onExport={exportMonthlyExcel} busy={exportBusy} />}
        <button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {loading && <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>{t('msg.loading')}</div>}
      {error && <div className="alert error">⚠️ {error}</div>}
      {!loading && !error && rows.length === 0 && (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>{t('msg.empty')}</p>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>{t('inv.monthly_report.period')}</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>عدد</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>{fcMoneyHeader('إجمالي')}</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>{fcMoneyHeader('محصل')}</th>
                <th style={{ ...thStyle, textAlign: 'end' }}>{fcMoneyHeader('متبقي')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    {r.month && r.year ? `${ARABIC_MONTHS[r.month - 1]} ${r.year}` : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'end' }}>{r.count}</td>
                  <td style={{ ...tdStyle, textAlign: 'end', fontWeight: 700 }}>{<MoneyCell value={r.totalSales} />}</td>
                  <td style={{ ...tdStyle, textAlign: 'end', color: '#16a34a', fontWeight: 700 }}>{<MoneyCell value={r.totalCollected} />}</td>
                  <td style={{ ...tdStyle, textAlign: 'end', color: r.totalRemaining > 0 ? '#dc2626' : '#16a34a', fontWeight: 700 }}>{<MoneyCell value={r.totalRemaining} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
