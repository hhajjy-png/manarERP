// ─────────────────────────────────────────────────────────────────────────
//  المصدر الموحّد لتصنيفات المصروفات (Single Source of Truth)
//  يُستخدم في: صفحة المصروفات (إنشاء/تعديل/فلترة)، لوحة التحكم، مهارة الذكاء،
//  وخرائط التسميات في config/modules.
//
//  ⚠️ يجب أن تبقى المفاتيح (value) متطابقة تمامًا مع ENUMS.expenseCategory
//     في backend/src/config/constants.ts (تحقّق Zod يرفض أي مفتاح غير موجود هناك).
//
//  التصنيف مخزَّن كنص (String) في قاعدة البيانات — إضافة بنود جديدة أو إعادة
//  ترتيبها عملية آمنة رجعيًا ولا تؤثر على السجلات القائمة.
//
//  الترتيب منطقي (تشغيل / مركبات / رسوم حكومية / عن طريق أشخاص / أخرى) لتسهيل الصيانة.
// ─────────────────────────────────────────────────────────────────────────

export type ExpenseCategoryGroup = 'operations' | 'vehicles' | 'government' | 'people' | 'other';

export interface ExpenseCategory {
  /** المفتاح الثابت (يُخزَّن في قاعدة البيانات ويُطابق backend enum). */
  value: string;
  /** الاسم العربي المعروض — هو ما يبحث فيه المستخدم. */
  labelAr: string;
  /** الاسم الإنجليزي — مساعد بحث إضافي (اختياري للمستخدم). */
  labelEn: string;
  /** أيقونة Material Symbols. */
  icon: string;
  group: ExpenseCategoryGroup;
}

export const EXPENSE_CATEGORY_GROUP_LABELS: Record<ExpenseCategoryGroup, string> = {
  operations: 'تشغيل عام',
  vehicles: 'مركبات',
  government: 'رسوم حكومية',
  people: 'عن طريق أشخاص',
  other: 'أخرى',
};

