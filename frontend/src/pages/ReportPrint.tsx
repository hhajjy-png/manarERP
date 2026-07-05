import { useEffect, useState, CSSProperties } from 'react';
import { printCurrentView } from '../utils/print';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { formatDate } from '../lib/date';
import { formatCurrency } from '../lib/format';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportData = { title: string; subtitle?: string; columns: { header: string; key: string; format?: 'currency' }[]; rows: any[]; totalsRow?: any };

const th: CSSProperties = { border: '1px solid #cbd5e1', padding: '8px 10px', background: '#1d4e6f', color: '#fff', textAlign: 'right', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
const td: CSSProperties = { border: '1px solid #e2e8f0', padding: '7px 10px', textAlign: 'right' };

function fmtCell(v: unknown, col: { format?: 'currency' }): string {
  if (v == null || v === '') return '';
  if (col.format === 'currency') return formatCurrency(v);
  if (typeof v === 'number') return v.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return String(v);
}

export default function ReportPrint() {
  const { type } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rep, setRep] = useState<ReportData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params: Record<string, string> = {};
    searchParams.forEach((v, k) => { if (v) params[k] = v; });

    (async () => {
      try {
        const r = await api.get(`/reports/${type}/preview`, { params });
        setRep(r.data.data);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [type, searchParams]);

  // فتح حوار الطباعة تلقائيًا بعد جاهزية المحتوى
  useEffect(() => {
    if (rep) {
      const t = setTimeout(() => printCurrentView(), 500);
      return () => clearTimeout(t);
    }
  }, [rep]);

  if (loading) return <div className="center-msg"><div className="spinner" />جارٍ تجهيز التقرير…</div>;
  if (error || !rep) return <div className="center-msg">تعذّر تحميل التقرير: {error}</div>;

  return (
    <div style={{ padding: 28, fontFamily: '"Cairo", Arial, sans-serif', maxWidth: 1100, margin: '0 auto', color: '#0f172a', background: '#fff', minHeight: '100vh' }}>
      <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (window.manar?.exportPdf) {
              await window.manar.exportPdf(`report-${type ?? 'report'}`);
            } else {
              printCurrentView();
            }
          }}
        >🖨️ حفظ PDF</button>
        <button className="btn secondary" onClick={() => navigate(-1)}>رجوع</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#3b82f6', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20, WebkitPrintColorAdjust: 'exact' }}>م</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1d4e6f', margin: 0 }}>{rep.title}</h1>
      </div>
      {rep.subtitle && <p style={{ textAlign: 'center', color: '#64748b', fontWeight: 600, margin: '2px 0' }}>{rep.subtitle}</p>}
      <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12, marginBottom: 18 }}>
        شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م · تاريخ التقرير: {formatDate(new Date())}
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>{rep.columns.map((c) => <th key={c.key} style={th}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rep.rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
              {rep.columns.map((c) => <td key={c.key} style={td}>{fmtCell(row[c.key], c)}</td>)}
            </tr>
          ))}
          {rep.totalsRow && (
            <tr>
              {rep.columns.map((c) => <td key={c.key} style={{ ...td, fontWeight: 800, background: '#f0f3f7', WebkitPrintColorAdjust: 'exact' }}>{fmtCell(rep.totalsRow[c.key], c)}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
