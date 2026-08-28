import { ReactNode } from 'react';
import { Column } from '../components/DataTable';
import { FormField, FormSection } from '../components/FormDialog';
import { formatDate } from '../lib/date';
import { formatCurrency, formatMoneyParts, formatMoneyCell } from '../lib/format';
import { currentCurrencyLanguage } from '../stores/settingsStore';
import { t as translate } from '../lib/i18n';
import { useUI } from '../stores/uiStore';
import { usePrivacyMode, buildLevel1Mask } from '../components/PrivateAmount';
import { expenseCategoryArMap } from './expenseCategories';
import { NameCell, ExpiryCell } from '../components/employees/employeeCells';
import { RegRemainingCell } from '../components/equipment/equipmentCells';
import { resolveName } from '../lib/resolveName';

// ===== أدوات عرض =====
export function money(v: unknown): string {
  return formatCurrency(v, { language: currentCurrencyLanguage() });
}

/** `money` split into its number + currency-label parts (for inline currency-label rendering). */
export function moneyParts(v: unknown): { number: string; currency: string } {
  return formatMoneyParts(v, { language: currentCurrencyLanguage() });
}

/**
 * مبلغ مالي **معروض** داخل بطاقة أو Drawer.
 *
 * `money()` وحدها لا تكفي: نصّها («255.000 KWD») يوضع في حاوية عربية، فيُعيد خوارزم
 * الاتجاه ثنائي الاتجاه ترتيبَه بصريًا إلى «KWD 255.000» — قِيس ذلك في التطبيق:
 * الرمز يبدأ عند 25px والرقم عند 40px. `money-cell` تعزل القيمة في اتجاه LTR بلا
 * التفاف، فيبقى الرقم أوّلًا والرمز بعده، والنصّ العربي المحيط لا يتأثّر.
 *
 * الرمز يتبع إعداد لغة العملة (KWD / د.ك)، والأرقام غربية دائمًا.
 */
export function MoneyText({ value }: { value: unknown }) {
  const masked = usePrivacyMode();
  const formatted = money(value);
  return (
    <span className="money-cell">
      <span className="pm-mask" style={{ display: masked ? 'inline' : 'none' }} aria-hidden={!masked}>
        {buildLevel1Mask(formatted)}
      </span>
      <span className="pm-real" style={{ display: masked ? 'none' : 'inline' }} aria-hidden={masked}>
        {formatted}
      </span>
    </span>
  );
}

/**
 * جملة تحوي مبلغًا (تنبيه تنفيذي، توصية، ملخّص نصّي).
 *
 * الرسالة تُبنى في الخلفية كنصّ عربي واحد («مديونيات متأخرة أكثر من 90 يوم:
 * 87,940.000 KWD»)، فيقلب خوارزم الاتجاه ترتيبَ الرقم والرمز داخلها. لا يكفي صنف على
 * الحاوية: العزل يجب أن يقع على **المبلغ نفسه**. هنا نقسم النصّ عند المبلغ ونعزله —
 * عرضٌ بحت: لا الرسالة تتغيّر، ولا مصدرها، ولا أي منطق.
 */
// نمطان متطابقان عمدًا: الأول للتقسيم (بعلم g)، والثاني للفحص (بلا g) — لأن `test`
// على نمط بعلم g يحتفظ بـ `lastIndex` فيُخطئ بالتناوب.
const MONEY_SPLIT = /(-?[\d,]+\.\d{3}\s*(?:KWD|د\.ك))/g;
const MONEY_MATCH = /^-?[\d,]+\.\d{3}\s*(?:KWD|د\.ك)$/;

export function TextWithMoney({ text }: { text?: string | null }) {
  // النصّ **اختياري فعلًا**: استجابة الـ API تُصنَّف بلا تحقّق وقت التشغيل، وقد يصل حقل
  // غائب — وقد حدث: توصيات لوحة المعلومات لا تحمل `message` إطلاقًا (الخلفية ترسل
  // reason / expectedImpact / suggestedAction). كان React يُصيّر `undefined` فراغًا
  // بصمت، فلمّا مرّ الحقل الغائب على `.split()` انهارت اللوحة كلها.
  //
  // الغياب ⇒ لا نُصيّر شيئًا: **نفس** ما كان يحدث قبل هذا المكوّن، لا أكثر. لا نخترع
  // نصًّا بديلًا، ولا نضع «—» فنُوهم بقيمة، ولا نبتلع عيب البيانات — العقد صار صريحًا،
  // والعيب مُبلَّغ عنه بدل أن يُسقط الشاشة.
  if (typeof text !== 'string' || text === '') return null;

  const parts = text.split(MONEY_SPLIT);
  return (
    <>
      {parts.map((part, i) =>
        MONEY_MATCH.test(part)
          ? <span key={i} className="money-cell">{part}</span>
          : <span key={i}>{part}</span>,
      )}
    </>
  );
}

