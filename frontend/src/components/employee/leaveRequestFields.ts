/**
 * المصدر الواحد لحقول **طلب الإجازة** في الواجهة.
 *
 * ═══ لماذا وُجد هذا الملف ═══
 * البيانات نفسها تُدخَل في مكانين وتُعرض في ثالث:
 *   • حوار «إضافة إجازة» (سجل الإجازات في صفحة المستحقات) — حيث تُدخَل وتُحفظ.
 *   • صفحة `LeaveRequest` — حيث تُراجَع وتُعدَّل قبل الطباعة.
 *   • قوالب `LeaveRequestTemplate` / `LeaveRequestEnHiTemplate` — حيث تُطبع.
 * قائمة أنواع مكرّرة في ثلاثة ملفات تعني أن إضافة نوع رابع تُنسى في اثنين منها.
 * القيم هنا هي المرجع، ومصدرها الأصلي مخطّط الخادم:
 *
 *     leaveSchema.body.type = z.enum(['ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY'])
 *
 * ═══ ما لا يعيش هنا ═══
 * نصوص القوالب المطبوعة العربية/الإنجليزية (`LEAVE_TYPES` / `LEAVE_TYPES_EN` داخل
 * القوالب): تلك ألفاظ **المستند** لا ألفاظ الواجهة، ولها نسختان لغويتان مستقلتان عن
 * لغة الواجهة. تركها في القالب مقصود — والربط المضمون هنا هو ربط **القيم**، فأي نوع
 * جديد يُضاف إلى `LEAVE_TYPE_VALUES` يكسر الترجمة في كل خريطة `Record<LeaveTypeValue,…>`
 * وقت البناء بدل أن يمرّ صامتًا.
 */

/** قيم نوع الإجازة — مطابقة لـ `leaveSchema` في الخادم حرفًا بحرف. */
export const LEAVE_TYPE_VALUES = ['ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY'] as const;

export type LeaveTypeValue = (typeof LEAVE_TYPE_VALUES)[number];

/**
 * مفاتيح الترجمة لسياق **نموذج طلب الإجازة** — نفس المفاتيح التي تستعملها صفحة
 * `LeaveRequest` في قائمتها المنسدلة، فيقرأ المستخدم اللفظ ذاته في مكان الإدخال
 * وفي صفحة الطباعة.
 */
export const LEAVE_TYPE_FORM_LABEL: Record<LeaveTypeValue, string> = {
  ANNUAL: 'page.leaveReq.opt.annual',
  SICK: 'page.leaveReq.opt.sick',
  UNPAID: 'page.leaveReq.opt.unpaid',
  EMERGENCY: 'page.leaveReq.opt.emergency',
};

/**
 * حقول طلب الإجازة القابلة للتعبئة اليدوية — الحصر الكامل لما يُدخله المستخدم.
 *
 * `days` **ليس منها**: يشتقّه الخادم من التاريخين (`diffDays`)، وتعرضه صفحة الطباعة
 * محسوبًا. إدراجه هنا كمُدخَل كان سيخلق مصدرين متنافسين لعدد الأيام.
 */
export interface LeaveRequestFields {
  type: LeaveTypeValue;
  /** 'YYYY-MM-DD' */
  startDate: string;
  /** 'YYYY-MM-DD' */
  endDate: string;
  reason: string;
  /** 'YYYY-MM-DD' — تاريخ العودة المتوقَّع، اختياري. */
  expectedReturnDate: string;
}

/** الحالة الابتدائية لحوار الإضافة — النوع الافتراضي هو الأشيع عمليًا. */
export const EMPTY_LEAVE_REQUEST_FIELDS: LeaveRequestFields = {
  type: 'ANNUAL',
  startDate: '',
  endDate: '',
  reason: '',
  expectedReturnDate: '',
};

/**
 * حمولة اختصار «طباعة نموذج الإجازة» — سجل إجازة محفوظ كما قرأه الخادم، مُهيَّأ
 * للعرض في صفحة الطباعة. تسافر في `state` الخاصة بالمسار، ولا تُكتب في أي مكان.
 */
export interface LeavePrintPrefill extends LeaveRequestFields {
  id: number;
  /** عدد الأيام كما احتسبه الخادم وخزّنه — يُعرض ولا يُعاد احتسابه هنا. */
  days: number;
}

/** يُطبّع تاريخ الخادم (ISO أو 'YYYY-MM-DD' أو null) إلى 'YYYY-MM-DD' أو نصّ فارغ. */
export function toDateOnly(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : '';
}
