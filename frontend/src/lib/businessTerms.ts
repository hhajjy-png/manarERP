/**
 * Administrative Forms — Business Term Resolution (v1)
 * ────────────────────────────────────────────────────
 * المصدر الوحيد لترجمة **القيم الديناميكية** (لا التسميات الثابتة) المعروضة داخل
 * النماذج الإدارية عند التبديل إلى الإنجليزية: المسمى الوظيفي، القسم، الجنسية،
 * وغرض الشهادة.
 *
 * المبادئ:
 *   • العربي هو مصدر الحقيقة المخزَّن. الإنجليزي **ترجمة مُهيّأة** يحرّرها المستخدم
 *     من «إعدادات الشركة» ولا يخترعها النظام وقت الطباعة.
 *   • قاموس واحد لكل فئة، يُخزَّن في جدول `Setting` الحر (JSON: عربي → إنجليزي).
 *     لا جداول جديدة، لا هجرة، لا تغيير في السجلات القائمة.
 *   • سياسة سقوط (fallback) **مركزية واحدة**: عند غياب الترجمة الإنجليزية تُعرض
 *     القيمة العربية المخزَّنة كما هي. لا تخمين، ولا خريطة ترجمة داخل أي نموذج.
 *
 * ── عزل تام عن عقد العمل (بيانات وكودًا) ──────────────────────────────────────
 * عقد العمل يملك قاموسه الخاص تحت `dict.nationalities` / `dict.jobTitles` ويقرأه
 * عبر `forms/shared/contractTranslations.ts` وحده. النماذج الإدارية تملك مساحة
 * مفاتيح منفصلة (`dict.forms.*`) وبذورًا خاصة بها هنا. لذلك:
 *   • هذا الملف **لا يستورد** `contractTranslations` إطلاقًا.
 *   • تعديل أي قاموس من قواميس النماذج الإدارية لا يمسّ العقد.
 *   • تعديل قاموس العقد لا يمسّ أي نموذج إداري.
 * يحرس هذا العقدَ `employmentContractExclusionGuard.test.ts`.
 */
import type { Lang } from '../stores/uiStore';

/** فئات القيم التجارية القابلة للترجمة التي اكتشفها تدقيق النماذج. */
export type BusinessTermCategory =
  | 'jobTitle'
  | 'department'
  | 'nationality'
  | 'certificatePurpose';

export const BUSINESS_TERM_CATEGORIES: readonly BusinessTermCategory[] = [
  'nationality',
  'jobTitle',
  'department',
  'certificatePurpose',
] as const;

/**
 * مساحة مفاتيح `Setting` الخاصة بالنماذج الإدارية — منفصلة تمامًا عن مفاتيح عقد
 * العمل. نفس شكل البيانات القائم (JSON: عربي → إنجليزي) ونفس الجدول الحر، فلا
 * هجرة ولا تغيير في أي سجل موجود.
 */
export const BUSINESS_TERM_SETTING_KEYS: Record<BusinessTermCategory, string> = {
  nationality: 'dict.forms.nationalities',
  jobTitle: 'dict.forms.jobTitles',
  department: 'dict.forms.departments',
  certificatePurpose: 'dict.forms.certificatePurposes',
};

/**
 * مفاتيح قاموس **عقد العمل** — مُعلَنة هنا للتوثيق وللحراسة فقط. لا شيء في مسار
 * النماذج الإدارية يقرأ هذه المفاتيح أو يكتبها.
 */
export const EMPLOYMENT_CONTRACT_SETTING_KEYS = ['dict.nationalities', 'dict.jobTitles'] as const;

/**
 * بذور جنسيات النماذج الإدارية — نسخة مستقلة مملوكة لهذه الوحدة.
 * صياغتها بحالة العنوان (Title Case) لأن النماذج الإدارية مستندات مكتبية، بخلاف
 * عقد العمل الرسمي الذي يحتفظ بصياغته بالأحرف الكبيرة في قاموسه الخاص.
 */
