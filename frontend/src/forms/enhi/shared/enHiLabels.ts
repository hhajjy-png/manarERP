/**
 * قاموس التسميات الثابتة English → हिन्दी للنماذج الإدارية (مرحلة تجريبية).
 *
 * لماذا هنا لا في `lib/i18n.ts`
 * ────────────────────────────
 * `DICT` هناك نوعه `Record<Lang, …>` و`Lang` هو `'ar' | 'en'`؛ إضافة عمود هندي
 * إليه تكسر النوع وتجرّ `formsTranslationKeyCompleteness.test.ts` معها. وهذه
 * تسميات **مستند مطبوع**، لا واجهة — فمكانها مع القالب الذي يطبعها.
 *
 * المدى: «طلب الإجازة» وحده في هذه المرحلة، زائد تسميات كتلة الاعتماد المشتركة.
 * أي نموذج لاحق يضيف كتلته الخاصة هنا؛ لا نص هندي حرفي داخل أي قالب.
 *
 * التسميات الإنجليزية منقولة **حرفيًا** من `LeaveRequestTemplate` الإنجليزي
 * القائم، حتى يبقى النصف الإنجليزي مطابقًا للقالب المعتمد بلا أي إعادة صياغة.
 */

import type { ApprovalSecondaryLabels } from '../../shared/ApprovalSection';
import { EN_HI_SEPARATOR } from './enHiStyles';

export interface EnHiPair {
  readonly en: string;
  readonly hi: string;
}

/**
 * السطر الهندي لتسميات كتلة الاعتماد المشتركة في التذييل.
 *
 * يُمرَّر إلى `FormLayout.approvalSecondaryLabels` ⇒ `ApprovalSection`، فتُرسم
 * تحت التسميات الإنجليزية التي يملكها ذلك المكوّن أصلًا. الجهة الإنجليزية تبقى
 * مصدرها `ApprovalSection.LABELS.en` — لا نسخة ثانية منها هنا.
 */
export const APPROVAL_SECONDARY_LABELS_HI: ApprovalSecondaryLabels = {
  title: 'प्रत्यक्ष प्रबंधक अनुमोदन',
  signature: 'हस्ताक्षर:',
  date: 'तिथि:',
  stamp: 'आधिकारिक मुहर',
};

/** أنواع الإجازة — نفس مفاتيح `Leave.type` المخزَّنة. */
export const LEAVE_TYPES_EN_HI = {
  ANNUAL: { en: 'Annual Leave', hi: 'वार्षिक अवकाश' },
  SICK: { en: 'Sick Leave', hi: 'रुग्णता अवकाश' },
  UNPAID: { en: 'Unpaid Leave', hi: 'अवैतनिक अवकाश' },
  EMERGENCY: { en: 'Emergency Leave', hi: 'आपातकालीन अवकाश' },
} as const satisfies Record<string, EnHiPair>;

/** تسميات «طلب الإجازة» — عناوين الأقسام، الحقول، الفقرة، التواقيع. */
export const LEAVE_REQUEST_LABELS_EN_HI = {
  // أقسام
  'sec.employeeInfo': { en: 'Employee Information', hi: 'कर्मचारी विवरण' },
  'sec.leaveDetails': { en: 'Leave Request Details', hi: 'अवकाश अनुरोध विवरण' },

  // بيانات الموظف
  'f.name': { en: 'Name', hi: 'नाम' },
  'f.employeeId': { en: 'Employee ID', hi: 'कर्मचारी संख्या' },
  'f.civilId': { en: 'Civil ID', hi: 'सिविल आईडी' },
  'f.jobTitle': { en: 'Job Title', hi: 'पद' },
  'f.department': { en: 'Department', hi: 'विभाग' },

  // تفاصيل الطلب
  'f.leaveType': { en: 'Leave Type', hi: 'अवकाश का प्रकार' },
  'f.startDate': { en: 'Start Date', hi: 'प्रारंभ तिथि' },
  'f.endDate': { en: 'End Date', hi: 'समाप्ति तिथि' },
  'f.days': { en: 'Days', hi: 'दिनों की संख्या' },
  'f.reason': { en: 'Reason', hi: 'कारण' },
  'f.expectedReturn': { en: 'Expected Return Date', hi: 'अपेक्षित वापसी तिथि' },

  // فقرة التعهد + التذييل
  'p.declaration': {
    en: 'I hereby request the above-mentioned leave and pledge to return to work on the specified date.',
    hi: 'मैं एतद्द्वारा उपर्युक्त अवकाश का अनुरोध करता/करती हूँ और निर्धारित तिथि पर कार्य पर लौटने का वचन देता/देती हूँ।',
  },
  'f.requestDate': { en: 'Request Date', hi: 'अनुरोध तिथि' },
  'sig.employee': { en: 'Employee Signature:', hi: 'कर्मचारी हस्ताक्षर:' },

  // عنوان المستند نفسه — يُركَّب في سطر `<h1>` الواحد الذي يرسمه `FormLayout`
  // (خاصيته `title` نوعها `string`، فالسطر الواحد يكفي بلا أي تغيير في الـShell).
  'doc.title': { en: 'Leave Request', hi: 'अवकाश अनुरोध' },
} as const satisfies Record<string, EnHiPair>;

export type LeaveRequestLabelKey = keyof typeof LEAVE_REQUEST_LABELS_EN_HI;

/**
 * يدمج طرفَي أي زوج في سطر واحد بالفاصل الموحَّد: `English — हिन्दी`.
 *
 * تستعمله الصفحة لعنوان المستند (`FormLayout.title`)، ويستعمله القالب لأي نصّ
 * ثنائي لا يمرّ بذرّة من ذرّات `enHiText`. مصدر واحد للفاصل ⇒ لا انحراف في
 * الشكل بين موضع وآخر.
 */
export function joinEnHi(pair: EnHiPair): string {
  return `${pair.en}${EN_HI_SEPARATOR}${pair.hi}`;
}

/** يقرأ زوج (EN, HI) لمفتاح تسمية في «طلب الإجازة». النوع يمنع أي مفتاح غير معرَّف. */
export function leaveRequestLabel(key: LeaveRequestLabelKey): EnHiPair {
  return LEAVE_REQUEST_LABELS_EN_HI[key];
}

/**
 * يحلّ نوع الإجازة إلى زوج ثنائي. المفتاح غير المعروف يسقط إلى نفسه في الجهتين —
 * نفس سياسة القوالب القائمة (`LEAVE_TYPES_EN[type] ?? type`)، لا اختراع ترجمة.
 */
export function leaveTypeEnHi(type: string): EnHiPair {
  return LEAVE_TYPES_EN_HI[type as keyof typeof LEAVE_TYPES_EN_HI] ?? { en: type, hi: type };
}
