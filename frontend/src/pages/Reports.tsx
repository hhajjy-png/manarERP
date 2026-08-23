import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { roundMoney } from '../lib/money';
import DateInput from '../components/DateInput';
import { downloadBlob } from '../utils/exportUtils';
import { exportReportAsPdf } from '../utils/pdfExport';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { useAuth } from '../stores/authStore';
import { useFinancialPeriod } from '../context/FinancialPeriodContext';
import PeriodControl from '../components/period/PeriodControl';
import { useT } from '../lib/i18n';
import { useUI } from '../stores/uiStore';
import { resolveName } from '../lib/resolveName';
import { ARABIC_MONTHS } from '../utils/dateUtils';
import { formatReportCell, formatCurrency } from '../lib/format';
import { currentCurrencyLanguage } from '../stores/settingsStore';
import { persistPreference } from '../lib/syncedPreferences';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
  StatusChip,
  FilterChip,
  SearchBox,
  SectionCard,
  EmptyState,
  Drawer,
  DrawerSection,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Reports.css';
import { fcMoneyHeader } from '../components/financial/financialLabels';

// ─── Types ───────────────────────────────────────────────────────────────────

type ReportColumnDef = { header: string; key: string; format?: 'currency'; align?: 'left' | 'center' | 'right' };

/** بطاقة مؤشّر تنفيذي يرسلها التقرير (اختيارية — التقارير التي لا ترسلها لا تتأثر). */
type ReportKpi = {
  label: string;
  value: string | number;
  format?: 'currency';
  hint?: string | number;
  hintFormat?: 'currency';
  color?: 'default' | 'green' | 'red' | 'blue';
  icon?: string;
};

/** قسم تحليلي إضافي يُعرض بعد الجدول الرئيسي — بنفس عقد الأعمدة/الصفوف. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportSection = { title: string; note?: string; columns: ReportColumnDef[]; rows: any[]; totalsRow?: any };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportData = { title: string; subtitle?: string; columns: ReportColumnDef[]; rows: any[]; totalsRow?: any; kpis?: ReportKpi[]; sections?: ReportSection[] };
type CustomerItem = { id: number; name: string };
type EmployeeItem = { id: number; fullName: string; department?: string | null };

// ─── Report Definitions ───────────────────────────────────────────────────────

type FilterKey = 'date' | 'customer' | 'employee' | 'status' | 'direction' | 'billingMonth' | 'billingYear' | 'company' | 'workType' | 'year' | 'month' | 'department';

interface ReportType {
  key: string;
  label: string;
  icon: string;
  group: string;
  groupLabelKey: string;
  filters: FilterKey[];
  statuses?: [string, string][];
  statusLabel?: string;
  descKey?: string;
  statusType?: 'ready' | 'needs-filter' | 'live';
  /**
   * أدوات الجدول (فرز بالأعمدة + بحث سريع داخل النتائج) — **اشتراك صريح**.
   * التقارير التي لا تُعلنها تُعرض بجدولها كما هو حرفيًا، بلا سطر أدوات ولا رؤوس
   * قابلة للنقر: لا تقرير قائم يتغيّر لأن تقريرًا جديدًا احتاج أداة.
   */
  tableTools?: boolean;
  /** مفتاح عمود الحالة الذي يُعرض كشارة ملوّنة بدل نصّ عارٍ. */
  statusColumnKey?: string;
  /** مفتاح العمود الذي يحمل تسمية صف المجاميع (يُعاد وسمه عند البحث السريع). */
  totalsLabelKey?: string;
}

// عربي «العمليات» هنا مختلف حرفيًا عن نص المفتاح report.group.operations («التشغيل») —
// ونص «العمليات التشغيلية» و«المستحقات» يختلفان أيضًا عن قيم report.group.operational/
// receivables الفعلية. حُفظت مفاتيح منفصلة لهذه النصوص كي لا يتغيّر العرض العربي حرفًا واحدًا.
const RC_GRP_OPERATIONS = 'rc.grp.operations';
const RC_GRP_OPERATIONAL_FULL = 'rc.grp.operational_full';
const RC_GRP_RECEIVABLES = 'rc.grp.receivables';