export const BASE_FORM_NATIONALITY_EN: Record<string, string> = {
  'هندي': 'Indian',
  'هندية': 'Indian',
  'باكستاني': 'Pakistani',
  'باكستانية': 'Pakistani',
  'مصري': 'Egyptian',
  'مصرية': 'Egyptian',
  'سوري': 'Syrian',
  'سورية': 'Syrian',
  'تركي': 'Turkish',
  'تركية': 'Turkish',
  'بنغلاديشي': 'Bangladeshi',
  'بنغلاديشية': 'Bangladeshi',
  'فلبيني': 'Filipino',
  'فلبينية': 'Filipino',
  'نيبالي': 'Nepalese',
  'نيبالية': 'Nepalese',
  'سريلانكي': 'Sri Lankan',
  'سريلانكية': 'Sri Lankan',
  'كويتي': 'Kuwaiti',
  'كويتية': 'Kuwaiti',
  'أردني': 'Jordanian',
  'أردنية': 'Jordanian',
  'يمني': 'Yemeni',
  'يمنية': 'Yemeni',
  'إثيوبي': 'Ethiopian',
  'إثيوبية': 'Ethiopian',
  'إندونيسي': 'Indonesian',
  'إندونيسية': 'Indonesian',
  'عراقي': 'Iraqi',
  'عراقية': 'Iraqi',
  'سوداني': 'Sudanese',
  'سودانية': 'Sudanese',
  'تونسي': 'Tunisian',
  'تونسية': 'Tunisian',
  'مغربي': 'Moroccan',
  'مغربية': 'Moroccan',
  'لبناني': 'Lebanese',
  'لبنانية': 'Lebanese',
  'ميانماري': 'Myanmar',
  'ميانمارية': 'Myanmar',
  'كيني': 'Kenyan',
  'كينية': 'Kenyan',
  'غاني': 'Ghanaian',
  'غانية': 'Ghanaian',
};

/** بذور المسميات الوظيفية للنماذج الإدارية — نسخة مستقلة مملوكة لهذه الوحدة. */
export const BASE_FORM_JOB_TITLE_EN: Record<string, string> = {
  'سائق شاحنة': 'Truck Driver',
  'سائق عموم آليات الطرق': 'General Road Equipment Driver',
  'سائق سيارة خصوصي': 'Private Car Driver',
  'مندوب مبيعات': 'Sales Representative',
  'عامل': 'Worker',
  'عامل عام': 'General Worker',
  'فني': 'Technician',
  'فني صيانة': 'Maintenance Technician',
  'مشرف': 'Supervisor',
  'مهندس': 'Engineer',
  'محاسب': 'Accountant',
  'حارس': 'Guard',
  'سائق': 'Driver',
  'مشغل معدات ثقيلة': 'Heavy Equipment Operator',
  'مشغل حفار': 'Excavator Operator',
  'مشغل مدحلة': 'Roller Operator',
  'مشغل شيول': 'Wheel Loader Operator',
  'سائق شاحنة قلاب': 'Dump Truck Driver',
  'ميكانيكي': 'Mechanic',
  'كهربائي': 'Electrician',
  'لحام': 'Welder',
  'نجار': 'Carpenter',
  'بناء': 'Mason',
  'مساعد سائق': 'Driver Assistant',
  'مراقب': 'Inspector',
  'مدير مشروع': 'Project Manager',
  'مهندس مدني': 'Civil Engineer',
  'مهندس ميداني': 'Field Engineer',
  'مسؤول مخازن': 'Storekeeper',
  'عامل مستودع': 'Warehouse Worker',
  'مساح': 'Surveyor',
  'مساعد إداري': 'Administrative Assistant',
  'سكرتير': 'Secretary',
  'مدير مالي': 'Financial Manager',
  'مدير موارد بشرية': 'HR Manager',
  'مسؤول مشتريات': 'Procurement Officer',
};

/** مجموعة إعدادات الأقسام الابتدائية — تُحرَّر بالكامل من «إعدادات الشركة». */
export const BASE_DEPARTMENT_EN: Record<string, string> = {
  'السائقين': 'Drivers',
  'السائقون': 'Drivers',
  'الإدارة': 'Administration',
  'الإدارة العامة': 'General Administration',
  'الموارد البشرية': 'Human Resources',
  'المحاسبة': 'Accounting',
  'المالية': 'Finance',
  'المشاريع': 'Projects',
  'العمليات': 'Operations',
  'الصيانة': 'Maintenance',
  'الورشة': 'Workshop',
  'المعدات': 'Equipment',
  'المخازن': 'Warehouse',
  'المشتريات': 'Procurement',
  'المبيعات': 'Sales',
  'الهندسة': 'Engineering',
  'الأمن': 'Security',
  'تقنية المعلومات': 'Information Technology',
};

/** لا بذور افتراضية لأغراض الشهادات — نص حر يملؤه المستخدم عند الحاجة. */
export const BASE_CERTIFICATE_PURPOSE_EN: Record<string, string> = {};

/**
 * البذور المدمجة للنماذج الإدارية. تُدمج تحتها قواميس «إعدادات الشركة» فتفوز
 * الأخيرة. كلها مملوكة لهذه الوحدة — لا شيء منها مشترك مع عقد العمل.
 */