/**
 * **خليّة جدول** مالية: الرقم وحده — «12,455.000» — بلا رمز، لأن العنوان يحمله مرّة
 * واحدة. الصفر قيمة («0.000»)، وغير المنطبق «—». `money-cell` تعزل الاتجاه فلا ينقلب
 * الرقم داخل واجهة عربية.
 *
 * لا تُستعمل في بطاقة أو Drawer بلا عنوان يحمل الرمز — هناك `MoneyText` (رقم + رمز).
 */
export function MoneyCell({ value }: { value: unknown }) {
  const masked = usePrivacyMode();
  const formatted = formatMoneyCell(value);
  // "—" (not-applicable) isn't a financial figure — never mask it, so empty cells
  // stay visually distinct from a genuinely masked zero/amount.
  if (formatted === '—') return <span className="money-cell">{formatted}</span>;
  return (
    <span className="money-cell">
      <span className="pm-mask" style={{ display: masked ? 'inline' : 'none' }} aria-hidden={!masked}>
        {buildLevel1Mask(formatted)}
      </span>
      <span className="pm-real" style={{ display: masked ? 'none' : 'inline' }} aria-hidden={masked}>
        {formatted}
      </span>
    </span>
  );
}

export function dateText(v: unknown): string {
  return formatDate(v);
}

/** Current UI language read outside React (same getState() pattern as currentCurrencyLanguage()). */
function currentLang() {
  return useUI.getState().lang;
}

type PillCls = 'green' | 'amber' | 'red' | 'blue' | 'gray';
function pill(label: string, cls: PillCls): ReactNode {
  return <span className={`pill ${cls}`}>{label}</span>;
}

function mapPill(map: Record<string, [string, PillCls]>) {
  return (v: string) => {
    const [label, cls] = map[v] ?? [v, 'gray'];
    return pill(label, cls);
  };
}

const contractStatus = mapPill({
  ACTIVE: ['ساري', 'green'], EXPIRED: ['منتهٍ', 'gray'], RENEWING: ['قيد التجديد', 'amber'], SUSPENDED: ['موقوف', 'red'],
});
const equipmentStatus = mapPill({ WORKING: ['تعمل', 'green'], NOT_WORKING: ['لا تعمل', 'red'] });
const EMPLOYEE_STATUS_MAP: Record<string, [string, PillCls]> = { ACTIVE: ['نشط', 'green'], ON_LEAVE: ['إجازة', 'amber'], TERMINATED: ['منتهي الخدمة', 'gray'] };
const employeeStatus = mapPill(EMPLOYEE_STATUS_MAP);
const expenseStatus = mapPill({ PENDING: ['معلّق', 'amber'], APPROVED: ['معتمد', 'green'], REJECTED: ['مرفوض', 'red'] });
const customerType = mapPill({ GOVERNMENT: ['حكومي', 'blue'], PRIVATE: ['خاص', 'gray'] });


// ==== تصنيفات المصروفات — مشتقّة من المصدر الموحّد (config/expenseCategories.ts) ====
// إعادة تصدير للحفاظ على التوافق مع المستهلكين الحاليين (مثل LatestExpensesTable).
export const expenseCategoryAr: Record<string, string> = expenseCategoryArMap;
// ============================================================

export interface ModuleConfig {
  key: string;
  endpoint: string;
  label: string;
  title: string;
  subtitle: string;
  icon: string;
  group: string;
  columns: Column[];
  fields: FormField[];
  createLabel: string;
  emptyText?: string;
  canApprove?: boolean;
  supportsArchive?: boolean;
  supportsExport?: boolean;
  /**
   * Excel Page Export Consistency v1 — opt-in only (currently `employees`). When true,
   * ResourcePage exports directly from this module's own `columns` (same headers/order/
   * values as the visible table) instead of the shared `/reports/:type/export` pipeline.
   * Modules WITHOUT this flag keep the exact original `/reports/:type/export` behavior —
   * unaffected by this pack (contracts, customers, suppliers, equipment).
   */
  nativeExcelExport?: boolean;
  statusFilter?: { param: string; options: { value: string; labelKey: string }[] };
  /**
   * الترتيب الافتراضي للوحدة — يحلّ محلّ «بلا فرز» في دورة `useTableSort`: يُطبَّق
   * حين لا يوجد اختيار محفوظ، وتعود إليه الدورة عند إكمالها وعند «إعادة تعيين
   * الفلاتر». `by` مفتاح عمود مُدرج في القائمة البيضاء للفرز في الخادم.
   * الوحدات بلا هذا الحقل تبقى على سلوكها السابق حرفيًا (ترتيب الخادم الافتراضي).
   */
  defaultSort?: { by: string; dir: 'asc' | 'desc' };
  /** Opt-in: render this module with the ExplorerKit executive layout (header,
   *  KPIs, sticky toolbar, modern table, detail drawer, sectioned dialog).
   *  Modules without this flag keep the classic ResourcePage layout unchanged. */
  explorer?: boolean;
  /** Material Symbols icon used by the explorer header / drawer / dialog. */
  explorerIcon?: string;
  /** Field grouping for the explorer create/edit dialog (sectioned cards). */
  formSections?: FormSection[];
}

