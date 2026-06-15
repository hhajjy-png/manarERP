export interface ImportColDef {
  key: string;
  labelAr: string;
  required: boolean;
}

export interface ImportEntityConfig {
  key: string;
  labelAr: string;
  columns: ImportColDef[];
  /** When true, template headers use Arabic labelAr (minus format hints) instead of key names.
   *  Required for entities whose backend validator uses an ARABIC_HEADER_MAP (currently: employees). */
  useArabicTemplateHeaders: boolean;
  previewPrimaryHeader: string;
  previewSecondaryHeader: string;
  previewPrimary: (row: Record<string, unknown>) => string;
  previewSecondary: (row: Record<string, unknown>) => string;
}

export const IMPORT_ENTITIES: ImportEntityConfig[] = [
  {
    key: 'employees',
    labelAr: 'الموظفون',
    useArabicTemplateHeaders: true,
    previewPrimaryHeader: 'الرقم الوظيفي',
    previewSecondaryHeader: 'الاسم / المهنة',
    previewPrimary:   (row) => String(row['code'] ?? '—'),
    previewSecondary: (row) => String(row['fullName'] ?? row['type'] ?? '—'),
    columns: [
      { key: 'code',                 labelAr: 'الرقم الوظيفي',                           required: true  },
      { key: 'fullName',             labelAr: 'الاسم بالعربي',                            required: true  },
      { key: 'fullNameEn',           labelAr: 'الاسم بالإنجليزي',                         required: false },
      { key: 'civilId',              labelAr: 'الرقم المدني',                             required: false },
      { key: 'jobTitle',             labelAr: 'المهنة',                                   required: false },
      { key: 'nationality',          labelAr: 'الجنسية',                                  required: false },
      { key: 'passportNumber',       labelAr: 'رقم جواز السفر',                           required: false },
      { key: 'passportExpiry',       labelAr: 'تاريخ انتهاء جواز السفر (YYYY-MM-DD)',     required: false },
      { key: 'residencyExpiry',      labelAr: 'تاريخ انتهاء الإقامة (YYYY-MM-DD)',        required: false },
      { key: 'licenseExpiry',        labelAr: 'تاريخ انتهاء رخصة القيادة (YYYY-MM-DD)',  required: false },
      { key: 'vehiclePlate',         labelAr: 'رقم لوحة المركبة',                         required: false },
      { key: 'vehicleLicenseExpiry', labelAr: 'تاريخ انتهاء رخصة المركبة (YYYY-MM-DD)', required: false },
      { key: 'birthDate',            labelAr: 'تاريخ الميلاد (YYYY-MM-DD)',               required: false },
      { key: 'company',              labelAr: 'الشركة',                                   required: false },
      { key: 'department',           labelAr: 'القسم',                                    required: false },
      { key: 'salary',               labelAr: 'الراتب الشهري (رقم)',                      required: false },
      { key: 'hireDate',             labelAr: 'تاريخ التعيين (YYYY-MM-DD)',               required: false },
      { key: 'phone',                labelAr: 'الهاتف',                                   required: false },
      { key: 'email',                labelAr: 'البريد الإلكتروني',                        required: false },
      { key: 'address',              labelAr: 'العنوان',                                  required: false },
      { key: 'status',               labelAr: 'حالة الموظف (ACTIVE / ON_LEAVE / TERMINATED)', required: false },
      { key: 'notes',                labelAr: 'ملاحظات',                                  required: false },
    ],
  },
  {
    key: 'customers',
    labelAr: 'العملاء',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'code',
    previewSecondaryHeader: 'name',
    previewPrimary:   (row) => String(row['code'] ?? '—'),
    previewSecondary: (row) => String(row['name'] ?? '—'),
    columns: [
      { key: 'code',        labelAr: 'رقم العميل',                         required: true  },
      { key: 'name',        labelAr: 'اسم العميل',                         required: true  },
      { key: 'type',        labelAr: 'النوع: GOVERNMENT / PRIVATE',        required: false },
      { key: 'category',    labelAr: 'التصنيف',                            required: false },
      { key: 'phone',       labelAr: 'الهاتف',                             required: false },
      { key: 'email',       labelAr: 'البريد الإلكتروني',                  required: false },
      { key: 'address',     labelAr: 'العنوان',                            required: false },
      { key: 'contactName', labelAr: 'مسؤول التواصل',                      required: false },
      { key: 'notes',       labelAr: 'ملاحظات',                            required: false },
    ],
  },
  {
    key: 'equipment',
    labelAr: 'المعدات',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'code',
    previewSecondaryHeader: 'type',
    previewPrimary:   (row) => String(row['code'] ?? '—'),
    previewSecondary: (row) => String(row['type'] ?? '—'),
    columns: [
      { key: 'code',               labelAr: 'رقم المعدة',                         required: true  },
      { key: 'type',               labelAr: 'نوع المعدة (قلاب / شيول / حفار...)', required: true  },
      { key: 'ownerName',          labelAr: 'اسم المالك',                         required: false },
      { key: 'driverName',         labelAr: 'اسم السائق',                         required: false },
      { key: 'plateNumber',        labelAr: 'رقم اللوحة',                         required: false },
      { key: 'registrationExpiry', labelAr: 'انتهاء دفتر المركبة (YYYY-MM-DD)',   required: false },
      { key: 'status',             labelAr: 'الحالة: WORKING / NOT_WORKING',      required: false },
      { key: 'manufacturer',       labelAr: 'الشركة المصنعة',                     required: false },
      { key: 'model',              labelAr: 'الموديل',                            required: false },
      { key: 'manufactureYear',    labelAr: 'سنة الصنع (رقم)',                    required: false },
      { key: 'operatingHours',     labelAr: 'ساعات التشغيل (رقم)',                required: false },
      { key: 'purchaseCost',       labelAr: 'تكلفة الشراء (رقم)',                 required: false },
      { key: 'notes',              labelAr: 'ملاحظات',                            required: false },
    ],
  },
  {
    key: 'suppliers',
    labelAr: 'الموردون',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'code',
    previewSecondaryHeader: 'name',
    previewPrimary:   (row) => String(row['code'] ?? '—'),
    previewSecondary: (row) => String(row['name'] ?? '—'),
    columns: [
      { key: 'code',        labelAr: 'الكود',          required: true  },
      { key: 'name',        labelAr: 'الاسم',          required: true  },
      { key: 'phone',       labelAr: 'الهاتف',         required: false },
      { key: 'email',       labelAr: 'البريد',         required: false },
      { key: 'address',     labelAr: 'العنوان',        required: false },
      { key: 'contactName', labelAr: 'اسم المسؤول',    required: false },
      { key: 'notes',       labelAr: 'ملاحظات',        required: false },
    ],
  },
  {
    key: 'prices',
    labelAr: 'أسعار المشاريع',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'مصنع الأسفلت',
    previewSecondaryHeader: 'الشركة / الوحدة',
    previewPrimary:   (row) => String(row['asphaltPlant'] ?? row['مصنع الأسفلت'] ?? '—'),
    previewSecondary: (row) =>
      `${String(row['companyName'] ?? row['اسم الشركة'] ?? '—')} / ${String(row['contractUnit'] ?? row['وحدة العقد'] ?? '—')}`,
    columns: [
      { key: 'asphaltPlant',     labelAr: 'مصنع الأسفلت',                      required: true },
      { key: 'companyName',      labelAr: 'اسم الشركة',                         required: true },
      { key: 'contractLocation', labelAr: 'مكان العقد',                         required: true },
      { key: 'contractUnit',     labelAr: 'وحدة العقد (طن / درب / يومية / مقطوعية)',      required: true },
      { key: 'unitPrice',        labelAr: 'سعر الوحدة (رقم موجب)',              required: true },
    ],
  },
  {
    key: 'contracts',
    labelAr: 'العقود',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'رمز العقد',
    previewSecondaryHeader: 'محطة الأسفلت',
    previewPrimary:   (row) => String(row['code'] ?? '—'),
    previewSecondary: (row) => String(row['asphaltPlant'] ?? '—'),
    columns: [
      { key: 'code',                  labelAr: 'رمز العقد',                                                       required: true  },
      { key: 'asphaltPlant',          labelAr: 'محطة الأسفلت',                                                    required: true  },
      { key: 'location',              labelAr: 'الموقع',                                                          required: false },
      { key: 'companyName',           labelAr: 'اسم الشركة',                                                      required: false },
      { key: 'unitName',              labelAr: 'وحدة القياس',                                                     required: false },
      { key: 'price',                 labelAr: 'سعر الوحدة (رقم غير سالب)',                                       required: false },
      { key: 'monthlyTransportValue', labelAr: 'قيمة النقل الشهري (رقم غير سالب)',                               required: false },
      { key: 'startDate',             labelAr: 'تاريخ البدء (YYYY-MM-DD)',                                        required: false },
      { key: 'endDate',               labelAr: 'تاريخ الانتهاء (YYYY-MM-DD)',                                     required: false },
      { key: 'status',                labelAr: 'الحالة (ACTIVE / EXPIRED / RENEWING / SUSPENDED) — افتراضي: ACTIVE', required: false },
      { key: 'customerCode',          labelAr: 'رمز العميل (اختياري)',                                            required: false },
      { key: 'managerCode',           labelAr: 'رمز الموظف المسؤول (اختياري)',                                    required: false },
      { key: 'notes',                 labelAr: 'ملاحظات',                                                         required: false },
    ],
  },
  {
    key: 'expenses',
    labelAr: 'المصروفات',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'رمز المصروف',
    previewSecondaryHeader: 'الفئة',
    previewPrimary:   (row) => String(row['code'] ?? '—'),
    previewSecondary: (row) => String(row['category'] ?? '—'),
    columns: [
      { key: 'code',         labelAr: 'رمز المصروف',                                                                              required: true  },
      { key: 'category',     labelAr: 'الفئة (FUEL / SALARIES / MAINTENANCE / RENT / PURCHASES / EQUIPMENT / SERVICES / OTHER)', required: true  },
      { key: 'description',  labelAr: 'الوصف',                                                                                    required: true  },
      { key: 'amount',       labelAr: 'المبلغ (د.ك — رقم موجب)',                                                                  required: true  },
      { key: 'date',         labelAr: 'التاريخ (YYYY-MM-DD) — افتراضي: اليوم',                                                   required: false },
      { key: 'contractCode', labelAr: 'رمز العقد (اختياري)',                                                                      required: false },
      { key: 'supplierCode', labelAr: 'رمز المورد (اختياري)',                                                                     required: false },
      { key: 'notes',        labelAr: 'ملاحظات (غير محفوظة — الوصف هو الحقل الرئيسي)',                                           required: false },
    ],
  },
  {
    key: 'invoices',
    labelAr: 'الفواتير',
    useArabicTemplateHeaders: false,
    previewPrimaryHeader: 'invoiceNumber',
    previewSecondaryHeader: 'direction / invoiceType',
    previewPrimary:   (row) => String(row['invoiceNumber'] ?? '—'),
    previewSecondary: (row) => `${String(row['direction'] ?? '—')} / ${String(row['invoiceType'] ?? '—')}`,
    columns: [
      { key: 'invoiceNumber', labelAr: 'رقم الفاتورة',                                                                          required: true  },
      { key: 'direction',     labelAr: 'الاتجاه (CUSTOMER / SUPPLIER)',                                                          required: true  },
      { key: 'invoiceType',   labelAr: 'نوع الفاتورة (نقل اسفلت / يومية عمل مالينج / يومية نقل اسفلت)',                        required: true  },
      { key: 'issueDate',     labelAr: 'تاريخ الفاتورة (YYYY-MM-DD)',                                                           required: true  },
      { key: 'total',         labelAr: 'الإجمالي (د.ك — رقم غير سالب)',                                                         required: true  },
      { key: 'customerCode',  labelAr: 'كود العميل (مطلوب إذا الاتجاه CUSTOMER)',                                                required: false },
      { key: 'supplierCode',  labelAr: 'كود المورد (مطلوب إذا الاتجاه SUPPLIER)',                                                required: false },
      { key: 'contractCode',  labelAr: 'كود العقد (اختياري)',                                                                    required: false },
      { key: 'dueDate',       labelAr: 'تاريخ الاستحقاق (YYYY-MM-DD) — اختياري',                                               required: false },
      { key: 'billingMonth',  labelAr: 'شهر الحساب (1–12) — اختياري',                                                          required: false },
      { key: 'billingYear',   labelAr: 'سنة الحساب (2020–2099) — اختياري',                                                     required: false },
      { key: 'subtotal',      labelAr: 'الإجمالي الفرعي (د.ك) — اختياري، افتراضي: الإجمالي',                                   required: false },
      { key: 'taxRate',       labelAr: 'نسبة الضريبة % — اختياري، افتراضي: 0',                                                  required: false },
      { key: 'taxAmount',     labelAr: 'مبلغ الضريبة (د.ك) — اختياري، افتراضي: 0',                                             required: false },
      { key: 'discount',      labelAr: 'الخصم (د.ك) — اختياري، افتراضي: 0',                                                    required: false },
      { key: 'paidAmount',    labelAr: 'المبلغ المدفوع (د.ك) — اختياري، افتراضي: 0',                                           required: false },
      { key: 'status',        labelAr: 'الحالة (UNPAID / PARTIAL / PAID / OVERDUE / CANCELLED) — افتراضي: UNPAID',             required: false },
      { key: 'notes',         labelAr: 'ملاحظات — اختياري',                                                                     required: false },
    ],
  },
];

export const IMPORT_ENTITY_MAP: Record<string, ImportEntityConfig> = Object.fromEntries(
  IMPORT_ENTITIES.map((e) => [e.key, e]),
);
