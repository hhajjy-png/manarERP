import { ReactNode } from 'react';
import { Column } from '../components/DataTable';
import { FormField } from '../components/FormDialog';

// ===== أدوات عرض =====
export function money(v: unknown): string {
  const n = Number(v ?? 0);
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) + ' د.ك';
}

export function dateText(v: unknown): string {
  if (!v) return '—';
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
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

// عرض المدة الباقية لدفتر المركبة (يأتي محسوبًا من الخادم في row.registration)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function regCell(row: any): ReactNode {
  const r = row.registration;
  if (!r || !r.expiry) return '—';
  const cls: PillCls = r.expired ? 'red' : r.expiringSoon ? 'amber' : 'green';
  return (
    <span>
      {dateText(r.expiry)}{'  '}
      <span className={`pill ${cls}`} style={{ marginInlineStart: 6 }}>{(r.expired || r.expiringSoon) ? '⚠ ' : ''}{r.remainingText}</span>
    </span>
  );
}

// ==== تعريف تصنيفات المصروفات (مرفوع للأعلى لتجنب الخطأ) ====
export const expenseCategoryAr: Record<string, string> = {
  FUEL: 'وقود', SALARIES: 'رواتب', MAINTENANCE: 'صيانة', RENT: 'إيجارات',
  PURCHASES: 'مشتريات', EQUIPMENT: 'معدات', SERVICES: 'خدمات', OTHER: 'أخرى',
};
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
  canApprove?: boolean; // مصروفات
}

