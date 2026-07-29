/**
 * Administrative Forms — Hindi Business Term Resolution (EN+HI Pilot v1)
 * ─────────────────────────────────────────────────────────────────────
 * طبقة **شقيقة** لـ`lib/businessTerms.ts` تضيف العمود الهندي للقيم الديناميكية
 * (المسمى الوظيفي، القسم، الجنسية، غرض الشهادة) في النماذج الإدارية.
 *
 * لماذا وحدة مستقلة لا توسعة لـ`businessTerms.ts`
 * ───────────────────────────────────────────────
 * توقيع `resolveBusinessTerm(…, lang: Lang)` يقبل `'ar' | 'en'` فقط، و`Lang` هو
 * نوع لغة **الواجهة** الذي يغذّي `DICT: Record<Lang, …>` في `lib/i18n.ts` —
 * فتوسيعه إلى `'hi'` يفرض قاموس واجهة ثالثًا كاملًا. الوحدة الشقيقة تُبقي
 * `businessTerms.ts` مطابقًا بايت-ببايت، فتظل عقود AR/EN القائمة وحُرّاسها
 * (`administrativeFormsEnglishTranslation.test.tsx`) خضراء بلا أي تعديل.
 *
 * ── عزل تام عن عقد العمل (بيانات وكودًا) ──────────────────────────────────────
 * عقد العمل يقرأ `dict.nationalities` / `dict.jobTitles` عبر
 * `forms/shared/contractTranslations.ts` وحده. هذه الوحدة تملك مساحة مفاتيح
 * ثالثة منفصلة (`dict.forms.hi.*`) و**لا تستورد** `contractTranslations`
 * إطلاقًا — نفس الشرط الذي يحرسه `employmentContractExclusionGuard.test.ts`.
 *
 * ── العلاقة بمساحة مفاتيح EN ─────────────────────────────────────────────────
 * `dict.forms.*` (إنجليزي) تبقى كما هي حرفيًا؛ العمود الهندي يعيش في مفاتيح
 * جديدة `dict.forms.hi.*`. المساحتان لا تتقاطعان، وحفظ إحداهما لا يمسّ الأخرى.
 */
import {
  BusinessTermCategory,
  BusinessTermDictionaries,
  BUSINESS_TERM_CATEGORIES,
  resolveBusinessTerm,
} from './businessTerms';
import type { SettingRow } from './businessTerms';

/**
 * مساحة مفاتيح `Setting` الهندية — منفصلة عن `dict.forms.*` (الإنجليزية) وعن
 * `dict.*` (عقد العمل). نفس شكل البيانات القائم (JSON: عربي → هندي) ونفس الجدول
 * الحر، فلا هجرة ولا تغيير في أي سجل موجود.
 */
export const BUSINESS_TERM_HI_SETTING_KEYS: Record<BusinessTermCategory, string> = {
  nationality: 'dict.forms.hi.nationalities',
  jobTitle: 'dict.forms.hi.jobTitles',
  department: 'dict.forms.hi.departments',
  certificatePurpose: 'dict.forms.hi.certificatePurposes',
};

/** بذور الجنسيات بالهندية — تُحرَّر بالكامل من «إعدادات الشركة». */
export const BASE_FORM_NATIONALITY_HI: Record<string, string> = {
  'هندي': 'भारतीय',
  'هندية': 'भारतीय',
  'باكستاني': 'पाकिस्तानी',
  'باكستانية': 'पाकिस्तानी',
  'مصري': 'मिस्री',
  'مصرية': 'मिस्री',
  'سوري': 'सीरियाई',
  'سورية': 'सीरियाई',
  'بنغلاديشي': 'बांग्लादेशी',
  'بنغلاديشية': 'बांग्लादेशी',
  'فلبيني': 'फिलिपीनी',
  'فلبينية': 'फिलिपीनी',
  'نيبالي': 'नेपाली',
  'نيبالية': 'नेपाली',
  'سريلانكي': 'श्रीलंकाई',
  'سريلانكية': 'श्रीलंकाई',
  'كويتي': 'कुवैती',
  'كويتية': 'कुवैती',
  'أردني': 'जॉर्डनी',
  'أردنية': 'जॉर्डनी',
  'يمني': 'यमनी',
  'يمنية': 'यमनी',
  'عراقي': 'इराकी',
  'عراقية': 'इराकी',
  'سوداني': 'सूडानी',
  'سودانية': 'सूडानी',
  'لبناني': 'लेबनानी',
  'لبنانية': 'लेबनानी',
};

/** بذور المسميات الوظيفية بالهندية. */
export const BASE_FORM_JOB_TITLE_HI: Record<string, string> = {
  'سائق': 'चालक',
  'سائق شاحنة': 'ट्रक चालक',
  'سائق شاحنة قلاب': 'डंपर ट्रक चालक',
  'سائق سيارة خصوصي': 'निजी कार चालक',
  'سائق عموم آليات الطرق': 'सड़क मशीनरी चालक',
  'مساعد سائق': 'चालक सहायक',
  'عامل': 'श्रमिक',
  'عامل عام': 'सामान्य श्रमिक',
  'فني': 'तकनीशियन',
  'فني صيانة': 'अनुरक्षण तकनीशियन',
  'مشرف': 'पर्यवेक्षक',
  'مهندس': 'अभियंता',
  'مهندس مدني': 'सिविल अभियंता',
  'مهندس ميداني': 'क्षेत्र अभियंता',
  'محاسب': 'लेखाकार',
  'حارس': 'गार्ड',
  'مشغل معدات ثقيلة': 'भारी मशीन चालक',
  'مشغل حفار': 'खुदाई मशीन चालक',
  'مشغل مدحلة': 'रोलर चालक',
  'مشغل شيول': 'लोडर चालक',
  'ميكانيكي': 'मैकेनिक',
  'كهربائي': 'इलेक्ट्रीशियन',
  'لحام': 'वेल्डर',
  'نجار': 'बढ़ई',
  'بناء': 'राजमिस्त्री',
  'مراقب': 'निरीक्षक',
  'مدير مشروع': 'परियोजना प्रबंधक',
  'مسؤول مخازن': 'भंडार प्रभारी',
  'عامل مستودع': 'गोदाम श्रमिक',
  'مساح': 'सर्वेक्षक',
  'مساعد إداري': 'प्रशासनिक सहायक',
  'سكرتير': 'सचिव',
  'مدير مالي': 'वित्त प्रबंधक',
  'مدير موارد بشرية': 'मानव संसाधन प्रबंधक',
  'مسؤول مشتريات': 'क्रय अधिकारी',
  'مندوب مبيعات': 'विक्रय प्रतिनिधि',
};