const REPORT_TYPES: ReportType[] = [
  {
    key: 'invoices', label: 'report.type.invoices', icon: '🧾', group: 'report.group.financial', groupLabelKey: 'report.group.financial',
    filters: ['date', 'customer', 'direction', 'status'],
    statuses: [['UNPAID', 'inv.status.unpaid'], ['PARTIAL', 'inv.status.partial'], ['PAID', 'inv.status.paid'], ['OVERDUE', 'inv.status.overdue'], ['CANCELLED', 'inv.status.cancelled']],
    descKey: 'report.desc.invoices',
    statusType: 'needs-filter',
  },
  {
    key: 'expenses', label: 'report.type.expenses', icon: '💸', group: 'report.group.financial', groupLabelKey: 'report.group.financial',
    filters: ['date', 'status'],
    statuses: [['PENDING', 'status.pending'], ['APPROVED', 'status.approved'], ['REJECTED', 'status.rejected']],
    descKey: 'report.desc.expenses',
    statusType: 'needs-filter',
  },
  {
    // Cheques Reporting & Excel Export Pack v1 — the period filter applies to the
    // cheque's own `chequeDate`, and the statuses are the cheque module's real
    // DRAFT/PRINTED/CANCELLED values with the same Arabic labels the Cheques screen
    // uses, so a filter chosen here means exactly what it means over there.
    key: 'cheques', label: 'report.type.cheques', icon: '🧾', group: 'report.group.financial', groupLabelKey: 'report.group.financial',
    filters: ['date', 'status'],
    statuses: [['DRAFT', 'cheque.status.draft'], ['PRINTED', 'cheque.status.printed'], ['CANCELLED', 'cheque.status.cancelled']],
    descKey: 'report.desc.cheques',
    statusType: 'ready',
  },
  {
    key: 'profit-loss', label: 'report.type.profit_loss', icon: '📈', group: 'report.group.financial', groupLabelKey: 'report.group.financial',
    filters: ['date'],
    descKey: 'report.desc.profit_loss',
    statusType: 'ready',
  },
  {
    key: 'contracts', label: 'report.type.contracts', icon: '📄', group: 'report.group.business', groupLabelKey: 'report.group.business',
    filters: ['customer', 'status'],
    statuses: [['ACTIVE', 'opt.contract.active'], ['EXPIRED', 'opt.contract.expired'], ['RENEWING', 'opt.contract.renewing'], ['SUSPENDED', 'opt.contract.suspended']],
    descKey: 'report.desc.contracts',
    statusType: 'ready',
  },
  {
    key: 'customers', label: 'report.type.customers', icon: '👥', group: 'report.group.business', groupLabelKey: 'report.group.business',
    filters: ['status'],
    statuses: [['GOVERNMENT', 'opt.customer.government'], ['PRIVATE', 'opt.customer.private']],
    statusLabel: 'filter.customer_type',
    descKey: 'report.desc.customers',
    statusType: 'ready',
  },
  {
    key: 'employees', label: 'report.type.employees', icon: '👷', group: 'report.group.hr', groupLabelKey: 'report.group.hr',
    filters: ['status'],
    statuses: [['ACTIVE', 'opt.emp.active'], ['ON_LEAVE', 'opt.emp.on_leave'], ['TERMINATED', 'opt.emp.terminated']],
    descKey: 'report.desc.employees',
    statusType: 'ready',
  },
  {
    key: 'payroll', label: 'report.type.payroll', icon: '💵', group: 'report.group.hr', groupLabelKey: 'report.group.hr',
    filters: ['date', 'employee', 'status'],
    statuses: [['DRAFT', 'payroll.status.draft'], ['APPROVED', 'payroll.status.approved'], ['PAID', 'payroll.status.paid'], ['CANCELLED', 'payroll.status.cancelled']],
    descKey: 'report.desc.payroll',
    statusType: 'needs-filter',
  },
  {
    /**
     * Comprehensive Reports — Monthly Employee Entitlements Report Pack v1.
     *
     * مصدره **وحدة مستحقات الموظف الشهرية وحدها** — لا الرواتب ولا القيود المحاسبية.
     * وهو تقرير منفصل تمامًا عن `payroll` أعلاه: مفتاح مختلف، وحدة بيانات مختلفة،
     * وصلاحية وحدة مختلفة (`employeeCompensation.read` تُفحص في الخادم).
     */
    key: 'employee-entitlements-monthly', label: 'report.type.employee_entitlements', icon: '🧮', group: 'report.group.hr', groupLabelKey: 'report.group.hr',
    filters: ['year', 'month', 'employee', 'department', 'status'],
    statuses: [['DRAFT', 'status.draft'], ['APPROVED', 'status.approved']],
    statusLabel: 'rc.filter.statement_status',
    descKey: 'report.desc.employee_entitlements',
    statusType: 'ready',
    tableTools: true,
    statusColumnKey: 'status',
    totalsLabelKey: 'employeeName',
  },
  {
    key: 'attendance', label: 'report.type.attendance', icon: '📅', group: 'report.group.hr', groupLabelKey: 'report.group.hr',
    filters: ['date', 'employee', 'status'],
    statuses: [['PRESENT', 'att.present'], ['ABSENT', 'att.absent'], ['LATE', 'att.late'], ['LEAVE', 'att.leave']],
    descKey: 'report.desc.attendance',
    statusType: 'needs-filter',
  },
  {
    key: 'equipment', label: 'report.type.equipment', icon: '🚜', group: 'report.group.operations', groupLabelKey: RC_GRP_OPERATIONS,
    filters: ['status'],
    statuses: [['WORKING', 'opt.eq.working'], ['NOT_WORKING', 'opt.eq.not_working']],
    descKey: 'report.desc.equipment',
    statusType: 'ready',
  },
  {
    /**
     * Vehicle Insurance Management v1 — تقرير تأمين المركبات.
     *
     * مصدره جدولا وحدة تأمين المركبات وحدهما، وصلاحية وحدته (`vehicleInsurance.read`)
     * تُفحص في الخادم فوق `reports.read`/`reports.export` — تمامًا كسابقة `payroll`.
     * فلتر الحالة الوحيد يغطّي بنود الحزمة: جميع الوثائق / المنتهية / التي تنتهي قريبًا.
     */
    key: 'vehicle-insurance', label: 'report.type.vehicle_insurance', icon: '🛡️', group: 'report.group.operations', groupLabelKey: RC_GRP_OPERATIONS,
    filters: ['status'],
    statuses: [['VALID', 'opt.vins.status_valid'], ['EXPIRING_SOON', 'opt.vins.status_expiring'], ['EXPIRED', 'opt.vins.status_expired']],
    statusLabel: 'col.vins.status',
    descKey: 'report.desc.vehicle_insurance',
    statusType: 'ready',
    tableTools: true,
    statusColumnKey: 'status',
    totalsLabelKey: 'equipmentCode',
  },
  {
    key: 'expenses-by-company', label: 'report.type.expenses_by_company', icon: '🏗️', group: 'report.group.operational', groupLabelKey: RC_GRP_OPERATIONAL_FULL,
    filters: ['date', 'billingMonth', 'billingYear', 'company', 'status'],
    statuses: [['PENDING', 'status.pending'], ['APPROVED', 'status.approved'], ['REJECTED', 'status.rejected']],
    descKey: 'report.desc.expenses_by_company',
    statusType: 'needs-filter',
  },
  /**
   * `invoices-by-customer` — **مُعطَّلة بانتظار قرار مالك المنتج**، لا محذوفة.
   *
   * لا يوجد لها تنفيذ خلفي، وتعريفها المقصود غير محسوم: تقرير «الفواتير» يُنتج أصلًا
   * جدول تلخيص لكل عميل (العميل/عدد الفواتير/الإجمالي/الأشهر عبر `invoicePrintLayout`)،
   * وتقرير «أرصدة العملاء» يُنتج صفًّا لكل عميل بالمفوتَر والمحصَّل والرصيد. فما الذي
   * يضيفه هذا التقرير عليهما تحديدًا — وبأي أعمدة؟ سؤال منتج لا سؤال تنفيذ، وإكماله
   * تخمينًا يعني اختراع دلالة مالية. البطاقة تبقى معلّقة هنا حتى يُحسم التعريف.
   */
  {
    key: 'prices-usage', label: 'agreements.usage.title', icon: '🤝', group: 'report.group.operational', groupLabelKey: RC_GRP_OPERATIONAL_FULL,
    filters: ['customer', 'company', 'workType'],
    descKey: 'report.desc.prices_usage',
    statusType: 'ready',
  },
  {
    key: 'customer-statement', label: 'report.type.customer_statement', icon: '📋', group: 'report.group.receivables', groupLabelKey: RC_GRP_RECEIVABLES,
    filters: ['customer', 'date'],
    descKey: 'report.desc.customer_statement',
    statusType: 'needs-filter',
  },
  {
    key: 'receivables-aging', label: 'report.type.receivables_aging', icon: '⏳', group: 'report.group.receivables', groupLabelKey: RC_GRP_RECEIVABLES,
    filters: ['date', 'customer'],
    descKey: 'report.desc.receivables_aging',
    statusType: 'live',
  },
  {
    key: 'customer-balances', label: 'report.type.customer_balances', icon: '⚖️', group: 'report.group.receivables', groupLabelKey: RC_GRP_RECEIVABLES,
    filters: ['customer', 'date'],
    descKey: 'report.desc.customer_balances',
    statusType: 'live',
  },
  {
    key: 'collections-summary', label: 'report.type.collections_summary', icon: '💰', group: 'report.group.receivables', groupLabelKey: RC_GRP_RECEIVABLES,
    filters: ['date', 'customer'],
    descKey: 'report.desc.collections_summary',
    statusType: 'live',
  },
];

