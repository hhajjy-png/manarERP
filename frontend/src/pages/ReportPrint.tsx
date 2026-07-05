import { useEffect, useState, CSSProperties } from 'react';
import { printCurrentView } from '../utils/print';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { formatDate } from '../lib/date';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportData = { title: string; subtitle?: string; columns: { header: string; key: string }[]; rows: any[]; totalsRow?: any };

const th: CSSProperties = { border: '1px solid #cbd5e1', padding: '4px 8px', background: '#1d4e6f', color: '#fff', textAlign: 'right', fontSize: 10.5, fontWeight: 700, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
const td: CSSProperties = { border: '1px solid #e2e8f0', padding: '4px 8px', textAlign: 'right', fontSize: 9.5, fontWeight: 400 };
const tdNum: CSSProperties = { fontVariantNumeric: 'tabular-nums', fontWeight: 600 };

function fmt(v: unknown): string {
  if (v == null || v === '') return '';
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
    <div style={{ padding: '18px 24px', fontFamily: '"Cairo", Arial, sans-serif', maxWidth: 1100, margin: '0 auto', color: '#0f172a', background: '#fff', minHeight: '100vh' }}>
      {/* Print footer: only "صفحة X من Y" (page X of Y) */}
      <style>{`@media print { @page { margin: 12mm; @bottom-center { content: "صفحة " counter(page) " من " counter(pages); font-family: 'Cairo', Arial, sans-serif; font-size: 7px; color: #94a3b8; } } }`}</style>

      <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
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
        <button type="button" className="btn secondary" onClick={() => navigate(-1)}>رجوع</button>
      </div>

      {/* Company Name */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 2 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: '#3b82f6', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14, WebkitPrintColorAdjust: 'exact', flexShrink: 0 }}>م</div>
        <div style={{ fontSize: 17.5, fontWeight: 700, color: '#1d4e6f', lineHeight: 1.25, textAlign: 'center' }}>
          شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م
        </div>
      </div>

      {/* Report Title */}
      <h1 style={{ fontSize: 10.5, fontWeight: 800, color: '#1d4e6f', textAlign: 'center', margin: '6px 0 0' }}>{rep.title}</h1>

      {/* Summary Row (count / total / paid / remaining) */}
      {rep.subtitle && <p style={{ textAlign: 'center', color: '#334155', fontWeight: 600, fontSize: 10.5, margin: '3px 0 0' }}>{rep.subtitle}</p>}

      {/* Print Information (date) */}
      <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 9.5, fontWeight: 400, margin: '2px 0 12px' }}>
        تاريخ التقرير: {formatDate(new Date())}
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5 }}>
        <thead>
          <tr>{rep.columns.map((c) => <th key={c.key} style={th}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rep.rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
              {rep.columns.map((c) => <td key={c.key} style={typeof row[c.key] === 'number' ? { ...td, ...tdNum } : td}>{fmt(row[c.key])}</td>)}
            </tr>
          ))}
          {rep.totalsRow && (
            <tr>
              {rep.columns.map((c) => <td key={c.key} style={{ ...td, fontSize: 10.5, fontWeight: 700, background: '#f0f3f7', WebkitPrintColorAdjust: 'exact', ...(typeof rep.totalsRow[c.key] === 'number' ? { fontVariantNumeric: 'tabular-nums' as const } : {}) }}>{fmt(rep.totalsRow[c.key])}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
