import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { usePersistedState } from '../hooks/usePersistedState';
import { useTableSort } from '../hooks/useTableSort';
import SortableHeader from '../components/SortableHeader';
import SearchableSelect, { type SearchableOption } from '../components/SearchableSelect';
import DateInput from '../components/DateInput';
import { MoneyText, MoneyCell, dateText } from '../config/modules';
import { fetchAllRows, downloadTableExcel } from '../utils/exportUtils';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { formatDateTime } from '../lib/date';
import {
  RECEIPT_METHODS,
  RECEIPT_METHOD_GROUPS,
  RECEIPT_INVOICE_STATUSES,
  receiptMethodMeta,
  receiptStatusMeta,
} from '../config/receiptPresentation';
import {
  RECEIPT_PRESETS,
  matchPreset,
  presetRange,
  type ReceiptPreset,
} from '../lib/receiptPeriods';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
  SectionCard,
  StatusChip,
  SearchBox,
  FilterChip,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Pagination,
  Drawer,
  DrawerHeaderCard,
  DrawerInfoGrid,
  DrawerActionBar,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Receipts.css';

/* ════════════════════════════════════════════════════════════════════════════
   صفحة المقبوضات — المرجع التشغيلي اليومي لما قُبض من العملاء.

   ═══ مصدر البيانات ═══
   `GET /api/receipts` و`/summary` — كلاهما فوق `Payment` لفواتير مبيعات فعّالة،
   وهو نفس المصدر الذي يقرؤه `getCollections` في المحرّك التشغيلي. لا تقرأ هذه
   الصفحة أي جدول آخر، فلا يمكن أن يظهر مبلغ مرّتين.

   ═══ التاريخ الحاكم ═══
   `Payment.date` — «تاريخ القبض» الذي يُدخله المستخدم عند تسجيل الدفعة، لا
   `createdAt` (ختم إدخال النظام). هذا هو التاريخ الذي يحكم القيد المحاسبي وكل
   تقارير التحصيل في النظام، فتبقى الصفحة متّسقة معها كلّها.

   ═══ لماذا لا يوجد فلتر «حالة الشيك» ═══
   لا يملك النظام دورة حياة لشيك العميل الوارد: `Payment` بلا حقل حالة، وجدول
   `cheques` صادر بالكامل (مستفيد + طباعة + سند صرف). فكل قبضٍ مسجَّل هو قبض
   مؤكَّد بتاريخه. اختراع «مستلم/مودع/محصَّل/مرتجع» كان سيعرض حالات لا مصدر لها.
   الحالة المعروضة هي حالة **سداد الفاتورة** المقبوض ضدّها، وهي مسمّاة كذلك
   صراحةً في الواجهة، ومصحوبة بإفصاح دائم أعلى الجدول.
   ════════════════════════════════════════════════════════════════════════════ */

const PAGE_SIZE = 15;
const SEARCH_DEBOUNCE_MS = 350;

interface ReceiptRow {
  id: number;
  date: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  invoiceId: number | null;
  invoiceNumber: string | null;
  invoiceIssueDate: string | null;
  invoiceTotal: number | null;
  invoiceRemaining: number | null;
  invoiceStatus: string | null;
  customerId: number | null;
  customerName: string | null;
  contractId: number | null;
  contractCode: string | null;
}

interface MethodRow {
  method: string;
  total: number;
  count: number;
  percent: number | null;
}

interface ReceiptsSummary {
  totals: { total: number; count: number; average: number };
  largest: { id: number; amount: number; date: string; method: string; customerName: string | null; invoiceNumber: string | null } | null;
  byMethod: MethodRow[];
  months: {
    current: { total: number; count: number; from: string; to: string };
    previous: { total: number; count: number; from: string; to: string };
    delta: number;
    percent: number | null;
  };
}

interface PageMeta { page: number; pageSize: number; total: number; totalPages: number }

/** الفترة الافتراضية عند أول فتح: هذا الشهر — سؤال الصفحة الأول. */
const DEFAULT_RANGE = () => presetRange('this-month');

