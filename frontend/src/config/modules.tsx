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
  canApprove?: boolean;
  statusFilter?: { param: string; options: { value: string; labelKey: string }[] };
}

export const MODULES: Record<string, ModuleConfig> = {
  contracts: {
    key: 'contracts', endpoint: '/contracts', label: 'إدارة العقود',
    title: 'mod.contracts.title', subtitle: 'mod.contracts.subtitle',
    icon: '📄', group: 'العمليات الأساسية', createLabel: 'mod.contracts.create',
    columns: [
      { key: 'code', label: 'col.contract_no', render: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.code}</strong> },
      { key: 'asphaltPlant', label: 'col.asphalt_plant' },
      { key: 'location', label: 'col.location' },
      { key: 'monthlyTransportValue', label: 'col.monthly_value', render: (r) => money(r.monthlyTransportValue) },
      { key: 'status', label: 'col.status', render: (r) => contractStatus(r.status) },
    ],
    fields: [
      { name: 'code', label: 'field.contract_no', required: true },
      { name: 'asphaltPlant', label: 'field.asphalt_plant_name', required: true },
      { name: 'location', label: 'field.location' },
      { name: 'monthlyTransportValue', label: 'field.monthly_value_kd', type: 'number' },
      { name: 'startDate', label: 'field.start_date', type: 'date' },
      { name: 'endDate', label: 'field.end_date', type: 'date' },
      { name: 'status', label: 'field.status', type: 'select', options: [
        { value: 'ACTIVE', label: 'opt.contract.active' },
        { value: 'RENEWING', label: 'opt.contract.renewing' },
        { value: 'EXPIRED', label: 'opt.contract.expired' },
        { value: 'SUSPENDED', label: 'opt.contract.suspended' }] },
      { name: 'customerId', label: 'field.contracting_party', type: 'select', optionsEndpoint: '/customers', optionLabel: 'name' },
    ],
  },

  customers: {
    key: 'customers', endpoint: '/customers', label: 'العملاء والجهات',
    title: 'mod.customers.title', subtitle: 'mod.customers.subtitle',
    icon: '👥', group: 'العمليات الأساسية', createLabel: 'mod.customers.create',
    statusFilter: {
      param: 'type',
      options: [
        { value: 'GOVERNMENT', labelKey: 'opt.customer.government' },
        { value: 'PRIVATE',    labelKey: 'opt.customer.private' },
      ],
    },
    columns: [
      { key: 'code', label: 'col.code', render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
      { key: 'name', label: 'col.customer_name', render: (r) => <strong>{r.name}</strong> },
      { key: 'type', label: 'col.type', render: (r) => customerType(r.type) },
      { key: 'phone', label: 'col.phone' },
      { key: 'contactName', label: 'col.contact_name' },
    ],
    fields: [
      { name: 'code', label: 'field.customer_code', required: true },
      { name: 'name', label: 'field.customer_name', required: true },
      { name: 'type', label: 'field.type', type: 'select', options: [
        { value: 'GOVERNMENT', label: 'opt.customer.government' },
        { value: 'PRIVATE', label: 'opt.customer.private' }] },
      { name: 'phone', label: 'field.phone' },
      { name: 'email', label: 'field.email' },
      { name: 'contactName', label: 'field.contact_name' },
      { name: 'address', label: 'field.address' },
      { name: 'notes', label: 'field.notes', type: 'textarea', half: false },
    ],
  },

  suppliers: {
    key: 'suppliers', endpoint: '/suppliers', label: 'الموردون',
    title: 'mod.suppliers.title', subtitle: 'mod.suppliers.subtitle',
    icon: '📦', group: 'المالية', createLabel: 'mod.suppliers.create',
    columns: [
      { key: 'code', label: 'col.code', render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
      { key: 'name', label: 'col.supplier_name', render: (r) => <strong>{r.name}</strong> },
      { key: 'phone', label: 'col.phone' },
      { key: 'contactName', label: 'col.contact_name' },
    ],
    fields: [
      { name: 'code', label: 'field.supplier_code', required: true },
      { name: 'name', label: 'field.supplier_name', required: true },
      { name: 'phone', label: 'field.phone' },
      { name: 'email', label: 'field.email' },
      { name: 'contactName', label: 'field.contact_name' },
      { name: 'address', label: 'field.address' },
      { name: 'notes', label: 'field.notes', type: 'textarea', half: false },
    ],
  },

  equipment: {
    key: 'equipment', endpoint: '/equipment', label: 'المعدات والآليات',
    title: 'mod.equipment.title', subtitle: 'mod.equipment.subtitle',
    icon: '🚜', group: 'العمليات الأساسية', createLabel: 'mod.equipment.create',
    statusFilter: {
      param: 'status',
      options: [
        { value: 'WORKING',     labelKey: 'opt.eq.working' },
        { value: 'NOT_WORKING', labelKey: 'opt.eq.not_working' },
      ],
    },
    columns: [
      { key: 'code', label: 'col.equipment_no', render: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.code}</strong> },
      { key: 'type', label: 'col.type' },
      { key: 'ownerName', label: 'col.owner_name' },
      { key: 'driverName', label: 'col.driver_name', render: (r) => <strong>{r.driverName ?? '—'}</strong> },
      { key: 'plateNumber', label: 'col.plate_number', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.plateNumber ?? '—'}</span> },
      { key: 'registration', label: 'col.registration', render: regCell },
      { key: 'status', label: 'col.status', render: (r) => equipmentStatus(r.status) },
    ],
    fields: [
      { name: 'code', label: 'field.equipment_no', required: true },
      { name: 'type', label: 'field.eq_type', required: true },
      { name: 'ownerName', label: 'field.owner_name' },
      { name: 'driverName', label: 'field.driver_name' },
      { name: 'plateNumber', label: 'field.plate_number' },
      { name: 'registrationExpiry', label: 'field.reg_expiry', type: 'date' },
      { name: 'status', label: 'field.vehicle_status', type: 'select', options: [
        { value: 'WORKING', label: 'opt.eq.working' },
        { value: 'NOT_WORKING', label: 'opt.eq.not_working' }] },
    ],
  },

  employees: {
    key: 'employees', endpoint: '/employees', label: 'الموظفون والكوادر',
    title: 'mod.employees.title', subtitle: 'mod.employees.subtitle',
    icon: '👷', group: 'العمليات الأساسية', createLabel: 'mod.employees.create',
    statusFilter: {
      param: 'status',
      options: [
        { value: 'ACTIVE',     labelKey: 'opt.emp.active' },
        { value: 'ON_LEAVE',   labelKey: 'opt.emp.on_leave' },
        { value: 'TERMINATED', labelKey: 'opt.emp.terminated' },
      ],
    },
    columns: [
      { key: 'fullName', label: 'col.fullname_ar', render: (r) => <strong>{r.fullName}</strong> },
      { key: 'fullNameEn', label: 'col.fullname_en' },
      { key: 'civilId', label: 'col.civil_id', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.civilId ?? '—'}</span> },
      { key: 'jobTitle', label: 'col.job_title' },
      { key: 'nationality', label: 'col.nationality' },
      { key: 'residencyExpiry', label: 'col.residency_expiry', render: (r) => dateText(r.residencyExpiry) },
      { key: 'passportNumber', label: 'col.passport_number', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.passportNumber ?? '—'}</span> },
      { key: 'passportExpiry', label: 'col.passport_expiry', render: (r) => dateText(r.passportExpiry) },
      { key: 'licenseExpiry', label: 'col.license_expiry', render: (r) => dateText(r.licenseExpiry) },
      { key: 'vehiclePlate', label: 'col.vehicle_plate', render: (r) => <span style={{ fontFamily: 'monospace' }}>{r.vehiclePlate ?? '—'}</span> },
      { key: 'vehicleLicenseExpiry', label: 'col.vehicle_license_expiry', render: (r) => dateText(r.vehicleLicenseExpiry) },
      { key: 'salary', label: 'col.salary', render: (r) => money(r.salary) },
      { key: 'status', label: 'col.status', render: (r) => employeeStatus(r.status) },
    ],
    fields: [
      { name: 'code', label: 'field.emp_code', required: true },
      { name: 'fullName', label: 'field.fullname_ar', required: true },
      { name: 'fullNameEn', label: 'field.fullname_en' },
      { name: 'civilId', label: 'field.civil_id' },
      { name: 'jobTitle', label: 'field.job_title' },
      { name: 'nationality', label: 'field.nationality' },
      { name: 'passportNumber', label: 'field.passport_number' },
      { name: 'passportExpiry', label: 'field.passport_expiry', type: 'date' },
      { name: 'residencyExpiry', label: 'field.residency_expiry', type: 'date' },
      { name: 'licenseExpiry', label: 'field.license_expiry', type: 'date' },
      { name: 'vehiclePlate', label: 'field.vehicle_plate' },
      { name: 'vehicleLicenseExpiry', label: 'field.vehicle_license_expiry', type: 'date' },
      { name: 'birthDate', label: 'field.birth_date', type: 'date' },
      { name: 'company', label: 'field.company' },
      { name: 'address', label: 'field.address' },
      { name: 'salary', label: 'field.salary_kd', type: 'number' },
      { name: 'status', label: 'field.status', type: 'select', options: [
        { value: 'ACTIVE', label: 'opt.emp.active' },
        { value: 'ON_LEAVE', label: 'opt.emp.on_leave' },
        { value: 'TERMINATED', label: 'opt.emp.terminated' }] },
    ],
  },

  expenses: {
    key: 'expenses', endpoint: '/expenses', label: 'المصروفات والتشغيل',
    title: 'mod.expenses.title', subtitle: 'mod.expenses.subtitle',
    icon: '💸', group: 'المالية', createLabel: 'mod.expenses.create', canApprove: true,
    statusFilter: {
      param: 'status',
      options: [
        { value: 'PENDING',  labelKey: 'status.pending' },
        { value: 'APPROVED', labelKey: 'status.approved' },
        { value: 'REJECTED', labelKey: 'status.rejected' },
      ],
    },
    columns: [
      { key: 'code', label: 'col.code', render: (r) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
      { key: 'category', label: 'col.category', render: (r) => expenseCategoryAr[r.category] ?? r.category },
      { key: 'description', label: 'col.description', render: (r) => <strong>{r.description}</strong> },
      { key: 'amount', label: 'col.amount', render: (r) => money(r.amount) },
      { key: 'date', label: 'col.date', render: (r) => dateText(r.date) },
      { key: 'status', label: 'col.status', render: (r) => expenseStatus(r.status) },
    ],
    fields: [
      { name: 'category', label: 'field.category', type: 'select', required: true,
        options: Object.keys(expenseCategoryAr).map((value) => ({ value, label: `cat.${value.toLowerCase()}` })) },
      { name: 'description', label: 'field.description', required: true },
      { name: 'amount', label: 'field.amount_kd', type: 'number', required: true },
      { name: 'date', label: 'field.date', type: 'date' },
      { name: 'contractId', label: 'field.linked_contract', type: 'select', optionsEndpoint: '/contracts', optionLabel: 'asphaltPlant' },
      { name: 'supplierId', label: 'field.supplier', type: 'select', optionsEndpoint: '/suppliers', optionLabel: 'name' },
    ],
  },

  users: {
    key: 'users', endpoint: '/users', label: 'المستخدمون والصلاحيات',
    title: 'mod.users.title', subtitle: 'mod.users.subtitle',
    icon: '🔐', group: 'النظام', createLabel: 'mod.users.create',
    columns: [
      { key: 'username', label: 'col.username', render: (r) => <strong style={{ fontFamily: 'monospace' }}>{r.username}</strong> },
      { key: 'fullName', label: 'col.fullname' },
      { key: 'role', label: 'col.role', render: (r) => pill(r.role?.displayName ?? '—', 'blue') },
      { key: 'isActive', label: 'col.status', render: (r) => r.isActive ? pill('نشط', 'green') : pill('موقوف', 'gray') },
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
    { key: 'contracts',    label: 'nav.contracts',    icon: 'description', permission: 'contracts.read' },
    { key: 'customers',    label: 'nav.customers',    icon: 'groups',      permission: 'customers.read' },
    { key: 'equipment',    label: 'nav.equipment',    icon: 'construction', permission: 'equipment.read' },
    { key: 'maintenance',  label: 'nav.maintenance',  icon: 'build_circle', permission: 'maintenance.read' },
    { key: 'employees',    label: 'nav.employees',    icon: 'badge',       permission: 'employees.read' },
  ] },
  { group: 'nav.group.financial', items: [
    { key: 'invoices', label: 'nav.invoices', icon: 'receipt_long', permission: 'invoices.read' },
    { key: 'expenses', label: 'nav.expenses', icon: 'payments', permission: 'expenses.read' },
    { key: 'cheques', label: 'nav.cheques', icon: 'edit_note', permission: 'cheques.read' },
    { key: 'salaries', label: 'nav.salaries', icon: 'account_balance_wallet', permission: 'payroll.read' },
    { key: 'suppliers', label: 'nav.suppliers', icon: 'inventory_2', permission: 'suppliers.read' },
    { key: 'accounting', label: 'nav.accounting', icon: 'account_balance', permission: 'transactions.read' },
  ] },
  { group: 'nav.group.warehouse', items: [
    { key: 'inventory', label: 'nav.inventory', icon: 'warehouse', permission: 'inventory.read' },
  ] },
  { group: 'nav.group.system', items: [
    { key: 'reports', label: 'nav.reports', icon: 'analytics', permission: 'reports.read' },
    { key: 'users', label: 'nav.users', icon: 'manage_accounts', permission: 'users.read' },
    { key: 'audit', label: 'nav.audit', icon: 'history', permission: 'audit.read' },
    { key: 'backup', label: 'nav.backup', icon: 'backup', permission: 'backups.read' },
    { key: 'settings', label: 'nav.settings', icon: 'settings', permission: 'settings.read' },
  ] },
  { group: 'nav.group.tools', items: [
    { key: 'import', label: 'nav.import', icon: 'upload', permission: 'import.read' },
  ] },
];
