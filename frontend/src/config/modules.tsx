import { ReactNode } from 'react';
import { Column } from '../components/DataTable';
import { FormField, FormSection } from '../components/FormDialog';
import { formatDate } from '../lib/date';
import { formatCurrency, formatMoneyParts, formatMoneyCell } from '../lib/format';
import { currentCurrencyLanguage } from '../stores/settingsStore';
import { expenseCategoryArMap } from './expenseCategories';

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
  return <span className="money-cell">{money(value)}</span>;
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
  return <span className="money-cell">{formatMoneyCell(value)}</span>;
}

export function dateText(v: unknown): string {
  return formatDate(v);
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
const employeeStatus = mapPill({ ACTIVE: ['نشط', 'green'], ON_LEAVE: ['إجازة', 'amber'], TERMINATED: ['منتهي الخدمة', 'gray'] });
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
  statusFilter?: { param: string; options: { value: string; labelKey: string }[] };
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
    key: 'contracts', endpoint: '/contracts', label: 'إدارة العقود',
    title: 'mod.contracts.title', subtitle: 'mod.contracts.subtitle',
    icon: '📄', group: 'العمليات الأساسية', createLabel: 'mod.contracts.create',
    emptyText: 'empty.contracts', supportsExport: true,
    explorer: true, explorerIcon: 'description',
    formSections: [
      { id: 'basic', title: 'بيانات العقد', icon: 'badge' },
      { id: 'pricing', title: 'التسعير والاتفاقية', icon: 'sell' },
      { id: 'period', title: 'مدة العقد', icon: 'event' },
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
      { key: 'customerName', label: 'col.customer', sortable: true, render: (r) => r.customer?.name ?? '—' },
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
    key: 'customers', endpoint: '/customers', label: 'العملاء والجهات',
    title: 'mod.customers.title', subtitle: 'mod.customers.subtitle',
    icon: '👥', group: 'العمليات الأساسية', createLabel: 'mod.customers.create',
    emptyText: 'empty.customers', supportsArchive: true, supportsExport: true,
    explorer: true, explorerIcon: 'groups',
    formSections: [
      { id: 'identity', title: 'هوية العميل', icon: 'badge' },
      { id: 'contact', title: 'معلومات الاتصال', icon: 'contacts' },
      { id: 'notes', title: 'ملاحظات', icon: 'sticky_note_2' },
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
      { key: 'name', label: 'col.customer_name', sortable: true, render: (r) => <strong>{r.name}</strong> },
      { key: 'type', label: 'col.type', sortable: true, render: (r) => customerType(r.type) },
      { key: 'phone', label: 'col.phone', sortable: true },
      { key: 'contactName', label: 'col.contact_name', sortable: true },
    ],
    fields: [
      { name: 'code', label: 'field.customer_code', required: true, placeholder: 'مثال: C-001', section: 'identity' },
      { name: 'name', label: 'field.customer_name', required: true, placeholder: 'الاسم الرسمي للعميل', section: 'identity' },
      { name: 'type', label: 'field.type', type: 'select', defaultValue: 'PRIVATE', section: 'identity', options: [
        { value: 'GOVERNMENT', label: 'opt.customer.government' },
        { value: 'PRIVATE', label: 'opt.customer.private' }] },
      { name: 'phone', label: 'field.phone', placeholder: '+965 XXXX XXXX', section: 'contact' },
      { name: 'email', label: 'field.email', placeholder: 'example@domain.com', section: 'contact' },
      { name: 'contactName', label: 'field.contact_name', placeholder: 'اسم الشخص المسؤول', section: 'contact' },
      { name: 'address', label: 'field.address', placeholder: 'العنوان التفصيلي', section: 'contact' },
      { name: 'notes', label: 'field.notes', type: 'textarea', half: false, section: 'notes' },
    ],
  },

  suppliers: {
    key: 'suppliers', endpoint: '/suppliers', label: 'الموردون',
    title: 'mod.suppliers.title', subtitle: 'mod.suppliers.subtitle',
    icon: '📦', group: 'المالية', createLabel: 'mod.suppliers.create',
    emptyText: 'empty.suppliers', supportsArchive: true, supportsExport: true,
    explorer: true, explorerIcon: 'inventory_2',
    formSections: [
      { id: 'identity', title: 'هوية المورد', icon: 'badge' },
      { id: 'contact', title: 'بيانات التواصل', icon: 'contacts' },
      { id: 'notes', title: 'ملاحظات', icon: 'sticky_note_2' },
    ],
    columns: [
      { key: 'code', label: 'col.code', sortable: true, render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
      { key: 'name', label: 'col.supplier_name', sortable: true, render: (r) => <strong>{r.name}</strong> },
      { key: 'phone', label: 'col.phone', sortable: true },
      { key: 'contactName', label: 'col.contact_name', sortable: true },
    ],
    fields: [
      { name: 'code', label: 'field.supplier_code', required: true, section: 'identity' },
      { name: 'name', label: 'field.supplier_name', required: true, section: 'identity' },
      { name: 'phone', label: 'field.phone', section: 'contact' },
      { name: 'email', label: 'field.email', section: 'contact' },
      { name: 'contactName', label: 'field.contact_name', section: 'contact' },
      { name: 'address', label: 'field.address', section: 'contact' },
      { name: 'notes', label: 'field.notes', type: 'textarea', half: false, section: 'notes' },
    ],
  },

  equipment: {
    key: 'equipment', endpoint: '/equipment', label: 'المعدات والآليات',
    title: 'mod.equipment.title', subtitle: 'mod.equipment.subtitle',
    icon: '🚜', group: 'العمليات الأساسية', createLabel: 'mod.equipment.create',
    emptyText: 'empty.equipment', supportsExport: true,
    explorer: true, explorerIcon: 'construction',
    formSections: [
      { id: 'identity', title: 'بيانات المعدة', icon: 'badge' },
      { id: 'ownership', title: 'الملكية والتشغيل', icon: 'person' },
      { id: 'registration', title: 'الترخيص', icon: 'event' },
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
      { key: 'type', label: 'col.type', sortable: true },
      { key: 'ownerName', label: 'col.owner_name', sortable: true },
      { key: 'driverName', label: 'col.driver_name', sortable: true, render: (r) => <strong>{r.driverName ?? '—'}</strong> },
      { key: 'plateNumber', label: 'col.plate_number', sortable: true, render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.plateNumber ?? '—'}</span> },
      // regExpiry يُفرز خادميًا عبر ترجمة القائمة البيضاء إلى registrationExpiry.
      // regRemaining (أدناه) مشتق بلا حقل خلفي → غير قابل للفرز عمدًا.
      { key: 'regExpiry', label: 'col.reg_expiry', sortable: true, render: (r) => {
        const reg = r.registration;
        return reg?.expiry ? dateText(reg.expiry) : '—';
      }},
      { key: 'regRemaining', label: 'col.reg_remaining', render: (r) => {
        const reg = r.registration;
        if (!reg?.expiry) return '—';
        const cls: PillCls = reg.expired ? 'red' : reg.expiringSoon ? 'amber' : 'green';
        return pill((reg.expired || reg.expiringSoon ? '⚠ ' : '') + reg.remainingText, cls);
      }},
      { key: 'status', label: 'col.status', sortable: true, render: (r) => equipmentStatus(r.status) },
    ],
    fields: [
      { name: 'code', label: 'field.equipment_no', required: true, section: 'identity' },
      { name: 'type', label: 'field.eq_type', required: true, section: 'identity' },
      { name: 'status', label: 'field.vehicle_status', type: 'select', section: 'identity', options: [
        { value: 'WORKING', label: 'opt.eq.working' },
        { value: 'NOT_WORKING', label: 'opt.eq.not_working' }] },
      { name: 'ownerName', label: 'field.owner_name', section: 'ownership' },
      { name: 'driverName', label: 'field.driver_name', section: 'ownership' },
      { name: 'plateNumber', label: 'field.plate_number', section: 'ownership' },
      { name: 'registrationExpiry', label: 'field.reg_expiry', type: 'date', section: 'registration' },
    ],
  },

  employees: {
    key: 'employees', endpoint: '/employees', label: 'الموظفون والكوادر',
    title: 'mod.employees.title', subtitle: 'mod.employees.subtitle',
    icon: '👷', group: 'العمليات الأساسية', createLabel: 'mod.employees.create',
    emptyText: 'empty.employees', supportsExport: true,
    explorer: true, explorerIcon: 'badge',
    formSections: [
      { id: 'identity', title: 'البيانات الشخصية', icon: 'badge' },
      { id: 'job', title: 'الوظيفة والراتب', icon: 'work' },
      { id: 'documents', title: 'الوثائق والصلاحيات', icon: 'description' },
      { id: 'contact', title: 'العنوان', icon: 'contacts' },
    ],
    statusFilter: {
      param: 'status',
      options: [
        { value: 'ACTIVE',     labelKey: 'opt.emp.active' },
        { value: 'ON_LEAVE',   labelKey: 'opt.emp.on_leave' },
        { value: 'TERMINATED', labelKey: 'opt.emp.terminated' },
      ],
    },
    columns: [
      { key: 'code', label: 'col.code', sortable: true, render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 12 }}>{r.code}</span> },
      { key: 'fullName', label: 'col.fullname_ar', sortable: true, render: (r) => <strong>{r.fullName}</strong> },
      { key: 'fullNameEn', label: 'col.fullname_en', sortable: true },
      { key: 'civilId', label: 'col.civil_id', sortable: true, render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.civilId ?? '—'}</span> },
      { key: 'jobTitle', label: 'col.job_title', sortable: true },
      { key: 'nationality', label: 'col.nationality', sortable: true },
      { key: 'residencyExpiry', label: 'col.residency_expiry', sortable: true, render: (r) => dateText(r.residencyExpiry) },
      { key: 'passportNumber', label: 'col.passport_number', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.passportNumber ?? '—'}</span> },
      { key: 'passportExpiry', label: 'col.passport_expiry', sortable: true, render: (r) => dateText(r.passportExpiry) },
      { key: 'licenseExpiry', label: 'col.license_expiry', sortable: true, render: (r) => dateText(r.licenseExpiry) },
      { key: 'vehiclePlate', label: 'col.vehicle_plate', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.vehiclePlate ?? '—'}</span> },
      { key: 'vehicleLicenseExpiry', label: 'col.vehicle_license_expiry', sortable: true, render: (r) => dateText(r.vehicleLicenseExpiry) },
      { key: 'salary', label: 'col.salary', money: true, sortable: true, render: (r) => <MoneyCell value={r.salary} /> },
      { key: 'hireDate', label: 'col.hire_date', sortable: true, render: (r) => dateText(r.hireDate) },
      { key: 'status', label: 'col.status', sortable: true, render: (r) => employeeStatus(r.status) },
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
      { name: 'vehicleLicenseExpiry', label: 'field.vehicle_license_expiry', type: 'date', section: 'documents' },
      { name: 'address', label: 'field.address', section: 'contact' },
    ],
  },

  expenses: {
    key: 'expenses', endpoint: '/expenses', label: 'المصروفات والتشغيل',
    title: 'mod.expenses.title', subtitle: 'mod.expenses.subtitle',
    icon: '💸', group: 'المالية', createLabel: 'mod.expenses.create', canApprove: true,
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
    key: 'users', endpoint: '/users', label: 'المستخدمون والصلاحيات',
    title: 'mod.users.title', subtitle: 'mod.users.subtitle',
    icon: '🔐', group: 'النظام', createLabel: 'mod.users.create',
    emptyText: 'empty.users',
    columns: [
      { key: 'username', label: 'col.username', sortable: true, render: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.username}</strong> },
      { key: 'fullName', label: 'col.fullname', sortable: true },
      { key: 'role', label: 'col.role', sortable: true, render: (r) => pill(r.role?.displayName ?? '—', 'blue') },
      { key: 'isActive', label: 'col.status', sortable: true, render: (r) => r.isActive ? pill('نشط', 'green') : pill('موقوف', 'gray') },
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
    { key: 'customers',    label: 'nav.customers',    icon: 'groups',      permission: 'customers.read' },
    { key: 'equipment',    label: 'nav.equipment',    icon: 'construction', permission: 'equipment.read' },
    { key: 'maintenance',  label: 'nav.maintenance',  icon: 'build_circle', permission: 'maintenance.read' },
    { key: 'employees',    label: 'nav.employees',    icon: 'badge',       permission: 'employees.read' },
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
    { key: 'salaries', label: 'nav.salaries', icon: 'account_balance_wallet', permission: 'payroll.read' },
    { key: 'suppliers', label: 'nav.suppliers', icon: 'inventory_2', permission: 'suppliers.read' },
    { key: 'accounting', label: 'nav.accounting', icon: 'account_balance', permission: 'transactions.read' },
    { key: 'financial', label: 'nav.financial', icon: 'account_balance', permission: 'statements.read' },
    { key: 'financial-ops', label: 'nav.financial_ops', icon: 'monitoring', permission: 'financialdashboard.read' },
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
