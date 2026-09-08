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
] as const;

export type TextFieldId = (typeof TEXT_FIELD_IDS)[number];

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
}

export const EMPTY_DEBT_ACK_DATA: DebtAckData = {
  ...(Object.fromEntries(TEXT_FIELD_IDS.map((k) => [k, ''])) as Record<TextFieldId, string>),
  ...(Object.fromEntries(DATE_FIELD_IDS.map((k) => [k, ''])) as Record<DateFieldId, string>),
  disbursementMethod: '',
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
}

/** بند مرقّم: مقدّمة عريضة ملوّنة ثم متن الفقرة — كما في ملفات Word. */
export interface Clause {
  lead: string;
  segs: Seg[];
}

/** صف في جدول «تعليمات مهمة قبل التوقيع والاستخدام». */
export interface GuidanceRow {
  label: string;
  text: string;
}

/**
 * محتوى قالب لغة واحدة — منقول حرفيًا من ملف DOCX الخاص بها.
 *
 * `dir` و`labelColumnFirst` مأخوذان من الملف نفسه لا مفترضَين: العربي `rtl`
 * وعمود التسمية أولًا في ترتيب الشبكة (فيظهر يمينًا)، والإنجليزي والهندي `ltr`
 * وعمود التسمية أولًا (فيظهر يسارًا).
 */
export interface DebtAckContent {
  lang: DebtAckLang;
  dir: 'rtl' | 'ltr';
  /**
   * ترتيب خلايا جداول البيانات في ملف DOCX نفسه: الإنجليزي والهندي يضعان عمود
   * التسمية أولًا، والعربي يضعه ثانيًا (شبكة `6900,2460` مقابل `2460,6900`) —
   * فيظهر يمينًا داخل جدول RTL. نُصيِّر الخلايا بترتيب الملف الأصلي حرفيًا.
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
  clauses4to7: Clause[];

  s5Heading: string;
  clauses8to14: Clause[];

  s6Heading: string;
  signaturesNote: string;
  /** رأس جدول التوقيعات: [الدائن، المدين] بترتيب الملف. */
  signatureHeader: [string, string];
  /** صفوف جدول التوقيعات — خليتان لكل صف، منقولتان حرفيًا. */
  signatureRows: [Seg[], Seg[]][];
  witnessesHeading: string;
  /** صفوف الشهود/المترجم — خلية واحدة بعرض الجدول لكل صف. */
  witnessRows: Seg[][];

  annexTitle: string;
  /** عناوين أعمدة جدول السداد بترتيب الملف الأصلي لهذه اللغة. */
  annexColumns: string[];
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
