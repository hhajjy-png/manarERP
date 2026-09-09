/**
 * إقرار دين موظف — نموذج البيانات المشترك بين القوالب الثلاثة (عربي / English / हिन्दी).
 *
 * ═══ لماذا ملف واحد للبيانات وثلاثة ملفات للنصوص ═══
 * ملفات Word الثلاثة (`docs/Iqrar_Dayn_Salfa_Muwazzaf_Kuwait_AR.docx`،
 * `docs/Employee_Loan_Acknowledgment_Kuwait_EN.docx`،
 * `docs/Employee_Loan_Acknowledgment_Kuwait_HI.docx`) **متطابقة البنية حرفيًا**: نفس
 * الأقسام الستة، نفس ترقيم البنود 1–14، نفس الجداول، نفس فواصل الصفحات الثلاثة،
 * ونفس الفراغات المتغيّرة في نفس المواضع. تختلف في **النص وحده** واتجاهه.
 *
 * لذلك: بنيةُ الحقول ومعرِّفاتها تعيش هنا مرة واحدة (فيدخل المستخدم بياناته مرة
 * واحدة لا ثلاثًا)، بينما **نصّ كل لغة يعيش في ملفه الخاص** منقولًا حرفيًا من ملف
 * Word الخاص بها — لا ترجمة وقت التشغيل، ولا اشتقاق نصّ لغة من أخرى.
 *
 * ═══ المصدر ═══
 * كل معرّف حقل أدناه يقابل فراغًا **موجودًا فعلًا** في ملفات Word (سلسلة نقاط أو
 * مربّع اختيار). لم يُضف حقل لأنه «منطقي».
 */

import type { InstallmentRow } from './debtAcknowledgmentSchedule';

/** لغات القالب الثلاث. `ar` وحدها RTL؛ الهندية LTR كما في ملف DOCX الأصلي. */
export type DebtAckLang = 'ar' | 'en' | 'hi';

/** وسيلة تسليم السلفة — مربّعات الاختيار الثلاثة في البند 1. */
export type DisbursementMethod = '' | 'transfer' | 'cheque' | 'cash';

/**
 * الحقول النصية — كل واحد منها فراغ فعلي في ملفات Word الثلاثة.
 *
 * `amountWords*` و`balanceWords*` مثلّثة عمدًا (ar/en/hi): المبلغ بالحروف عبارة
 * **قانونية مشتقّة من اللغة نفسها**، فلا يمكن لقيمة واحدة أن تخدم القوالب الثلاثة
 * كما تخدمها الأسماء والأرقام والتواريخ. هذا هو الاختلاف الوحيد في خريطة الحقول
 * بين اللغات — وما عداه قيمة واحدة تُحقن في القوالب الثلاثة.
 */
export const TEXT_FIELD_IDS = [
  // أولاً: بيانات الدائن (صاحب العمل)
  'creditorName',
  'creditorCivilId',
  'creditorCommercialReg',
  'creditorRepresentative',
  'creditorAddress',
  // ثانياً: بيانات المدين (الموظف)
  'debtorFullName',
  'debtorCivilId',
  'debtorNationality',
  'debtorPassportNo',
  'debtorEmployeeNo',
  'debtorJobTitle',
  'debtorAddressKuwait',
  'debtorContact',
  // البند 1 — استلام مبلغ السلفة
  'amountFigures',
  'amountWordsAr',
  'amountWordsEn',
  'amountWordsHi',
  'transferNo',
  'chequeNo',
  'cashReceiptNo',
  // البند 3 — الرصيد عند التوقيع
  'balanceFigures',
  'balanceWordsAr',
  'balanceWordsEn',
  'balanceWordsHi',
  // البند 4 — الأقساط
  'installmentsCount',
  'installmentAmount',
  'monthlyDueDay',
  'finalInstallmentAmount',
  // البند 5 — وسيلة السداد
  'creditorIban',
  // البند 13 — اللغة والفهم
  'explanationLanguage',
  // سادساً: التوقيعات
  'creditorSignatoryName',
  'debtorSignatoryName',
  'witness1Name',
  'witness1CivilId',
  'witness2Name',
  'witness2CivilId',
  'interpreterName',
  'interpreterLanguage',
  'interpreterCivilId',
  // ── نظائر لاتينية للقالبين الإنجليزي والهندي ─────────────────────────────────
  // ليست حقولًا جديدة في المستند: هي **قيمة أخرى لنفس الفراغ** حين يُطبع بلغة أجنبية.
  // انظر `LOCALIZABLE_FIELD_IDS` أدناه للسبب الكامل.
  'creditorNameLatin',
  'creditorRepresentativeLatin',
  'creditorAddressLatin',
  'debtorFullNameLatin',
  'debtorNationalityLatin',
  'debtorJobTitleLatin',
  'debtorAddressKuwaitLatin',
  'debtorContactLatin',
  'explanationLanguageLatin',
  'creditorSignatoryNameLatin',
  'debtorSignatoryNameLatin',
  'witness1NameLatin',
  'witness2NameLatin',
  'interpreterNameLatin',
  'interpreterLanguageLatin',
] as const;