/** ترتيب عرض المجموعات. */
export const EXPENSE_CATEGORY_GROUP_ORDER: ExpenseCategoryGroup[] = [
  'operations', 'vehicles', 'government', 'people', 'other',
];

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  // ── تشغيل عام ──
  { value: 'FUEL',           labelAr: 'وقود',            labelEn: 'Fuel',                        icon: 'local_gas_station',   group: 'operations' },
  { value: 'OILS',           labelAr: 'زيوت وتشحيم',      labelEn: 'Oils & Lubrication',          icon: 'oil_barrel',          group: 'operations' },
  { value: 'PURCHASES',      labelAr: 'مشتريات',          labelEn: 'Purchases',                   icon: 'shopping_cart',       group: 'operations' },
  { value: 'SERVICES',       labelAr: 'خدمات',            labelEn: 'Services',                    icon: 'handyman',            group: 'operations' },
  { value: 'RENT',           labelAr: 'إيجارات',          labelEn: 'Rent',                        icon: 'home_work',           group: 'operations' },
  { value: 'EQUIPMENT',      labelAr: 'معدات',            labelEn: 'Equipment',                   icon: 'construction',        group: 'operations' },
  { value: 'EQUIPMENT_RENT', labelAr: 'إيجار معدات',       labelEn: 'Equipment Rent',              icon: 'agriculture',         group: 'operations' },
  { value: 'TRUCK_RENT',     labelAr: 'إيجار شاحنات',      labelEn: 'Truck Rent',                  icon: 'local_shipping',      group: 'operations' },
  { value: 'SALARIES',       labelAr: 'رواتب',            labelEn: 'Salaries',                    icon: 'payments',            group: 'operations' },
  // ── مركبات ──
  { value: 'MAINTENANCE',        labelAr: 'صيانة',              labelEn: 'Maintenance',                     icon: 'build',                group: 'vehicles' },
  { value: 'TIRES',              labelAr: 'إطارات وتواير',       labelEn: 'Tires / Tire Replacement',        icon: 'tire_repair',          group: 'vehicles' },
  { value: 'BATTERY',            labelAr: 'شراء بطارية',         labelEn: 'Battery Purchase',                icon: 'battery_charging_full',group: 'vehicles' },
  { value: 'VEHICLE_PAINT',      labelAr: 'صبغ سيارة',          labelEn: 'Vehicle Painting',                icon: 'format_paint',         group: 'vehicles' },
  { value: 'VEHICLE_BODYWORK',   labelAr: 'حدادة سيارة',        labelEn: 'Vehicle Bodywork',                icon: 'directions_car',       group: 'vehicles' },
  { value: 'VEHICLE_ELECTRICAL', labelAr: 'كهرباء سيارة',       labelEn: 'Vehicle Electrical Repairs',      icon: 'electrical_services',  group: 'vehicles' },
  { value: 'TOW_TRUCK',          labelAr: 'كرين سحب',           labelEn: 'Tow Truck',                       icon: 'car_crash',            group: 'vehicles' },
  { value: 'VEHICLE_INSURANCE',  labelAr: 'رسوم تأمين دفتر مركبة', labelEn: 'Vehicle Registration Insurance Fees', icon: 'shield',           group: 'vehicles' },
  { value: 'VEHICLE_REGISTRATION', labelAr: 'رسوم تجديد دفتر مركبة', labelEn: 'Vehicle Registration Renewal Fees', icon: 'note_alt',        group: 'vehicles' },
  // ── رسوم حكومية ──
  { value: 'GOVERNMENT_FEES',    labelAr: 'رسوم شؤون',          labelEn: 'Government Affairs Fees',         icon: 'account_balance',      group: 'government' },
  { value: 'RESIDENCY',          labelAr: 'رسوم إقامة',         labelEn: 'Residency Fees',                  icon: 'badge',                group: 'government' },
  { value: 'LABOR_INSURANCE',    labelAr: 'رسوم تأمين عمالة',    labelEn: 'Labor Insurance Fees',            icon: 'health_and_safety',    group: 'government' },
  { value: 'TOLL',               labelAr: 'رسوم مرور',          labelEn: 'Toll Fees',                       icon: 'toll',                 group: 'government' },
  { value: 'TRAFFIC_VIOLATIONS', labelAr: 'مخالفات مرورية',      labelEn: 'Traffic Violations',              icon: 'gpp_maybe',            group: 'government' },
  { value: 'COURT_FEES',         labelAr: 'رسوم قضائية',        labelEn: 'Court Fees',                      icon: 'gavel',                group: 'government' },
  // ── عن طريق أشخاص ──
  { value: 'HASSAN',          labelAr: 'مصروف عن طريق حسن',   labelEn: 'Hassan Expense',    icon: 'person',        group: 'people' },
  { value: 'GHANEM',          labelAr: 'مصروف عن طريق غانم',   labelEn: 'Ghanem Expense',    icon: 'person',        group: 'people' },
  { value: 'NATHEER',         labelAr: 'مصروف عن طريق نظير',   labelEn: 'Natheer Expense',   icon: 'person',        group: 'people' },
  { value: 'HAROON',          labelAr: 'مصروف عن طريق هارون',  labelEn: 'Haroon Expense',    icon: 'person',        group: 'people' },
  { value: 'BILLS_NAZEER',    labelAr: 'فواتير عن طريق نظير',  labelEn: 'Bills via Nazeer',  icon: 'receipt_long',  group: 'people' },
  { value: 'DRIVER_EXPENSES', labelAr: 'مصروف عن طريق سائق',   labelEn: 'Driver Expenses',   icon: 'local_taxi',    group: 'people' },
  { value: 'DRIVER_MEALS',    labelAr: 'أكل للسواق',          labelEn: 'Driver Meals',      icon: 'restaurant',    group: 'people' },
  // ── أخرى ──
  { value: 'CHARITY',  labelAr: 'صدقة شهرية',      labelEn: 'Monthly Charity',        icon: 'volunteer_activism', group: 'other' },
  { value: 'GIFTS',    labelAr: 'هدايا',           labelEn: 'Gifts',                  icon: 'redeem',             group: 'other' },
  { value: 'MISC',     labelAr: 'مصروفات متفرقة',   labelEn: 'Miscellaneous Expenses', icon: 'category',           group: 'other' },
  { value: 'OTHER',    labelAr: 'أخرى',            labelEn: 'Other',                  icon: 'receipt_long',       group: 'other' },
];

const BY_VALUE = new Map(EXPENSE_CATEGORIES.map((c) => [c.value, c]));

/** الاسم العربي للتصنيف، مع رجوع آمن للمفتاح إذا كان قديمًا/غير معروف. */
export function expenseCategoryLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return BY_VALUE.get(value)?.labelAr ?? value;
}

/** أيقونة التصنيف، مع رجوع افتراضي. */
export function expenseCategoryIcon(value: string | null | undefined): string {
  return (value && BY_VALUE.get(value)?.icon) || 'receipt_long';
}

/** خريطة {مفتاح → اسم عربي} — للتوافق مع الأماكن التي تتوقع Record. */
export const expenseCategoryArMap: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.labelAr]),
);

/**
 * خيارات جاهزة لقائمة SearchableSelect (بحث في العربي + الإنجليزي، عناوين مجموعات).
 * يستهلكها صفحة المصروفات وحوار الإدخال الشهري السريع — مصدر واحد لتفادي التكرار.
 */
export const EXPENSE_CATEGORY_SELECT_OPTIONS = EXPENSE_CATEGORIES.map((c) => ({
  value: c.value,
  label: c.labelAr,
  keywords: c.labelEn,
  icon: c.icon,
  group: EXPENSE_CATEGORY_GROUP_LABELS[c.group],
}));