export const MODULES: Record<string, ModuleConfig> = {
  contracts: {
    key: 'contracts', endpoint: '/contracts', label: 'إدارة العقود', title: 'إدارة العقود',
    subtitle: 'عقود نقل الأسفلت الشهرية مع مصانع الأسفلت', icon: '📄', group: 'العمليات الأساسية', createLabel: 'عقد جديد',
    columns: [
      { key: 'code', label: 'رقم العقد', render: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.code}</strong> },
      { key: 'asphaltPlant', label: 'مصنع الأسفلت' },
      { key: 'location', label: 'مكان العقد' },
      { key: 'monthlyTransportValue', label: 'قيمة النقل الشهري', render: (r) => money(r.monthlyTransportValue) },
      { key: 'status', label: 'الحالة', render: (r) => contractStatus(r.status) },
    ],
    fields: [
      { name: 'code', label: 'رقم العقد', required: true },
      { name: 'asphaltPlant', label: 'اسم مصنع الأسفلت', required: true },
      { name: 'location', label: 'مكان العقد' },
      { name: 'monthlyTransportValue', label: 'قيمة النقل الشهري (د.ك)', type: 'number' },
      { name: 'startDate', label: 'تاريخ البداية', type: 'date' },
      { name: 'endDate', label: 'تاريخ النهاية', type: 'date' },
      { name: 'status', label: 'الحالة', type: 'select', options: [
        { value: 'ACTIVE', label: 'ساري' }, { value: 'RENEWING', label: 'قيد التجديد' },
        { value: 'EXPIRED', label: 'منتهٍ' }, { value: 'SUSPENDED', label: 'موقوف' }] },
      { name: 'customerId', label: 'الجهة المتعاقدة', type: 'select', optionsEndpoint: '/customers', optionLabel: 'name' },
    ],
  },

  customers: {
    key: 'customers', endpoint: '/customers', label: 'العملاء والجهات', title: 'العملاء والجهات',
    subtitle: 'الجهات الحكومية وشركات القطاع الخاص', icon: '👥', group: 'العمليات الأساسية', createLabel: 'إضافة عميل',
    columns: [
      { key: 'code', label: 'الرقم', render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
      { key: 'name', label: 'اسم العميل', render: (r) => <strong>{r.name}</strong> },
      { key: 'type', label: 'النوع', render: (r) => customerType(r.type) },
      { key: 'phone', label: 'الهاتف' },
      { key: 'contactName', label: 'مسؤول التواصل' },
    ],
    fields: [
      { name: 'code', label: 'رقم العميل', required: true },
      { name: 'name', label: 'اسم العميل', required: true },
      { name: 'type', label: 'النوع', type: 'select', options: [{ value: 'GOVERNMENT', label: 'حكومي' }, { value: 'PRIVATE', label: 'خاص' }] },
      { name: 'phone', label: 'الهاتف' },
      { name: 'email', label: 'البريد الإلكتروني' },
      { name: 'contactName', label: 'اسم المسؤول' },
      { name: 'address', label: 'العنوان' },
      { name: 'notes', label: 'ملاحظات', type: 'textarea', half: false },
    ],
  },

  suppliers: {
    key: 'suppliers', endpoint: '/suppliers', label: 'الموردون', title: 'الموردون',
    subtitle: 'إدارة بيانات الموردين', icon: '📦', group: 'المالية', createLabel: 'إضافة مورّد',
    columns: [
      { key: 'code', label: 'الرقم', render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
      { key: 'name', label: 'اسم المورّد', render: (r) => <strong>{r.name}</strong> },
      { key: 'phone', label: 'الهاتف' },
      { key: 'contactName', label: 'مسؤول التواصل' },
    ],
    fields: [
      { name: 'code', label: 'رقم المورّد', required: true },
      { name: 'name', label: 'اسم المورّد', required: true },
      { name: 'phone', label: 'الهاتف' },
      { name: 'email', label: 'البريد الإلكتروني' },
      { name: 'contactName', label: 'اسم المسؤول' },
      { name: 'address', label: 'العنوان' },
      { name: 'notes', label: 'ملاحظات', type: 'textarea', half: false },
    ],
  },

  equipment: {
    key: 'equipment', endpoint: '/equipment', label: 'المعدات والآليات', title: 'المعدات والآليات',
    subtitle: 'المركبات والسائقين ودفاتر المركبات', icon: '🚜', group: 'العمليات الأساسية', createLabel: 'إضافة مركبة',
    columns: [
      { key: 'code', label: 'رقم المعدة', render: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.code}</strong> },
      { key: 'type', label: 'النوع' },
      { key: 'ownerName', label: 'اسم المالك' },
      { key: 'driverName', label: 'اسم السائق', render: (r) => <strong>{r.driverName ?? '—'}</strong> },
      { key: 'plateNumber', label: 'رقم اللوحة', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.plateNumber ?? '—'}</span> },
      { key: 'registration', label: 'دفتر المركبة / المدة الباقية', render: regCell },
      { key: 'status', label: 'الحالة', render: (r) => equipmentStatus(r.status) },
    ],
    fields: [
      { name: 'code', label: 'رقم المعدة', required: true },
      { name: 'type', label: 'النوع', required: true },
      { name: 'ownerName', label: 'اسم المالك' },
      { name: 'driverName', label: 'اسم السائق' },
      { name: 'plateNumber', label: 'رقم اللوحة' },
      { name: 'registrationExpiry', label: 'تاريخ انتهاء دفتر المركبة', type: 'date' },
      { name: 'status', label: 'حالة المركبة', type: 'select', options: [{ value: 'WORKING', label: 'تعمل' }, { value: 'NOT_WORKING', label: 'لا تعمل' }] },
    ],
  },

  employees: {
    key: 'employees', endpoint: '/employees', label: 'الموظفون والكوادر', title: 'الموظفون والكوادر',
    subtitle: 'بيانات الموظفين والمستندات الرسمية', icon: '👷', group: 'العمليات الأساسية', createLabel: 'إضافة موظف',
    columns: [
      { key: 'fullName', label: 'الاسم (عربي)', render: (r) => <strong>{r.fullName}</strong> },
      { key: 'fullNameEn', label: 'الاسم (إنجليزي)' },
      { key: 'civilId', label: 'الرقم المدني', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.civilId ?? '—'}</span> },
      { key: 'jobTitle', label: 'المهنة' },
      { key: 'nationality', label: 'الجنسية' },
      { key: 'residencyExpiry', label: 'انتهاء الإقامة', render: (r) => dateText(r.residencyExpiry) },
      { key: 'passportNumber', label: 'رقم الجواز', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.passportNumber ?? '—'}</span> },
      { key: 'passportExpiry', label: 'انتهاء الجواز', render: (r) => dateText(r.passportExpiry) },
      { key: 'licenseExpiry', label: 'انتهاء رخصة القيادة', render: (r) => dateText(r.licenseExpiry) },
      { key: 'vehiclePlate', label: 'رقم لوحة المركبة', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.vehiclePlate ?? '—'}</span> },
      { key: 'vehicleLicenseExpiry', label: 'انتهاء رخصة المركبة', render: (r) => dateText(r.vehicleLicenseExpiry) },
      { key: 'salary', label: 'الراتب الشهري', render: (r) => money(r.salary) },
      { key: 'status', label: 'الحالة', render: (r) => employeeStatus(r.status) },
    ],
    fields: [
      { name: 'code', label: 'الرقم الوظيفي', required: true },
      { name: 'fullName', label: 'الاسم (بالعربي)', required: true },
      { name: 'fullNameEn', label: 'الاسم (بالإنجليزي)' },
      { name: 'civilId', label: 'الرقم المدني' },
      { name: 'jobTitle', label: 'المهنة' },
      { name: 'nationality', label: 'الجنسية' },
      { name: 'passportNumber', label: 'رقم جواز السفر' },
      { name: 'passportExpiry', label: 'تاريخ انتهاء الجواز', type: 'date' },
      { name: 'residencyExpiry', label: 'تاريخ انتهاء الإقامة', type: 'date' },
      { name: 'licenseExpiry', label: 'تاريخ انتهاء رخصة القيادة', type: 'date' },
      { name: 'vehiclePlate', label: 'رقم لوحة المركبة' },
      { name: 'vehicleLicenseExpiry', label: 'تاريخ انتهاء رخصة المركبة', type: 'date' },
      { name: 'birthDate', label: 'تاريخ الميلاد', type: 'date' },
      { name: 'company', label: 'الشركة' },
      { name: 'address', label: 'العنوان' },
      { name: 'salary', label: 'الراتب الشهري (د.ك)', type: 'number' },
      { name: 'status', label: 'الحالة', type: 'select', options: [
        { value: 'ACTIVE', label: 'نشط' }, { value: 'ON_LEAVE', label: 'إجازة' }, { value: 'TERMINATED', label: 'منتهي الخدمة' }] },
    ],
  },

  expenses: {
    key: 'expenses', endpoint: '/expenses', label: 'المصروفات والتشغيل', title: 'المصروفات والتشغيل',
    subtitle: 'تسجيل واعتماد فواتير الموردين والمحروقات', icon: '💸', group: 'المالية', createLabel: 'تسجيل مصروف', canApprove: true,
    columns: [
      { key: 'code', label: 'الرقم', render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
      { key: 'category', label: 'التصنيف', render: (r) => expenseCategoryAr[r.category] ?? r.category },
      { key: 'description', label: 'الوصف', render: (r) => <strong>{r.description}</strong> },
      { key: 'amount', label: 'المبلغ', render: (r) => money(r.amount) },
      { key: 'date', label: 'التاريخ', render: (r) => dateText(r.date) },
      { key: 'status', label: 'الحالة', render: (r) => expenseStatus(r.status) },
    ],
    fields: [
      { name: 'category', label: 'التصنيف', type: 'select', required: true, options: Object.entries(expenseCategoryAr).map(([value, label]) => ({ value, label })) },
      { name: 'description', label: 'الوصف', required: true },
      { name: 'amount', label: 'المبلغ (د.ك)', type: 'number', required: true },
      { name: 'date', label: 'التاريخ', type: 'date' },
      { name: 'contractId', label: 'العقد المرتبط', type: 'select', optionsEndpoint: '/contracts', optionLabel: 'asphaltPlant' },
      { name: 'supplierId', label: 'المورّد', type: 'select', optionsEndpoint: '/suppliers', optionLabel: 'name' },
    ],
  },

  users: {
    key: 'users', endpoint: '/users', label: 'المستخدمون والصلاحيات', title: 'المستخدمون والصلاحيات',
    subtitle: 'حسابات الدخول والأدوار', icon: '🔐', group: 'النظام', createLabel: 'مستخدم جديد',
    columns: [
      { key: 'username', label: 'المستخدم', render: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.username}</strong> },
      { key: 'fullName', label: 'الاسم' },
      { key: 'role', label: 'الدور', render: (r) => pill(r.role?.displayName ?? '—', 'blue') },
      { key: 'isActive', label: 'الحالة', render: (r) => r.isActive ? pill('نشط', 'green') : pill('موقوف', 'gray') },
    ],
    fields: [
      { name: 'username', label: 'اسم المستخدم', required: true },
      { name: 'password', label: 'كلمة المرور', type: 'password' },
      { name: 'fullName', label: 'الاسم الكامل', required: true },
      { name: 'email', label: 'البريد الإلكتروني' },
      { name: 'roleId', label: 'الدور', type: 'select', required: true, optionsEndpoint: '/roles', optionLabel: 'displayName' },
    ],
  },
};