/** بذور الأقسام بالهندية. */
export const BASE_DEPARTMENT_HI: Record<string, string> = {
  'السائقين': 'चालक विभाग',
  'السائقون': 'चालक विभाग',
  'الإدارة': 'प्रशासन',
  'الإدارة العامة': 'सामान्य प्रशासन',
  'الموارد البشرية': 'मानव संसाधन',
  'المحاسبة': 'लेखा',
  'المالية': 'वित्त',
  'المشاريع': 'परियोजनाएँ',
  'العمليات': 'संचालन',
  'الصيانة': 'अनुरक्षण',
  'الورشة': 'कार्यशाला',
  'المعدات': 'उपकरण',
  'المخازن': 'भंडार',
  'المشتريات': 'क्रय',
  'المبيعات': 'विक्रय',
  'الهندسة': 'अभियांत्रिकी',
  'الأمن': 'सुरक्षा',
  'تقنية المعلومات': 'सूचना प्रौद्योगिकी',
};

/** لا بذور افتراضية لأغراض الشهادات — نص حر يملؤه المستخدم عند الحاجة. */
export const BASE_CERTIFICATE_PURPOSE_HI: Record<string, string> = {};

/** البذور الهندية المدمجة. تُدمج فوقها قواميس «إعدادات الشركة» فتفوز الأخيرة. */
export const BASE_BUSINESS_TERMS_HI: Record<BusinessTermCategory, Record<string, string>> = {
  nationality: BASE_FORM_NATIONALITY_HI,
  jobTitle: BASE_FORM_JOB_TITLE_HI,
  department: BASE_DEPARTMENT_HI,
  certificatePurpose: BASE_CERTIFICATE_PURPOSE_HI,
};

/** القواميس الهندية الافتراضية — نسخة جديدة في كل نداء (لا حالة مشتركة). */
export function defaultBusinessTermHiDictionaries(): BusinessTermDictionaries {
  return {
    nationality: { ...BASE_BUSINESS_TERMS_HI.nationality },
    jobTitle: { ...BASE_BUSINESS_TERMS_HI.jobTitle },
    department: { ...BASE_BUSINESS_TERMS_HI.department },
    certificatePurpose: { ...BASE_BUSINESS_TERMS_HI.certificatePurpose },
  };
}

function parseDictionaryValue(raw: string | undefined): Record<string, string> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [ar, hi] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof hi === 'string') out[ar] = hi;
    }
    return out;
  } catch {
    // إعداد تالف — نتجاهله ونبقى على البذور بدل إسقاط الشاشة.
    return null;
  }
}

/**
 * يبني القواميس الهندية من صفوف `/settings`. السجلات القديمة (التي لا تحمل
 * المفاتيح الجديدة إطلاقًا) صالحة تمامًا: كل فئة تعود إلى بذورها المدمجة.
 *
 * الدمج **إضافي**: البذرة أولًا ثم إعدادات المستخدم فوقها.
 */
export function parseBusinessTermHiDictionaries(rows: readonly SettingRow[]): BusinessTermDictionaries {
  const dicts = defaultBusinessTermHiDictionaries();
  for (const category of BUSINESS_TERM_CATEGORIES) {
    const raw = rows.find((r) => r.key === BUSINESS_TERM_HI_SETTING_KEYS[category])?.value;
    const stored = parseDictionaryValue(raw);
    if (stored) dicts[category] = { ...BASE_BUSINESS_TERMS_HI[category], ...stored };
  }
  return dicts;
}

/**
 * **سياسة السقوط المركزية الوحيدة** للقالب الثنائي:
 *   1. ترجمة هندية مُهيّأة   → تُعرض.
 *   2. لا هندية، وهناك إنجليزية → الإنجليزية (عبر `resolveBusinessTerm` نفسها،
 *      فلا تُكرَّر سياسة EN هنا ولا تنحرف عنها).
 *   3. لا هندية ولا إنجليزية  → القيمة العربية المخزَّنة كما هي. لا اختراع ترجمة.
 *   4. قيمة فارغة             → الشرطة `dash`.
 *
 * لا تُكرَّر هذه القواعد في أي قالب؛ كل قالب ثنائي ينادي هذه الدالة.
 */
export function resolveBusinessTermHi(
  hiDictionaries: BusinessTermDictionaries,
  enDictionaries: BusinessTermDictionaries,
  category: BusinessTermCategory,
  value: string | null | undefined,
  dash = '—',
): string {
  const stored = value?.trim();
  if (!stored) return dash;
  const hi = hiDictionaries[category]?.[stored];
  if (hi && hi.trim()) return hi.trim();
  // السقوط إلى الإنجليزية يمرّ بالدالة المركزية القائمة — لا نسخة ثانية من سياستها.
  return resolveBusinessTerm(enDictionaries, category, stored, 'en', dash);
}