export type TextFieldId = (typeof TEXT_FIELD_IDS)[number];

/**
 * الحقول التي تختلف قيمتها باختلاف لغة القالب — لكلٍّ منها نظير لاتيني `<id>Latin`.
 *
 * ═══ لماذا نظير بدل قيمة واحدة ═══
 * القالبان الإنجليزي والهندي يُسلَّمان لعامل لا يقرأ العربية، فطباعة اسمه ومهنته
 * وجنسيته وعنوانه بالعربية داخلهما تجعل المستند غير مفهوم لمن يوقّعه. ولا يملك سجل
 * الموظف مقابلًا إنجليزيًا لهذه الحقول (عدا `fullNameEn` وحده)، فلا مصدر تلقائي لها.
 *
 * القاعدة الصارمة: **لا سقوط إلى العربية**. النظير اللاتيني الفارغ يطبع فراغ النموذج
 * (سلسلة النقاط) كخانة غير معبّأة — ولا يُنسخ النصّ العربي مكانه ولا يُترجَم ولا
 * يُحوَّل حرفيًا. الحقول التي ليست هنا (الأرقام والهويات والتواريخ والمبالغ) قيمة
 * واحدة تخدم القوالب الثلاثة.
 */
export const LOCALIZABLE_FIELD_IDS = [
  'creditorName',
  'creditorRepresentative',
  'creditorAddress',
  'debtorFullName',
  'debtorNationality',
  'debtorJobTitle',
  'debtorAddressKuwait',
  'debtorContact',
  'explanationLanguage',
  'creditorSignatoryName',
  'debtorSignatoryName',
  'witness1Name',
  'witness2Name',
  'interpreterName',
  'interpreterLanguage',
] as const;

export type LocalizableFieldId = (typeof LOCALIZABLE_FIELD_IDS)[number];

const LOCALIZABLE_SET: ReadonlySet<string> = new Set(LOCALIZABLE_FIELD_IDS);

/** معرّف النظير اللاتيني لحقل، أو `null` إن كانت قيمته واحدة في اللغات الثلاث. */
export function latinTwinOf(id: FieldId): TextFieldId | null {
  return LOCALIZABLE_SET.has(id) ? (`${id}Latin` as TextFieldId) : null;
}

/** حقول التاريخ — تُدخَل بصيغة `YYYY-MM-DD` وتُطبع `DD/MM/YYYY` كشكل القالب. */
export const DATE_FIELD_IDS = [
  'receiptDate',
  'firstInstallmentDate',
  'finalInstallmentDate',
  'creditorSignDate',
  'debtorSignDate',
  'annexDate',
] as const;

export type DateFieldId = (typeof DATE_FIELD_IDS)[number];

export type FieldId = TextFieldId | DateFieldId;