// ترتيب القائمة الجانبية
export const NAV: { group: string; items: { key: string; label: string; icon: string; permission?: string }[] }[] = [
  { group: '', items: [{ key: 'dashboard', label: 'لوحة التحكم', icon: '📊' }] },
  { group: 'العمليات الأساسية', items: [
    { key: 'contracts', label: 'إدارة العقود', icon: '📄', permission: 'contracts.read' },
    { key: 'customers', label: 'العملاء والجهات', icon: '👥', permission: 'customers.read' },
    { key: 'equipment', label: 'المعدات والآليات', icon: '🚜', permission: 'equipment.read' },
    { key: 'employees', label: 'الموظفون والكوادر', icon: '👷', permission: 'employees.read' },
  ] },
  { group: 'الإدارة المالية', items: [
    { key: 'invoices', label: 'الفواتير والمطالبات', icon: '🧾', permission: 'invoices.read' },
    { key: 'expenses', label: 'المصروفات والتشغيل', icon: '💸', permission: 'expenses.read' },
    { key: 'salaries', label: 'الرواتب', icon: '💵', permission: 'payroll.read' },
    { key: 'suppliers', label: 'الموردون', icon: '📦', permission: 'suppliers.read' },
    { key: 'accounting', label: 'القيود المحاسبية', icon: '📒', permission: 'transactions.read' },
  ] },
  { group: 'النظام', items: [
    { key: 'reports', label: 'التقارير الشاملة', icon: '📈', permission: 'reports.read' },
    { key: 'users', label: 'الصلاحيات والمستخدمين', icon: '🔐', permission: 'users.read' },
    { key: 'backup', label: 'النسخ الاحتياطي', icon: '💾', permission: 'backups.read' },
    { key: 'settings', label: 'إعدادات الشركة', icon: '⚙️', permission: 'settings.read' },
  ] },
];