export const MODULES: Record<string, ModuleConfig> = {
  contracts: {
    key: 'contracts', endpoint: '/contracts', label: 'nav.contracts',
    title: 'mod.contracts.title', subtitle: 'mod.contracts.subtitle',
    icon: '📄', group: 'nav.group.core', createLabel: 'mod.contracts.create',
    emptyText: 'empty.contracts', supportsExport: true,
    explorer: true, explorerIcon: 'description',
    formSections: [
      { id: 'basic', title: 'page.form.contracts.basic', icon: 'badge' },
      { id: 'pricing', title: 'page.form.contracts.pricing', icon: 'sell' },
      { id: 'period', title: 'page.form.contracts.period', icon: 'event' },
    ],
    statusFilter: {
      param: 'status',
      options: [
        { value: 'ACTIVE',    labelKey: 'opt.contract.active' },
        { value: 'RENEWING',  labelKey: 'opt.contract.renewing' },
        { value: 'EXPIRED',   labelKey: 'opt.contract.expired' },
        { value: 'SUSPENDED', labelKey: 'opt.contract.suspended' },
      ],
    },
    columns: [
      { key: 'code', label: 'col.contract_no', sortable: true, render: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.code}</strong> },
      { key: 'customerName', label: 'col.customer', sortable: true, render: (r) => r.customer ? resolveName(r.customer, currentLang()) : '—' },
      { key: 'asphaltPlant', label: 'col.asphalt_plant', sortable: true },
      { key: 'companyName', label: 'col.company_name', sortable: true },
      { key: 'location', label: 'col.location', sortable: true },
      { key: 'unitName', label: 'col.unit_name', sortable: true },
      { key: 'price', label: 'col.price', money: true, sortable: true, render: (r) => <MoneyCell value={r.price} /> },
      { key: 'monthlyTransportValue', label: 'col.monthly_value', money: true, sortable: true, render: (r) => <MoneyCell value={r.monthlyTransportValue} /> },
      { key: 'status', label: 'col.status', sortable: true, render: (r) => contractStatus(r.status) },
    ],
    fields: [
      {
        name: 'linkedPrice',
        label: 'field.linked_price',
        type: 'select',
        optionsEndpoint: '/prices?pageSize=100',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        optionLabelFn: (x: any) => `${x.asphaltPlant} — ${x.companyName} — ${x.contractLocation} — ${x.contractUnit} — ${money(x.unitPrice)}`,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onSelectRaw: (raw: any) => ({
          asphaltPlant: raw.asphaltPlant ?? '',
          companyName: raw.companyName ?? '',
          location: raw.contractLocation ?? '',
          unitName: raw.contractUnit ?? '',
          price: String(raw.unitPrice ?? ''),
        }),
        half: false,
        section: 'pricing',
      },
      { name: 'code', label: 'field.contract_no', required: true, section: 'basic' },
      { name: 'customerId', label: 'field.contracting_party', type: 'select', optionsEndpoint: '/customers', optionLabel: 'name', section: 'basic' },
      { name: 'status', label: 'field.status', type: 'select', section: 'basic', options: [
        { value: 'ACTIVE', label: 'opt.contract.active' },
        { value: 'RENEWING', label: 'opt.contract.renewing' },
        { value: 'EXPIRED', label: 'opt.contract.expired' },
        { value: 'SUSPENDED', label: 'opt.contract.suspended' }] },
      { name: 'asphaltPlant', label: 'field.asphalt_plant_name', required: true, section: 'pricing' },
      { name: 'companyName', label: 'field.company_name', section: 'pricing' },
      { name: 'location', label: 'field.location', section: 'pricing' },
      { name: 'unitName', label: 'field.unit_name', section: 'pricing' },
      { name: 'price', label: 'field.price_kd', type: 'number', section: 'pricing' },
      { name: 'monthlyTransportValue', label: 'field.monthly_value_kd', type: 'number', section: 'pricing' },
      { name: 'startDate', label: 'field.start_date', type: 'date', section: 'period' },
      { name: 'endDate', label: 'field.end_date', type: 'date', section: 'period' },
    ],
  },

  customers: {
    key: 'customers', endpoint: '/customers', label: 'nav.customers',
    title: 'mod.customers.title', subtitle: 'mod.customers.subtitle',
    icon: '👥', group: 'nav.group.core', createLabel: 'mod.customers.create',
    emptyText: 'empty.customers', supportsArchive: true, supportsExport: true,
    explorer: true, explorerIcon: 'groups',
    formSections: [
      { id: 'identity', title: 'page.form.customers.identity', icon: 'badge' },
      { id: 'contact', title: 'page.form.customers.contact', icon: 'contacts' },
      { id: 'notes', title: 'field.notes', icon: 'sticky_note_2' },
    ],
    statusFilter: {
      param: 'type',
      options: [
        { value: 'GOVERNMENT', labelKey: 'opt.customer.government' },
        { value: 'PRIVATE',    labelKey: 'opt.customer.private' },
      ],
    },
    columns: [
      { key: 'code', label: 'col.code', sortable: true, render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
      { key: 'name', label: 'col.customer_name', sortable: true, render: (r) => <strong>{resolveName(r, currentLang())}</strong> },
      { key: 'type', label: 'col.type', sortable: true, render: (r) => customerType(r.type) },
      { key: 'phone', label: 'col.phone', sortable: true },
      { key: 'contactName', label: 'col.contact_name', sortable: true },
    ],
    fields: [
      { name: 'code', label: 'field.customer_code', required: true, placeholder: 'placeholder.customers.code', section: 'identity' },
      { name: 'name', label: 'field.customer_name', required: true, placeholder: 'placeholder.customers.name', section: 'identity' },
      { name: 'nameEn', label: 'field.customer_name_en', section: 'identity' },
      { name: 'type', label: 'field.type', type: 'select', defaultValue: 'PRIVATE', section: 'identity', options: [
        { value: 'GOVERNMENT', label: 'opt.customer.government' },
        { value: 'PRIVATE', label: 'opt.customer.private' }] },
      { name: 'phone', label: 'field.phone', placeholder: '+965 XXXX XXXX', section: 'contact' },
      { name: 'email', label: 'field.email', placeholder: 'example@domain.com', section: 'contact' },
      { name: 'contactName', label: 'field.contact_name', placeholder: 'placeholder.customers.contact_name', section: 'contact' },
      { name: 'address', label: 'field.address', placeholder: 'placeholder.customers.address', section: 'contact' },
      { name: 'notes', label: 'field.notes', type: 'textarea', half: false, section: 'notes' },
    ],
  },

  suppliers: {
    key: 'suppliers', endpoint: '/suppliers', label: 'nav.suppliers',
    title: 'mod.suppliers.title', subtitle: 'mod.suppliers.subtitle',
    icon: '📦', group: 'mod.group.financial_short', createLabel: 'mod.suppliers.create',
    emptyText: 'empty.suppliers', supportsArchive: true, supportsExport: true,
    explorer: true, explorerIcon: 'inventory_2',
    formSections: [
      { id: 'identity', title: 'page.form.suppliers.identity', icon: 'badge' },
      { id: 'contact', title: 'page.form.suppliers.contact', icon: 'contacts' },
      { id: 'notes', title: 'field.notes', icon: 'sticky_note_2' },
    ],
    columns: [
      { key: 'code', label: 'col.code', sortable: true, render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
      { key: 'name', label: 'col.supplier_name', sortable: true, render: (r) => <strong>{resolveName(r, currentLang())}</strong> },
      { key: 'phone', label: 'col.phone', sortable: true },
      { key: 'contactName', label: 'col.contact_name', sortable: true },
    ],
    fields: [
      { name: 'code', label: 'field.supplier_code', required: true, section: 'identity' },
      { name: 'name', label: 'field.supplier_name', required: true, section: 'identity' },
      { name: 'nameEn', label: 'field.supplier_name_en', section: 'identity' },
      { name: 'phone', label: 'field.phone', section: 'contact' },
      { name: 'email', label: 'field.email', section: 'contact' },
      { name: 'contactName', label: 'field.contact_name', section: 'contact' },
      { name: 'address', label: 'field.address', section: 'contact' },
      { name: 'notes', label: 'field.notes', type: 'textarea', half: false, section: 'notes' },
    ],
  },

  equipment: {
    key: 'equipment', endpoint: '/equipment', label: 'nav.equipment',
    title: 'mod.equipment.title', subtitle: 'mod.equipment.subtitle',
    icon: '🚜', group: 'nav.group.core', createLabel: 'mod.equipment.create',
    emptyText: 'empty.equipment', supportsExport: true,
    explorer: true, explorerIcon: 'construction',
    // الأقرب انتهاءً أولًا: `regRemaining` يُترجَم خادميًا إلى `registrationExpiry`
    // (نفس مصدر «المدة الباقية»)، و«غير محدد» يبقى في الذيل عبر nulls: 'last'.
    defaultSort: { by: 'regRemaining', dir: 'asc' },
    formSections: [
      { id: 'identity', title: 'page.form.equipment.identity', icon: 'badge' },
      { id: 'ownership', title: 'page.form.equipment.ownership', icon: 'person' },
      { id: 'registration', title: 'page.form.equipment.registration', icon: 'event' },
    ],
    statusFilter: {
      param: 'status',
      options: [
        { value: 'WORKING',     labelKey: 'opt.eq.working' },
        { value: 'NOT_WORKING', labelKey: 'opt.eq.not_working' },
      ],
    },
    columns: [
      // معيار ترقيم الصفوف: رقم المعدة معرّف تجاري غير ضروري في القائمة —
      // استُبدل بترقيم تسلسلي يتابع عبر الصفحات. الكود يبقى في البحث والتنبيهات والـ Drawer.
      { key: 'rowNo', label: '#', rowNumber: true },
      // «النوع» → «الشكل»: تسمية عرض فقط؛ المفتاح والحقل الخلفي `type` بلا تغيير.
      { key: 'type', label: 'col.eq_shape', sortable: true },
      { key: 'ownerName', label: 'col.owner_name', sortable: true },
      { key: 'driverName', label: 'col.driver_name', sortable: true, render: (r) => <strong>{r.driverName ?? '—'}</strong> },
      { key: 'plateNumber', label: 'col.plate_number', sortable: true, render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.plateNumber ?? '—'}</span> },
      { key: 'chassisNumber', label: 'field.eq_chassis', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.chassisNumber ?? '—'}</span> },
      { key: 'manufacturer', label: 'field.eq_make', render: (r) => r.manufacturer ?? '—' },
      { key: 'manufactureYear', label: 'field.eq_make_year', render: (r) => r.manufactureYear ?? '—' },
      { key: 'color', label: 'field.eq_color', render: (r) => r.color ?? '—' },
      // regExpiry يُفرز خادميًا عبر ترجمة القائمة البيضاء إلى registrationExpiry.
      // regRemaining (أدناه) مشتق بلا حقل خلفي → غير قابل للفرز عمدًا.
      { key: 'regExpiry', label: 'col.reg_expiry', sortable: true, render: (r) => {
        const reg = r.registration;
        return reg?.expiry ? dateText(reg.expiry) : '—';
      }},
      // Equipment Table Visual Consistency Pack — soft tint + accent (shared
      // ToneCell), matching the Employee table's approved tone system exactly.
      // الفرز خادمي على `registrationExpiry` نفسه (المصدر ذاته الذي تُحسب منه
      // المدة الباقية) — انظر القائمة البيضاء في equipment.service.ts.
      { key: 'regRemaining', label: 'col.reg_remaining', sortable: true, render: (r) => <RegRemainingCell registration={r.registration} /> },
      { key: 'status', label: 'col.status', sortable: true, render: (r) => equipmentStatus(r.status) },
    ],
    fields: [
      { name: 'code', label: 'field.equipment_no', required: true, section: 'identity' },
      { name: 'type', label: 'field.eq_type', required: true, section: 'identity' },
      { name: 'manufacturer', label: 'field.eq_make', section: 'identity' },
      { name: 'manufactureYear', label: 'field.eq_make_year', type: 'number', section: 'identity' },
      { name: 'color', label: 'field.eq_color', section: 'identity' },
      { name: 'status', label: 'field.vehicle_status', type: 'select', section: 'identity', options: [
        { value: 'WORKING', label: 'opt.eq.working' },
        { value: 'NOT_WORKING', label: 'opt.eq.not_working' }] },
      { name: 'ownerName', label: 'field.owner_name', section: 'ownership' },
      { name: 'driverName', label: 'field.driver_name', section: 'ownership' },
      { name: 'plateNumber', label: 'field.plate_number', section: 'ownership' },
      { name: 'chassisNumber', label: 'field.eq_chassis', section: 'ownership' },
      { name: 'registrationExpiry', label: 'field.reg_expiry', type: 'date', section: 'registration' },
    ],
  },

  employees: {
    key: 'employees', endpoint: '/employees', label: 'nav.employees',
    title: 'mod.employees.title', subtitle: 'mod.employees.subtitle',
    icon: '👷', group: 'nav.group.core', createLabel: 'mod.employees.create',
    emptyText: 'empty.employees', supportsExport: true, nativeExcelExport: true,
    explorer: true, explorerIcon: 'badge',
    formSections: [
      { id: 'identity', title: 'page.form.employees.identity', icon: 'badge' },
      { id: 'job', title: 'page.form.employees.job', icon: 'work' },
      { id: 'documents', title: 'page.form.employees.documents', icon: 'description' },
      { id: 'contact', title: 'field.address', icon: 'contacts' },
    ],
    statusFilter: {
      param: 'status',
      options: [
        { value: 'ACTIVE',     labelKey: 'opt.emp.active' },
        { value: 'ON_LEAVE',   labelKey: 'opt.emp.on_leave' },
        { value: 'TERMINATED', labelKey: 'opt.emp.terminated' },
      ],
    },
    // Executive Visual Polish Pack v1.1 — presentation-only. Frozen identity
    // block = code + Arabic name only; single-line name cells; profession &
    // nationality are plain text; every expiry column shares one label-free
    // ExpiryCell (soft tint + thin colour accent). Keys, sortability and data
    // are unchanged.
    columns: [
      { key: 'code', label: 'col.code', sortable: true, frozen: true, width: '90px', render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 12 }}>{r.code}</span> },
      { key: 'fullName', label: 'col.fullname_ar', sortable: true, frozen: true, width: '180px', render: (r) => <NameCell value={r.fullName} lang="ar" strong /> },
      { key: 'fullNameEn', label: 'col.fullname_en', sortable: true, width: '140px', render: (r) => <NameCell value={r.fullNameEn} lang="en" /> },
      { key: 'civilId', label: 'col.civil_id', sortable: true, width: '108px', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.civilId ?? '—'}</span> },
      { key: 'jobTitle', label: 'col.job_title', sortable: true, width: '100px', render: (r) => <NameCell value={r.jobTitle} lang="ar" /> },
      { key: 'nationality', label: 'col.nationality', sortable: true, width: '84px' },
      { key: 'residencyExpiry', label: 'col.residency_expiry', sortable: true, width: '120px', render: (r) => <ExpiryCell value={r.residencyExpiry} />, exportValue: (r) => dateText(r.residencyExpiry) },
      { key: 'passportNumber', label: 'col.passport_number', width: '108px', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.passportNumber ?? '—'}</span> },
      { key: 'passportExpiry', label: 'col.passport_expiry', sortable: true, width: '120px', render: (r) => <ExpiryCell value={r.passportExpiry} />, exportValue: (r) => dateText(r.passportExpiry) },
      { key: 'licenseExpiry', label: 'col.license_expiry', sortable: true, width: '120px', render: (r) => <ExpiryCell value={r.licenseExpiry} />, exportValue: (r) => dateText(r.licenseExpiry) },
      { key: 'vehiclePlate', label: 'col.vehicle_plate', width: '100px', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.vehiclePlate ?? '—'}</span> },
      // انتهاء رخصة/دفتر المركبة لا يُعرض هنا: مالكه سجل المعدة/المركبة
      // (`equipment.registrationExpiry`) لا سجل الموظف — Remove Employee Vehicle
      // License Expiry v1. رقم اللوحة أعلاه بيانات الموظف فبقي.
      { key: 'salary', label: 'col.salary', money: true, sortable: true, width: '128px', render: (r) => <MoneyCell value={r.salary} /> },
      { key: 'hireDate', label: 'col.hire_date', sortable: true, width: '120px', render: (r) => dateText(r.hireDate), exportValue: (r) => dateText(r.hireDate) },
      { key: 'status', label: 'col.status', sortable: true, width: '124px', render: (r) => employeeStatus(r.status), exportValue: (r) => EMPLOYEE_STATUS_MAP[r.status]?.[0] ?? r.status ?? '' },
    ],
    fields: [
      { name: 'code', label: 'field.emp_code', required: true, section: 'identity' },
      { name: 'fullName', label: 'field.fullname_ar', required: true, section: 'identity' },
      { name: 'fullNameEn', label: 'field.fullname_en', section: 'identity' },
      { name: 'civilId', label: 'field.civil_id', section: 'identity' },
      { name: 'nationality', label: 'field.nationality', section: 'identity' },
      { name: 'birthDate', label: 'field.birth_date', type: 'date', section: 'identity' },
      { name: 'status', label: 'field.status', type: 'select', section: 'identity', options: [
        { value: 'ACTIVE', label: 'opt.emp.active' },
        { value: 'ON_LEAVE', label: 'opt.emp.on_leave' },
        { value: 'TERMINATED', label: 'opt.emp.terminated' }] },
      { name: 'jobTitle', label: 'field.job_title', section: 'job' },
      { name: 'company', label: 'field.company', section: 'job' },
      { name: 'hireDate', label: 'field.hire_date', type: 'date', section: 'job' },
      { name: 'salary', label: 'field.salary_kd', type: 'number', section: 'job' },
      { name: 'bankAccount', label: 'field.bank_account', section: 'job' },
      { name: 'passportNumber', label: 'field.passport_number', section: 'documents' },
      { name: 'passportExpiry', label: 'field.passport_expiry', type: 'date', section: 'documents' },
      { name: 'residencyExpiry', label: 'field.residency_expiry', type: 'date', section: 'documents' },
      { name: 'licenseExpiry', label: 'field.license_expiry', type: 'date', section: 'documents' },
      { name: 'vehiclePlate', label: 'field.vehicle_plate', section: 'documents' },
      // لا حقل «تاريخ انتهاء رخصة المركبة» في النموذج: المصدر الرسمي لانتهاء
      // رخصة/دفتر المركبة هو سجل المعدة/المركبة، فلا يُدخل من شاشة الموظفين.
      { name: 'address', label: 'field.address', section: 'contact' },
    ],
  },

  expenses: {
    key: 'expenses', endpoint: '/expenses', label: 'nav.expenses',
    title: 'mod.expenses.title', subtitle: 'mod.expenses.subtitle',
    icon: '💸', group: 'mod.group.financial_short', createLabel: 'mod.expenses.create', canApprove: true,
    emptyText: 'empty.expenses',
    statusFilter: {
      param: 'status',
      options: [
        { value: 'PENDING',  labelKey: 'status.pending' },
        { value: 'APPROVED', labelKey: 'status.approved' },
        { value: 'REJECTED', labelKey: 'status.rejected' },
      ],
    },
    columns: [
      { key: 'code', label: 'col.code', sortable: true, render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
      { key: 'category', label: 'col.category', sortable: true, render: (r) => expenseCategoryAr[r.category] ?? r.category },
      { key: 'description', label: 'col.description', sortable: true, render: (r) => <strong>{r.description}</strong> },
      { key: 'amount', label: 'col.amount', money: true, sortable: true, render: (r) => <MoneyCell value={r.amount} /> },
      { key: 'date', label: 'col.date', sortable: true, render: (r) => dateText(r.date) },
      { key: 'status', label: 'col.status', sortable: true, render: (r) => expenseStatus(r.status) },
    ],
    fields: [
      { name: 'category', label: 'field.category', type: 'select', required: true,
        options: Object.keys(expenseCategoryAr).map((value) => ({ value, label: `cat.${value.toLowerCase()}` })) },
      { name: 'description', label: 'field.description', required: true },
      { name: 'amount', label: 'field.amount_kd', type: 'number', required: true },
      { name: 'date', label: 'field.date', type: 'date', required: true },
      { name: 'contractId', label: 'field.linked_contract', type: 'select', optionsEndpoint: '/contracts', optionLabel: 'code' },
      { name: 'supplierId', label: 'field.supplier', type: 'select', optionsEndpoint: '/suppliers', optionLabel: 'name' },
    ],
  },

  users: {
    key: 'users', endpoint: '/users', label: 'mod.users.title',
    title: 'mod.users.title', subtitle: 'mod.users.subtitle',
    icon: '🔐', group: 'nav.group.system', createLabel: 'mod.users.create',
    emptyText: 'empty.users',
    columns: [
      { key: 'username', label: 'col.username', sortable: true, render: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.username}</strong> },
      { key: 'fullName', label: 'col.fullname', sortable: true },
      { key: 'role', label: 'col.role', sortable: true, render: (r) => pill(r.role?.displayName ?? '—', 'blue') },
      { key: 'isActive', label: 'col.status', sortable: true, render: (r) => r.isActive ? pill(translate('status.active', currentLang()), 'green') : pill(translate('status.suspended', currentLang()), 'gray') },
    ],
    fields: [
      { name: 'username', label: 'field.username', required: true },
      { name: 'password', label: 'field.password', type: 'password' },
      { name: 'fullName', label: 'field.fullname', required: true },
      { name: 'email', label: 'field.email' },
      { name: 'roleId', label: 'field.role', type: 'select', required: true, optionsEndpoint: '/roles', optionLabel: 'displayName' },
    ],
  },
};

