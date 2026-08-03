import { normalizeSearch } from '../lib/arabicSearch';

/**
 * fontRegistry — المصدر الوحيد لسلاسل الخطوط وبيانات الخطوط في الواجهة
 * (Font Foundation Pack v1 + Font Registry Enhancement Pack v2).
 *
 * ما هذا الملف
 * ────────────
 * قبل هذه الحزمة كانت سلسلة خطوط الواجهة مكتوبة **نصًّا حرفيًا** في أكثر من عشرين
 * موضعًا (مكوّنات الرسوم، أنماط سطرية، ملفات CSS)، بثلاث صيغ كتابة مختلفة تُنتج
 * القيمة المحسوبة نفسها. أي تعديل مستقبلي كان يعني تتبّع كل موضع يدويًا. هذا الملف
 * يجمعها في تعريف واحد.
 *
 * سياسة الحزمة الأولى: **معماري لا بصري.**
 * كل ثابت هنا يساوي حرفيًا ما كان مكتوبًا في مواضعه — نفس العائلات، نفس الترتيب،
 * نفس الاحتياط. لم يُضف وزن، ولم يُحذف احتياط، ولم يتغيّر خط أي سطح.
 *
 * لماذا ثوابت TypeScript وليست متغيّرات CSS فقط؟
 * ────────────────────────────────────────────
 * متغيّرات CSS (`--app-font-ui` في `app/theme.css`) تغطّي ملفات CSS وحدها. لكن Recharts
 * يمرّر `tick={{ fontFamily }}` فيُصيَّر **خاصية عرض على عنصر SVG** (`font-family`
 * attribute)، و`var(...)` **لا يعمل في خصائص العرض**. لذلك تحتاج تلك المواضع قيمة
 * نصية فعلية — وهي `UI_FONT_STACK` أدناه. الملفان (هذا و`theme.css`) وجهان لتعريف
 * واحد، ويجب أن يبقيا متطابقين.
 *
 * ما لم يُوحَّد عمدًا في هذه الحزمة (سلاسل **مختلفة فعلًا** — توحيدها يغيّر الاحتياط
 * المرئي، فهو قرار بصري مستقل لا تنظيم معماري):
 *   · `pages/BankAccounts.tsx`            → بلا Tajawal
 *   · `pages/BankSalaryAnalytics.tsx:1209`→ IBM Plex ثم Arial مباشرةً
 *   · `pages/BankAccountExplorer.tsx`     → ثابت `ARABIC_FONT` بلا Tajawal ولا Arial
 *   · `components/DateCalendarPicker.css` → يبدأ بـ Inter
 *   · `components/RootErrorBoundary.css`  → سطح الانهيار: يبقى نصًّا صريحًا كي لا
 *                                            يعتمد على أي متغيّر قد لا يُحمَّل
 *   · `print-templates/utils/textStyleOverrides.ts` → **خيار يختاره المستخدم** في
 *                                            مصمّم النصوص؛ تغييره يغيّر مستندات محفوظة
 *   · `"IBM Plex Mono"` في محرّر الشيكات ومواضع `monospace` المتفرقة
 */

