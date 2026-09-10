import { useEffect, useRef, useState, CSSProperties } from 'react';
import { printCurrentView } from '../utils/print';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { formatDate } from '../lib/date';
import { formatReportCell, formatCurrency } from '../lib/format';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { composeFromNode, getPageSpec } from '../printing';
import { fcMoneyHeader } from '../components/financial/financialLabels';
import { currentCurrencyLanguage } from '../stores/settingsStore';
import { DOC_FONT_STACK } from '../styles/fontRegistry';

type ReportColumnDef = { header: string; key: string; format?: 'currency'; align?: 'left' | 'center' | 'right' };
type ReportKpi = {
  label: string;
  value: string | number;
  format?: 'currency';
  hint?: string | number;
  hintFormat?: 'currency';
  color?: 'default' | 'green' | 'red' | 'blue';
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportSection = { title: string; note?: string; columns: ReportColumnDef[]; rows: any[]; totalsRow?: any };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportData = { title: string; subtitle?: string; columns: ReportColumnDef[]; rows: any[]; totalsRow?: any; kpis?: ReportKpi[]; sections?: ReportSection[] };

/**
 * تقارير تُطبع A4 **أفقيًا** رغم خلوّها من الأقسام التحليلية، لأن جدولها الرئيسي
 * نفسه عريض. «المقبوضات» (تسعة أعمدة) كانت أفقية بحكم قسم التوزيع؛ بعد إزالته
 * يُثبَّت اتجاهها هنا صراحةً بدل أن ينقلب عموديًا.
 */
const WIDE_TABLE_REPORTS: ReadonlySet<string> = new Set(['receipts']);

const th: CSSProperties = { border: '1px solid #cbd5e1', padding: '4px 8px', background: '#1d4e6f', color: '#fff', textAlign: 'right', fontSize: 10.5, fontWeight: 700, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
const td: CSSProperties = { border: '1px solid #e2e8f0', padding: '4px 8px', textAlign: 'right', fontSize: 9.5, fontWeight: 400 };
const tdNum: CSSProperties = { fontVariantNumeric: 'tabular-nums', fontWeight: 600 };
const tdTotals: CSSProperties = { ...td, fontSize: 10.5, fontWeight: 700, background: '#f0f3f7', WebkitPrintColorAdjust: 'exact' };
/** يبني تجاوز محاذاة أفقية/رأسية لعمود صرّح بـ `align` — كلا الخاصيتين معًا كما هو مطلوب. */
const alignStyle = (align?: 'left' | 'center' | 'right'): CSSProperties =>
  align ? { textAlign: align, verticalAlign: 'middle' } : {};

// ─── بطاقات المؤشرات التنفيذية ───────────────────────────────────────────────
// نفس ألوان لوحة التقرير المطبوع (الأزرق المؤسسي والرمادي) — بلا لوحة جديدة.
const KPI_PALETTE: Record<string, { bg: string; border: string }> = {
  blue:    { bg: '#eff6ff', border: '#93c5fd' },
  green:   { bg: '#f0fdf4', border: '#86efac' },
  red:     { bg: '#fff1f2', border: '#fca5a5' },
  default: { bg: '#f8fafc', border: '#e2e8f0' },
};

/** قيمة البطاقة: الرمز داخلها لأنها بلا عنوان عمود يحمله. */
function kpiText(value: unknown, format?: 'currency'): string {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'currency') return formatCurrency(value, { language: currentCurrencyLanguage() });
  return typeof value === 'number' ? formatReportCell(value, {}, { symbol: 'header' }) : String(value);
}

function KpiCards({ kpis }: { kpis: ReportKpi[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '0 0 12px' }}>
      {kpis.map((k, i) => {
        const c = KPI_PALETTE[k.color ?? 'default'] ?? KPI_PALETTE.default;
        return (
          <div
            key={`${k.label}-${i}`}
            style={{
              flex: '1 1 150px', minWidth: 130, padding: '7px 10px', borderRadius: 6,
              background: c.bg, border: `1px solid ${c.border}`, breakInside: 'avoid',
              WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
            }}
          >
            <div style={{ fontSize: 8.5, color: '#6b7280', marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{kpiText(k.value, k.format)}</div>
            {k.hint !== undefined && k.hint !== '' && (
              <div style={{ fontSize: 8.5, fontWeight: 600, color: '#475569', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {kpiText(k.hint, k.hintFormat)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * جدول التقرير — مُستخرَج من الجدول الرئيسي حرفيًا (نفس الأنماط السطرية) كي
 * تستعمله الأقسام التحليلية بلا لغة بصرية ثانية. `compact` يصغّر الخط للأقسام
 * العريضة (مصفوفة الأشهر) فتسع عرض الورقة.
 */
function PrintTable({ columns, rows, totalsRow, compact }: {
  columns: ReportColumnDef[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  totalsRow?: any;
  compact?: boolean;
}) {
  const shrink: CSSProperties = compact ? { fontSize: 8.5, padding: '3px 5px' } : {};
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compact ? 8.5 : 9.5 }}>
      <thead>
        {/* Phase E: الرمز مرّة واحدة في العنوان — والخلايا أرقام مجرّدة. */}
        <tr>{columns.map((c) => (
          <th key={c.key} style={{ ...th, ...(compact ? { fontSize: 9, padding: '3px 5px' } : {}), ...alignStyle(c.align) }}>
            {c.format === 'currency' ? fcMoneyHeader(c.header) : c.header}
          </th>
        ))}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
            {columns.map((c) => (
              <td key={c.key} style={{ ...(c.format === 'currency' ? { ...td, ...tdNum } : td), ...shrink, ...alignStyle(c.align) }}>
                {formatReportCell(row[c.key], c, { language: currentCurrencyLanguage(), symbol: 'header' })}
              </td>
            ))}
          </tr>
        ))}
        {totalsRow && (
          <tr style={{ breakInside: 'avoid' }}>
            {columns.map((c) => (
              <td
                key={c.key}
                style={{
                  ...tdTotals,
                  ...(compact ? { fontSize: 9, padding: '3px 5px' } : {}),
                  ...(c.format === 'currency' ? { fontVariantNumeric: 'tabular-nums' as const } : {}),
                  ...alignStyle(c.align),
                }}
              >
                {formatReportCell(totalsRow[c.key], c, { language: currentCurrencyLanguage(), symbol: 'header' })}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}


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

  /**
   * التقارير التحليلية تُطبع **أفقيًا**: مصفوفة «التصنيفات × الأشهر» تصل إلى أربعة
   * عشر عمودًا، ولا تُقرأ على A4 عمودي. الشرط معلّق على وجود أقسام تحليلية، فأي
   * تقرير لا يرسلها يبقى عموديًا كما كان بالضبط (وهو ما تفعله كل التقارير الأخرى).
   *
   * واستثناءً، تقارير جدولها وحده عريض فتُطبع أفقيًا بلا أقسام — `WIDE_TABLE_REPORTS`.
   */
  const hasSections = !!rep.sections?.length;
  const isLandscape = hasSections || WIDE_TABLE_REPORTS.has(type ?? '');
  const pageSpecId = isLandscape ? 'a4-landscape' : 'a4-portrait';
  const pageCss = isLandscape ? '@page { size: A4 landscape; margin: 10mm;' : '@page { margin: 12mm;';

  return (
    <div ref={printRootRef} style={{ padding: '18px 24px', fontFamily: DOC_FONT_STACK, maxWidth: isLandscape ? 1400 : 1100, margin: '0 auto', color: '#0f172a', background: '#fff', minHeight: '100vh' }}>
      {/* Print footer: only "صفحة X من Y" (page X of Y) */}
      <style>{`@media print { ${pageCss} @bottom-center { content: "صفحة " counter(page) " من " counter(pages); font-family: ${DOC_FONT_STACK}; font-size: 7px; color: #94a3b8; } } }`}</style>

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
              // نفس مقاس exportPdf السابق (A4 عمودي) لكل التقارير — إلا التحليلية
              // منها فتُرسم أفقيًا، مطابقةً لقاعدة `@page` أعلاه.
              pageSpec: getPageSpec(pageSpecId),
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

      {/* Executive KPI cards — للتقارير التي ترسلها فقط */}
      {rep.kpis && rep.kpis.length > 0 && <KpiCards kpis={rep.kpis} />}

      <PrintTable columns={rep.columns} rows={rep.rows} totalsRow={rep.totalsRow} />

      {/* Analytical sections — العنوان لا ينفصل عن جدوله عند انقسام الصفحة */}
      {rep.sections?.map((section, i) => (
        <section key={`${section.title}-${i}`} style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 11.5, fontWeight: 800, color: '#1d4e6f', margin: '0 0 4px', paddingBottom: 3, borderBottom: '1.5px solid #dbe3ea', breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>
            {section.title}
          </h2>
          {section.note && (
            <p style={{ fontSize: 8.5, color: '#64748b', margin: '0 0 5px', breakAfter: 'avoid', pageBreakAfter: 'avoid' }}>{section.note}</p>
          )}
          <PrintTable columns={section.columns} rows={section.rows} totalsRow={section.totalsRow} compact />
        </section>
      ))}
    </div>
  );
}
