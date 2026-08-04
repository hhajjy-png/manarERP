import { useMemo, type ReactNode } from 'react';
import PrivateAmount from '../PrivateAmount';
import { StatusChip, Icon, SearchBox } from '../explorer/ExplorerKit';
import SortableHeader from '../SortableHeader';
import { useTableSort } from '../../hooks/useTableSort';
import { sortRowsClient } from '../../lib/clientSort';
import { normalizeSearch } from '../../lib/arabicSearch';
import type { AnalysisStatus } from './analysisTypes';
import { useT } from '../../lib/i18n';

/* ════════════════════════════════════════════════════════════════════════════
   جدول التحليل — الشكل الوحيد لكل جداول مركز التحليل المالي.

   مبني على `.xpl-table` من ExplorerKit بلا أي تصميم جديد: هذا الملف يضيف
   **السلوك** فقط (محاذاة الأعمدة، صفّ المجاميع، القصّ مع «عرض الكل»، وخلايا
   قابلة للضغط للتنقّل التفصيلي) لا لغة بصرية ثانية.
   ════════════════════════════════════════════════════════════════════════════ */

export interface AnalysisColumn<R> {
  key: string;
  label: string;
  /** المحاذاة داخل الخلية — الأرقام تُحاذى للنهاية دائمًا. */
  align?: 'start' | 'end' | 'center';
  /**
   * عمود نصّي يبتلع المساحة المتبقية ويُختصر بنقاط عند ضيقها، فتبقى الأعمدة
   * الرقمية بعرض محتواها كاملًا ولا يظهر تمرير أفقي.
   *
   * **عمود واحد لكل جدول**: عمودان قابلان للاقتطاع يقتسمان الفائض فيُختصر كلاهما
   * بلا داعٍ. يُوضع دائمًا على العمود النصّي المفتوح الطول (اسم عميل، وصف، تصنيف).
   */
  truncate?: boolean;
  /** نص تلميح الخليّة — يُقرن بـ`truncate` لإظهار القيمة الكاملة عند المرور. */
  title?: (row: R) => string;
  render: (row: R) => ReactNode;
  /** محتوى الخلية في صفّ المجاميع؛ غيابه يترك الخليّة فارغة. */
  total?: ReactNode;
  /**
   * القيمة الخام للفرز والبحث. وجودها هو ما يجعل العمود قابلًا للفرز؛ غيابها
   * يبقيه عمودَ عرض فقط. تُفصل عن `render` عمدًا: الفرز على رقم لا على عقدة React.
   */
  sortValue?: (row: R) => string | number | null;
}

/** أصناف الخليّة الموحّدة — الرأس والبيانات يبنيانها من هنا فلا ينحرف أحدهما. */
function cellClass<R>(c: AnalysisColumn<R>): string {
  return `fac-al-${c.align ?? 'start'}${c.truncate ? ' fac-truncate' : ''}`;
}

interface AnalysisTableProps<R> {
  columns: AnalysisColumn<R>[];
  rows: R[];
  rowKey: (row: R, index: number) => string;
  /** أقصى عدد صفوف معروضة قبل زرّ «عرض الكل». غيابه ⇒ عرض الكل دائمًا. */
  maxRows?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  /** نص زرّ التوسيع (مثلاً «عرض جميع المصروفات»). */
  expandLabel?: string;
  /** يُعرض بدل الجدول عند غياب الصفوف. */
  emptyLabel?: string;
  /** إظهار صفّ المجاميع (يستخدم `column.total`). */
  showTotals?: boolean;
  totalsLabel?: string;
  compact?: boolean;
  /**
   * يفعّل الفرز (على الأعمدة التي تعلن `sortValue`) ويحفظ اختيار المستخدم تحت
   * هذا المفتاح — نفس `useTableSort` المعتمد في كل جداول النظام.
   */
  sortKey?: string;
  /** يفعّل شريط بحث فوق الجدول، يبحث في كل قيم `sortValue` النصّية. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** يجعل الصفّ كله قابلًا للضغط (لوحة مفاتيح مدعومة) — للتنقّل التفصيلي. */
  onRowClick?: (row: R) => void;
  /** نصّ البحث — مملوك للمستدعي كي ينجو من إعادة رسم القسم. */
  search?: string;
  onSearchChange?: (value: string) => void;
}

