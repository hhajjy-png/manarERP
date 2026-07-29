export interface ImportColDef {
  key: string;
  labelAr: string;
  /** English display label — parallel to labelAr. Used for UI display only;
   *  labelAr remains the source of truth for Arabic-header column matching
   *  in utils/headerIntelligence.ts and must not change. */
  labelEn: string;
  required: boolean;
}

export interface ImportEntityConfig {
  key: string;
  labelAr: string;
  /** i18n key for the entity's display label (chips/buttons/metrics in GenericImporterView.tsx). */
  labelKey: string;
  columns: ImportColDef[];
  /** When true, template headers use Arabic labelAr (minus format hints) instead of key names.
   *  Required for entities whose backend validator uses an ARABIC_HEADER_MAP (currently: employees). */
  useArabicTemplateHeaders: boolean;
  previewPrimaryHeader: string;
  /** i18n key overriding previewPrimaryHeader when it's Arabic text; leave undefined when the
   *  header is already an English field name (e.g. "code") that doesn't need translation. */
  previewPrimaryHeaderKey?: string;
  previewSecondaryHeader: string;
  previewSecondaryHeaderKey?: string;
  previewPrimary: (row: Record<string, unknown>) => string;
  previewSecondary: (row: Record<string, unknown>) => string;
}