/* ══════════════════════════════════════════════════════════════════════════
   FontRegistry — سجل الخطوط (Font Registry Enhancement Pack v2)
   ══════════════════════════════════════════════════════════════════════════

   الفرق بين هذا القسم وبقية الملف
   ───────────────────────────────
   بقية الملف تعرّف **سلاسل** خطوط (`UI_FONT_STACK` وأخواتها): «أي سلسلة
   يستعمل هذا السطح». هذا القسم يعرّف **الخطوط المتاحة وخصائص كل واحد**:
   اسمه، تصنيفه، أوزانه الحقيقية، ما يصلح له، ومقاسه الافتراضي.

   بعده لا يُكتب اسم عائلة خط نصًّا حرفيًا في أي ملف؛ يُقرأ من
   `FontRegistry`، ولا تحتاج أي شاشة إلى منطق خاص بها لاختيار خط.

   من أين تُحمَّل كل عائلة (أربعة مصادر، وهذا مقصود — الشرح الكامل في
   `assets/fonts/fonts.css`):
     · `assets/fonts/fonts.css` ← الثماني عائلات المستندية.
     · `styles/fonts.css`       ← `IBM Plex Sans Arabic` و `Tajawal`.
     · `@fontsource/cairo`      ← `Cairo` (أوزان 400/600/700).
     · نظام التشغيل             ← `Tahoma`؛ الملف المرفق `103-Tahoma.ttf`
       **غير معلَن** عمدًا كي لا يحجب خط ويندوز على الأسطح التي تستعمله اليوم.

   ما مصدر كل حقل — وهذا يهم
   ─────────────────────────
   `weights` و `supportsBold` و `supportsItalic` **مقيسة** من ملفات الخطوط
   نفسها (جدول `name`/`OS/2`، وقياس مساحة الحبر لترتيب أوزان PFDin)، ويحرسها
   `__tests__/fontRegistryMetadata.test.ts` بمقارنتها بقواعد `@font-face`
   الفعلية — فلا تنحرف عن الواقع بصمت.

   `defaultSize` و `defaultLineHeight` و `category` و `recommendedFor` **قرارات
   تحريرية** لا قياسات: نقاط انطلاق للمحرّرات المستقبلية. تغييرها قرار ذوقي
   مشروع، وهي لا تؤثّر على أي سطح اليوم لأن لا أحد يقرأها بعد.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * تصنيف الخط — محور واحد لا محاور متعدّدة، كي تبقى التصفية في المنتقي قراراً
 * واحداً لا تقاطع مجموعات.
 *
 * · `UI`         خطوط الواجهة والجداول والأرقام (وما يحمّله التطبيق أصلًا).
 * · `Official`   خطوط الكتب والمخاطبات والعقود الرسمية.
 * · `Modern`     خطوط هندسية حديثة للعناوين والعروض.
 * · `Classic`    خطوط نسخ كلاسيكية للمتون الطويلة والكتب.
 * · `Decorative` خطوط عرض وزخرفة — للعناوين الكبيرة والشهادات لا للمتن.
 */
export type FontCategory = 'UI' | 'Official' | 'Modern' | 'Classic' | 'Decorative';

/** الاستعمالات التي يوصى بها لخط ما — نفس المفردات التي يقبلها `getDefaultFontFor`. */
export type FontUsage =
  | 'ui'
  | 'body'
  | 'headings'
  | 'tables'
  | 'numbers'
  | 'letters'
  | 'contracts'
  | 'books'
  | 'certificates'
  | 'display'
  | 'quran';

/** اتجاه النص الذي صُمّم الخط له. الاثنتا عشرة عائلة كلها عربية الأصل. */
export type TextDirection = 'rtl' | 'ltr';

/**
 * نص المعاينة الموحّد. **مشترك عمدًا**: المقارنة بين خطين لا تصحّ إلا على نفس
 * النص. الحقل يبقى لكل خط على حدة في `FontMeta` كي يستطيع خط بعينه أن يخالف
 * لاحقًا (خط أرقام مثلًا) دون تغيير العقد.
 */
export const DEFAULT_FONT_PREVIEW_TEXT = 'بسم الله الرحمن الرحيم\nشركة المنار الدولية';