// ترتيب القائمة الجانبية — label/group values are i18n keys resolved in Layout.tsx
// icon values = Material Symbols Outlined names (rendered as <span class="material-symbols-outlined ic">)
export const NAV: { group: string; items: { key: string; label: string; icon: string; permission?: string }[] }[] = [
  { group: '', items: [{ key: 'dashboard', label: 'nav.dashboard', icon: 'dashboard' }] },
  { group: 'nav.group.core', items: [
    { key: 'prices',       label: 'nav.prices',       icon: 'handshake',   permission: 'prices.read' },
    // تحليل الشغل والعمولة — يجاور اتفاقيات الأسعار لأنه يستهلكها، ويسبق الفوترة.
    { key: 'work-analysis', label: 'nav.work_analysis', icon: 'query_stats', permission: 'workAnalysis.read' },
    { key: 'customers',    label: 'nav.customers',    icon: 'groups',      permission: 'customers.read' },
    { key: 'equipment',    label: 'nav.equipment',    icon: 'construction', permission: 'equipment.read' },
    { key: 'maintenance',  label: 'nav.maintenance',  icon: 'build_circle', permission: 'maintenance.read' },
    // تأمين المركبات — يجاور الصيانة لأن كليهما يعمل على أسطول المعدات، وصلاحيته
    // مستقلة تمامًا عن `equipment.read` و`maintenance.read`.
    { key: 'vehicle-insurance', label: 'nav.vehicle_insurance', icon: 'shield', permission: 'vehicleInsurance.read' },
    { key: 'employees',    label: 'nav.employees',    icon: 'badge',       permission: 'employees.read' },
    // مستحقات الموظف الشهرية — يجاور «الموظفين» لأنه يقرأ منهم، ويسبق الحضور.
    // صلاحيته مستقلة تمامًا عن `payroll.read`.
    { key: 'employee-compensation', label: 'nav.employee_compensation', icon: 'request_quote', permission: 'employeeCompensation.read' },
    { key: 'attendance',   label: 'nav.attendance',   icon: 'event_available', permission: 'attendance.read' },
    { key: 'contracts',    label: 'nav.contracts',    icon: 'description', permission: 'contracts.read' },
  ] },
  { group: 'nav.group.admin_ops', items: [
    { key: 'forms', label: 'nav.forms', icon: 'article', permission: 'forms.read' },
  ] },
  { group: 'nav.group.financial', items: [
    { key: 'invoices', label: 'nav.invoices', icon: 'receipt_long', permission: 'invoices.read' },
    { key: 'expenses', label: 'nav.expenses', icon: 'payments', permission: 'expenses.read' },
    { key: 'cheques', label: 'nav.cheques', icon: 'edit_note', permission: 'cheques.read' },
    // البنوك والحسابات — مصدر هوية البنك لوحدة الشيكات، فموضعها بجوارها مباشرةً.
    { key: 'banks', label: 'nav.banks', icon: 'account_balance', permission: 'banks.read' },
    { key: 'salaries', label: 'nav.salaries', icon: 'account_balance_wallet', permission: 'payroll.read' },
    { key: 'suppliers', label: 'nav.suppliers', icon: 'inventory_2', permission: 'suppliers.read' },
    { key: 'accounting', label: 'nav.accounting', icon: 'account_balance', permission: 'transactions.read' },
    { key: 'financial', label: 'nav.financial', icon: 'account_balance', permission: 'statements.read' },
    { key: 'financial-ops', label: 'nav.financial_ops', icon: 'monitoring', permission: 'financialdashboard.read' },
    // مركز التحليل المالي — قراءة فقط فوق نفس المحرّك التشغيلي، يحرسه reports.read.
    { key: 'financial-analysis', label: 'nav.financial_analysis', icon: 'query_stats', permission: 'reports.read' },
  ] },
  { group: 'nav.group.import_center', items: [
    { key: 'payroll/bank-analytics', label: 'nav.bank_analytics', icon: 'bar_chart', permission: 'import.read' },
    { key: 'bank-reconciliation', label: 'nav.bank_reconciliation', icon: 'balance', permission: 'bankStatementImport.read' },
    { key: 'bank-accounts', label: 'nav.bank_accounts', icon: 'account_balance_wallet', permission: 'bankStatementImport.read' },
  ] },
  { group: 'nav.group.warehouse', items: [
    { key: 'inventory', label: 'nav.inventory', icon: 'warehouse', permission: 'inventory.read' },
  ] },
  { group: 'nav.group.system', items: [
    { key: 'expirations', label: 'nav.expirations', icon: 'event_busy', permission: 'expirations.read' },
    { key: 'executive', label: 'nav.executive', icon: 'crisis_alert', permission: 'dashboard.read' },
    { key: 'reports', label: 'nav.reports', icon: 'analytics', permission: 'reports.read' },
    { key: 'users', label: 'nav.users', icon: 'manage_accounts', permission: 'users.read' },
    { key: 'audit', label: 'nav.audit', icon: 'history', permission: 'audit.read' },
    { key: 'backup', label: 'nav.backup', icon: 'backup', permission: 'backups.read' },
    { key: 'settings',      label: 'nav.settings',      icon: 'settings',         permission: 'settings.read' },
    { key: 'integrations',  label: 'nav.integrations',  icon: 'hub',              permission: 'integrations.read' },
  ] },
  { group: 'nav.group.tools', items: [
    { key: 'import', label: 'nav.import', icon: 'upload', permission: 'import.read' },
  ] },
  { group: 'nav.group.ai', items: [
    { key: 'ai-assistant', label: 'nav.ai_assistant', icon: 'psychology', permission: 'reports.read' },
  ] },
];