/** بيانات المستند الواحدة — تُدخَل مرة واحدة وتُحقن في أي من القوالب الثلاثة. */
export interface DebtAckData extends Record<FieldId, string> {
  /** لا يُعدّ حقلًا نصيًا: يقرّر أي مربّع من الثلاثة يُطبع مؤشَّرًا (☑) في البند 1. */
  disbursementMethod: DisbursementMethod;
  /**
   * هل عدّل المستخدم «الرصيد عند التوقيع» بيده؟
   *
   * الرصيد يساوي أصل الدين في الحالة الشائعة (سلفة جديدة لم يُسدَّد منها شيء)،
   * فيتبعه تلقائيًا ما دام لم يُمسّ. وحين يكتبه المستخدم بيده يصير القيمة
   * **المقصودة** — يعبّر عن المتبقّي فعلًا يوم التوقيع — فلا يدهسها تغييرُ أصل
   * الدين بعد ذلك. العلم جزء من بيانات المستند، فيُحفظ في المسودّة ويعود معها.
   */
  balanceManual: boolean;
  /**
   * جدول السداد المطبوع في «ملحق (أ)» — **مصدر واحد تُصيّره القوالب الثلاثة**.
   * يُولَّد من أصل الدين وعدد الأقساط وتاريخ أول قسط، ويبقى قابلًا للتعديل اليدوي.
   */
  schedule: InstallmentRow[];
  /**
   * هل مسّ المستخدم الجدول بيده؟ حين تكون `true` لا يُعاد التوليد تلقائيًا عند تغيير
   * أصل الدين أو العدد أو تاريخ أول قسط — يُسأل أولًا، فلا يُمحى عمل يدوي بصمت.
   */
  scheduleManual: boolean;
}

export const EMPTY_DEBT_ACK_DATA: DebtAckData = {
  ...(Object.fromEntries(TEXT_FIELD_IDS.map((k) => [k, ''])) as Record<TextFieldId, string>),
  ...(Object.fromEntries(DATE_FIELD_IDS.map((k) => [k, ''])) as Record<DateFieldId, string>),
  // «نقدًا» هي الحالة الغالبة في سلف الموظفين، وقرار مالك المنتج أن تكون
  // الافتراضي. تبقى قابلة للتغيير، والاختيار يُحفظ في المسودّة ولا يُعاد ضبطه.
  disbursementMethod: 'cash',
  schedule: [],
  scheduleManual: false,
  balanceManual: false,
};

/**
 * جزء من فقرة: نصّ حرفي من ملف Word، أو فراغ يُملأ.
 *
 * `p` هي **سلسلة النقاط الحرفية** التي يعرضها ملف Word في ذلك الموضع بالذات
 * (أطوالها تختلف من فراغ لآخر)، فتُطبع كما هي حين يترك المستخدم الحقل فارغًا —
 * أي أن النموذج غير المعبّأ يخرج مطابقًا للأصل.
 */
export type Seg =
  | string
  | { f: FieldId; p: string }
  | { d: DateFieldId }
  | { w: 'amount' | 'balance' }
  | { cb: Exclude<DisbursementMethod, ''> };

/** فراغ التاريخ في ملفات Word الثلاثة — شكل واحد في كل المواضع. */
export const DATE_PLACEHOLDER = '....../....../..........';

/** صف في جدول بيانات (عمود تسمية + عمود قيمة). */
export interface LabelledRow {
  label: string;
  segs: Seg[];
  /**
   * هذا الصفّ **خانة توقيع**: سطر يوقّع عليه طرفٌ بيده، لا حقل بيانات. يُعطى مساحة
   * الكتابة الموسّعة نفسها التي تُعطى لخلايا جدول التوقيعات. يُعلَن في حزمة المحتوى
   * لأن الأمر يخصّ بنية الملف الأصلي (أي صفوف الملحق سطور توقيع)، لا رقم صفّ يُخمَّن.
   */
  signature?: boolean;
}

/** بند مرقّم: مقدّمة عريضة ملوّنة ثم متن الفقرة — كما في ملفات Word. */
export interface Clause {
  lead: string;
  segs: Seg[];
}

/**
 * دور خلية في صفّ «ملحق (أ) — جدول السداد»:
 * تاريخ الاستحقاق · المبلغ المسدد · الرصيد المتبقي بعد القسط · ملاحظات/رقم الإيصال.
 */
export type AnnexCellRole = 'dueDate' | 'amount' | 'balance' | 'notes';

/** الطرف الذي يخصّه عمودٌ في جدول التوقيعات — لا موضعه. */
export type SignatureColumnRole = 'creditor' | 'debtor';