/** وصف خط واحد في السجل. كل الحقول للقراءة فقط — السجل ثابت لا حالة. */
export interface FontMeta {
  /** المفتاح في `FontRegistry`. يطابق المفتاح دائمًا (يحرسه اختبار). */
  readonly id: string;
  /** اسم العائلة كما يُكتب في `font-family` — لا اسم الملف ولا اسم مستعار. */
  readonly family: string;
  /** الاسم المعروض للمستخدم في المنتقي. */
  readonly displayName: string;
  readonly category: FontCategory;
  /** مرادفات للبحث فقط — لا تُعرض. تُغطّي الاسم العربي والاختصارات الشائعة. */
  readonly aliases: readonly string[];
  readonly recommendedFor: readonly FontUsage[];
  /** مقاس الانطلاق بالبكسل في المحرّرات — قرار تحريري لا قياس. */
  readonly defaultSize: number;
  /** ارتفاع السطر الافتراضي (نسبة) — قرار تحريري لا قياس. */
  readonly defaultLineHeight: number;
  /** هل يملك الخط وجهًا عريضًا **حقيقيًا** (وزن ≥ 600)؟ إن كان `false` فالمتصفح يصطنعه. */
  readonly supportsBold: boolean;
  /** هل يملك الخط وجهًا مائلًا **حقيقيًا**؟ إن كان `false` فالمتصفح يميله اصطناعًا. */
  readonly supportsItalic: boolean;
  /**
   * التسطير `text-decoration` لا علاقة له بملف الخط — يعمل مع كل خط. الحقل
   * موجود في العقد كي يستطيع خط بذيول عميقة أن يمنعه لاحقًا لأسباب بصرية.
   */
  readonly supportsUnderline: boolean;
  /** الأوزان المُعلَنة فعلًا بـ`@font-face` (أو التي يشحنها النظام لـ`Tahoma`)، تصاعديًا. */
  readonly weights: readonly number[];
  readonly direction: TextDirection;
  readonly previewText: string;
  /** `false` يُخفي الخط من المنتقي دون حذف بياناته — والمستندات المحفوظة تظل تجده بـ`getFont`. */
  readonly enabled: boolean;
}

/**
 * الخطوط الاثنا عشر. المفتاح هو `id`، والقيمة هي كل ما يعرفه النظام عن الخط.
 *
 * `satisfies` لا `:` — كي يبقى نوع المفاتيح حرفيًا (فيصحّ `FontId`) بينما
 * تُفحَص كل حقول البيانات مقابل `FontMeta` وقت الترجمة.
 */
