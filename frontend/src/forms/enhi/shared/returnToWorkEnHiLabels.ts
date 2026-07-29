/**
 * قاموس التسميات الثابتة English → हिन्दी لـ«إشعار العودة إلى العمل».
 *
 * ملف **جديد ومستقل** — لا يعدّل `enHiLabels.ts` المعتمد من PHASE 1 (يستورد منه
 * `EnHiPair` و`joinEnHi` فقط، دون لمس محتواه). نفس سبب عزل PHASE 1: هذه تسميات
 * **مستند مطبوع**، لا واجهة، فمكانها مع القالب الذي يطبعها — لا `lib/i18n.ts`.
 *
 * التسميات الإنجليزية منقولة **حرفيًا** من `ReturnToWorkTemplate` الإنجليزي
 * القائم (لم يُمَسّ)، حتى يبقى النصف الإنجليزي مطابقًا للقالب المعتمد.
 */
import type { EnHiPair } from './enHiLabels';

/** أنواع الإجازة — نفس مفاتيح `Leave.type` المخزَّنة (نفس ترجمات PHASE 1). */
export const LEAVE_TYPES_EN_HI = {
  ANNUAL: { en: 'Annual Leave', hi: 'वार्षिक अवकाश' },
  SICK: { en: 'Sick Leave', hi: 'रुग्णता अवकाश' },
  UNPAID: { en: 'Unpaid Leave', hi: 'अवैतनिक अवकाश' },
  EMERGENCY: { en: 'Emergency Leave', hi: 'आपातकालीन अवकाश' },
} as const satisfies Record<string, EnHiPair>;

export const RETURN_TO_WORK_LABELS_EN_HI = {
  'doc.title': { en: 'Return To Work Notice', hi: 'कार्य पर वापसी सूचना' },

  'sec.employeeInfo': { en: 'Employee Information', hi: 'कर्मचारी विवरण' },
  'sec.returnDetails': { en: 'Return to Work Details', hi: 'कार्य पर वापसी विवरण' },

  'f.name': { en: 'Name', hi: 'नाम' },
  'f.employeeId': { en: 'Employee ID', hi: 'कर्मचारी संख्या' },
  'f.jobTitle': { en: 'Job Title', hi: 'पद' },
  'f.department': { en: 'Department', hi: 'विभाग' },

  'f.leaveType': { en: 'Leave Type', hi: 'अवकाश का प्रकार' },
  'f.leaveStartDate': { en: 'Leave Start Date', hi: 'अवकाश प्रारंभ तिथि' },
  'f.leaveEndDate': { en: 'Leave End Date', hi: 'अवकाश समाप्ति तिथि' },
  'f.days': { en: 'Days', hi: 'दिनों की संख्या' },
  'f.actualReturnDate': { en: 'Actual Return Date', hi: 'वास्तविक वापसी तिथि' },
  'f.medicalNotes': { en: "Medical Notes / Doctor's Report", hi: 'चिकित्सा टिप्पणी / डॉक्टर की रिपोर्ट' },

  'p.declaration': {
    en: 'The above-mentioned employee has returned to work after the expiry of their leave and is in good condition and ready to resume their duties.',
    hi: 'उपर्युक्त कर्मचारी अपने अवकाश की समाप्ति के बाद कार्य पर वापस लौट आया/आई है और अपने कर्तव्यों को फिर से शुरू करने के लिए स्वस्थ एवं तैयार है।',
  },
  'f.noticeDate': { en: 'Notice Date', hi: 'सूचना तिथि' },
  'sig.employee': { en: 'Employee Signature (Return Confirmation):', hi: 'कर्मचारी हस्ताक्षर (वापसी की पुष्टि):' },
} as const satisfies Record<string, EnHiPair>;

export type ReturnToWorkLabelKey = keyof typeof RETURN_TO_WORK_LABELS_EN_HI;

export function returnToWorkLabel(key: ReturnToWorkLabelKey): EnHiPair {
  return RETURN_TO_WORK_LABELS_EN_HI[key];
}

/** يحلّ نوع الإجازة إلى زوج ثنائي — نفس سياسة PHASE 1: مفتاح مجهول يسقط لنفسه. */
export function leaveTypeEnHi(type: string): EnHiPair {
  return LEAVE_TYPES_EN_HI[type as keyof typeof LEAVE_TYPES_EN_HI] ?? { en: type, hi: type };
}