export const IMPORT_ENTITIES: ImportEntityConfig[] = [
  {
    key: 'employees',
    labelAr: 'الموظفون',
    labelKey: 'import.entity.employees',
    useArabicTemplateHeaders: true,
    previewPrimaryHeader: 'الرقم الوظيفي',
    previewPrimaryHeaderKey: 'import.entity.employees.preview_primary',
    previewSecondaryHeader: 'الاسم / المهنة',
    previewSecondaryHeaderKey: 'import.entity.employees.preview_secondary',
    previewPrimary:   (row) => String(row['code'] ?? '—'),
    previewSecondary: (row) => String(row['fullName'] ?? row['type'] ?? '—'),
    columns: [
      { key: 'code',                 labelAr: 'الرقم الوظيفي',                           labelEn: 'Employee Code',                                     required: true  },
      { key: 'fullName',             labelAr: 'الاسم بالعربي',                            labelEn: 'Name (Arabic)',                                     required: true  },
      { key: 'fullNameEn',           labelAr: 'الاسم بالإنجليزي',                         labelEn: 'Name (English)',                                    required: false },
      { key: 'civilId',              labelAr: 'الرقم المدني',                             labelEn: 'Civil ID',                                          required: false },
      { key: 'jobTitle',             labelAr: 'المهنة',                                   labelEn: 'Job Title',                                         required: false },
      { key: 'nationality',          labelAr: 'الجنسية',                                  labelEn: 'Nationality',                                       required: false },
      { key: 'passportNumber',       labelAr: 'رقم جواز السفر',                           labelEn: 'Passport Number',                                   required: false },
      { key: 'passportExpiry',       labelAr: 'تاريخ انتهاء جواز السفر (YYYY-MM-DD)',     labelEn: 'Passport Expiry Date (YYYY-MM-DD)',                 required: false },
      { key: 'residencyExpiry',      labelAr: 'تاريخ انتهاء الإقامة (YYYY-MM-DD)',        labelEn: 'Residency Expiry Date (YYYY-MM-DD)',                required: false },
      { key: 'licenseExpiry',        labelAr: 'تاريخ انتهاء رخصة القيادة (YYYY-MM-DD)',  labelEn: "Driver's License Expiry Date (YYYY-MM-DD)",         required: false },
      { key: 'vehiclePlate',         labelAr: 'رقم لوحة المركبة',                         labelEn: 'Vehicle Plate Number',                              required: false },
      { key: 'vehicleLicenseExpiry', labelAr: 'تاريخ انتهاء رخصة المركبة (YYYY-MM-DD)', labelEn: 'Vehicle License Expiry Date (YYYY-MM-DD)',          required: false },
      { key: 'birthDate',            labelAr: 'تاريخ الميلاد (YYYY-MM-DD)',               labelEn: 'Date of Birth (YYYY-MM-DD)',                        required: false },
      { key: 'company',              labelAr: 'الشركة',                                   labelEn: 'Company',                                           required: false },
      { key: 'department',           labelAr: 'القسم',                                    labelEn: 'Department',                                        required: false },
      { key: 'salary',               labelAr: 'الراتب الشهري (رقم)',                      labelEn: 'Monthly Salary (number)',                           required: false },
      { key: 'hireDate',             labelAr: 'تاريخ التعيين (YYYY-MM-DD)',               labelEn: 'Hire Date (YYYY-MM-DD)',                            required: false },
      { key: 'phone',                labelAr: 'الهاتف',                                   labelEn: 'Phone',                                             required: false },
      { key: 'email',                labelAr: 'البريد الإلكتروني',                        labelEn: 'Email',                                             required: false },
      { key: 'address',              labelAr: 'العنوان',                                  labelEn: 'Address',                                           required: false },
      { key: 'status',               labelAr: 'حالة الموظف (ACTIVE / ON_LEAVE / TERMINATED)', labelEn: 'Employee Status (ACTIVE / ON_LEAVE / TERMINATED)', required: false },
      { key: 'notes',                labelAr: 'ملاحظات',                                  labelEn: 'Notes',                                             required: false },
    ],
  },
  {
    key: 'customers',
    labelAr: 'العملاء',
    labelKey: 'import.entity.customers',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'code',
    previewSecondaryHeader: 'name',
    previewPrimary:   (row) => String(row['code'] ?? '—'),
    previewSecondary: (row) => String(row['name'] ?? '—'),
    columns: [
      { key: 'code',        labelAr: 'رقم العميل',                         labelEn: 'Customer Code',              required: true  },
      { key: 'name',        labelAr: 'اسم العميل',                         labelEn: 'Customer Name',              required: true  },
      { key: 'type',        labelAr: 'النوع: GOVERNMENT / PRIVATE',        labelEn: 'Type: GOVERNMENT / PRIVATE', required: false },
      { key: 'category',    labelAr: 'التصنيف',                            labelEn: 'Category',                   required: false },
      { key: 'phone',       labelAr: 'الهاتف',                             labelEn: 'Phone',                      required: false },
      { key: 'email',       labelAr: 'البريد الإلكتروني',                  labelEn: 'Email',                      required: false },
      { key: 'address',     labelAr: 'العنوان',                            labelEn: 'Address',                    required: false },
      { key: 'contactName', labelAr: 'مسؤول التواصل',                      labelEn: 'Contact Person',             required: false },
      { key: 'notes',       labelAr: 'ملاحظات',                            labelEn: 'Notes',                      required: false },
    ],
  },
  {
    key: 'equipment',
    labelAr: 'المعدات',
    labelKey: 'import.entity.equipment',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'code',
    previewSecondaryHeader: 'type',
    previewPrimary:   (row) => String(row['code'] ?? '—'),
    previewSecondary: (row) => String(row['type'] ?? '—'),
    columns: [
      { key: 'code',               labelAr: 'رقم المعدة',                         labelEn: 'Equipment Code',                            required: true  },
      // مفاتيح الأعمدة ثابتة (`type` لم يتغيّر) — التسمية وحدها صارت «الشكل»،
      // فملفّات الاستيراد القديمة تبقى صالحة كما هي.
      { key: 'type',               labelAr: 'شكل المعدة (قلاب / شيول / حفار...)', labelEn: 'Equipment Shape (Dump Truck / Loader / Excavator...)', required: true  },
      { key: 'ownerName',          labelAr: 'اسم المالك',                         labelEn: 'Owner Name',                                required: false },
      { key: 'driverName',         labelAr: 'اسم السائق',                         labelEn: 'Driver Name',                               required: false },
      { key: 'plateNumber',        labelAr: 'رقم اللوحة',                         labelEn: 'Plate Number',                              required: false },
      { key: 'chassisNumber',      labelAr: 'رقم القاعدة',                        labelEn: 'Chassis Number',                            required: false },
      { key: 'registrationExpiry', labelAr: 'انتهاء دفتر المركبة (YYYY-MM-DD)',   labelEn: 'Vehicle Registration Expiry (YYYY-MM-DD)',  required: false },
      { key: 'status',             labelAr: 'الحالة: WORKING / NOT_WORKING',      labelEn: 'Status: WORKING / NOT_WORKING',             required: false },
      { key: 'manufacturer',       labelAr: 'الصنع',                              labelEn: 'Make',                                      required: false },
      { key: 'model',              labelAr: 'الموديل',                            labelEn: 'Model',                                     required: false },
      { key: 'manufactureYear',    labelAr: 'سنة الصنع (رقم)',                    labelEn: 'Manufacture Year (number)',                 required: false },
      { key: 'color',              labelAr: 'اللون',                              labelEn: 'Color',                                     required: false },
      { key: 'operatingHours',     labelAr: 'ساعات التشغيل (رقم)',                labelEn: 'Operating Hours (number)',                  required: false },
      { key: 'purchaseCost',       labelAr: 'تكلفة الشراء (رقم)',                 labelEn: 'Purchase Cost (number)',                    required: false },
      { key: 'notes',              labelAr: 'ملاحظات',                            labelEn: 'Notes',                                     required: false },
    ],
  },
  {
    key: 'suppliers',
    labelAr: 'الموردون',
    labelKey: 'import.entity.suppliers',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'code',
    previewSecondaryHeader: 'name',
    previewPrimary:   (row) => String(row['code'] ?? '—'),
    previewSecondary: (row) => String(row['name'] ?? '—'),
    columns: [
      { key: 'code',        labelAr: 'الكود',          labelEn: 'Code',           required: true  },
      { key: 'name',        labelAr: 'الاسم',          labelEn: 'Name',           required: true  },
      { key: 'phone',       labelAr: 'الهاتف',         labelEn: 'Phone',          required: false },
      { key: 'email',       labelAr: 'البريد',         labelEn: 'Email',          required: false },
      { key: 'address',     labelAr: 'العنوان',        labelEn: 'Address',        required: false },
      { key: 'contactName', labelAr: 'اسم المسؤول',    labelEn: 'Contact Person', required: false },
      { key: 'notes',       labelAr: 'ملاحظات',        labelEn: 'Notes',          required: false },
    ],
  },
  {
    key: 'prices',
    labelAr: 'أسعار المشاريع',
    labelKey: 'import.entity.prices',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'مصنع الأسفلت',
    previewPrimaryHeaderKey: 'import.entity.prices.preview_primary',
    previewSecondaryHeader: 'الشركة / الوحدة',
    previewSecondaryHeaderKey: 'import.entity.prices.preview_secondary',
    previewPrimary:   (row) => String(row['asphaltPlant'] ?? row['مصنع الأسفلت'] ?? '—'),
    previewSecondary: (row) =>
      `${String(row['companyName'] ?? row['اسم الشركة'] ?? '—')} / ${String(row['contractUnit'] ?? row['وحدة العقد'] ?? '—')}`,
    columns: [
      { key: 'asphaltPlant',     labelAr: 'مصنع الأسفلت',                      labelEn: 'Asphalt Plant',                                  required: true },
      { key: 'companyName',      labelAr: 'اسم الشركة',                         labelEn: 'Company Name',                                   required: true },
      { key: 'contractLocation', labelAr: 'مكان العقد',                         labelEn: 'Contract Location',                              required: true },
      { key: 'contractUnit',     labelAr: 'وحدة العقد (طن / درب / يومية / مقطوعية)',      labelEn: 'Contract Unit (طن / درب / يومية / مقطوعية)', required: true },
      { key: 'unitPrice',        labelAr: 'سعر الوحدة (رقم موجب)',              labelEn: 'Unit Price (positive number)',                   required: true },
    ],
  },
  {
    key: 'contracts',
    labelAr: 'العقود',
    labelKey: 'import.entity.contracts',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'رمز العقد',
    previewPrimaryHeaderKey: 'import.entity.contracts.preview_primary',
    previewSecondaryHeader: 'محطة الأسفلت',
    previewSecondaryHeaderKey: 'import.entity.contracts.preview_secondary',
    previewPrimary:   (row) => String(row['code'] ?? '—'),
    previewSecondary: (row) => String(row['asphaltPlant'] ?? '—'),
    columns: [
      { key: 'code',                  labelAr: 'رمز العقد',                                                       labelEn: 'Contract Code',                                                required: true  },
      { key: 'asphaltPlant',          labelAr: 'محطة الأسفلت',                                                    labelEn: 'Asphalt Plant',                                                required: true  },
      { key: 'location',              labelAr: 'الموقع',                                                          labelEn: 'Location',                                                     required: false },
      { key: 'companyName',           labelAr: 'اسم الشركة',                                                      labelEn: 'Company Name',                                                 required: false },
      { key: 'unitName',              labelAr: 'وحدة القياس',                                                     labelEn: 'Unit of Measure',                                              required: false },
      { key: 'price',                 labelAr: 'سعر الوحدة (رقم غير سالب)',                                       labelEn: 'Unit Price (non-negative number)',                             required: false },
      { key: 'monthlyTransportValue', labelAr: 'قيمة النقل الشهري (رقم غير سالب)',                               labelEn: 'Monthly Transport Value (non-negative number)',               required: false },
      { key: 'startDate',             labelAr: 'تاريخ البدء (YYYY-MM-DD)',                                        labelEn: 'Start Date (YYYY-MM-DD)',                                      required: false },
      { key: 'endDate',               labelAr: 'تاريخ الانتهاء (YYYY-MM-DD)',                                     labelEn: 'End Date (YYYY-MM-DD)',                                        required: false },
      { key: 'status',                labelAr: 'الحالة (ACTIVE / EXPIRED / RENEWING / SUSPENDED) — افتراضي: ACTIVE', labelEn: 'Status (ACTIVE / EXPIRED / RENEWING / SUSPENDED) — default: ACTIVE', required: false },
      { key: 'customerCode',          labelAr: 'رمز العميل (اختياري)',                                            labelEn: 'Customer Code (optional)',                                     required: false },
      { key: 'managerCode',           labelAr: 'رمز الموظف المسؤول (اختياري)',                                    labelEn: 'Responsible Employee Code (optional)',                         required: false },
      { key: 'notes',                 labelAr: 'ملاحظات',                                                         labelEn: 'Notes',                                                        required: false },
    ],
  },
  {
    key: 'expenses',
    labelAr: 'المصروفات',
    labelKey: 'import.entity.expenses',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'رمز المصروف',
    previewPrimaryHeaderKey: 'import.entity.expenses.preview_primary',
    previewSecondaryHeader: 'الفئة',
    previewSecondaryHeaderKey: 'import.entity.expenses.preview_secondary',
    previewPrimary:   (row) => String(row['code'] ?? '—'),
    previewSecondary: (row) => String(row['category'] ?? '—'),
    columns: [
      { key: 'code',         labelAr: 'رمز المصروف',                                                                              labelEn: 'Expense Code',                                                                     required: true  },
      { key: 'category',     labelAr: 'الفئة (FUEL / SALARIES / MAINTENANCE / RENT / PURCHASES / EQUIPMENT / SERVICES / OTHER)', labelEn: 'Category (FUEL / SALARIES / MAINTENANCE / RENT / PURCHASES / EQUIPMENT / SERVICES / OTHER)', required: true  },
      { key: 'description',  labelAr: 'الوصف',                                                                                    labelEn: 'Description',                                                                      required: true  },
      { key: 'amount',       labelAr: 'المبلغ (د.ك — رقم موجب)',                                                                  labelEn: 'Amount (KD — positive number)',                                                    required: true  },
      { key: 'date',         labelAr: 'التاريخ (YYYY-MM-DD) — افتراضي: اليوم',                                                   labelEn: 'Date (YYYY-MM-DD) — default: today',                                               required: false },
      { key: 'contractCode', labelAr: 'رمز العقد (اختياري)',                                                                      labelEn: 'Contract Code (optional)',                                                         required: false },
      { key: 'supplierCode', labelAr: 'رمز المورد (اختياري)',                                                                     labelEn: 'Supplier Code (optional)',                                                         required: false },
      { key: 'notes',        labelAr: 'ملاحظات (غير محفوظة — الوصف هو الحقل الرئيسي)',                                           labelEn: 'Notes (not saved — description is the primary field)',                            required: false },
    ],
  },
  {
    key: 'invoices',
    labelAr: 'الفواتير',
    labelKey: 'import.entity.invoices',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'invoiceNumber',
    previewSecondaryHeader: 'direction / invoiceType',
    previewPrimary:   (row) => String(row['invoiceNumber'] ?? '—'),
    previewSecondary: (row) => `${String(row['direction'] ?? '—')} / ${String(row['invoiceType'] ?? '—')}`,
    columns: [
      { key: 'invoiceNumber', labelAr: 'رقم الفاتورة',                                                                          labelEn: 'Invoice Number',                                                    required: true  },
      { key: 'direction',     labelAr: 'الاتجاه (CUSTOMER / SUPPLIER)',                                                          labelEn: 'Direction (CUSTOMER / SUPPLIER)',                                   required: true  },
      { key: 'invoiceType',   labelAr: 'نوع الفاتورة (نقل اسفلت / يومية عمل مالينج / يومية نقل اسفلت)',                        labelEn: 'Invoice Type (نقل اسفلت / يومية عمل مالينج / يومية نقل اسفلت)',   required: true  },
      { key: 'issueDate',     labelAr: 'تاريخ الفاتورة (YYYY-MM-DD)',                                                           labelEn: 'Invoice Date (YYYY-MM-DD)',                                         required: true  },
      { key: 'total',         labelAr: 'الإجمالي (د.ك — رقم غير سالب)',                                                         labelEn: 'Total (KD — non-negative number)',                                  required: true  },
      { key: 'customerCode',  labelAr: 'كود العميل (مطلوب إذا الاتجاه CUSTOMER)',                                                labelEn: 'Customer Code (required if direction is CUSTOMER)',                required: false },
      { key: 'supplierCode',  labelAr: 'كود المورد (مطلوب إذا الاتجاه SUPPLIER)',                                                labelEn: 'Supplier Code (required if direction is SUPPLIER)',                required: false },
      { key: 'contractCode',  labelAr: 'كود العقد (اختياري)',                                                                    labelEn: 'Contract Code (optional)',                                          required: false },
      { key: 'dueDate',       labelAr: 'تاريخ الاستحقاق (YYYY-MM-DD) — اختياري',                                               labelEn: 'Due Date (YYYY-MM-DD) — optional',                                  required: false },
      { key: 'billingMonth',  labelAr: 'شهر الحساب (1–12) — اختياري',                                                          labelEn: 'Billing Month (1–12) — optional',                                   required: false },
      { key: 'billingYear',   labelAr: 'سنة الحساب (2020–2099) — اختياري',                                                     labelEn: 'Billing Year (2020–2099) — optional',                               required: false },
      { key: 'subtotal',      labelAr: 'الإجمالي الفرعي (د.ك) — اختياري، افتراضي: الإجمالي',                                   labelEn: 'Subtotal (KD) — optional, default: Total',                          required: false },
      { key: 'taxRate',       labelAr: 'نسبة الضريبة % — اختياري، افتراضي: 0',                                                  labelEn: 'Tax Rate % — optional, default: 0',                                 required: false },
      { key: 'taxAmount',     labelAr: 'مبلغ الضريبة (د.ك) — اختياري، افتراضي: 0',                                             labelEn: 'Tax Amount (KD) — optional, default: 0',                            required: false },
      { key: 'discount',      labelAr: 'الخصم (د.ك) — اختياري، افتراضي: 0',                                                    labelEn: 'Discount (KD) — optional, default: 0',                              required: false },
      { key: 'paidAmount',    labelAr: 'المبلغ المدفوع (د.ك) — اختياري، افتراضي: 0',                                           labelEn: 'Paid Amount (KD) — optional, default: 0',                           required: false },
      { key: 'status',        labelAr: 'الحالة (UNPAID / PARTIAL / PAID / OVERDUE / CANCELLED) — افتراضي: UNPAID',             labelEn: 'Status (UNPAID / PARTIAL / PAID / OVERDUE / CANCELLED) — default: UNPAID', required: false },
      { key: 'notes',         labelAr: 'ملاحظات — اختياري',                                                                     labelEn: 'Notes — optional',                                                  required: false },
    ],
  },
  {
    key: 'payroll',
    labelAr: 'كشوف الرواتب',
    labelKey: 'import.entity.payroll',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'employeeCode',
    previewSecondaryHeader: 'شهر / سنة',
    previewSecondaryHeaderKey: 'import.entity.payroll.preview_secondary',
    previewPrimary:   (row) => String(row['employeeCode'] ?? '—'),
    previewSecondary: (row) => `${String(row['month'] ?? '—')} / ${String(row['year'] ?? '—')}`,
    columns: [
      { key: 'employeeCode',    labelAr: 'رمز الموظف',                                               labelEn: 'Employee Code',                                            required: true  },
      { key: 'month',           labelAr: 'الشهر (1–12)',                                              labelEn: 'Month (1–12)',                                             required: true  },
      { key: 'year',            labelAr: 'السنة (مثال: 2026)',                                        labelEn: 'Year (e.g. 2026)',                                         required: true  },
      { key: 'baseSalary',      labelAr: 'الراتب الأساسي (د.ك — رقم غير سالب)',                      labelEn: 'Base Salary (KD — non-negative number)',                   required: true  },
      { key: 'totalAllowances', labelAr: 'إجمالي البدلات (د.ك) — افتراضي: 0',                        labelEn: 'Total Allowances (KD) — default: 0',                       required: false },
      { key: 'overtimeAmount',  labelAr: 'مبلغ الإضافي (د.ك) — افتراضي: 0',                         labelEn: 'Overtime Amount (KD) — default: 0',                        required: false },
      { key: 'totalDeductions', labelAr: 'إجمالي الخصومات (د.ك) — افتراضي: 0',                      labelEn: 'Total Deductions (KD) — default: 0',                       required: false },
      { key: 'totalAdvances',   labelAr: 'إجمالي السلف (د.ك) — افتراضي: 0',                         labelEn: 'Total Advances (KD) — default: 0',                         required: false },
      { key: 'grossSalary',     labelAr: 'الإجمالي (د.ك) — اختياري، يُحسب تلقائياً إن لم يُدخل',   labelEn: 'Gross Total (KD) — optional, auto-calculated if not entered', required: false },
      { key: 'netSalary',       labelAr: 'الصافي (د.ك) — اختياري، يُحسب تلقائياً إن لم يُدخل',     labelEn: 'Net Salary (KD) — optional, auto-calculated if not entered',  required: false },
      { key: 'paymentMethod',   labelAr: 'طريقة الدفع (CASH / BANK / CHEQUE / TRANSFER) — اختياري', labelEn: 'Payment Method (CASH / BANK / CHEQUE / TRANSFER) — optional', required: false },
      { key: 'notes',           labelAr: 'ملاحظات — اختياري',                                        labelEn: 'Notes — optional',                                         required: false },
    ],
  },
];

export const IMPORT_ENTITY_MAP: Record<string, ImportEntityConfig> = Object.fromEntries(
  IMPORT_ENTITIES.map((e) => [e.key, e]),
);