export const FontRegistry = {
  // ── UI ────────────────────────────────────────────────────────────────
  ibmPlexArabic: {
    id: 'ibmPlexArabic',
    family: 'IBM Plex Sans Arabic',
    displayName: 'IBM Plex Sans Arabic',
    category: 'UI',
    aliases: ['بلكس', 'آي بي إم', 'plex', 'ibm'],
    recommendedFor: ['ui', 'tables', 'numbers', 'body'],
    defaultSize: 14,
    defaultLineHeight: 1.55,
    supportsBold: true,
    supportsItalic: false,
    supportsUnderline: true,
    weights: [400, 500, 600, 700],
    direction: 'rtl',
    previewText: DEFAULT_FONT_PREVIEW_TEXT,
    enabled: true,
  },
  cairo: {
    id: 'cairo',
    family: 'Cairo',
    displayName: 'Cairo',
    category: 'UI',
    aliases: ['القاهرة', 'كايرو'],
    recommendedFor: ['body', 'headings', 'letters', 'ui'],
    defaultSize: 16,
    defaultLineHeight: 1.6,
    supportsBold: true,
    supportsItalic: false,
    supportsUnderline: true,
    // ثلاثة أوزان فقط لأن `@fontsource/cairo` يحمّل 400/600/700؛ ملفات
    // `assets/fonts/Cairo-*.ttf` الثمانية **غير معلَنة** عمدًا (حزمة v1).
    weights: [400, 600, 700],
    direction: 'rtl',
    previewText: DEFAULT_FONT_PREVIEW_TEXT,
    enabled: true,
  },
  tajawal: {
    id: 'tajawal',
    family: 'Tajawal',
    displayName: 'Tajawal',
    category: 'UI',
    aliases: ['تجوال', 'تجول'],
    recommendedFor: ['ui', 'headings', 'body'],
    defaultSize: 15,
    defaultLineHeight: 1.6,
    supportsBold: true,
    supportsItalic: false,
    supportsUnderline: true,
    // 600 و 700 يشيران إلى `Tajawal-Bold.woff2` نفسه في `styles/fonts.css` —
    // وزنان مُعلَنان بملف واحد. أُبقي كما هو (وضع قائم، لا تغيير بصري).
    weights: [400, 500, 600, 700],
    direction: 'rtl',
    previewText: DEFAULT_FONT_PREVIEW_TEXT,
    enabled: true,
  },
  tahoma: {
    id: 'tahoma',
    family: 'Tahoma',
    displayName: 'Tahoma',
    category: 'UI',
    aliases: ['تاهوما', 'طاهوما'],
    recommendedFor: ['ui', 'tables', 'numbers'],
    defaultSize: 14,
    defaultLineHeight: 1.5,
    supportsBold: true,
    supportsItalic: false,
    supportsUnderline: true,
    // خط نظام: ويندوز يشحن Tahoma و Tahoma Bold فقط. لا `@font-face` له.
    weights: [400, 700],
    direction: 'rtl',
    previewText: DEFAULT_FONT_PREVIEW_TEXT,
    enabled: true,
  },

  // ── Official ──────────────────────────────────────────────────────────
  traditionalArabic: {
    id: 'traditionalArabic',
    family: 'Traditional Arabic',
    displayName: 'Traditional Arabic',
    category: 'Official',
    aliases: ['تقليدي', 'العربي التقليدي', 'trad'],
    recommendedFor: ['letters', 'contracts', 'certificates', 'headings'],
    defaultSize: 18,
    defaultLineHeight: 1.45,
    supportsBold: false,
    supportsItalic: false,
    supportsUnderline: true,
    weights: [400],
    direction: 'rtl',
    previewText: DEFAULT_FONT_PREVIEW_TEXT,
    enabled: true,
  },
  simplifiedArabic: {
    id: 'simplifiedArabic',
    family: 'Simplified Arabic Fixed',
    displayName: 'Simplified Arabic Fixed',
    category: 'Official',
    aliases: ['المبسط', 'العربي المبسط', 'simplified'],
    recommendedFor: ['letters', 'contracts', 'tables'],
    defaultSize: 16,
    defaultLineHeight: 1.5,
    supportsBold: false,
    supportsItalic: false,
    supportsUnderline: true,
    weights: [400],
    direction: 'rtl',
    previewText: DEFAULT_FONT_PREVIEW_TEXT,
    enabled: true,
  },
  amiri: {
    id: 'amiri',
    family: 'Amiri',
    displayName: 'Amiri',
    category: 'Official',
    aliases: ['أميري', 'اميري'],
    recommendedFor: ['body', 'books', 'letters', 'contracts', 'certificates'],
    defaultSize: 16,
    defaultLineHeight: 1.35,
    supportsBold: true,
    supportsItalic: true,
    supportsUnderline: true,
    weights: [400, 700],
    direction: 'rtl',
    previewText: DEFAULT_FONT_PREVIEW_TEXT,
    enabled: true,
  },

  // ── Classic ───────────────────────────────────────────────────────────
  scheherazade: {
    id: 'scheherazade',
    family: 'Scheherazade New',
    displayName: 'Scheherazade New',
    category: 'Classic',
    aliases: ['شهرزاد', 'شيهرزاد'],
    recommendedFor: ['books', 'quran', 'body'],
    defaultSize: 18,
    defaultLineHeight: 1.5,
    supportsBold: true,
    supportsItalic: false,
    supportsUnderline: true,
    weights: [400, 500, 600, 700],
    direction: 'rtl',
    previewText: DEFAULT_FONT_PREVIEW_TEXT,
    enabled: true,
  },
  droidNaskh: {
    id: 'droidNaskh',
    family: 'Droid Arabic Naskh',
    displayName: 'Droid Arabic Naskh',
    category: 'Classic',
    aliases: ['نسخ', 'درويد', 'droid', 'naskh'],
    recommendedFor: ['body', 'books', 'letters'],
    defaultSize: 16,
    defaultLineHeight: 1.6,
    supportsBold: false,
    supportsItalic: false,
    supportsUnderline: true,
    weights: [400],
    direction: 'rtl',
    previewText: DEFAULT_FONT_PREVIEW_TEXT,
    enabled: true,
  },

  // ── Modern ────────────────────────────────────────────────────────────
  pdfDinArabic: {
    id: 'pdfDinArabic',
    family: 'PFDinTextArabic',
    displayName: 'PF Din Text Arabic',
    category: 'Modern',
    aliases: ['دين', 'بي اف دين', 'din', 'pfdin'],
    recommendedFor: ['headings', 'display', 'ui', 'numbers'],
    defaultSize: 15,
    defaultLineHeight: 1.5,
    supportsBold: true,
    supportsItalic: false,
    supportsUnderline: true,
    // ثمانية أوزان رُتِّبت بقياس مساحة الحبر لا بالتخمين — الشرح في
    // `assets/fonts/fonts.css`.
    weights: [100, 150, 200, 300, 400, 500, 700, 900],
    direction: 'rtl',
    previewText: DEFAULT_FONT_PREVIEW_TEXT,
    enabled: true,
  },

  // ── Decorative ────────────────────────────────────────────────────────
  sultan: {
    id: 'sultan',
    family: 'Sultan',
    displayName: 'Sultan Medium',
    category: 'Decorative',
    aliases: ['سلطان'],
    recommendedFor: ['display', 'certificates', 'headings'],
    defaultSize: 18,
    defaultLineHeight: 1.5,
    supportsBold: false,
    supportsItalic: false,
    supportsUnderline: true,
    weights: [500],
    direction: 'rtl',
    previewText: DEFAULT_FONT_PREVIEW_TEXT,
    enabled: true,
  },
  ptBoldHeading: {
    id: 'ptBoldHeading',
    family: 'PT Bold Heading',
    displayName: 'PT Bold Heading',
    category: 'Decorative',
    aliases: ['بي تي', 'عناوين', 'pt'],
    recommendedFor: ['headings', 'display', 'certificates'],
    defaultSize: 20,
    defaultLineHeight: 1.3,
    supportsBold: false,
    supportsItalic: false,
    supportsUnderline: true,
    // «Bold» جزء من اسم العائلة لا من وزنها؛ الملف يُصرّح 400.
    weights: [400],
    direction: 'rtl',
    previewText: DEFAULT_FONT_PREVIEW_TEXT,
    enabled: true,
  },
} as const satisfies Record<string, FontMeta>;

