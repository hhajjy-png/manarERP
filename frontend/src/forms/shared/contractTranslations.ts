export const BASE_NATIONALITY_EN: Record<string, string> = {
  'هندي': 'INDIAN',
  'هندية': 'INDIAN',
  'باكستاني': 'PAKISTANI',
  'باكستانية': 'PAKISTANI',
  'مصري': 'EGYPTIAN',
  'مصرية': 'EGYPTIAN',
  'سوري': 'SYRIAN',
  'سورية': 'SYRIAN',
  'تركي': 'TURKISH',
  'تركية': 'TURKISH',
  'بنغلاديشي': 'BANGLADESHI',
  'بنغلاديشية': 'BANGLADESHI',
  'فلبيني': 'FILIPINO',
  'فلبينية': 'FILIPINO',
  'نيبالي': 'NEPALESE',
  'نيبالية': 'NEPALESE',
  'سريلانكي': 'SRI LANKAN',
  'سريلانكية': 'SRI LANKAN',
  'كويتي': 'KUWAITI',
  'كويتية': 'KUWAITI',
  'أردني': 'JORDANIAN',
  'أردنية': 'JORDANIAN',
  'يمني': 'YEMENI',
  'يمنية': 'YEMENI',
  'إثيوبي': 'ETHIOPIAN',
  'إثيوبية': 'ETHIOPIAN',
  'إندونيسي': 'INDONESIAN',
  'إندونيسية': 'INDONESIAN',
  'عراقي': 'IRAQI',
  'عراقية': 'IRAQI',
  'سوداني': 'SUDANESE',
  'سودانية': 'SUDANESE',
  'تونسي': 'TUNISIAN',
  'تونسية': 'TUNISIAN',
  'مغربي': 'MOROCCAN',
  'مغربية': 'MOROCCAN',
  'لبناني': 'LEBANESE',
  'لبنانية': 'LEBANESE',
  'ميانماري': 'MYANMAR',
  'ميانمارية': 'MYANMAR',
  'كيني': 'KENYAN',
  'كينية': 'KENYAN',
  'غاني': 'GHANAIAN',
  'غانية': 'GHANAIAN',
};

export const BASE_JOB_TITLE_EN: Record<string, string> = {
  'سائق شاحنة': 'HEAVY DRIVER',
  'سائق عموم آليات الطرق': 'GENERAL ROAD EQUIPMENT DRIVER',
  'سائق سيارة خصوصي': 'PRIVATE CAR DRIVER',
  'مندوب مبيعات': 'SALES REPRESENTATIVE',
  'عامل': 'WORKER',
  'عامل عام': 'GENERAL WORKER',
  'فني': 'TECHNICIAN',
  'فني صيانة': 'MAINTENANCE TECHNICIAN',
  'مشرف': 'SUPERVISOR',
  'مهندس': 'ENGINEER',
  'محاسب': 'ACCOUNTANT',
  'حارس': 'GUARD',
  'سائق': 'DRIVER',
  'مشغل معدات ثقيلة': 'HEAVY EQUIPMENT OPERATOR',
  'مشغل حفار': 'EXCAVATOR OPERATOR',
  'مشغل مدحلة': 'ROLLER OPERATOR',
  'مشغل شيول': 'WHEEL LOADER OPERATOR',
  'سائق شاحنة قلاب': 'DUMP TRUCK DRIVER',
  'ميكانيكي': 'MECHANIC',
  'كهربائي': 'ELECTRICIAN',
  'لحام': 'WELDER',
  'نجار': 'CARPENTER',
  'بناء': 'MASON',
  'مساعد سائق': 'DRIVER ASSISTANT',
  'مراقب': 'INSPECTOR',
  'مدير مشروع': 'PROJECT MANAGER',
  'مهندس مدني': 'CIVIL ENGINEER',
  'مهندس ميداني': 'FIELD ENGINEER',
  'مسؤول مخازن': 'STOREKEEPER',
  'عامل مستودع': 'WAREHOUSE WORKER',
  'مساح': 'SURVEYOR',
  'مساعد إداري': 'ADMINISTRATIVE ASSISTANT',
  'سكرتير': 'SECRETARY',
  'مدير مالي': 'FINANCIAL MANAGER',
  'مدير موارد بشرية': 'HR MANAGER',
  'مسؤول مشتريات': 'PROCUREMENT OFFICER',
};

let _natOverrides: Record<string, string> = {};
let _jobOverrides: Record<string, string> = {};

export function applyTranslationOverrides(
  nat: Record<string, string>,
  job: Record<string, string>,
) {
  _natOverrides = nat;
  _jobOverrides = job;
}

export function getNationalityEn(ar: string | null | undefined): string {
  if (!ar) return '—';
  const key = ar.trim();
  return _natOverrides[key] ?? BASE_NATIONALITY_EN[key] ?? ar;
}

/**
 * البحث **الصارم** عن المسمى الإنجليزي: يعيد القيمة المعتمدة (تجاوز الإعدادات ثم
 * الجدول الأساسي)، و`null` حين لا يوجد مصدر معتمد — فلا يُخترع نصّ إنجليزي ولا
 * يُعاد النصّ العربي متنكّرًا في هيئة ترجمة.
 *
 * `getJobTitleEn` أدناه يبقى كما كان حرفًا بحرف (يتراجع إلى العربي) لأن النماذج
 * الإنجليزية القائمة تعتمد على ذلك التراجع؛ هذا الباب الصارم أُضيف للكشف الثنائي
 * اللغة الذي يجب أن يُخفي الشقّ الإنجليزي بدل تكرار العربي.
 */
export function lookupJobTitleEn(ar: string | null | undefined): string | null {
  if (!ar) return null;
  const key = ar.trim();
  return _jobOverrides[key] ?? BASE_JOB_TITLE_EN[key] ?? null;
}

export function getJobTitleEn(ar: string | null | undefined): string {
  if (!ar) return '—';
  return lookupJobTitleEn(ar) ?? ar;
}

const PRIORITY_EN: Record<string, string> = {
  LOW:    'Low',
  MEDIUM: 'Medium',
  HIGH:   'High',
  URGENT: 'Urgent',
};

export function getPriorityLabelEn(key: string): string {
  return PRIORITY_EN[key.toUpperCase()] ?? key;
}

export function getPriorityEn(ar: string | null | undefined): string {
  if (!ar) return '—';
  // Map Arabic priority labels to English equivalents
  const AR_TO_EN: Record<string, string> = {
    'منخفضة': 'Low',
    'متوسطة': 'Medium',
    'عالية': 'High',
    'عاجل': 'Urgent',
  };
  return AR_TO_EN[ar.trim()] ?? ar;
}
