import { useEffect, useRef, useState, CSSProperties } from 'react';
import { printCurrentView } from '../utils/print';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { formatDate } from '../lib/date';
import { formatReportCell } from '../lib/format';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { composeFromNode, getPageSpec } from '../printing';
import { fcMoneyHeader } from '../components/financial/financialLabels';
import { currentCurrencyLanguage } from '../stores/settingsStore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportData = { title: string; subtitle?: string; columns: { header: string; key: string; format?: 'currency'; align?: 'left' | 'center' | 'right' }[]; rows: any[]; totalsRow?: any };

const th: CSSProperties = { border: '1px solid #cbd5e1', padding: '4px 8px', background: '#1d4e6f', color: '#fff', textAlign: 'right', fontSize: 10.5, fontWeight: 700, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
const td: CSSProperties = { border: '1px solid #e2e8f0', padding: '4px 8px', textAlign: 'right', fontSize: 9.5, fontWeight: 400 };
const tdNum: CSSProperties = { fontVariantNumeric: 'tabular-nums', fontWeight: 600 };
/** يبني تجاوز محاذاة أفقية/رأسية لعمود صرّح بـ `align` — كلا الخاصيتين معًا كما هو مطلوب. */
const alignStyle = (align?: 'left' | 'center' | 'right'): CSSProperties =>
  align ? { textAlign: align, verticalAlign: 'middle' } : {};


export default function ReportPrint() {
  const { type } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rep, setRep] = useState<ReportData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  /** جذر المستند المطبوع — نفس العقدة التي يطبعها المسار القديم، وهي مصدر الـ PDF الآن. */
  const printRootRef = useRef<HTMLDivElement>(null);

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
    <div ref={printRootRef} style={{ padding: '18px 24px', fontFamily: '"Cairo", Arial, sans-serif', maxWidth: 1100, margin: '0 auto', color: '#0f172a', background: '#fff', minHeight: '100vh' }}>
      {/* Print footer: only "صفحة X من Y" (page X of Y) */}
      <style>{`@media print { @page { margin: 12mm; @bottom-center { content: "صفحة " counter(page) " من " counter(pages); font-family: 'Cairo', Arial, sans-serif; font-size: 7px; color: #94a3b8; } } }`}</style>

      <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            /**
             * PDF من المستند، لا من النافذة الحيّة.
             *
             * `exportPdf` يلتقط نافذة التطبيق كما هي، وElectron يتجاهل `@media print` هناك،
             * فتُرسم قشرة التطبيق الداكنة داخل الـ PDF («الإطار الأسود»). التقرير هنا مُنسَّق
             * بأنماط سطرية بالكامل، فيكفي `composeFromNode` — لا التقاط أوراق أنماط.
             * المحتوى والترتيب والأعمدة والمجاميع كما هي حرفيًا؛ يتغيّر **مصدر** الرسم فقط.
             */
            const name = generateExportFileName({ reportName: ReportName.Report, identifier: type ?? null, extension: 'pdf' });
            const node = printRootRef.current;
            const exportFromHtml = window.manar?.exportPdfFromHtml;
            if (!exportFromHtml || !node) {
              // بيئة قديمة بلا الجسر — السلوك السابق كما هو.
              if (window.manar?.exportPdf) await window.manar.exportPdf(name);
              else printCurrentView();
              return;
            }
            const html = composeFromNode({
              node,
              pageSpec: getPageSpec('a4-portrait'), // نفس مقاس exportPdf السابق (A4)
              title: rep.title,
              lang: 'ar',
              stripSelectors: ['.no-print'], // شريط الأزرار لا يدخل الورقة — كما في الطباعة
            });
            await exportFromHtml(html, name);
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
          {/* Phase E: الرمز مرّة واحدة في العنوان — والخلايا أرقام مجرّدة. */}
          <tr>{rep.columns.map((c) => (
            <th key={c.key} style={{ ...th, ...alignStyle(c.align) }}>{c.format === 'currency' ? fcMoneyHeader(c.header) : c.header}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rep.rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
              {rep.columns.map((c) => <td key={c.key} style={{ ...(c.format === 'currency' ? { ...td, ...tdNum } : td), ...alignStyle(c.align) }}>{formatReportCell(row[c.key], c, { language: currentCurrencyLanguage(), symbol: 'header' })}</td>)}
            </tr>
          ))}
          {rep.totalsRow && (
            <tr>
              {rep.columns.map((c) => <td key={c.key} style={{ ...td, fontSize: 10.5, fontWeight: 700, background: '#f0f3f7', WebkitPrintColorAdjust: 'exact', ...(c.format === 'currency' ? { fontVariantNumeric: 'tabular-nums' as const } : {}), ...alignStyle(c.align) }}>{formatReportCell(rep.totalsRow[c.key], c, { language: currentCurrencyLanguage(), symbol: 'header' })}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