export default function AnalysisTable<R>({
  columns,
  rows,
  rowKey,
  maxRows,
  expanded = false,
  onToggleExpand,
  expandLabel,
  emptyLabel,
  showTotals = false,
  totalsLabel,
  compact = false,
  sortKey,
  searchable = false,
  searchPlaceholder,
  onRowClick,
  search = '',
  onSearchChange,
}: AnalysisTableProps<R>) {
  const { t } = useT();
  // الخطّاف يُستدعى دائمًا (قواعد الخطّافات)؛ `sortKey` الغائب يعني مفتاحًا خاملًا.
  const sort = useTableSort(`fac:${sortKey ?? 'static'}`);

  const columnByKey = useMemo(
    () => new Map(columns.map((c) => [c.key, c])),
    [columns],
  );

  /** يقرأ القيمة الخام لعمود — مصدر واحد يشترك فيه البحث والفرز. */
  const rawValue = (row: R, key: string) => columnByKey.get(key)?.sortValue?.(row) ?? null;

  const filtered = useMemo(() => {
    const term = normalizeSearch(search);
    if (!searchable || term === '') return rows;
    const searchables = columns.filter((c) => c.sortValue);
    return rows.filter((row) =>
      searchables.some((c) => normalizeSearch(String(c.sortValue!(row) ?? '')).includes(term)),
    );
  }, [rows, columns, search, searchable]);

  const ordered = useMemo(
    () => (sortKey ? sortRowsClient(filtered, sort.sortBy, sort.sortDir, rawValue) : filtered),
    // `rawValue` مُشتقّة من columnByKey؛ إدراجها يعيد الحساب في كل رسم بلا داعٍ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, sort.sortBy, sort.sortDir, sortKey, columnByKey],
  );

  const limited = maxRows != null && !expanded ? ordered.slice(0, maxRows) : ordered;
  const hiddenCount = ordered.length - limited.length;
  const truncating = columns.some((c) => c.truncate);

  const searchBar = searchable && onSearchChange && (
    <div className="fac-table-search no-print">
      <SearchBox value={search} onChange={onSearchChange} placeholder={searchPlaceholder} />
    </div>
  );

  if (rows.length === 0) {
    return <p className="fac-empty">{emptyLabel ?? t('msg.empty')}</p>;
  }

  if (ordered.length === 0) {
    return (
      <>
        {searchBar}
        <p className="fac-empty">{t('msg.no_results')}</p>
      </>
    );
  }

  const tableClass = [
    'xpl-table',
    'xpl-table--zebra',
    'fac-table',
    compact ? 'fac-table--compact' : '',
    truncating ? 'fac-table--truncating' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      {searchBar}
      <div className="xpl-table-wrap">
        <table className={tableClass}>
          <thead>
            <tr>
              {columns.map((c) =>
                // عمود قابل للفرز فقط حين يعلن قيمة خامًا **و** الجدول مفعَّل الفرز.
                sortKey && c.sortValue ? (
                  <SortableHeader
                    key={c.key}
                    label={c.label}
                    title={c.label}
                    state={sort.getState(c.key)}
                    onToggle={() => sort.toggle(c.key)}
                    className={cellClass(c)}
                  />
                ) : (
                  <th key={c.key} className={cellClass(c)} scope="col" title={c.truncate ? c.label : undefined}>
                    {c.label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {limited.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                className={onRowClick ? 'xpl-row--click' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((c) => (
                  <td key={c.key} className={cellClass(c)} title={c.title?.(row)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {showTotals && (
            <tfoot>
              <tr className="fac-totals-row">
                {columns.map((c, i) => (
                  <td key={c.key} className={cellClass(c)}>
                    {i === 0 ? (totalsLabel ?? t('msg.total')) : c.total ?? null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {onToggleExpand && (hiddenCount > 0 || expanded) && (
        <button type="button" className="fac-expand" onClick={onToggleExpand}>
          <Icon name={expanded ? 'expand_less' : 'arrow_back'} />
          {expanded ? t('action.collapse') : expandLabel ?? t('action.expand')}
          {!expanded && hiddenCount > 0 && <span className="fac-expand-count">+{hiddenCount}</span>}
        </button>
      )}
    </>
  );
}

/* ── خلايا مشتركة ───────────────────────────────────────────────────────── */

const STATUS_TONE: Record<AnalysisStatus, 'green' | 'blue' | 'orange' | 'red' | 'neutral'> = {
  excellent: 'green',
  good: 'blue',
  acceptable: 'orange',
  weak: 'red',
  // نفس نغمة `weak` — الأيقونة أدناه هي ما يفصل «عالي الخطورة» عن «متأخر»،
  // فلا نُدخل لونًا سادسًا خارج لوحة الطقم المشترك.
  critical: 'red',
  none: 'neutral',
};

/** «عالي الخطورة» وحدها تحمل أيقونة — تمييز داخل نفس لغة الشارات المعتمدة. */
const STATUS_ICON: Partial<Record<AnalysisStatus, string>> = { critical: 'priority_high' };

/** تسميات الأداء (الربحية/المؤشرات). */
const STATUS_LABEL_KEY: Record<AnalysisStatus, string> = {
  excellent: 'fac.status.excellent',
  good: 'fac.status.good',
  acceptable: 'fac.status.acceptable',
  weak: 'fac.status.weak',
  critical: 'fac.status.critical',
  none: 'fac.status.none',
};

/** تسميات الذمم — نفس المقياس بمفردات تحصيل بدل مفردات أداء. */
const RECEIVABLE_LABEL_KEY: Record<AnalysisStatus, string> = {
  excellent: 'fac.rec.status.excellent',
  good: 'fac.rec.status.good',
  acceptable: 'fac.rec.status.watch',
  weak: 'fac.rec.status.overdue',
  critical: 'fac.rec.status.critical',
  none: 'fac.status.none',
};

export function StatusCell({
  status,
  variant = 'performance',
}: {
  status: AnalysisStatus;
  variant?: 'performance' | 'receivable';
}) {
  const { t } = useT();
  if (status === 'none') return <span className="fac-muted">—</span>;
  const labels = variant === 'receivable' ? RECEIVABLE_LABEL_KEY : STATUS_LABEL_KEY;
  return (
    <StatusChip tone={STATUS_TONE[status]} icon={STATUS_ICON[status]}>
      {t(labels[status])}
    </StatusChip>
  );
}

/** مبلغ قابل للضغط يفتح نافذة التفصيل. بلا `onClick` يبقى نصًّا عاديًا. */
export function MoneyCell({ value, onClick, title }: { value: number; onClick?: () => void; title?: string }) {
  const amount = <PrivateAmount value={value} level={1} />;
  if (!onClick) return <span className="fac-money">{amount}</span>;
  return (
    <button
      type="button"
      className="fac-money fac-drill"
      // إيقاف الانتشار إلزامي: داخل صفّ قابل للضغط كان النقر على المبلغ يفتح
      // تفصيل الخليّة **وتفصيل الصفّ** معًا.
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
    >
      {amount}
      <Icon name="open_in_new" />
    </button>
  );
}

/** تاريخ مختصر داخل جدول، أو شرطة خافتة عند غيابه. */
export function DateCell({ value }: { value: string | null }) {
  if (!value) return <span className="fac-muted">—</span>;
  return <span className="fac-mono">{value}</span>;
}

/** نسبة مئوية بمنزلتين، أو شرطة عند غياب أساس للحساب. */
export function PercentCell({ value, decimals = 2 }: { value: number | null; decimals?: number }) {
  if (value == null || !Number.isFinite(value)) return <span className="fac-muted">—</span>;
  return <span className="fac-num">{value.toFixed(decimals)}%</span>;
}

/** تغيّر مقابل الفترة السابقة — السهم يتبع الاتجاه، واللون يتبع المعنى. */
export function ChangeCell({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value == null || !Number.isFinite(value)) return <span className="fac-muted">—</span>;
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <span className={`fac-change fac-change--${good ? 'up' : 'down'}`}>
      <Icon name={up ? 'arrow_upward' : 'arrow_downward'} />
      {`${up ? '+' : ''}${value.toFixed(2)}%`}
    </span>
  );
}

/** `YYYY-MM` → `MM/YYYY` — أرقام غربية، بلا أسماء أشهر تتغيّر مع اللغة. */
export function monthDisplay(month: string): string {
  const [y, m] = month.split('-');
  return m && y ? `${m}/${y}` : month;
}