export default function Receipts() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  // ── الفلاتر (محفوظة لكل مستخدم على هذا الجهاز تحت البادئة `rcp:`) ──
  const [from, setFrom] = usePersistedState('rcp:from', DEFAULT_RANGE().from);
  const [to, setTo] = usePersistedState('rcp:to', DEFAULT_RANGE().to);
  const [customerId, setCustomerId] = usePersistedState('rcp:customer', '');
  const [method, setMethod] = usePersistedState('rcp:method', '');
  const [invoiceStatus, setInvoiceStatus] = usePersistedState('rcp:status', '');
  const [searchInput, setSearchInput] = usePersistedState('rcp:search', '');
  const [minAmount, setMinAmount] = usePersistedState('rcp:min', '');
  const [maxAmount, setMaxAmount] = usePersistedState('rcp:max', '');
  const [page, setPage] = usePersistedState('rcp:page', 1);
  const [advancedOpen, setAdvancedOpen] = usePersistedState('rcp:adv', false);

  /**
   * البحث مُهدَّأ: الكتابة تُحدِّث الحقل فورًا (لا تأخّر مرئي) وتُطلق الطلب بعد
   * سكونٍ قصير. بلا ذلك يذهب طلب لكل حرف — وترتيب وصولها غير مضمون.
   */
  const [search, setSearch] = useState(searchInput);
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchInput]);

  const sort = useTableSort('receipts', () => setPage(1));

  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [summary, setSummary] = useState<ReceiptsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [customers, setCustomers] = useState<{ id: number; name: string }[]>([]);
  const [viewing, setViewing] = useState<ReceiptRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  /**
   * معطيات المجموعة — **المصدر الوحيد** الذي تستهلكه القائمة والملخّص والتصدير
   * معًا. هويّة مستقرّة عبر `useMemo` كي لا يُعاد إطلاق التأثيرات في كل رسم.
   */
  const filterParams = useMemo(() => ({
    from: from || undefined,
    to: to || undefined,
    customerId: customerId || undefined,
    method: method || undefined,
    invoiceStatus: invoiceStatus || undefined,
    search: search || undefined,
    minAmount: minAmount || undefined,
    maxAmount: maxAmount || undefined,
  }), [from, to, customerId, method, invoiceStatus, search, minAmount, maxAmount]);

  const sortParams = useMemo(
    () => (sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}),
    [sort.sortBy, sort.sortDir],
  );

  /* ── الجلب ─────────────────────────────────────────────────────────────
     طلبان منفصلان بحارسَي سباق مستقلّين:
       • القائمة  — تتغيّر مع الفلاتر والصفحة والفرز.
       • الملخّص  — يتغيّر مع الفلاتر وحدها، فتقليب الصفحات لا يُعيد أي تجميع.
     الحارس ضروري: تغيير فلتر بسرعة يُطلق طلبات متتالية وترتيب وصولها غير مضمون،
     فاستجابة قديمة بطيئة كانت ستكتب فوق أحدث منها. */

  const listReqRef = useRef(0);
  const summaryReqRef = useRef(0);

  const loadList = useCallback(async () => {
    const reqId = ++listReqRef.current;
    setLoading(true);
    setListError('');
    try {
      const res = await api.get('/receipts', { params: { page, pageSize: PAGE_SIZE, ...filterParams, ...sortParams } });
      if (reqId !== listReqRef.current) return;
      setRows(res.data?.data?.data ?? []);
      setMeta(res.data?.data?.meta ?? null);
    } catch (e) {
      if (reqId !== listReqRef.current) return;
      setListError(errorMessage(e));
      setRows([]);
      setMeta(null);
    } finally {
      if (reqId === listReqRef.current) setLoading(false);
    }
  }, [page, filterParams, sortParams]);

  const loadSummary = useCallback(async () => {
    const reqId = ++summaryReqRef.current;
    setSummaryError('');
    try {
      const res = await api.get('/receipts/summary', { params: filterParams });
      if (reqId !== summaryReqRef.current) return;
      setSummary(res.data?.data ?? null);
    } catch (e) {
      if (reqId !== summaryReqRef.current) return;
      // إبطال القيمة القديمة صراحةً: بطاقات فلترٍ سابق فوق جدول فلترٍ جديد
      // رقمٌ صحيح لمجموعة خاطئة — أسوأ من غياب الرقم.
      setSummary(null);
      setSummaryError(errorMessage(e));
    }
  }, [filterParams]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  useEffect(() => {
    api.get('/customers', { params: { pageSize: 300 } })
      .then((r) => setCustomers(r.data?.data?.data ?? []))
      .catch(() => {});
  }, []);

  /* ── الفلاتر: تغييرٌ يعود دائمًا إلى الصفحة الأولى ───────────────────── */

  function applyPreset(key: Exclude<ReceiptPreset, 'custom'>) {
    const range = presetRange(key);
    setFrom(range.from);
    setTo(range.to);
    setPage(1);
  }

  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  function resetFilters() {
    const range = DEFAULT_RANGE();
    setFrom(range.from);
    setTo(range.to);
    setCustomerId('');
    setMethod('');
    setInvoiceStatus('');
    setSearchInput('');
    setSearch('');
    setMinAmount('');
    setMaxAmount('');
    setPage(1);
    sort.reset();
  }

  const activePreset = matchPreset({ from, to });

  const customerName = useMemo(
    () => customers.find((c) => String(c.id) === customerId)?.name ?? customerId,
    [customers, customerId],
  );

  /**
   * الفلاتر النشطة القابلة للإزالة منفردةً.
   *
   * النطاق الزمني **ليس** منها عمدًا: الصفحة لا تعمل بلا فترة (تعني «كل التاريخ»
   * وهي ليست سؤالًا تشغيليًا)، فإزالته المنفردة كانت ستترك حالة بلا معنى.
   * تغييره يجري من أزرار الاختصار أو الحقلين، وزرّ «إعادة ضبط» يعيده إلى الشهر.
   */
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (customerId) chips.push({ key: 'customer', label: `${t('rcp.filter.customer')}: ${customerName}`, clear: () => changeFilter(() => setCustomerId('')) });
    if (method) chips.push({ key: 'method', label: `${t('rcp.filter.method')}: ${t(receiptMethodMeta(method).key)}`, clear: () => changeFilter(() => setMethod('')) });
    if (invoiceStatus) chips.push({ key: 'status', label: `${t('rcp.filter.status')}: ${t(receiptStatusMeta(invoiceStatus).key)}`, clear: () => changeFilter(() => setInvoiceStatus('')) });
    if (search) chips.push({ key: 'search', label: `${t('action.search')}: ${search}`, clear: () => changeFilter(() => { setSearchInput(''); setSearch(''); }) });
    if (minAmount) chips.push({ key: 'min', label: `${t('rcp.filter.min_amount')}: ${minAmount}`, clear: () => changeFilter(() => setMinAmount('')) });
    if (maxAmount) chips.push({ key: 'max', label: `${t('rcp.filter.max_amount')}: ${maxAmount}`, clear: () => changeFilter(() => setMaxAmount('')) });
    return chips;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, customerName, method, invoiceStatus, search, minAmount, maxAmount, t]);

  const advancedCount = (minAmount ? 1 : 0) + (maxAmount ? 1 : 0);
  const isFiltered = activeChips.length > 0 || activePreset !== 'this-month';

  /* ── الأعمدة: مصدر واحد للجدول المرئي ولتصدير Excel معًا ─────────────── */

  interface ReceiptColumn {
    key: string;
    header: string;
    plainLabel: string;
    sortable?: boolean;
    align?: 'end';
    render: (r: ReceiptRow) => ReactNode;
    exportValue: (r: ReceiptRow) => string | number | null | undefined;
    money?: boolean;
  }

  /**
   * دلالة `reference` تتبع الوسيلة: رقم شيك، رقم تحويل، أو اسم مستلم (نقدًا،
   * ويُخزَّن في `notes`). عمودٌ واحد ذكيّ بدل ثلاثة أعمدة تبقى فارغة لأغلب الصفوف
   * — وهذا ما يجعل صفًّا نقديًا لا يبدو جدولًا مكسورًا.
   *
   * لا يوجد عمود «البنك» ولا «تاريخ الشيك»: `Payment` لا يحمل أيًّا منهما، وعمود
   * فارغ في كل صفّ يُوهم بعطل لا بغياب.
   */
  function referenceOf(r: ReceiptRow): string {
    if (r.method === 'CASH') return r.notes?.trim() || '—';
    return r.reference?.trim() || '—';
  }

  /**
   * هل المرجع لاتينيّ خالص («004108»، «0409TR8821»)؟
   *
   * الحقل نصّ حرّ: قد يحمل رقمًا لاتينيًا أو جملة عربية («شيك رقم 004066
   * التجاري»). عرض الجملة العربية داخل حقل LTR يقلب ترتيب كلماتها بصريًا —
   * رُصد فعليًا في لقطة المراجعة. الجدول يحلّها بـ`unicode-bidi: plaintext`،
   * ولوحة التفاصيل تحتاج قرارًا صريحًا لأن `ltr` عَلَم منطقي في عقد `InfoItem`.
   */
  function isLatinReference(value: string): boolean {
    return /^[\x20-\x7E]+$/.test(value);
  }

  const columns: ReceiptColumn[] = useMemo(() => [
    {
      key: 'date',
      header: t('rcp.col.date'),
      plainLabel: t('rcp.col.date'),
      sortable: true,
      render: (r) => <span className="rcpx-date">{dateText(r.date)}</span>,
      exportValue: (r) => dateText(r.date),
    },
    {
      key: 'customer',
      header: t('rcp.col.customer'),
      plainLabel: t('rcp.col.customer'),
      sortable: true,
      render: (r) => <strong>{r.customerName ?? '—'}</strong>,
      exportValue: (r) => r.customerName ?? '—',
    },
    {
      key: 'invoiceNumber',
      header: t('rcp.col.invoice'),
      plainLabel: t('rcp.col.invoice'),
      render: (r) => <span className="rcpx-mono">{r.invoiceNumber ?? '—'}</span>,
      exportValue: (r) => r.invoiceNumber ?? '—',
    },
    {
      key: 'method',
      header: t('rcp.col.method'),
      plainLabel: t('rcp.col.method'),
      sortable: true,
      render: (r) => {
        const m = receiptMethodMeta(r.method);
        return <StatusChip tone={m.tone} icon={m.icon}>{t(m.key)}</StatusChip>;
      },
      exportValue: (r) => t(receiptMethodMeta(r.method).key),
    },
    {
      key: 'reference',
      header: t('rcp.col.reference'),
      plainLabel: t('rcp.col.reference'),
      render: (r) => <span className="rcpx-mono">{referenceOf(r)}</span>,
      exportValue: (r) => referenceOf(r),
    },
    {
      key: 'invoiceStatus',
      header: t('rcp.col.invoice_status'),
      plainLabel: t('rcp.col.invoice_status'),
      render: (r) => {
        const s = receiptStatusMeta(r.invoiceStatus);
        return <StatusChip tone={s.tone} icon={s.icon}>{t(s.key)}</StatusChip>;
      },
      exportValue: (r) => t(receiptStatusMeta(r.invoiceStatus).key),
    },
    {
      key: 'amount',
      header: t('rcp.col.amount'),
      plainLabel: t('rcp.col.amount'),
      sortable: true,
      align: 'end',
      money: true,
      render: (r) => <span className="rcpx-amount"><MoneyCell value={r.amount} /></span>,
      exportValue: (r) => Number(r.amount ?? 0),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [t]);

  /**
   * التصدير يحترم الفلاتر والفرز الحاليَّين ويجلب **كل** النتائج المطابقة عبر
   * الصفحات (`fetchAllRows` يكرّر بـ200 صف/صفحة) — لا الصفحة المعروضة وحدها.
   */
  async function exportExcel() {
    setExporting(true);
    setExportError('');
    try {
      const all = await fetchAllRows<ReceiptRow>('/receipts', { ...filterParams, ...sortParams });
      downloadTableExcel(
        all,
        columns.map((c) => ({ header: c.header, value: c.exportValue, money: c.money })),
        generateExportFileName({ reportName: ReportName.Receipts, extension: 'xlsx' }),
      );
    } catch (e) {
      setExportError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  /* ── تجميعة الوسائل للبطاقات وشريط التفصيل ──────────────────────────── */

  const methodTotals = useMemo(() => {
    const map = new Map<string, MethodRow>((summary?.byMethod ?? []).map((r) => [r.method, r]));
    return RECEIPT_METHOD_GROUPS.map((g) => {
      const parts = g.methods.map((m) => map.get(m)).filter(Boolean) as MethodRow[];
      const total = parts.reduce((s, p) => s + p.total, 0);
      const count = parts.reduce((s, p) => s + p.count, 0);
      const base = summary?.totals.total ?? 0;
      return { ...g, total, count, percent: base > 0 ? (total / base) * 100 : null };
    });
  }, [summary]);

  const months = summary?.months;
  const deltaDir: 'up' | 'down' = (months?.delta ?? 0) >= 0 ? 'up' : 'down';
  const deltaText = months
    ? months.percent === null
      ? t('rcp.kpi.no_previous_base')
      : `${months.percent > 0 ? '+' : ''}${months.percent.toFixed(1)}%`
    : '';

  const customerOptions: SearchableOption[] = useMemo(
    () => customers.map((c) => ({ value: String(c.id), label: String(c.name) })),
    [customers],
  );

  return (
    <div className="xpl-scope xpl-page">
      <ExecutiveHeader
        icon="account_balance_wallet"
        title={t('rcp.title')}
        subtitle={t('rcp.subtitle')}
        chips={summary ? (
          <>
            <IdChip icon="tag" tone="indigo">{summary.totals.count} {t('rcp.unit.receipt')}</IdChip>
            <IdChip icon="calculate" tone="blue">{t('rcp.kpi.average')}: <MoneyText value={summary.totals.average} /></IdChip>
          </>
        ) : undefined}
        aside={hasPermission('reports.export') ? (
          <Button variant="secondary" icon="table_view" busy={exporting} onClick={exportExcel}>Excel</Button>
        ) : undefined}
      />

      {/* ── بطاقات المؤشرات ── */}
      {summary && (
        <div className="rcpx-metrics">
          <HeroMetric
            icon="account_balance_wallet"
            label={t('rcp.kpi.total')}
            value={<MoneyText value={summary.totals.total} />}
            sub={<><span className="material-symbols-outlined">receipt_long</span>{t('rcp.kpi.total_sub', { count: summary.totals.count })}</>}
          />
          <div className="xpl-kpi-grid">
            <MetricCard
              icon="calendar_month"
              tone="blue"
              label={t('rcp.kpi.current_month')}
              value={<MoneyText value={months?.current.total ?? 0} />}
              sub={t('rcp.kpi.ops_count', { count: months?.current.count ?? 0 })}
              trend={months ? { dir: deltaDir, text: deltaText } : undefined}
            />
            <MetricCard
              icon="history"
              tone="neutral"
              label={t('rcp.kpi.previous_month')}
              value={<MoneyText value={months?.previous.total ?? 0} />}
              sub={t('rcp.kpi.ops_count', { count: months?.previous.count ?? 0 })}
            />
            <MetricCard
              icon="difference"
              tone={deltaDir === 'up' ? 'green' : 'red'}
              label={t('rcp.kpi.delta')}
              value={<MoneyText value={months?.delta ?? 0} />}
              sub={deltaText}
            />
            <MetricCard
              icon="tag"
              tone="indigo"
              label={t('rcp.kpi.count')}
              value={(summary.totals.count).toLocaleString('en-US')}
              sub={t('rcp.kpi.count_sub')}
            />
            {methodTotals.map((g) => (
              <MetricCard
                key={g.key}
                icon={g.icon}
                tone={g.tone}
                label={t(g.labelKey)}
                value={<MoneyText value={g.total} />}
                sub={g.percent === null
                  ? t('rcp.kpi.ops_count', { count: g.count })
                  : `${g.percent.toFixed(1)}% · ${t('rcp.kpi.ops_count', { count: g.count })}`}
                active={g.methods.length === 1 && method === g.methods[0]}
                onClick={g.methods.length === 1
                  ? () => changeFilter(() => setMethod(method === g.methods[0] ? '' : g.methods[0]))
                  : undefined}
              />
            ))}
            {summary.largest && (
              <MetricCard
                icon="trending_up"
                tone="green"
                label={t('rcp.kpi.largest')}
                value={<MoneyText value={summary.largest.amount} />}
                sub={summary.largest.customerName ?? '—'}
              />
            )}
          </div>
        </div>
      )}

      {/* ── تفصيل وسائل القبض ── */}
      {summary && summary.totals.total > 0 && (
        <SectionCard title={t('rcp.section.breakdown')} icon="donut_small">
          <div className="rcpx-breakdown">
            {summary.byMethod.map((m) => {
              const meta = receiptMethodMeta(m.method);
              const pct = m.percent ?? 0;
              return (
                <div className="rcpx-break-row" key={m.method}>
                  <span className="rcpx-break-label">
                    <span className="material-symbols-outlined" aria-hidden="true">{meta.icon}</span>
                    {t(meta.key)}
                  </span>
                  <span className="rcpx-break-bar" role="presentation">
                    <span className={`rcpx-break-fill rcpx-break-fill--${meta.tone}`} style={{ inlineSize: `${Math.max(pct, 0)}%` }} />
                  </span>
                  <span className="rcpx-break-pct">{m.percent === null ? '—' : `${pct.toFixed(1)}%`}</span>
                  <span className="rcpx-break-count">{t('rcp.kpi.ops_count', { count: m.count })}</span>
                  <span className="rcpx-break-value"><MoneyText value={m.total} /></span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {summaryError && <ErrorBanner>{summaryError} <button type="button" className="xpl-clear-link" onClick={loadSummary}>{t('action.refresh')}</button></ErrorBanner>}
      {exportError && <ErrorBanner>{exportError}</ErrorBanner>}

      {/* ── شريط الفلاتر ── */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        {/* الصفّ ١: اختصارات الفترة */}
        <div className="xpl-toolbar-row">
          {RECEIPT_PRESETS.map((p) => (
            <FilterChip key={p.key} active={activePreset === p.key} onClick={() => applyPreset(p.key)}>
              {t(p.labelKey)}
            </FilterChip>
          ))}
          <div className="rcpx-range">
            <div className="xpl-field">
              <span className="xpl-field-label">{t('rcp.filter.from')}</span>
              <DateInput className="xpl-input" value={from} onChange={(v) => changeFilter(() => setFrom(v))} ariaLabel={t('rcp.filter.from')} />
            </div>
            <div className="xpl-field">
              <span className="xpl-field-label">{t('rcp.filter.to')}</span>
              <DateInput className="xpl-input" value={to} onChange={(v) => changeFilter(() => setTo(v))} ariaLabel={t('rcp.filter.to')} />
            </div>
          </div>
        </div>

        {/* الصفّ ٢: البحث + العميل + الوسيلة + الحالة */}
        <div className="xpl-toolbar-row">
          <SearchBox
            value={searchInput}
            onChange={(v) => changeFilter(() => setSearchInput(v))}
            placeholder={t('rcp.search.placeholder')}
            ariaLabel={t('rcp.search.aria')}
          />
          <div className="xpl-field" style={{ minWidth: 210 }}>
            <span className="xpl-field-label">{t('rcp.filter.customer')}</span>
            <SearchableSelect
              options={customerOptions}
              value={customerId}
              onChange={(v) => changeFilter(() => setCustomerId(v))}
              emptyLabel={t('rcp.filter.all_customers')}
              ariaLabel={t('rcp.filter.customer')}
              searchPlaceholder={t('rcp.filter.search_customers')}
            />
          </div>
          <div className="xpl-field" style={{ minWidth: 170 }}>
            <span className="xpl-field-label">{t('rcp.filter.method')}</span>
            <select className="xpl-select" aria-label={t('rcp.filter.method')} value={method} onChange={(e) => changeFilter(() => setMethod(e.target.value))}>
              <option value="">{t('rcp.filter.all_methods')}</option>
              {RECEIPT_METHODS.map((m) => (
                <option key={m} value={m}>{t(receiptMethodMeta(m).key)}</option>
              ))}
            </select>
          </div>
          <div className="xpl-field" style={{ minWidth: 190 }}>
            <span className="xpl-field-label">{t('rcp.filter.status')}</span>
            <select className="xpl-select" aria-label={t('rcp.filter.status')} value={invoiceStatus} onChange={(e) => changeFilter(() => setInvoiceStatus(e.target.value))}>
              <option value="">{t('rcp.filter.all_statuses')}</option>
              {RECEIPT_INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>{t(receiptStatusMeta(s).key)}</option>
              ))}
            </select>
          </div>
          <Button
            variant="ghost"
            icon="tune"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
          >
            {t('rcp.filter.advanced')}{advancedCount > 0 ? ` (${advancedCount})` : ''}
          </Button>
          <Button variant="ghost" icon="restart_alt" onClick={resetFilters} disabled={!isFiltered}>
            {t('rcp.filter.reset')}
          </Button>
        </div>

        {/* الصفّ ٣: الفلاتر المتقدّمة — مطويّة افتراضيًا كي لا يزدحم الشريط */}
        {advancedOpen && (
          <div className="xpl-toolbar-row">
            <div className="xpl-field" style={{ minWidth: 150 }}>
              <span className="xpl-field-label">{t('rcp.filter.min_amount')}</span>
              <input
                className="xpl-input" type="number" min={0} inputMode="decimal"
                value={minAmount} aria-label={t('rcp.filter.min_amount')}
                onChange={(e) => changeFilter(() => setMinAmount(e.target.value))}
              />
            </div>
            <div className="xpl-field" style={{ minWidth: 150 }}>
              <span className="xpl-field-label">{t('rcp.filter.max_amount')}</span>
              <input
                className="xpl-input" type="number" min={0} inputMode="decimal"
                value={maxAmount} aria-label={t('rcp.filter.max_amount')}
                onChange={(e) => changeFilter(() => setMaxAmount(e.target.value))}
              />
            </div>
          </div>
        )}

        {/* الصفّ ٤: الفلاتر النشطة + عدّاد النتائج */}
        <div className="xpl-active-row">
          <div className="xpl-active-chips">
            <span className="xpl-active-chip rcpx-period-chip">
              <span className="material-symbols-outlined" aria-hidden="true">date_range</span>
              {activePreset === 'custom' ? t('rcp.period.custom') : t(RECEIPT_PRESETS.find((p) => p.key === activePreset)!.labelKey)}
              {' · '}{dateText(from)} — {dateText(to)}
            </span>
            {activeChips.map((c) => (
              <span key={c.key} className="xpl-active-chip">
                {c.label}
                <button type="button" onClick={c.clear} aria-label={t('rcp.filter.remove', { label: c.label })}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </span>
            ))}
          </div>
          <span className="xpl-result-count">{t('rcp.result_count', { count: meta?.total ?? rows.length })}</span>
        </div>
      </div>

      {/* إفصاح دائم: تعريف «مقبوض» في هذا النظام — لا يعتمد على قراءة التقرير. */}
      <p className="rcpx-disclosure">
        <span className="material-symbols-outlined" aria-hidden="true">info</span>
        {t('rcp.disclosure')}
      </p>

      {listError && <ErrorBanner>{listError} <button type="button" className="xpl-clear-link" onClick={loadList} disabled={loading}>{t('action.refresh')}</button></ErrorBanner>}

      {/* ── الجدول ── */}
      <SectionCard title={t('rcp.section.table')} icon="table_rows" padded={false}>
        {loading ? (
          <div className="xpl-card--pad" style={{ padding: 16 }}><SkeletonRows rows={7} withAvatar={false} /></div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="account_balance_wallet"
            tone="neutral"
            title={t('rcp.empty.title')}
            message={t('rcp.empty.message')}
            action={<Button variant="secondary" icon="restart_alt" onClick={resetFilters}>{t('rcp.empty.reset')}</Button>}
          />
        ) : (
          <>
            <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="xpl-table rcpx-table">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      c.sortable ? (
                        <SortableHeader key={c.key} label={c.header} title={c.plainLabel} state={sort.getState(c.key)} onToggle={() => sort.toggle(c.key)} />
                      ) : (
                        <th key={c.key}>{c.header}</th>
                      )
                    ))}
                    <th aria-label={t('a11y.open_row')} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      id={`row-${r.id}`}
                      className="xpl-row--click"
                      tabIndex={0}
                      role="button"
                      aria-label={t('rcp.aria.open_receipt', { customer: r.customerName ?? '—' })}
                      onClick={() => setViewing(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(r); } }}
                    >
                      {columns.map((c) => (
                        <td key={c.key} className={c.align === 'end' ? 'rcpx-cell-end' : undefined}>{c.render(r)}</td>
                      ))}
                      <td className="rcpx-cell-chevron">
                        <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPage={setPage} disabled={loading} />
          </>
        )}
      </SectionCard>

      {/* ── تفاصيل عملية القبض ── */}
      {viewing && (
        <Drawer
          title={t('rcp.drawer.title')}
          onClose={() => setViewing(null)}
          hero={(
            <DrawerHeaderCard
              icon={receiptMethodMeta(viewing.method).icon}
              title={<MoneyText value={viewing.amount} />}
              subtitle={viewing.customerName ?? '—'}
              status={{
                tone: receiptMethodMeta(viewing.method).tone,
                icon: receiptMethodMeta(viewing.method).icon,
                label: t(receiptMethodMeta(viewing.method).key),
              }}
              kpis={[
                { label: t('rcp.col.date'), value: dateText(viewing.date), tone: 'blue' },
                { label: t('rcp.drawer.invoice_total'), value: <MoneyText value={viewing.invoiceTotal ?? 0} /> },
                { label: t('rcp.drawer.invoice_remaining'), value: <MoneyText value={viewing.invoiceRemaining ?? 0} />, tone: (viewing.invoiceRemaining ?? 0) > 0 ? 'orange' : 'green' },
              ]}
            />
          )}
          footer={viewing.invoiceId ? (
            <DrawerActionBar
              primary={{
                key: 'open-invoice',
                label: t('rcp.drawer.open_invoice'),
                icon: 'open_in_new',
                onClick: () => navigate(`/invoices/${viewing.invoiceId}/preview`),
              }}
            />
          ) : undefined}
        >
          <DrawerInfoGrid
            title={t('rcp.drawer.receipt_info')}
            items={[
              { label: t('rcp.col.method'), value: t(receiptMethodMeta(viewing.method).key) },
              {
                label: receiptMethodMeta(viewing.method).referenceKey
                  ? t(receiptMethodMeta(viewing.method).referenceKey!)
                  : t('rcp.drawer.recipient'),
                value: referenceOf(viewing),
                mono: true,
                ltr: isLatinReference(referenceOf(viewing)),
              },
              { label: t('rcp.col.date'), value: dateText(viewing.date) },
              { label: t('rcp.drawer.notes'), value: viewing.notes ?? '—' },
            ]}
          />
          <DrawerInfoGrid
            title={t('rcp.drawer.invoice_info')}
            items={[
              { label: t('rcp.col.invoice'), value: viewing.invoiceNumber ?? '—', mono: true, ltr: true },
              { label: t('rcp.drawer.issue_date'), value: viewing.invoiceIssueDate ? dateText(viewing.invoiceIssueDate) : '—' },
              { label: t('rcp.col.customer'), value: viewing.customerName ?? '—' },
              { label: t('rcp.drawer.contract'), value: viewing.contractCode ?? '—' },
              { label: t('rcp.col.invoice_status'), value: t(receiptStatusMeta(viewing.invoiceStatus).key) },
            ]}
          />
          <DrawerInfoGrid
            title={t('rcp.drawer.audit')}
            items={[
              // ختم الإدخال يُعرض ولا يُفلتَر به: تاريخ القبض هو تاريخ العمل،
              // وهذا يجيب سؤال «متى أُدخل السجل؟» حين يختلفان.
              { label: t('rcp.drawer.entered_at'), value: formatDateTime(viewing.createdAt), ltr: true },
            ]}
          />
        </Drawer>
      )}
    </div>
  );
}
