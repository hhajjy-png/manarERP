/**
 * ثوابت النظام المشتركة — أسماء الأدوار والقيم المسموحة للحقول النصية.
 * تُستخدم في الـ seed، التحقق (Zod)، وفحص الصلاحيات.
 */

/** أسماء الأدوار النظامية (تطابق Role.name). */
export const ROLES = {
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  GENERAL_MANAGER: 'GENERAL_MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  EQUIPMENT_MANAGER: 'EQUIPMENT_MANAGER',
  HR_MANAGER: 'HR_MANAGER',
  STANDARD_USER: 'STANDARD_USER',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/** الأسماء العربية المعروضة للأدوار. */
export const ROLE_DISPLAY: Record<RoleName, string> = {
  SYSTEM_ADMIN: 'مدير النظام',
  GENERAL_MANAGER: 'المدير العام',
  ACCOUNTANT: 'المحاسب',
  PROJECT_MANAGER: 'مدير العقود',
  EQUIPMENT_MANAGER: 'مسؤول المعدات',
  HR_MANAGER: 'مسؤول الموارد البشرية',
  STANDARD_USER: 'مستخدم عادي',
};

/** وحدات النظام (تُستخدم في مفاتيح الصلاحيات والـ Audit). */
export const MODULES = [
  'dashboard',
  'customers',
  'employees',
  'attendance',
  'payroll',
  'equipment',
  'maintenance',
  'contracts',
  'invoices',
  'suppliers',
  'expenses',
  'transactions',
  'reports',
  'users',
  'roles',
  'audit',
  'backups',
  'settings',
  'inventory',
  'cheques',
  'import',
  'prices',
  'forms',
] as const;

export type ModuleName = (typeof MODULES)[number];

/** الإجراءات الذرّية للصلاحيات. */
export const ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'approve',
  'export',
  'pay',
  'generate',
  'payslip',
  'adjust',
  'cancel',
  'print',
  'submit',   // Draft → Pending submission step (used by future module configs)
  'reopen',   // Rejected → Pending reopen step (used by future module configs)
] as const;
export type ActionName = (typeof ACTIONS)[number];

/** القيم المسموحة للحقول النصية (تُفرض في طبقة Zod). */
export const ENUMS = {
  customerType: ['GOVERNMENT', 'PRIVATE'] as const,
  employeeStatus: ['ACTIVE', 'ON_LEAVE', 'TERMINATED'] as const,
  equipmentStatus: ['WORKING', 'NOT_WORKING'] as const,
  contractStatus: ['ACTIVE', 'EXPIRED', 'RENEWING', 'SUSPENDED'] as const,
  invoiceDirection: ['SALES', 'PURCHASE'] as const,
  invoiceType: ['نقل اسفلت', 'يومية عمل مالينج', 'يومية نقل اسفلت'] as const,
  invoiceUnit: ['طن', 'درب', 'يومية', 'مقطوعية'] as const,
  invoiceStatus: ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'] as const,
  expenseCategory: [
    'FUEL',
    'SALARIES',
    'MAINTENANCE',
    'RENT',
    'PURCHASES',
    'EQUIPMENT',
    'SERVICES',
    'EQUIPMENT_RENT',
    'TRUCK_RENT',
    'HASSAN',
    'GHANEM',
    'NATHEER',
    'HAROON',
    'OTHER',
  ] as const,
  expenseStatus: ['PENDING', 'APPROVED', 'REJECTED', 'REVERSED', 'CANCELLED'] as const,
  // Unified GL payment method: used for GL routing in Expenses, Payroll, Purchase Invoices.
  // CASH → Cr Cashbox (1000), BANK → Cr Bank (1010), ACCOUNTS_PAYABLE → Cr liability per module
  // (Expenses: AP 2000, Payroll: Salaries Payable 2100)
  glPaymentMethod: ['CASH', 'BANK', 'ACCOUNTS_PAYABLE'] as const,
  expensePaymentMethod: ['CASH', 'BANK', 'ACCOUNTS_PAYABLE'] as const, // alias for backward compat
  transactionType: ['REVENUE', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT'] as const,
  payrollStatus: ['DRAFT', 'APPROVED', 'PAID', 'CANCELLED'] as const,
  paymentMethod: ['CASH', 'BANK', 'CHEQUE', 'TRANSFER'] as const, // legacy — used for invoice Payment.method
  maintenanceType: ['PREVENTIVE', 'CORRECTIVE'] as const,
  backupType: ['MANUAL', 'AUTO', 'SCHEDULED'] as const,
  materialUnit: ['طن', 'كيلو', 'لتر', 'قطعة', 'متر', 'كيس', 'برميل', 'صندوق'] as const,
  purchaseOrderStatus: ['DRAFT', 'SUBMITTED', 'RECEIVED', 'CANCELLED'] as const,
  goodsReceiptStatus: ['DRAFT', 'POSTED'] as const,
  materialIssueStatus: ['DRAFT', 'POSTED', 'CANCELLED'] as const,
  chequeStatus: ['DRAFT', 'PRINTED', 'CANCELLED'] as const,
} as const;