/** معرّف خط في السجل — `'cairo' | 'amiri' | …`. */
export type FontId = keyof typeof FontRegistry;

/** اسم عائلة خط مسجَّل — `'Cairo' | 'Amiri' | …`. */
export type FontFamilyName = (typeof FontRegistry)[FontId]['family'];

/** كل المعرّفات بترتيب التعريف (مجموعة تلو مجموعة). */
export const FONT_IDS = Object.keys(FontRegistry) as FontId[];

/** كل التصنيفات بترتيب العرض المقصود في المنتقي. */
export const FONT_CATEGORIES: readonly FontCategory[] = [
  'UI',
  'Official',
  'Modern',
  'Classic',
  'Decorative',
];

/**
 * التسمية العربية لكل تصنيف. تعيش هنا لا داخل المنتقي كي لا تكتب كل شاشة
 * ترجمتها الخاصة فتتفرّق التسميات — واجهة النظام عربية والتصنيف إنجليزي.
 */
export const FONT_CATEGORY_LABELS_AR: Readonly<Record<FontCategory, string>> = {
  UI: 'واجهة',
  Official: 'رسمي',
  Modern: 'حديث',
  Classic: 'كلاسيكي',
  Decorative: 'زخرفي',
};

/**
 * الخط الافتراضي لكل استعمال. **خريطة صريحة** لا اشتقاق من `recommendedFor`:
 * الاشتقاق («أول خط يذكر هذا الاستعمال») يجعل الافتراضي رهينة ترتيب التعريف،
 * فيتغيّر بصمت عند إضافة خط جديد في المنتصف.
 *
 * يحرس اختبارُ السجل أن كل افتراضي هنا مُفعَّل وأن `recommendedFor` عنده يذكر
 * الاستعمال فعلًا — فلا تتناقض الخريطتان.
 */
const DEFAULT_FONT_BY_USAGE: Readonly<Record<FontUsage, FontId>> = {
  ui: 'ibmPlexArabic',
  body: 'cairo',
  headings: 'cairo',
  tables: 'ibmPlexArabic',
  numbers: 'ibmPlexArabic',
  letters: 'traditionalArabic',
  contracts: 'traditionalArabic',
  books: 'amiri',
  certificates: 'amiri',
  display: 'ptBoldHeading',
  quran: 'scheherazade',
};

