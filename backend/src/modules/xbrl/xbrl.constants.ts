/**
 * ثوابت طبقة جاهزية XBRL — XBRL Readiness Foundation v1.
 *
 * كل ما في هذا الملف **وصفي**: أكواد قواعد تحقق، أنواع قوائم، حدود عرض. لا رقم
 * محاسبي واحد يُشتق من هنا، ولا قيمة واحدة تُغيّر سلوك الترحيل أو الأرصدة.
 *
 * ⚠ لا يوجد في هذا الملف — ولن يوجد قبل وصول المواصفة الرسمية — أي وسم XBRL حكومي
 *   (QAYD) ولا namespace رسمي ولا كود مفهوم رسمي. ما يُكتب هنا يُشتق من مواصفة
 *   موثّقة أو لا يُكتب إطلاقًا.
 */

/** أنواع الحسابات التي تدخل في معادلة القوائم المالية. */
export const FINANCIAL_ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
export type FinancialAccountType = (typeof FINANCIAL_ACCOUNT_TYPES)[number];

export function isFinancialAccountType(type: string): type is FinancialAccountType {
  return (FINANCIAL_ACCOUNT_TYPES as readonly string[]).includes(type);
}

/** العملة والدقة الافتراضية — الدينار الكويتي بثلاث منازل، كبقية النظام. */
export const XBRL_DEFAULT_CURRENCY = 'KWD';
export const XBRL_DEFAULT_DECIMALS = 3;
export const XBRL_DEFAULT_LANGUAGE = 'ar';

/** بادئة ترقيم اللقطات — `XBRLS-<السنة>-00001`. */
export const SNAPSHOT_NUMBER_PREFIX = 'XBRLS';
export const SNAPSHOT_SEQUENCE_WIDTH = 5;

/**
 * أكواد قواعد التحقق — **ثابتة إلى الأبد**.
 *
 * الكود هو العقد بين المحرّك والواجهة وبين نسخة اليوم ونسخة الغد: يُقرأ في اللقطات
 * القديمة، ويُترجم في الواجهة، ويُستشهد به في المراجعة. تغيير معنى كود قائم يُفسد
 * تفسير كل لقطة سابقة — القاعدة الجديدة تأخذ كودًا جديدًا، ولا تُعاد تسمية قديم.
 */
export const XBRL_RULE_CODES = {
  /** ميزان المراجعة غير متوازن (إجمالي المدين ≠ إجمالي الدائن). */
  TRIAL_BALANCE_UNBALANCED: 'ACC-001',
  /** معادلة الميزانية لا تُغلق: الأصول ≠ الالتزامات + حقوق الملكية + نتيجة الفترة. */
  BALANCE_SHEET_EQUATION: 'ACC-002',
  /** حسابات مالية فعّالة بلا ربط. */
  UNMAPPED_FINANCIAL_ACCOUNTS: 'ACC-003',
  /** حساب فعّال بنوع غير معروف — لا يقع في أي طرف من المعادلة. */
  UNCLASSIFIED_ACCOUNT_TYPE: 'ACC-004',

  /** سياق التقرير مفقود أو فترته غير صحيحة. */
  REPORTING_PERIOD_INVALID: 'RPT-001',
  /** فترة المقارنة غير متسقة مع الفترة الحالية. */
  COMPARATIVE_PERIOD_INCONSISTENT: 'RPT-002',
  /** العملة مفقودة أو بصيغة غير صالحة. */
  CURRENCY_MISSING: 'RPT-003',
  /** بيانات الشركة الأساسية ناقصة. */
  ENTITY_INFO_INCOMPLETE: 'RPT-004',

  /** أكثر من ربط فعّال لنفس الحساب بنوافذ سريان متداخلة. */
  CONFLICTING_MAPPING: 'MAP-001',
  /** ربط يشير إلى مفهوم لا ينتمي إلى التصنيف نفسه. */
  INVALID_MAPPING: 'MAP-002',
  /** لا يوجد تصنيف مفعَّل. */
  TAXONOMY_INACTIVE: 'MAP-003',
  /** مفاهيم مطلوبة في التصنيف بلا أي ربط. */
  MISSING_REQUIRED_CONCEPTS: 'MAP-004',
  /** ربط يتيم: حسابه غير فعّال أو مفهومه غير موجود. */
  ORPHAN_MAPPING: 'MAP-005',
  /** بند قائمة مالية مفعَّل بلا مفهوم. */
  STATEMENT_LINE_UNMAPPED: 'MAP-006',

  /** لا يوجد تصنيف رسمي معتمد — الحالة الطبيعية في هذه المرحلة. */
  NO_OFFICIAL_TAXONOMY: 'EXP-001',
} as const;

export type XbrlRuleCode = (typeof XBRL_RULE_CODES)[keyof typeof XBRL_RULE_CODES];

export type XbrlSeverity = 'ERROR' | 'WARNING' | 'INFO';

/** تصنيف القاعدة — يُستخدم للتجميع في الواجهة لا أكثر. */
export type XbrlRuleCategory = 'ACCOUNTING' | 'REPORTING' | 'MAPPING' | 'EXPORT';

/**
 * حالة الجاهزية المعروضة.
 *
 * ⚠ لا توجد ولن توجد في v1 حالة اسمها «QAYD Ready». أقصى ما يبلغه النظام هنا هو
 *   `READY_PENDING_TAXONOMY`: البيانات الداخلية سليمة، والتصنيف الرسمي لم يصل بعد.
 */
export const XBRL_READINESS_STATUS = {
  /** توجد أخطاء تمنع اعتبار البيانات جاهزة. */
  NOT_READY: 'NOT_READY',
  /** لا أخطاء، لكن الربط لم يكتمل أو توجد تنبيهات. */
  IN_PROGRESS: 'IN_PROGRESS',
  /** كل الفحوص الداخلية نجحت — ينقص التصنيف الرسمي وحده. */
  READY_PENDING_TAXONOMY: 'READY_PENDING_TAXONOMY',
} as const;

export type XbrlReadinessStatus = (typeof XBRL_READINESS_STATUS)[keyof typeof XBRL_READINESS_STATUS];

/**
 * الرسالة الوحيدة المسموح بها عند محاولة تصدير رسمي في هذه المرحلة.
 * نصّها جزء من العقد مع المستخدم: لا يجوز تلطيفها ولا الإيحاء بأن التصدير «قريب».
 */
export const NO_OFFICIAL_TAXONOMY_MESSAGE =
  'لم يتم تثبيت Taxonomy رسمية معتمدة للتصدير بعد. النظام جاهز لإضافتها عند توفر المواصفات الرسمية.';

/** صيغ المُصدِّرات المتاحة. لا واحدة منها رسمية في v1. */
export const XBRL_EXPORT_FORMATS = {
  /** مجموعة بيانات داخلية للتطوير والمراجعة — ليست XBRL ولا QAYD ولا instance document. */
  INTERNAL_PREVIEW: 'INTERNAL_PREVIEW',
  /** مستند XBRL رسمي — غير متاح قبل وصول تصنيف رسمي. */
  XBRL_INSTANCE: 'XBRL_INSTANCE',
} as const;
