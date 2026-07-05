import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { financialApi, type DashboardSummary } from '../../api/financial';
import PrivateAmount from '../PrivateAmount';

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-KW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function FinancialDashboardTab() {
  const navigate                   = useNavigate();
  const [data, setData]            = useState<DashboardSummary | null>(null);
  const [loading, setLoading]      = useState(false);
  const [error, setError]          = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    financialApi.getDashboardSummary()
      .then(setData)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">جاري تحميل الملخص المالي...</div>;
  if (error)   return <div className="error-state">{error}</div>;
  if (!data)   return null;

  return (
    <div className="financial-dashboard-tab" dir="rtl">
      <div className="dashboard-last-updated">آخر تحديث: {fmtTime(data.generatedAt)}</div>

      {/* Summary Cards */}
      <div className="financial-dashboard-cards">
        <div className="fin-dash-card">
          <div className="fin-dash-card-title">ذمم العملاء</div>
          <div className="fin-dash-card-value"><PrivateAmount value={data.arSummary.totalOutstanding} /></div>
          <div className="fin-dash-card-sub critical">حرج +90 يوم: <PrivateAmount value={data.arSummary.criticalOver90} /></div>
          <button className="fin-dash-link" onClick={() => navigate('/financial?tab=aging&subTab=ar')}>
            عرض التفاصيل ←
          </button>
        </div>
        <div className="fin-dash-card">
          <div className="fin-dash-card-title">ذمم الموردين</div>
          <div className="fin-dash-card-value"><PrivateAmount value={data.apSummary.totalOutstanding} /></div>
          <div className="fin-dash-card-sub critical">حرج +90 يوم: <PrivateAmount value={data.apSummary.criticalOver90} /></div>
          <button className="fin-dash-link" onClick={() => navigate('/financial?tab=aging&subTab=ap')}>
            عرض التفاصيل ←
          </button>
        </div>
        <div className="fin-dash-card">
          <div className="fin-dash-card-title">تحصيلات 30 يوم</div>
          <div className="fin-dash-card-value green"><PrivateAmount value={data.collectionsLast30} /></div>
        </div>
        <div className="fin-dash-card">
          <div className="fin-dash-card-title">مدفوعات 30 يوم</div>
          <div className="fin-dash-card-value"><PrivateAmount value={data.paymentsLast30} /></div>
        </div>
      </div>

      {/* Top 5 Tables */}
      <div className="financial-dashboard-tables">
        <div className="fin-dash-table">
          <h4>أعلى 5 عملاء (ذمم)</h4>
          <table>
            <thead>
              <tr><th>الاسم</th><th>المبلغ</th></tr>
            </thead>
            <tbody>
              {data.topCustomers.map(c => (
                <tr
                  key={c.id}
                  className="clickable-row"
                  onClick={() => navigate(`/financial?tab=statement&entityType=customer&entityId=${c.id}`)}
                >
                  <td>{c.name}</td>
                  <td className="num"><PrivateAmount value={c.outstanding} /></td>
                </tr>
              ))}
              {data.topCustomers.length === 0 && (
                <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>لا توجد بيانات</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="fin-dash-table">
          <h4>أعلى 5 موردين (ذمم)</h4>
          <table>
            <thead>
              <tr><th>الاسم</th><th>المبلغ</th></tr>
            </thead>
            <tbody>
              {data.topSuppliers.map(s => (
                <tr
                  key={s.id}
                  className="clickable-row"
                  onClick={() => navigate(`/financial?tab=statement&entityType=supplier&entityId=${s.id}`)}
                >
                  <td>{s.name}</td>
                  <td className="num"><PrivateAmount value={s.outstanding} /></td>
                </tr>
              ))}
              {data.topSuppliers.length === 0 && (
                <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>لا توجد بيانات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