/* ── واجهة الاستعلام (API) ────────────────────────────────────────────────
   كل ما تحتاجه أي شاشة. لا شاشة تكتب منطق خطوط خاصًّا بها بعد اليوم. */

/** بيانات خط معروف وقت الترجمة. لا يُرجع `undefined` — المعرّف مضمون. */
export function getFont(id: FontId): FontMeta {
  return FontRegistry[id];
}

/**
 * بحث بمعرّف **غير موثوق** — قيمة قادمة من مستند محفوظ أو إعداد مخزَّن قد
 * تشير إلى خط أُزيل أو أُعيدت تسميته. يُرجع `undefined` بدل الانهيار.
 *
 * فحص الملكية الذاتية لا الفهرسة المباشرة: الفهرسة تصل إلى سلسلة النماذج
 * الأولية، فمستند محفوظ يحمل `"constructor"` أو `"toString"` كان سيُرجع **دالة**
 * تجتاز فحص `undefined`، ثم تنهار عند قراءة `.family` أو تنتج
 * `font-family: undefined`.
 *
 * `hasOwnProperty.call` لا `Object.hasOwn`: الأخير يتطلّب `lib: es2022` بينما
 * `tsconfig` الواجهة أقدم — ورفع الهدف تغيير خارج نطاق حزمة الخطوط.
 */
export function findFont(id: string | null | undefined): FontMeta | undefined {
  if (!id) return undefined;
  if (!Object.prototype.hasOwnProperty.call(FontRegistry, id)) return undefined;
  return (FontRegistry as Record<string, FontMeta>)[id];
}

/** هل هذا النص معرّف خط مسجَّل؟ حارس نوع لقيم المستندات المحفوظة. */
export function isFontId(id: string | null | undefined): id is FontId {
  return findFont(id) !== undefined;
}

/** كل الخطوط بما فيها المعطَّلة — للتدقيق والإدارة لا للعرض. */
export function getAllFonts(): FontMeta[] {
  return FONT_IDS.map((id) => FontRegistry[id]);
}

/** الخطوط المتاحة للاختيار. هذا ما تعرضه المنتقيات. */
export function getEnabledFonts(): FontMeta[] {
  return getAllFonts().filter((f) => f.enabled);
}

/** خطوط تصنيف واحد — المعطَّلة مستبعَدة لأن الوجهة عرضٌ للمستخدم. */
export function getFontsByCategory(category: FontCategory): FontMeta[] {
  return getEnabledFonts().filter((f) => f.category === category);
}

/** خطوط الكتب والمخاطبات الرسمية (تصنيف `Official`). */
export function getOfficialFonts(): FontMeta[] {
  return getFontsByCategory('Official');
}

/** خطوط الواجهة (تصنيف `UI`). */
export function getUIFonts(): FontMeta[] {
  return getFontsByCategory('UI');
}

/** الخطوط الموصى بها لاستعمال ما — كلها، لا الافتراضي وحده. */
export function getFontsFor(usage: FontUsage): FontMeta[] {
  return getEnabledFonts().filter((f) => f.recommendedFor.includes(usage));
}

/** الخط الافتراضي لاستعمال ما. دالة كلّية — لكل استعمال افتراضي معرَّف. */
export function getDefaultFontFor(usage: FontUsage): FontMeta {
  return FontRegistry[DEFAULT_FONT_BY_USAGE[usage]];
}

/**
 * اسم العائلة مقتبسًا للاستعمال داخل `font-family` — أغلب الأسماء متعددة
 * الكلمات وتحتاج اقتباسًا، فالدالة تضمنه بدل تركه لكل موضع استدعاء.
 */
export function fontFamilyValue(id: FontId): string {
  return `"${FontRegistry[id].family}"`;
}