/** صف في جدول «تعليمات مهمة قبل التوقيع والاستخدام». */
export interface GuidanceRow {
  label: string;
  text: string;
}

/**
 * محتوى قالب لغة واحدة — منقول حرفيًا من ملف DOCX الخاص بها.
 *
 * ═══ قاعدة ترتيب الخلايا في الجداول — مقروءة من الملفات لا مفترضة ═══
 * **لا جدول من الجداول السبعة في أي من ملفات DOCX الثلاثة يحمل `w:bidiVisual`.**
 * فكلّها جداول تُصفّ من اليسار: الخلية الأولى في شبكة XML هي الخلية **اليسرى**
 * بصريًا، مهما كان اتجاه المستند.
 *
 * ولذلك كتب مؤلّف الملف العربي جداوله **بترتيب معكوس** مقابل الإنجليزي والهندي،
 * ليخرج الشكل العربي صحيحًا. الشبكات نفسها تُثبت ذلك بلا لبس:
 *
 *   جداول البيانات  EN/HI: `2460,6900` (تسمية ضيّقة ثم قيمة واسعة)
 *                   AR   : `6900,2460` (قيمة واسعة ثم تسمية ضيّقة) ⇐ معكوسة
 *   ملحق السداد     EN/HI: `1600,1800,1800,1900,2260` (رقم القسط أولًا)
 *                   AR   : `2260,1800,1800,1900,1600` (ملاحظات أولًا)   ⇐ معكوسة
 *
 * فالصورة التي يعرضها Word واحدة في اللغات الثلاث، معكوسةً في العربي: التسمية
 * يمينًا، ورقم القسط أقصى اليمين، والملاحظات أقصى اليسار.
 *
 * ═══ وماذا يعني ذلك هنا ═══
 * جذر المستند العربي `dir="rtl"`، وفيه تُرسم **الخلية الأولى في DOM في أقصى
 * اليمين** — عكس Word تمامًا. فليطابق المطبوعُ الأصلَ يجب أن يكون ترتيب DOM في
 * العربية **معكوس ترتيب شبكة XML**، وفي الإنجليزية والهندية **مطابقًا** له.
 *
 * الحقول أدناه (`labelColumnFirst` · `annexNumberFirst` · `annexColumns` ·
 * `signatureHeader`/`signatureRows`) تحمل جميعها **ترتيب DOM** لا ترتيب الشبكة.
 * وكل قيمة مولَّدة مربوطة بعمودها عبر دور صريح (`annexCellRoles` ·
 * `signatureColumnRoles`) لا عبر موضعها — فلا تنفصل قيمة عن ترويستها مهما
 * تغيّر الترتيب. **لا `transform`، ولا اتجاه مقلوب على جدول، ولا نصّ معكوس.**
 */
export interface DebtAckContent {
  lang: DebtAckLang;
  dir: 'rtl' | 'ltr';
/**
   * هل تُصيَّر خلية التسمية **أولًا في DOM**؟ (انظر قاعدة الترتيب أعلاه.)
   *
   * `true` في اللغات الثلاث، ولسببين متعاكسين يعطيان الصورة نفسها: في العربية
   * الخلية الأولى تُرسم يمينًا فتقع التسمية يمينًا كما في Word؛ وفي الإنجليزية
   * والهندية تُرسم يسارًا فتقع التسمية يسارًا كما في Word.
   */
  labelColumnFirst: boolean;
  title: string;
  subtitle: string;

  s1Heading: string;
  creditorRows: LabelledRow[];

  s2Heading: string;
  debtorRows: LabelledRow[];

  s3Heading: string;
  preamble: string;
  clauses1to3: Clause[];