export const BASE_BUSINESS_TERMS: Record<BusinessTermCategory, Record<string, string>> = {
  nationality: BASE_FORM_NATIONALITY_EN,
  jobTitle: BASE_FORM_JOB_TITLE_EN,
  department: BASE_DEPARTMENT_EN,
  certificatePurpose: BASE_CERTIFICATE_PURPOSE_EN,
};

export type BusinessTermDictionaries = Record<BusinessTermCategory, Record<string, string>>;

/** القواميس الافتراضية قبل تحميل الإعدادات — نسخة جديدة في كل نداء (لا حالة مشتركة). */
export function defaultBusinessTermDictionaries(): BusinessTermDictionaries {
  return {
    nationality: { ...BASE_BUSINESS_TERMS.nationality },
    jobTitle: { ...BASE_BUSINESS_TERMS.jobTitle },
    department: { ...BASE_BUSINESS_TERMS.department },
    certificatePurpose: { ...BASE_BUSINESS_TERMS.certificatePurpose },
  };
}

export interface SettingRow {
  key: string;
  value: string;
}

function parseDictionaryValue(raw: string | undefined): Record<string, string> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [ar, en] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof en === 'string') out[ar] = en;
    }
    return out;
  } catch {
    // إعداد تالف — نتجاهله ونبقى على البذور بدل إسقاط الشاشة.
    return null;
  }
}

/**
 * يبني القواميس من صفوف `/settings`. السجلات القديمة (التي لا تحمل المفاتيح
 * الجديدة) صالحة تمامًا: الفئة غير الموجودة تعود إلى بذورها المدمجة.
 *
 * الدمج **إضافي**: البذرة أولًا ثم إعدادات المستخدم فوقها، فلا تُفقد أي ترجمة
 * مدمجة عندما يحفظ المستخدم قاموسًا جزئيًا.
 */
export function parseBusinessTermDictionaries(rows: readonly SettingRow[]): BusinessTermDictionaries {
  const dicts = defaultBusinessTermDictionaries();
  for (const category of BUSINESS_TERM_CATEGORIES) {
    const raw = rows.find((r) => r.key === BUSINESS_TERM_SETTING_KEYS[category])?.value;
    const stored = parseDictionaryValue(raw);
    if (stored) dicts[category] = { ...BASE_BUSINESS_TERMS[category], ...stored };
  }
  return dicts;
}

/**
 * **سياسة السقوط المركزية الوحيدة** لكل النماذج:
 *   1. اللغة عربية        → القيمة المخزَّنة كما هي.
 *   2. إنجليزية + ترجمة   → الترجمة المُهيّأة.
 *   3. إنجليزية بلا ترجمة → القيمة العربية المخزَّنة كما هي (لا اختراع ترجمة).
 *   4. قيمة فارغة         → الشرطة `dash`.
 *
 * لا تُكرَّر هذه القواعد في أي نموذج؛ كل النماذج تنادي هذه الدالة.
 */
export function resolveBusinessTerm(
  dictionaries: BusinessTermDictionaries,
  category: BusinessTermCategory,
  value: string | null | undefined,
  lang: Lang,
  dash = '—',
): string {
  const stored = value?.trim();
  if (!stored) return dash;
  if (lang !== 'en') return stored;
  const translated = dictionaries[category]?.[stored];
  return translated && translated.trim() ? translated.trim() : stored;
}

/**
 * صفوف محرّر «إعدادات الشركة» لأي قاموس (نماذج إدارية أو عقد عمل): القاموس المحفوظ
 * تحت `settingKey` إن وُجد، وإلا `baseMap`. يحافظ هذا **حرفيًا** على سلوك المحرّر
 * القائم — المحفوظ يحلّ محل المعروض، ولا تعود الصفوف المحذوفة للظهور بعد الحفظ.
 *
 * الدالة لا تعرف شيئًا عن أي مجموعة؛ المفتاح والبذور يأتيان من المُنادي، وهو ما
 * يجعل المحرّر الواحد يخدم مجموعتين معزولتين بلا خلط بينهما.
 */
export function dictionaryEditorRows(
  rows: readonly SettingRow[],
  settingKey: string,
  baseMap: Record<string, string>,
): { ar: string; en: string }[] {
  const raw = rows.find((r) => r.key === settingKey)?.value;
  const map = parseDictionaryValue(raw) ?? baseMap;
  return Object.entries(map).map(([ar, en]) => ({ ar, en: String(en) }));
}

/** يحوّل صفوف محرّر «إعدادات الشركة» إلى قيمة `Setting` المخزَّنة (JSON عربي → إنجليزي). */
export function serializeBusinessTermRows(rows: readonly { ar: string; en: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const ar = row.ar.trim();
    if (!ar) continue;
    out[ar] = row.en.trim();
  }
  return out;
}