/**
 * سلسلة خطوط تبدأ بالعائلة المطلوبة وتنتهي بالاحتياط العام. الاحتياط مطابق
 * لذيل `DOC_FONT_STACK` القائم، فأي سلسلة تُبنى هنا تتدهور كما تتدهور
 * سلاسل المستندات اليوم.
 */
export function fontStackFor(id: FontId): string {
  return `${fontFamilyValue(id)}, Arial, sans-serif`;
}

/**
 * سلسلة خطوط من بيانات خط — نفس مخرَج `fontStackFor` لكن من الكائن مباشرة،
 * فلا يضطر المنتقي إلى تحويل `FontMeta` إلى معرّف ثم العودة إلى السجل.
 */
export function fontStackOf(meta: FontMeta): string {
  return `"${meta.family}", Arial, sans-serif`;
}

/**
 * هل يطابق الخط نص بحث **مُطبَّعًا مسبقًا**؟ يبحث في الاسم المعروض واسم العائلة
 * والمعرّف والتصنيف والمرادفات — فيصل «trad» إلى Traditional Arabic، و«نسخ»
 * إلى Droid Arabic Naskh، و«official» إلى كل خطوط الكتب الرسمية.
 */
export function fontMatchesQuery(meta: FontMeta, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const haystack = [meta.displayName, meta.family, meta.id, meta.category, ...meta.aliases];
  return haystack.some((s) => normalizeSearch(s).includes(normalizedQuery));
}

/**
 * بحث في الخطوط. التطبيع هنا هو نفسه المستعمل في `SearchableSelect` — فلا
 * يختلف سلوك البحث بين منتقي الخطوط وبقية قوائم النظام.
 *
 * @param query نص المستخدم الخام (يُطبَّع داخليًا). الفارغ يُرجع القائمة كاملة.
 * @param fonts نطاق البحث — الافتراضي كل الخطوط المُفعَّلة.
 */
export function searchFonts(query: string, fonts: readonly FontMeta[] = getEnabledFonts()): FontMeta[] {
  const q = normalizeSearch(query);
  if (!q) return fonts.slice();
  return fonts.filter((f) => fontMatchesQuery(f, q));
}

/**
 * سلسلة خطوط واجهة النظام — مطابقة حرفيًا لما كان في `app/theme.css` وكل موضع وُحِّد.
 * أي تعديل هنا يجب أن يُعكس في `--app-font-ui` داخل `app/theme.css` (والعكس).
 */
export const UI_FONT_STACK = '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif';

/**
 * خط الرسوم البيانية. مطابق لخط الواجهة اليوم، لكنه ثابت **منفصل** لأن مواضعه
 * تقنيًا مختلفة: خصائص عرض على SVG لا تقبل `var(...)`. الفصل يجعل أي قرار مستقبلي
 * بإفراد خط للرسوم تغييرًا في سطر واحد بدل تتبّع ستة مكوّنات.
 */
export const CHART_FONT_STACK = UI_FONT_STACK;

/**
 * الخط أحادي العرض — للأكواد والأرقام المصطفّة (رموز الحسابات، أرقام العمليات،
 * معرّفات السجلات، جداول المعايرة).
 *
 * كانت هذه السلسلة مكرّرة في **19 موضعًا** بثلاث صيغ اقتباس مختلفة تُنتج القيمة
 * المحسوبة نفسها.
 *
 * نظيره في CSS اسمه `--app-font-mono` (لا `--font-mono`): **Tailwind v4 يملك
 * `--font-mono`** ويعرّفه في `@layer theme`، وتعريفنا غير المُطبَّق في طبقة كان
 * سيتقدّم عليه ويغيّر خط أي مكوّن shadcn يستخدم أداة `font-mono`. انظر الشرح
 * الكامل في `app/theme.css`.
 *
 * ملاحظة موثّقة (اكتشاف تدقيق، **لم يُعالَج هنا عمدًا**): عائلة `IBM Plex Mono`
 * **غير محمَّلة في المشروع إطلاقًا** — لا ملف خط في `assets/fonts`، ولا `@font-face`
 * في `styles/fonts.css`، ولا حزمة `@fontsource`. فكل استخدام يسقط اليوم إلى
 * `monospace` النظام. هذا هو المظهر القائم والمعتمَد بصريًا، وتوحيد النص هنا
 * **لا يغيّره**. إضافة الخط فعليًا تغيير بصري حقيقي ⇒ مرحلة مستقلة.
 */
