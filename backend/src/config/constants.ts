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
  'statements',
  'aging',
  'gl',
  'trialbalance',
  'journal',
  'finreports',
  'financial',
  'financialdashboard',
  'verification',
  'integrations',
  'payrollBankImport',
  'bankStatementImport',
  'expirations',
  'attachments',
  // Print Center Foundation v1 — used as the AuditLog `module` label for PRINT /
  // PDF_EXPORT events. No permission keys are generated for it in this phase (see
  // modules/printing/printing.routes.ts for why); a dedicated `printing.*` key
  // lands with the print_logs table, alongside its migration and seed update.
  'printing',
  // تحليل الشغل والعمولة — أداة تحليل تشغيلية داخلية خارج الدورة المحاسبية تمامًا.
  // تكتب حصرًا في work_analyses / work_analysis_lines.
  'workAnalysis',
  // محرك الخطابات — هوية المستند ودورة حياته. وحدة إدارية بحتة: لا تكتب في أي جدول
  // خارج letters / letter_references / letter_sequences، ولا ترتبط بالمحاسبة ولا
  // بالفواتير ولا بالرواتب ولا بالمخزون.
  'letters',
  // مستحقات الموظف الشهرية — وحدة تجريبية مستقلة. تكتب حصريًا في جداولها الأربعة
  // (employee_compensation_*)، ولا ترتبط بالرواتب ولا بالمحاسبة ولا بالمصروفات ولا
  // بنهاية الخدمة. مفاتيحها منفصلة عن `payroll.*` عمدًا: صلاحية الرواتب لا تمنح
  // صلاحية هذه الوحدة، والعكس.
  'employeeCompensation',
  // جاهزية XBRL — طبقة إعداد مستقبلية فوق المحاسبة، لا داخلها. تكتب حصريًا في
  // جداول `xbrl_*`، وتقرأ الأرصدة من خدمات المحاسبة القائمة بلا نسخ منطق محاسبي.
  // مفاتيحها منفصلة عن `transactions.*` و`finreports.*` عمدًا: من يقرأ التقارير
  // المالية لا يرث تلقائيًا صلاحية تعديل ربط XBRL، والعكس صحيح.
  'xbrl',
  // تأمين المركبات — وحدة تشغيلية مستقلة. تكتب حصرًا في vehicle_insurance_policies /
  // vehicle_accidents، ولا ترتبط بالمحاسبة ولا بالمصروفات ولا بالصيانة ولا بالتعويضات.
  // مفاتيحها منفصلة عن `equipment.*` و`maintenance.*` عمدًا.
  'vehicleInsurance',
  // سجل البنوك والحسابات البنكية (Multi-Bank Cheques Foundation v1) — مصدر هوية
  // البنك لوحدة الشيكات. مفتاحان فقط: `read` (يحتاجه أيضًا منتقي الحساب في نموذج
  // الشيك) و`manage` (إنشاء/تعديل/تفعيل البنوك والحسابات).
  //   لا `delete`: البنك أو الحساب المرتبط بشيكات مُصدَرة سجل تاريخي دائم؛
  //   الإيقاف (isActive=false) هو المسار، ولا مسار حذف في الخدمة أصلًا.
  //   لا مفتاح للطباعة أو المعايرة هنا: قوالب الطباعة لكل حساب حزمة لاحقة،
  //   ومفتاح بلا مسار خلفه يظهر في شاشة الأدوار كقدرة لا تفعل شيئًا.
  'banks',
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
  'submit',      // Draft → Pending submission step (used by future module configs)
  'reopen',      // Rejected → Pending reopen step (used by future module configs)
  'configure',   // Update integration/module configuration
  'run',         // Execute an integration or automated task
  'reconcile',   // Reconcile bank statement transactions
  'overrideLock', // Post/amend inside a locked accounting period (always audited)
  'reverse',      // Post a contra entry that reverses a manual journal entry
  // محرك الخطابات — إجراءان لا يغطّيهما أي فعل قائم:
  'register',     // إصدار رقم مرجعي دائم لا يُعاد استخدامه أبدًا (لا رجعة فيه)
  'archive',      // أرشفة مستند صادر (حفظ، لا حذف)
  // جاهزية XBRL — فعلان لا يغطّيهما أي فعل قائم:
  'manage',       // إدارة التصنيفات والمفاهيم والربط (إنشاء/تعديل/حذف في طبقة واحدة)
  'snapshot',     // إنشاء لقطة إصدار مالي غير قابلة للتعديل (لا رجعة فيها)
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
  invoiceUnit: ['طن', 'درب', 'معالجات', 'يومية', 'مقطوعية'] as const,
  invoiceStatus: ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'] as const,
  // مصنّفة منطقيًا لتسهيل الصيانة (تشغيل / مركبات / رسوم حكومية / عن طريق أشخاص / أخرى).
  // القيمة تُخزَّن كنص (String) في قاعدة البيانات — لا يوجد enum على مستوى DB، فإعادة الترتيب
  // وإضافة بنود جديدة عملية آمنة رجعيًا ولا تؤثر على السجلات القائمة.
  // ملاحظة: يجب أن تبقى هذه القائمة متطابقة مع frontend/src/config/expenseCategories.ts.
  expenseCategory: [
    // ── تشغيل عام ──
    'FUEL',
    'OILS',
    'PURCHASES',
    'SERVICES',
    'RENT',
    'EQUIPMENT',
    'EQUIPMENT_RENT',
    'TRUCK_RENT',
    'SALARIES',
    // ── مركبات ──
    'MAINTENANCE',
    'TIRES',
    'BATTERY',
    'VEHICLE_PAINT',
    'VEHICLE_BODYWORK',
    'VEHICLE_ELECTRICAL',
    'TOW_TRUCK',
    'VEHICLE_INSURANCE',
    'VEHICLE_REGISTRATION',
    // ── رسوم حكومية ──
    'GOVERNMENT_FEES',
    'RESIDENCY',
    'LABOR_INSURANCE',
    'TOLL',
    'TRAFFIC_VIOLATIONS',
    'COURT_FEES',
    // ── عن طريق أشخاص ──
    'HASSAN',
    'GHANEM',
    'NATHEER',
    'HAROON',
    'BILLS_NAZEER',
    'DRIVER_EXPENSES',
    'DRIVER_MEALS',
    // ── أخرى ──
    'CHARITY',
    'GIFTS',
    'MISC',
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
  // RESCUE — نسخة إنقاذ تُنشأ تلقائيًا بعد فشل عملية سحابية. ليست نسخة مجدولة:
  // لا يحكمها إعداد «النسخ التلقائي»، ولا تُحدِّث حالته، ولا تدخل في سياسة احتفاظه.
  // (Cloud-Failure Local Backup Guarantee v1)
  backupType: ['MANUAL', 'AUTO', 'SCHEDULED', 'RESCUE'] as const,
  materialUnit: ['طن', 'كيلو', 'لتر', 'قطعة', 'متر', 'كيس', 'برميل', 'صندوق'] as const,
  purchaseOrderStatus: ['DRAFT', 'SUBMITTED', 'RECEIVED', 'CANCELLED'] as const,
  goodsReceiptStatus: ['DRAFT', 'POSTED'] as const,
  materialIssueStatus: ['DRAFT', 'POSTED', 'CANCELLED'] as const,
  chequeStatus: ['DRAFT', 'PRINTED', 'CANCELLED'] as const,
  // طريقة دفع تسوية رصيد الإجازة (تسجيل يدوي فقط — بلا ربط محاسبي/بنكي/شيكات).
  leaveSettlementPaymentMethod: ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const,
  // نوع المستحق في سجل المستحقات المصروفة (سجل تاريخي فقط — لا يؤثر في أي احتساب).
  entitlementLedgerType: ['LEAVE_ALLOWANCE', 'END_OF_SERVICE', 'OTHER'] as const,
  // دورة حياة التصفية النهائية: مسودة تُحتسب حيًّا ← لقطة معتمدة مجمَّدة ← مسدَّدة بالكامل.
  // CANCELLED حالة نهائية تاريخية: تُحفظ اللقطة والدفعات كما هي، ولا تُعدّ تصفية نشطة.
  finalSettlementStatus: ['DRAFT', 'APPROVED', 'PAID', 'CANCELLED'] as const,
  // سبب انتهاء الخدمة — يختار سيناريو مكافأة نهاية الخدمة في المحرّك القانوني القائم.
  terminationReason: ['RESIGNATION', 'EMPLOYER_TERMINATION'] as const,
  // حالة تحليل الشغل والعمولة — تصنيف تشغيلي بحت. لا يُشغّل أي اعتماد ولا ترحيل
  // ولا سير موافقات؛ COMPLETED لا تعني «معتمد محاسبيًا» بل «انتهى المستخدم منه».
  workAnalysisStatus: ['DRAFT', 'COMPLETED', 'ARCHIVED'] as const,

  // ── جاهزية XBRL (XBRL Readiness Foundation v1) ───────────────────────────
  // قيم وصفية للطبقة التحضيرية وحدها. لا واحدة منها تؤثر في أي احتساب محاسبي،
  // ولا تحمل أي دلالة رسمية: التصنيف الرسمي يُميَّز بـ`isOfficial` لا بالحالة.
  xbrlTaxonomyStatus: ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const,
  xbrlJurisdiction: ['KW', 'GCC', 'IFRS', 'INTERNAL'] as const,
  xbrlDataType: ['MONETARY', 'DECIMAL', 'SHARES', 'STRING', 'DATE', 'BOOLEAN'] as const,
  xbrlBalanceType: ['DEBIT', 'CREDIT', 'NONE'] as const,
  xbrlPeriodType: ['INSTANT', 'DURATION'] as const,
  // SFP: المركز المالي — IS: الأرباح والخسائر — CF: التدفقات النقدية
  // SCE: التغيّرات في حقوق الملكية — NOTES: الإيضاحات
  xbrlStatementType: ['SFP', 'IS', 'CF', 'SCE', 'NOTES', 'NONE'] as const,
  // «غير مربوط» ليست قيمة هنا: هي غياب سطر الربط أصلًا.
  xbrlMappingStatus: ['MAPPED', 'NEEDS_REVIEW', 'NOT_APPLICABLE'] as const,
  xbrlMappingSource: ['MANUAL', 'IMPORTED', 'SUGGESTED'] as const,
  xbrlSeverity: ['ERROR', 'WARNING', 'INFO'] as const,
  xbrlReportingLanguage: ['ar', 'en'] as const,
  // نوع تغطية تأمين المركبة — شامل | ضد الغير | آخر. يُخزَّن كنص (لا enum على مستوى DB).
  insuranceCoverageType: ['COMPREHENSIVE', 'THIRD_PARTY', 'OTHER'] as const,
  // حالة وثيقة التأمين المشتقّة من `endDate` وحده — قيمة محسوبة لا مخزَّنة.
  insuranceStatus: ['VALID', 'EXPIRING_SOON', 'EXPIRED'] as const,
} as const;