  s4Heading: string;
  /**
   * البند 4 حين يكون القسط **واحدًا**.
   *
   * ═══ لماذا نصّان لبندٍ واحد ═══
   * الصيغة المعتمدة تتحدّث عن أقساط عادية وعن «قسط أخير» يحمل المتبقّي — وهي وصفٌ
   * صحيح لاثنين فأكثر، ولغوٌ حين لا يوجد إلا قسط واحد: لا «عادي» يقابله، ولا «أخير»
   * يتميّز عنه. فالنصّ يبقى صادقًا في أرقامه ويكذب في وصفه.
   *
   * هذا النصّ **ليس في ملفات DOCX**: ملفات Word كُتبت لحالة الأقساط المتعدّدة وحدها،
   * وحالة القسط الواحد صيغةٌ ديناميكية أقرّها مالك المنتج. وهو استثناء مسجَّل صراحةً
   * في اختبار أمانة النصّ كسابقَيه (تسمية عمود الرصيد، وإدراجَي البند 4)، ويحتفظ
   * بعبارتَي الافتتاح والختام الحرفيّتين من الأصل ليبقى في أسلوبه.
   *
   * ولا يُغيّر حسابًا: القسط الواحد هو الرصيد عند التوقيع كلّه، والملحق يعرض القيمة
   * والتاريخ نفسيهما لأن كليهما يقرأ الجدول نفسه.
   */
  clause4Single: Clause;
  clauses4to7: Clause[];

  s5Heading: string;
  clauses8to14: Clause[];

  s6Heading: string;
  signaturesNote: string;
  /** رأس جدول التوقيعات: [الدائن، المدين] بترتيب الملف. */
  signatureHeader: [string, string];
  /**
   * الطرف الذي يخصّه كل عمود من عمودَي جدول التوقيعات، **بترتيب DOM نفسه**.
   *
   * العربية `['debtor', 'creditor']` والإنجليزية والهندية `['creditor', 'debtor']`
   * — لأن ترتيب DOM معكوس في العربية. وبه يُشتقّ اسم منطقة التوقيع من **الدور** لا
   * من الموضع، فلا يصير توقيع الدائن باسم المدين عند أي إعادة ترتيب.
   */
  signatureColumnRoles: [SignatureColumnRole, SignatureColumnRole];
  /** صفوف جدول التوقيعات — خليتان لكل صف، منقولتان حرفيًا. */
  signatureRows: [Seg[], Seg[]][];
  /**
   * فهرس **صفّ التوقيع** داخل `signatureRows` — الصفّ الذي يوقّع عليه الطرفان بيدهما
   * («التوقيع والختم:» / «التوقيع:»)، تمييزًا له عن صفّ الاسم وصفّ التاريخ. هو وحده
   * الذي يأخذ مساحة الكتابة الموسّعة. يُعلَن هنا لأن ترتيب الصفوف خاصية للملف الأصلي.
   */
  signatureRowIndex: number;
  witnessesHeading: string;
  /** صفوف الشهود/المترجم — خلية واحدة بعرض الجدول لكل صف. */
  witnessRows: Seg[][];

  annexTitle: string;
  /** عناوين أعمدة جدول السداد بترتيب الملف الأصلي لهذه اللغة. */
  annexColumns: string[];
  /**
   * دور كل خلية في صفّ جدول السداد، **عدا خلية رقم القسط**، بترتيب الملف الأصلي لهذه
   * اللغة. العربي يعكس ترتيب الأعمدة (شبكة RTL) فتختلف دلالة الفهرس بين اللغات —
   * فيُعلَن الدور صراحةً بدل استنتاجه من الفهرس.
   */
  annexCellRoles: AnnexCellRole[];
  /**
   * لاحقة العملة في خلايا المبالغ داخل جدول السداد، كما يكتبها ملف Word نفسه:
   * ` د.ك` في العربي و` KWD` في الإنجليزي والهندي. تُقرأ من هنا بدل استنتاجها من
   * اللغة، فتبقى مطابقة للأصل حرفيًا (يحرسها اختبار الأمانة مقابل `annexRowCells`).
   */
  annexAmountSuffix: string;
  /** هل عمود «رقم القسط» أولًا (الإنجليزي/الهندي) أم أخيرًا (العربي). */
  annexNumberFirst: boolean;
  /** خلايا الصف الفارغ عدا خلية رقم القسط — بترتيب الملف الأصلي. */
  annexRowCells: string[];
  annexRowCount: number;
  annexTotals: Seg[];
  annexNote: string;
  annexSignRows: LabelledRow[];

  guidanceTitle: string;
  guidanceRows: GuidanceRow[];

  sourcesHeading: string;
  sources: string[];
  disclaimer: string;
}