export const MONO_FONT_STACK = '"IBM Plex Mono", monospace';

/**
 * لغة المستند المطبوع — منفصلة عن لغة الواجهة (`stores/uiStore`) لأن كل نموذج يملك
 * مبدّل لغته الخاص. لا لغات جديدة في هذه الحزمة.
 */
export type DocLang = 'ar' | 'en';

/**
 * خط المستندات (النماذج، المعاينة الدقيقة، الطباعة، PDF) — مطابق حرفيًا لما كان
 * مكتوبًا في `FormLayout` و`composeDocument`.
 */
export const DOC_FONT_STACK = '"Cairo", Arial, sans-serif';

/**
 * عائلة الديفاناغارية — للقالب الثنائي English + हिन्दी في النماذج الإدارية.
 * تُعلَن `@font-face` لها في `styles/fonts.css` (ملفان محليان، OFL 1.1).
 */
export const DEVANAGARI_FONT_FAMILY = 'Noto Sans Devanagari';

/**
 * سلسلة خط المستند للقالب الثنائي English + हिन्दी.
 *
 * **Cairo أولًا عمدًا**: اللاتيني والأرقام تُحلّ إلى Cairo تمامًا كما في القالب
 * الإنجليزي الحالي، فالنصف الإنجليزي مطابق بصريًا بلا أي انزياح. لا تُستدعى
 * `Noto Sans Devanagari` إلا لنقاط الترميز التي تعوز Cairo/Arial — أي
 * الديفاناغارية وحدها. `DOC_FONT_STACK` أعلاه **لم يُمَسّ**، فكل نموذج قائم
 * (عربي أو إنجليزي) يبقى على سلسلته الحالية حرفيًا.
 */
export const DOC_FONT_STACK_EN_HI = `"Cairo", "${DEVANAGARI_FONT_FAMILY}", Arial, sans-serif`;

/** العائلة المضمَّنة base64 داخل كل مستند مُولَّد. وزن واحد (Regular) — كما هو اليوم. */
export const EMBEDDED_DOC_FONT_FAMILY = 'Cairo';

/**
 * خط المستند حسب لغته. اللغتان الحاليتان تشتركان في نفس السلسلة (Cairo يغطّي العربية
 * واللاتينية معًا) — فالدالة لا تغيّر أي مخرَج اليوم. وجودها هو نقطة التمديد الوحيدة
 * التي ستحتاجها أي لغة بخط مختلف لاحقًا، فلا يعود على كل مسار طباعة أن يقرّر بنفسه.
 */
export function docFontStack(_lang: DocLang): string {
  return DOC_FONT_STACK;
}

/**
 * يبني كتلة `@font-face` للخط المضمَّن داخل مستند مُولَّد (معاينة دقيقة / طباعة / PDF).
 *
 * كانت هذه الكتلة مكرّرة حرفيًا في `composeDocument.ts` (و`formPdfDocument.ts` سابقًا،
 * قبل تقاعده — المرحلة 5D) بصياغتين مختلفتين تُنتجان القاعدة نفسها. المخرَج هنا هو نفس القاعدة: نفس العائلة، نفس
 * `format('truetype')`، نفس الوزن والنمط.
 *
 * @param dataUri عنوان `data:` للخط بعد تضمينه وقت البناء. حين يفشل التضمين تُرجَع
 *   سلسلة فارغة — نفس التدهور اللطيف القائم: يسقط المستند إلى `Arial` وتشكيل النظام
 *   بدل أن يُصدِر `@font-face` مكسورة.
 */
export function buildEmbeddedFontFaceCss(dataUri: string | undefined): string {
  if (!dataUri) return '';
  return `@font-face { font-family: '${EMBEDDED_DOC_FONT_FAMILY}'; src: url('${dataUri}') format('truetype'); font-weight: normal; font-style: normal; }`;
}