// وحدات العقد (طن/درب/معالجات…) قيمَ مرسَلة فعليًا كـ `value` للـ API (فلتر نوع العمل) —
// نصّها العربي هو المعرّف المخزَّن خلفيًا، وليس مجرّد تسمية عرض. تُركت بلا ترجمة عمدًا
// كي لا ينفصل العرض عن القيمة المرسَلة؛ راجع تقرير الحزمة لتفصيل السبب.
const CONTRACT_UNITS = ['طن', 'درب', 'معالجات', 'يومية', 'مقطوعية'];

/**
 * سنوات فلتر تقرير مستحقات الموظفين الشهرية.
 *
 * نافذة ثابتة حول السنة الحالية بدل استعلام إضافي لجلب السنوات الموجودة فعلًا: خيار
 * سنة بلا كشوف يُنتج تقريرًا فارغًا صريحًا لا خطأ. تُحتسب مرة واحدة عند تحميل الوحدة.
 */
const ENTITLEMENT_YEARS: number[] = (() => {
  const current = new Date().getFullYear();
  return [current + 1, current, current - 1, current - 2, current - 3, current - 4];
})();

const COMPANY_GROUPS = [
  { value: 'HASSAN', labelKey: 'cat.hassan' },
  { value: 'GHANEM', labelKey: 'cat.ghanem' },
  { value: 'NATHEER', labelKey: 'cat.natheer' },
  { value: 'HAROON', labelKey: 'cat.haroon' },
];

const CHIP_GROUPS = [
  { key: 'all', labelKey: 'opt.all_plain', group: undefined },
  { key: 'financial', labelKey: 'report.group.financial', group: 'report.group.financial' },
  { key: 'business', labelKey: 'report.group.business', group: 'report.group.business' },
  { key: 'hr', labelKey: 'report.group.hr', group: 'report.group.hr' },
  { key: 'operations', labelKey: RC_GRP_OPERATIONS, group: 'report.group.operations' },
  { key: 'operational', labelKey: 'report.group.operational', group: 'report.group.operational' },
  { key: 'receivables', labelKey: RC_GRP_RECEIVABLES, group: 'report.group.receivables' },
  { key: 'favorites', labelKey: 'rc.favorites', group: undefined },
];

const LS_FAVORITES = 'rc_favorites_v1';
const LS_RECENT    = 'rc_recent_v1';

function loadFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_FAVORITES) ?? '[]'); } catch { return []; }
}
// Zero Data Loss Certification Pack v1 — المفضّلات والمؤخّرات تُحفظ في قاعدة البيانات
// أيضًا (عبر `persistPreference`) فتنتقل مع النسخة الاحتياطية والمزامنة.
function saveFavorites(ids: string[]) { persistPreference(LS_FAVORITES, JSON.stringify(ids)); }
function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_RECENT) ?? '[]'); } catch { return []; }
}
function pushRecent(key: string) {
  const prev = loadRecent().filter((k) => k !== key);
  persistPreference(LS_RECENT, JSON.stringify([key, ...prev].slice(0, 5)));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type StatusTone = 'green' | 'orange' | 'blue';
function statusMeta(type: ReportType['statusType'], t: (key: string) => string): { tone: StatusTone; label: string; icon: string } {
  if (type === 'needs-filter') return { tone: 'orange', label: t('rc.status.needs_filter'), icon: 'tune' };
  if (type === 'live')         return { tone: 'blue',   label: t('rc.status.live'), icon: 'bolt' };
  return                              { tone: 'green',  label: t('rc.status.ready'), icon: 'check_circle' };
}

/** لون البطاقة القادم من التقرير → درجة ExplorerKit (بلا لوحة ألوان جديدة). */
function kpiTone(color: ReportKpi['color']): 'green' | 'blue' | 'orange' | 'indigo' {
  if (color === 'green') return 'green';
  if (color === 'blue')  return 'blue';
  if (color === 'red')   return 'orange';
  return 'indigo';
}

/** قيمة البطاقة: الرمز داخلها («1,200.125 KWD») لأنها بلا عنوان عمود يحمله. */
function kpiText(value: unknown, format?: 'currency'): string {
  if (value === null || value === undefined || value === '') return '—';
  if (format === 'currency') return formatCurrency(value, { language: currentCurrencyLanguage() });
  return typeof value === 'number' ? formatReportCell(value, {}, { symbol: 'header' }) : String(value);
}

/**
 * تلوين حالة الكشف — التسميات العربية هي ما يرسله الخادم فعلًا (`entitlementStatusAr`)،
 * وهي القيمة المعروضة نفسها. أي حالة غير معروفة تبقى شارة محايدة بلا لون مُخترَع.
 */
const STATEMENT_STATUS_TONES: Record<string, 'green' | 'orange'> = {
  'معتمد': 'green',
  'مسودة': 'orange',
};

/** مقارنة خليّتين للفرز: رقمًا حين يكونان رقمين، وإلا نصًّا بترتيب عربي. */
function compareCells(a: unknown, b: unknown): number {
  const an = typeof a === 'number' ? a : NaN;
  const bn = typeof b === 'number' ? b : NaN;
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
  return String(a ?? '').localeCompare(String(b ?? ''), 'ar', { numeric: true });
}

/**
 * تقريب مجموع عائم إلى ثلاث منازل — نفس دقّة الدينار المعتمدة في العرض.
 * كان تعريفًا محليًا ثالثًا لنفس السياسة؛ صار يشير إلى وحدة النقود المشتركة، فمجاميع
 * المعاينة المفلترة تطابق مجاميع الخادم عند نقاط التعادل بدل أن تنحرف بفلس.
 */
const round3 = roundMoney;

/**
 * جدول التقرير — نفس الترميز المستخدم منذ البداية للجدول الرئيسي، مُستخرَج كي
 * تستعمله الأقسام التحليلية حرفيًا فلا تنشأ لغة بصرية ثانية.
 *
 * `applyAlign` مُطفأ للجدول الرئيسي عمدًا: تعريفات الأعمدة القديمة (قائمة الدخل)
 * تُعلن `align` وكانت المعاينة تتجاهلها دائمًا — تفعيلها هنا كان سيغيّر تقريرًا
 * غير معنيّ بهذه الحزمة.
 *
 * ═══ أدوات الجدول (`tools`) — اشتراك صريح ═══
 * الفرز بالأعمدة والبحث السريع وشارات الحالة **مطفأة افتراضيًا**. تقرير لا يطلبها
 * يُعرض بجدوله كما كان حرفيًا: لا سطر أدوات، ولا رؤوس قابلة للنقر، ولا حالة إضافية.
 * الفرز والبحث عرضٌ محلي بحت — لا يعيد طلبًا إلى الخادم ولا يغيّر بيانات التقرير.
 */
function PreviewTable({
  columns, rows, totalsRow, applyAlign, emptyText,
  tools, statusColumnKey, totalsLabelKey,
}: {
  columns: ReportColumnDef[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  totalsRow?: any;
  applyAlign?: boolean;
  emptyText: string;
  tools?: boolean;
  statusColumnKey?: string;
  totalsLabelKey?: string;
}) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const trimmedQuery = tools ? query.trim().toLowerCase() : '';

  const visibleRows = useMemo(() => {
    const filtered = trimmedQuery
      ? rows.filter((r) => columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(trimmedQuery)))
      : rows;
    if (!sort) return filtered;
    const sorted = [...filtered].sort((a, b) => compareCells(a[sort.key], b[sort.key]));
    return sort.dir === 'asc' ? sorted : sorted.reverse();
  }, [rows, columns, trimmedQuery, sort]);

  /**
   * صفّ المجاميع أثناء البحث السريع.
   *
   * عرض مجاميع الخادم (المحسوبة على كل الصفوف) فوق نتائج مُصفّاة كان سيكذب على
   * القارئ. فحين يكون البحث نشطًا تُعاد الأعمدة النقدية من **الصفوف الظاهرة**،
   * وتُفرَّغ بقية الخلايا، ويُعاد وسم الصف صراحةً بأنه مجموع نتائج البحث.
   * بلا بحث: صفّ الخادم كما هو حرفيًا.
   */
  const effectiveTotals = useMemo(() => {
    if (!totalsRow || !trimmedQuery) return totalsRow;
    const out: Record<string, unknown> = {};
    columns.forEach((c) => {
      out[c.key] = c.format === 'currency'
        ? round3(visibleRows.reduce((sum, r) => sum + (Number(r[c.key]) || 0), 0))
        : '';
    });
    if (totalsLabelKey) out[totalsLabelKey] = t('rc.table.totals_filtered');
    return out;
  }, [totalsRow, trimmedQuery, columns, visibleRows, totalsLabelKey, t]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null; // النقرة الثالثة تُعيد الترتيب الأصلي القادم من الخادم
    });
  }

  const cellStyle = (c: ReportColumnDef) =>
    applyAlign && c.align ? { textAlign: c.align, verticalAlign: 'middle' as const } : undefined;

  const sortIcon = (key: string) =>
    sort?.key !== key ? 'unfold_more' : sort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward';

  return (
    <>
      {tools && (
        <div className="rcx-table-tools">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder={t('rc.table.search_ph')}
            ariaLabel={t('rc.table.search_ph')}
          />
          <span className="rcx-table-tools-count">
            {t('rc.table.showing', { shown: visibleRows.length, total: rows.length })}
          </span>
          {sort && (
            <Button variant="ghost" icon="restart_alt" small onClick={() => setSort(null)}>
              {t('rc.table.clear_sort')}
            </Button>
          )}
        </div>
      )}
      <div className={`xpl-table-wrap rcx-table-scroll${tools ? ' rcx-table--tools' : ''}`}>
        <table className="xpl-table">
          <thead>
            {/* الرمز مرّة واحدة في العنوان («المبلغ (KWD)») بدل تكراره في كل صفّ.
                العنوان **عرضٌ فقط**: تعريف العمود القادم من الخلفية لم يُمسّ. */}
            <tr>{columns.map((c) => (
              <th
                key={c.key}
                className={c.format === 'currency' ? 'num' : undefined}
                style={cellStyle(c)}
                aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                {tools ? (
                  <button type="button" className="rcx-sort-btn" onClick={() => toggleSort(c.key)}>
                    <span>{c.format === 'currency' ? fcMoneyHeader(c.header) : c.header}</span>
                    <span className="material-symbols-outlined" aria-hidden="true">{sortIcon(c.key)}</span>
                  </button>
                ) : (
                  c.format === 'currency' ? fcMoneyHeader(c.header) : c.header
                )}
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={columns.length} style={{ textAlign: 'center', color: 'var(--xpl-muted)', padding: 28 }}>{emptyText}</td></tr>
            ) : (
              visibleRows.map((row, i) => (
                <tr key={i}>{columns.map((c) => (
                  <td key={c.key} className={c.format === 'currency' ? 'money-cell' : undefined} style={cellStyle(c)}>
                    {c.key === statusColumnKey && row[c.key]
                      ? <StatusChip tone={STATEMENT_STATUS_TONES[String(row[c.key])] ?? 'neutral'}>{String(row[c.key])}</StatusChip>
                      : formatReportCell(row[c.key], c, { language: currentCurrencyLanguage(), symbol: 'header' })}
                  </td>
                ))}</tr>
              ))
            )}
            {effectiveTotals && (
              <tr className="rcx-totals-row">
                {columns.map((c) => (
                  <td key={c.key} className={c.format === 'currency' ? 'money-cell' : undefined} style={cellStyle(c)}>
                    {formatReportCell(effectiveTotals[c.key], c, { language: currentCurrencyLanguage(), symbol: 'header' })}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}


// ─── Component ───────────────────────────────────────────────────────────────

export default function Reports() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { t } = useT();
  const lang = useUI((s) => s.lang);
  const { period } = useFinancialPeriod();
  const canView   = hasPermission('reports.read');
  const canExport = hasPermission('reports.export');

  // Filter state — preserved exactly
  const [searchParams] = useSearchParams();
  /**
   * ربط عميق: `/reports?type=profit-loss&from=…&to=…`.
   *
   * التقارير كلها منفَّذة هنا أصلًا — بما فيها الأرباح والخسائر. المركز المالي كان يعرضها
   * بطاقة «قريباً» كاذبة؛ صار يفتحها هنا بدل أن يبني تقريرًا ثانيًا. النوع غير المعروف
   * يُتجاهل ويبقى الافتراضي.
   */
  const initialType = searchParams.get('type');
  const [selected, setSelected]       = useState<string>(
    initialType && REPORT_TYPES.some((r) => r.key === initialType) ? initialType : 'invoices',
  );
  // تبدأ من الفترة العالمية (السنة حتى اليوم افتراضيًا) بدل all-time الصامت.
  const [from, setFrom]               = useState(searchParams.get('from') ?? period.fromDate ?? '');
  const [to, setTo]                   = useState(searchParams.get('to') ?? period.toDate ?? '');
  const [customerId, setCustomerId]   = useState('');
  const [employeeId, setEmployeeId]   = useState('');
  const [status, setStatus]           = useState('');
  const [direction, setDirection]     = useState('');
  const [billingMonth, setBillingMonth] = useState('');
  const [billingYear, setBillingYear]   = useState('');
  const [company, setCompany]         = useState('');
  const [workType, setWorkType]       = useState('');
  // فلاتر تقرير مستحقات الموظفين الشهرية — سنة/شهر السجل نفسه (لا نطاق تواريخ)،
  // والقسم كما هو محفوظ في لقطة الكشف.
  const [entYear, setEntYear]         = useState('');
  const [entMonth, setEntMonth]       = useState('');
  const [department, setDepartment]   = useState('');

  // Preview state — preserved exactly
  const [preview, setPreview]         = useState<ReportData | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [excelBusy, setExcelBusy]     = useState(false);
  const [pdfBusy,   setPdfBusy]       = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  // Dropdown data
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);

  // Explorer state
  const [search, setSearch]         = useState('');
  const [activeChip, setActiveChip] = useState('all');
  const [favorites, setFavorites]   = useState<string[]>(loadFavorites);
  const [panelOpen, setPanelOpen]   = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const currentType = useMemo(() => REPORT_TYPES.find((rt) => rt.key === selected)!, [selected]);

  /**
   * أقسام فلتر تقرير المستحقات — مشتقّة من قائمة الموظفين المحمَّلة أصلًا لهذه الصفحة.
   * لا نقطة نهاية جديدة ولا استعلام ثانٍ: الفلتر يُطبَّق في الخادم على لقطة القسم
   * المحفوظة في الكشف، وهذه القائمة مصدر **الخيارات** المعروضة فقط.
   */
  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => { const d = (e.department ?? '').trim(); if (d) set.add(d); });
    return [...set].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [employees]);

  // Load dropdowns once
  useEffect(() => {
    api.get('/customers', { params: { pageSize: 500 } })
      .then((r) => setCustomers(r.data.data.data ?? []))
      .catch(() => {});
    api.get('/employees', { params: { pageSize: 500 } })
      .then((r) => setEmployees(r.data.data.data ?? []))
      .catch(() => {});
  }, []);

  // إعادة الفلاتر عند تغيّر نوع التقرير أو الفترة العالمية — from/to يتبعان الفترة
  // (السنة حتى اليوم افتراضيًا) بدل إفراغهما إلى all-time.
  useEffect(() => {
    setFrom(period.fromDate ?? ''); setTo(period.toDate ?? '');
    setCustomerId(''); setEmployeeId('');
    setStatus(''); setDirection('');
    setBillingMonth(''); setBillingYear('');
    setCompany(''); setWorkType('');
    setEntYear(''); setEntMonth(''); setDepartment('');
    setPreview(null); setError('');
  }, [selected, period.fromDate, period.toDate, period.isAllPeriods]);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    function onOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [exportOpen]);

  function resetFilters() {
    setFrom(''); setTo('');
    setCustomerId(''); setEmployeeId('');
    setStatus(''); setDirection('');
    setBillingMonth(''); setBillingYear('');
    setCompany(''); setWorkType('');
    setEntYear(''); setEntMonth(''); setDepartment('');
    setPreview(null); setError('');
  }

  function buildParams(): Record<string, string> {
    const p: Record<string, string> = {};
    if (from)         p.from         = from;
    if (to)           p.to           = to;
    if (customerId)   p.customerId   = customerId;
    if (employeeId)   p.employeeId   = employeeId;
    if (status)       p.status       = status;
    if (direction)    p.direction    = direction;
    if (billingMonth) p.billingMonth = billingMonth;
    if (billingYear)  p.billingYear  = billingYear;
    if (company)      p.company      = company;
    if (workType)     p.workType     = workType;
    if (entYear)      p.year         = entYear;
    if (entMonth)     p.month        = entMonth;
    if (department)   p.department   = department;
    return p;
  }

  const loadPreview = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    setPreview(null);
    setPanelOpen(false);
    try {
      const res = await api.get(`/reports/${selected}/preview`, { params: buildParams() });
      setPreview(res.data.data);
      setGeneratedAt(new Date());
      pushRecent(selected);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, from, to, customerId, employeeId, status, direction, billingMonth, billingYear, company, workType, entYear, entMonth, department, canView]);

  // وسم الفترة لاسم الملف: نطاق from/to، أو «كل الفترات» عند غيابهما.
  const exportPeriod = { from: from || undefined, to: to || undefined, allPeriods: !from && !to };

  async function downloadExcel() {
    if (!canExport) return;
    setExcelBusy(true);
    setExportOpen(false);
    try {
      const res = await api.get(`/reports/${selected}/export`, {
        params: { ...buildParams(), format: 'excel' },
        responseType: 'blob',
      });
      downloadBlob(res.data as Blob, generateExportFileName({ reportName: ReportName.Report, identifier: selected, period: exportPeriod, extension: 'xlsx' }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExcelBusy(false);
    }
  }

  async function downloadPdf() {
    if (!canExport) return;
    setPdfBusy(true);
    setExportOpen(false);
    try {
      await exportReportAsPdf(
        `/reports/${selected}/export`,
        { ...buildParams(), format: 'html' },
        generateExportFileName({ reportName: ReportName.Report, identifier: selected, period: exportPeriod, extension: 'pdf' }),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPdfBusy(false);
    }
  }

  function openPrint() {
    const params = new URLSearchParams(buildParams());
    const qs = params.toString();
    setExportOpen(false);
    navigate(`/print/${selected}${qs ? `?${qs}` : ''}`);
  }

  function toggleFavorite(key: string) {
    setFavorites((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      saveFavorites(next);
      return next;
    });
  }

  function selectReport(key: string) {
    setSelected(key);
    setPreview(null);
    setError('');
  }

  // Filtered report list
  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return REPORT_TYPES.filter((rt) => {
      if (activeChip === 'favorites') return favorites.includes(rt.key);
      if (activeChip !== 'all') {
        const chip = CHIP_GROUPS.find((c) => c.key === activeChip);
        if (chip?.group && rt.group !== chip.group) return false;
      }
      if (!q) return true;
      const label = t(rt.label).toLowerCase();
      const desc  = (rt.descKey ? t(rt.descKey) : '').toLowerCase();
      const grp   = t(rt.groupLabelKey).toLowerCase();
      return label.includes(q) || desc.includes(q) || grp.includes(q) || rt.key.includes(q);
    });
  }, [search, activeChip, favorites, t]);

  // KPI values
  const kpi = useMemo(() => ({
    total:       REPORT_TYPES.length,
    ready:       REPORT_TYPES.filter((r) => r.statusType === 'ready').length,
    needsFilter: REPORT_TYPES.filter((r) => r.statusType === 'needs-filter').length,
    live:        REPORT_TYPES.filter((r) => r.statusType === 'live').length,
    financial:   REPORT_TYPES.filter((r) => r.group === 'report.group.financial').length,
    hr:          REPORT_TYPES.filter((r) => r.group === 'report.group.hr').length,
    ops:         REPORT_TYPES.filter((r) => ['report.group.operations', 'report.group.operational'].includes(r.group)).length,
    recv:        REPORT_TYPES.filter((r) => r.group === 'report.group.receivables').length,
  }), []);

  // Recent reports (recalculates after each successful run)
  const recentReports = useMemo(() => {
    return loadRecent()
      .map((k) => REPORT_TYPES.find((r) => r.key === k))
      .filter(Boolean) as ReportType[];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedAt]);

  // Per-chip counts for filter chips
  const chipCounts = useMemo(() => {
    const map: Record<string, number> = { all: REPORT_TYPES.length, favorites: favorites.length };
    CHIP_GROUPS.forEach((c) => {
      if (c.group) map[c.key] = REPORT_TYPES.filter((r) => r.group === c.group).length;
    });
    return map;
  }, [favorites]);

  const hasAnyFilter = !!(from || to || customerId || employeeId || status || direction || billingMonth || billingYear || company || workType || entYear || entMonth || department);
  const f = currentType.filters;
  const curStatus = statusMeta(currentType.statusType, t);

  // ─── Filter fields (rendered inside the report drawer) ────────────────────

  function renderFilterFields() {
    return (
      <div className="rcx-drawer-filters">
        {f.includes('date') && (
          <>
            <div className="rcx-filter-field">
              <label>{t('filter.date_from')}</label>
              <DateInput ariaLabel={t('filter.date_from')} value={from} onChange={setFrom} />
            </div>
            <div className="rcx-filter-field">
              <label>{t('filter.date_to')}</label>
              <DateInput ariaLabel={t('filter.date_to')} value={to} onChange={setTo} />
            </div>
          </>
        )}
        {f.includes('customer') && customers.length > 0 && (
          <div className="rcx-filter-field">
            <label>{t('filter.customer')}</label>
            <select aria-label={t('filter.customer')} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{resolveName(c, lang)}</option>)}
            </select>
          </div>
        )}
        {f.includes('employee') && employees.length > 0 && (
          <div className="rcx-filter-field">
            <label>{t('filter.employee')}</label>
            <select aria-label={t('filter.employee')} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          </div>
        )}
        {f.includes('year') && (
          <div className="rcx-filter-field">
            <label>{t('rc.filter.year')}</label>
            <select aria-label={t('rc.filter.year')} value={entYear} onChange={(e) => setEntYear(e.target.value)}>
              <option value="">{t('opt.all_plain')}</option>
              {ENTITLEMENT_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        )}
        {f.includes('month') && (
          <div className="rcx-filter-field">
            <label>{t('rc.filter.month')}</label>
            <select aria-label={t('rc.filter.month')} value={entMonth} onChange={(e) => setEntMonth(e.target.value)}>
              <option value="">{t('opt.all_plain')}</option>
              {ARABIC_MONTHS.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
            </select>
          </div>
        )}
        {f.includes('department') && departments.length > 0 && (
          <div className="rcx-filter-field">
            <label>{t('rc.filter.department')}</label>
            <select aria-label={t('rc.filter.department')} value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}
        {f.includes('direction') && (
          <div className="rcx-filter-field">
            <label>{t('filter.direction')}</label>
            <select aria-label={t('filter.direction')} value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              <option value="SALES">{t('opt.direction.sales')}</option>
              <option value="PURCHASE">{t('opt.direction.purchase')}</option>
            </select>
          </div>
        )}
        {f.includes('status') && currentType.statuses && (
          <div className="rcx-filter-field">
            <label>{t(currentType.statusLabel ?? 'filter.status')}</label>
            <select aria-label={t(currentType.statusLabel ?? 'filter.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">{t('opt.all')}</option>
              {currentType.statuses.map(([val, lbl]) => <option key={val} value={val}>{t(lbl)}</option>)}
            </select>
          </div>
        )}
        {f.includes('billingMonth') && (
          <div className="rcx-filter-field">
            <label>{t('lbl.inv.billing_period')}</label>
            <select aria-label={t('lbl.inv.billing_period')} value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)}>
              <option value="">{t('opt.all_plain')}</option>
              {ARABIC_MONTHS.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
            </select>
          </div>
        )}
        {f.includes('billingYear') && (
          <div className="rcx-filter-field">
            <label>{t('rc.filter.year')}</label>
            <select aria-label={t('rc.filter.year')} value={billingYear} onChange={(e) => setBillingYear(e.target.value)}>
              <option value="">{t('opt.all_plain')}</option>
              {[new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        )}
        {f.includes('company') && (
          <div className="rcx-filter-field">
            <label>{t('rc.filter.company')}</label>
            <select aria-label={t('rc.filter.company')} value={company} onChange={(e) => setCompany(e.target.value)}>
              <option value="">{t('opt.all_plain')}</option>
              {COMPANY_GROUPS.map((g) => <option key={g.value} value={g.value}>{t(g.labelKey)}</option>)}
            </select>
          </div>
        )}
        {f.includes('workType') && (
          <div className="rcx-filter-field">
            <label>{t('rc.filter.work_type')}</label>
            {/* CONTRACT_UNITS: قيمة الخيار = النص العربي نفسه (مرسل كـ value إلى الـ API) —
                لا تُترجَم التسمية المعروضة دون تنسيق مطابق في الخلفية؛ انظر تقرير الحزمة. */}
            <select aria-label={t('rc.filter.work_type')} value={workType} onChange={(e) => setWorkType(e.target.value)}>
              <option value="">{t('opt.all_plain')}</option>
              {CONTRACT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}
      </div>
    );
  }

  function openReport(key: string) {
    selectReport(key);
    setPanelOpen(true);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="xpl-scope xpl-page">

      {/* ── Report Preview / Config Drawer ── */}
      {panelOpen && (
        <Drawer
          title={t(currentType.label)}
          onClose={() => setPanelOpen(false)}
          hero={
            <div className="xpl-drawer-hero">
              <div className="xpl-drawer-hero-icon" style={{ fontSize: 24 }}>{currentType.icon}</div>
              <div className="xpl-drawer-hero-body">
                <span className="xpl-drawer-hero-title">{t(currentType.label)}</span>
                <span className="xpl-drawer-hero-sub">{t(currentType.groupLabelKey)}</span>
                <div style={{ marginTop: 4 }}>
                  <StatusChip tone={curStatus.tone} icon={curStatus.icon}>{curStatus.label}</StatusChip>
                </div>
              </div>
            </div>
          }
          footer={
            <>
              {canView && (
                <Button variant="primary" icon="play_arrow" busy={loading} onClick={loadPreview}>
                  {t('rc.action.run_report')}
                </Button>
              )}
              {hasAnyFilter && (
                <Button variant="ghost" icon="restart_alt" onClick={resetFilters}>{t('action.reset_filters_inline')}</Button>
              )}
            </>
          }
        >
          {currentType.descKey && (
            <DrawerSection title={t('rc.drawer.desc_title')}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--xpl-text)' }}>{t(currentType.descKey)}</p>
            </DrawerSection>
          )}

          <DrawerSection title={t('rc.drawer.info_title')}>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">{t('rc.drawer.category_label')}</span>
              <span className="xpl-drawer-field-value">{t(currentType.groupLabelKey)}</span>
            </div>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">{t('col.status')}</span>
              <span className="xpl-drawer-field-value">
                <StatusChip tone={curStatus.tone} icon={curStatus.icon}>{curStatus.label}</StatusChip>
              </span>
            </div>
            <div className="xpl-drawer-field">
              <span className="xpl-drawer-field-label">{t('rc.drawer.results_count_label')}</span>
              <span className="xpl-drawer-field-value">
                {preview ? t('rc.unit.record_count', { count: preview.rows.length }) : t('rc.hint.run_to_view')}
              </span>
            </div>
            {generatedAt && preview && (
              <div className="xpl-drawer-field">
                <span className="xpl-drawer-field-label">{t('rc.drawer.last_run_label')}</span>
                <span className="xpl-drawer-field-value">{generatedAt.toLocaleTimeString('ar')}</span>
              </div>
            )}
          </DrawerSection>

          {f.length > 0 && (
            <DrawerSection title={t('rc.drawer.filters_title')}>
              {renderFilterFields()}
            </DrawerSection>
          )}

          {canExport && (
            <DrawerSection title={t('rc.drawer.export_title')}>
              {preview ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Button variant="secondary" icon="table_view" busy={excelBusy} onClick={downloadExcel} block style={excelBusy ? undefined : { color: '#217346' }}>Excel</Button>
                  {window.manar?.exportPdfFromHtml && (
                    <Button variant="secondary" icon="picture_as_pdf" busy={pdfBusy} onClick={downloadPdf} block>{t('rc.export.pdf')}</Button>
                  )}
                  <Button variant="ghost" icon="print" onClick={openPrint} block>{t('btn.inv.print_invoice')}</Button>
                </div>
              ) : (
                <p className="rcx-note" style={{ margin: 0 }}>
                  <span className="material-symbols-outlined">info</span>
                  {t('rc.drawer.export_hint')}
                </p>
              )}
            </DrawerSection>
          )}

          <DrawerSection title={t('field.notes')}>
            <p className="rcx-note" style={{ margin: 0 }}>
              <span className="material-symbols-outlined">lightbulb</span>
              {currentType.statusType === 'needs-filter'
                ? t('rc.note.needs_filter')
                : currentType.statusType === 'live'
                  ? t('rc.note.live')
                  : t('rc.note.ready')}
            </p>
          </DrawerSection>
        </Drawer>
      )}

      {/* ── Executive Header ── */}
      <ExecutiveHeader
        icon="assessment"
        title={t('search.page.reports')}
        subtitle={t('rc.header.subtitle')}
        chips={
          <>
            <IdChip icon="summarize" tone="indigo">{kpi.total} {t('rc.unit.report')}</IdChip>
            <IdChip icon="check_circle" tone="green">{kpi.ready} {t('rc.status.ready')}</IdChip>
            <IdChip icon="tune" tone="orange">{kpi.needsFilter} {t('rc.status.needs_filter')}</IdChip>
            <IdChip icon="bolt" tone="indigo">{kpi.live} {t('rc.unit.live')}</IdChip>
            {favorites.length > 0 && <IdChip icon="star" tone="orange">{favorites.length} {t('rc.unit.favorite')}</IdChip>}
          </>
        }
        aside={<PeriodControl hideLabelPrefix />}
      />

      {/* تنبيه قائمة الدخل عند كل الفترات: يجب ألا تعمل P&L على all-time بصمت. */}
      {selected === 'profit-loss' && (!from || !to) && (
        <div className="alert" role="note" style={{
          display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0',
          padding: '10px 14px', borderRadius: 12,
          background: 'var(--amber-light)', color: 'var(--amber)', fontWeight: 600, fontSize: 13,
        }}>
          <span className="material-symbols-outlined" aria-hidden>warning</span>
          {t('rc.warn.pl_all_years')}
        </div>
      )}

      {/* ── Summary hero + report statistics ── */}
      <div className="rcx-metrics">
        <HeroMetric
          icon="analytics"
          label={t('rc.metric.total_available')}
          value={kpi.total}
          sub={<><span className="material-symbols-outlined">category</span>{t('rc.metric.main_categories', { count: CHIP_GROUPS.length - 2 })}</>}
        />
        <div className="rcx-metrics-secondary">
          <MetricCard icon="payments" tone="green" label={t('fc.tab.finreport')} value={kpi.financial} />
          <MetricCard icon="groups" tone="blue" label={t('report.group.hr')} value={kpi.hr} />
          <MetricCard icon="construction" tone="orange" label={t(RC_GRP_OPERATIONS)} value={kpi.ops} />
          <MetricCard icon="request_quote" tone="indigo" label={t(RC_GRP_RECEIVABLES)} value={kpi.recv} />
          <MetricCard icon="check_circle" tone="green" label={t('rc.metric.ready_to_run')} value={kpi.ready} />
          <MetricCard icon="star" tone="orange" label={t('rc.favorites')} value={favorites.length} />
        </div>
      </div>

      {/* ── Sticky toolbar: search + recent + filter chips ── */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={setSearch} placeholder={t('rc.search.placeholder')} ariaLabel={t('rc.search.aria')} />
          {recentReports.length > 0 && (
            <div className="rcx-recent">
              <span className="rcx-recent-label"><span className="material-symbols-outlined">history</span>{t('rc.recent_label')}</span>
              {recentReports.map((r) => (
                <button type="button" key={r.key} className="rcx-recent-btn" onClick={() => selectReport(r.key)}>
                  <span>{r.icon}</span>{t(r.label)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="xpl-toolbar-row">
          {CHIP_GROUPS.map((chip) => (
            <FilterChip
              key={chip.key}
              active={activeChip === chip.key}
              onClick={() => setActiveChip(chip.key)}
              icon={chip.key === 'favorites' ? 'star' : undefined}
              count={chipCounts[chip.key]}
            >
              {t(chip.labelKey)}
            </FilterChip>
          ))}
        </div>
        <div className="xpl-active-row">
          <span className="xpl-result-count">
            {t('rc.result_prefix')}<strong style={{ color: 'var(--xpl-text)' }}>{filteredReports.length}</strong> {t('rc.unit.report')}
            {search && <>{t('rc.result_search_suffix', { term: search })}</>}
          </span>
        </div>
      </div>

      {/* ── Report cards grid ── */}
      {filteredReports.length === 0 ? (
        <EmptyState
          icon="search_off"
          tone="neutral"
          title={t('rc.empty.title')}
          message={t('rc.empty.message')}
          action={<Button variant="secondary" icon="restart_alt" onClick={() => { setSearch(''); setActiveChip('all'); }}>{t('rc.empty.reset')}</Button>}
        />
      ) : (
        <div className="rcx-card-grid">
          {filteredReports.map((rt) => {
            const meta  = statusMeta(rt.statusType, t);
            const isFav = favorites.includes(rt.key);
            const isSel = selected === rt.key;
            return (
              <div
                key={rt.key}
                className={`rcx-card${isSel ? ' selected' : ''}`}
                onClick={() => openReport(rt.key)}
              >
                <div className="rcx-card-top">
                  <div className="rcx-card-emoji">{rt.icon}</div>
                  <button
                    type="button"
                    className={`rcx-fav-btn${isFav ? ' active' : ''}`}
                    title={isFav ? t('rc.fav.remove') : t('rc.fav.add')}
                    aria-label={isFav ? t('rc.fav.remove') : t('rc.fav.add')}
                    aria-pressed={isFav ? 'true' : 'false'}
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(rt.key); }}
                  >
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: isFav ? "'FILL' 1" : undefined }}>star</span>
                  </button>
                </div>
                <div className="rcx-card-body">
                  <div className="rcx-card-name">{t(rt.label)}</div>
                  {rt.descKey && <div className="rcx-card-desc">{t(rt.descKey)}</div>}
                </div>
                <div className="rcx-card-meta">
                  <StatusChip tone={meta.tone} icon={meta.icon}>{meta.label}</StatusChip>
                  <StatusChip tone="neutral">{t(rt.groupLabelKey)}</StatusChip>
                </div>
                <div className="rcx-card-actions">
                  {canView && (
                    <Button
                      variant="primary"
                      icon="play_arrow"
                      small
                      onClick={(e) => { e.stopPropagation(); selectReport(rt.key); setTimeout(loadPreview, 0); }}
                    >
                      {t('rc.action.run')}
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    icon="tune"
                    small
                    onClick={(e) => { e.stopPropagation(); openReport(rt.key); }}
                  >
                    {t('rc.action.configure')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Selected report run / preview section ── */}
      <SectionCard
        title={t(currentType.label)}
        icon="play_circle"
        padded={false}
        actions={
          <>
            <Button variant="secondary" icon="tune" small onClick={() => setPanelOpen(true)}>{t('rc.action.filters')}</Button>
            {canView && (
              <Button variant="primary" icon="play_arrow" small busy={loading} onClick={loadPreview}>
                {t('page.reports.view')}
              </Button>
            )}
            {hasAnyFilter && (
              <Button variant="ghost" icon="restart_alt" small onClick={resetFilters}>{t('action.reset_filters')}</Button>
            )}
            {canExport && preview && (
              <div className="rcx-export-wrap" ref={exportRef}>
                <Button variant="secondary" icon="ios_share" small onClick={() => setExportOpen((o) => !o)} disabled={excelBusy || pdfBusy}>
                  {t('perm.action.export')}
                  <span className="material-symbols-outlined" aria-hidden="true">expand_more</span>
                </Button>
                {exportOpen && (
                  <div className="rcx-export-menu rcx-export-menu--down">
                    <button type="button" className="rcx-export-item" onClick={downloadExcel} disabled={excelBusy}>
                      {excelBusy ? (
                        <><span className="material-symbols-outlined">table_view</span>{t('rc.busy')}</>
                      ) : (
                        <><span className="material-symbols-outlined" style={{ color: '#217346' }}>table_view</span><span style={{ color: '#217346' }}>Excel</span></>
                      )}
                    </button>
                    {window.manar?.exportPdfFromHtml && (
                      <button type="button" className="rcx-export-item" onClick={downloadPdf} disabled={pdfBusy}>
                        <span className="material-symbols-outlined">picture_as_pdf</span>{pdfBusy ? t('rc.busy') : t('rc.export.pdf')}
                      </button>
                    )}
                    <button type="button" className="rcx-export-item" onClick={openPrint}>
                      <span className="material-symbols-outlined">print</span>{t('btn.inv.print_invoice')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        }
      >
        <div className="xpl-card--pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {currentType.descKey && <p style={{ margin: 0, fontSize: 13, color: 'var(--xpl-muted)', lineHeight: 1.6 }}>{t(currentType.descKey)}</p>}

          {/* Hints */}
          {['invoices', 'expenses', 'payroll'].includes(selected) && !from && !to && (
            <div className="rcx-hint"><span className="material-symbols-outlined">info</span>{t('page.reports.date_range_hint')}</div>
          )}
          {selected === 'customer-statement' && !customerId && (
            <div className="rcx-hint warn"><span className="material-symbols-outlined">warning</span>{t('rc.hint.customer_required')}</div>
          )}
          {error && <div className="xpl-error-banner"><span className="material-symbols-outlined">error</span><span>{error}</span></div>}

          {/* Loading skeleton */}
          {loading && (
            <div className="xpl-skeleton">
              {Array.from({ length: 4 }).map((_, i) => (
                <div className="xpl-skeleton-row" key={i}>
                  <div className="xpl-skeleton-cell xpl-sk-lg" />
                  <div className="xpl-skeleton-cell xpl-sk-md" />
                  <div className="xpl-skeleton-cell xpl-sk-sm" />
                </div>
              ))}
            </div>
          )}

          {/* Results bar */}
          {!loading && preview && (
            <div className="rcx-results-bar">
              <span><strong>{preview.rows.length}</strong> {t('page.reports.results_count')}</span>
              {generatedAt && <span>{t('page.dashboard.last_update')} {generatedAt.toLocaleTimeString('ar')}</span>}
            </div>
          )}

          {/* Empty state */}
          {!loading && !preview && !error && (
            <EmptyState
              icon="bar_chart"
              title={t(currentType.label)}
              message={t('page.reports.empty')}
              action={canView ? <Button variant="primary" icon="play_arrow" onClick={loadPreview}>{t('page.reports.view')}</Button> : undefined}
            />
          )}

          {/* Executive KPI cards — تُعرض فقط للتقارير التي ترسلها */}
          {!loading && preview && preview.kpis && preview.kpis.length > 0 && (
            <div className="rcx-kpi-grid">
              {preview.kpis.map((k, i) => (
                <MetricCard
                  key={`${k.label}-${i}`}
                  icon={k.icon ?? 'insights'}
                  tone={kpiTone(k.color)}
                  label={k.label}
                  value={kpiText(k.value, k.format)}
                  sub={k.hint !== undefined && k.hint !== '' ? kpiText(k.hint, k.hintFormat) : undefined}
                />
              ))}
            </div>
          )}

          {/* Preview table */}
          {!loading && preview && (
            <div>
              {preview.subtitle && <div className="rcx-preview-subtitle">{preview.subtitle}</div>}
              {/* `key` على مفتاح التقرير: تبديل التقرير يُعيد ضبط الفرز والبحث السريع
                  بدل أن يرث الجدول الجديد حالة عرض الجدول السابق. */}
              <PreviewTable
                key={selected}
                columns={preview.columns}
                rows={preview.rows}
                totalsRow={preview.totalsRow}
                emptyText={t('page.reports.no_data')}
                tools={currentType.tableTools}
                statusColumnKey={currentType.statusColumnKey}
                totalsLabelKey={currentType.totalsLabelKey}
              />
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Analytical sections (only for reports that provide them) ── */}
      {!loading && preview?.sections?.map((section, i) => (
        <SectionCard key={`${section.title}-${i}`} title={section.title} icon="analytics" padded={false}>
          <div className="xpl-card--pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {section.note && (
              <p className="rcx-note" style={{ margin: 0 }}>
                <span className="material-symbols-outlined">info</span>
                {section.note}
              </p>
            )}
            <PreviewTable
              columns={section.columns}
              rows={section.rows}
              totalsRow={section.totalsRow}
              applyAlign
              emptyText={t('page.reports.no_data')}
            />
          </div>
        </SectionCard>
      ))}

    </div>
  );
}
