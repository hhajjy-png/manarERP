/**
 * قاموس التسميات الثابتة English → हिन्दी لـ«إنذار موظف».
 *
 * ملف **جديد ومستقل** — لا يعدّل `enHiLabels.ts` المعتمد من PHASE 1. التسميات
 * الإنجليزية منقولة **حرفيًا** من `EmployeeWarningTemplate` الإنجليزي القائم،
 * بما فيها درجات الإنذار الثلاث (`LEVELS`).
 */
import type { EnHiPair } from './enHiLabels';

/** درجات الإنذار — نفس مفاتيح `WarningLevel` المخزَّنة في القالب الإنجليزي. */
export const WARNING_LEVELS_EN_HI = {
  first: { en: 'First (Verbal)', hi: 'प्रथम (मौखिक)' },
  second: { en: 'Second (Written)', hi: 'द्वितीय (लिखित)' },
  final: { en: 'Final Warning', hi: 'अंतिम चेतावनी' },
} as const satisfies Record<string, EnHiPair>;

export type WarningLevelKey = keyof typeof WARNING_LEVELS_EN_HI;

export const EMPLOYEE_WARNING_LABELS_EN_HI = {
  'doc.title': { en: 'Employee Warning Notice', hi: 'कर्मचारी चेतावनी सूचना' },

  'sec.employeeInfo': { en: 'Employee Information', hi: 'कर्मचारी विवरण' },
  'sec.warningDetails': { en: 'Warning Details', hi: 'चेतावनी विवरण' },

  'f.name': { en: 'Name', hi: 'नाम' },
  'f.employeeId': { en: 'Employee ID', hi: 'कर्मचारी संख्या' },
  'f.civilId': { en: 'Civil ID', hi: 'सिविल आईडी' },
  'f.jobTitle': { en: 'Job Title', hi: 'पद' },
  'f.department': { en: 'Department', hi: 'विभाग' },

  'f.warningDate': { en: 'Warning Date', hi: 'चेतावनी तिथि' },
  'f.warningLevel': { en: 'Warning Level', hi: 'चेतावनी स्तर' },
  'f.warningReason': { en: 'Warning Reason', hi: 'चेतावनी का कारण' },
  'f.violationDetails': { en: 'Violation Details', hi: 'उल्लंघन विवरण' },
  'f.correctiveAction': { en: 'Corrective Action', hi: 'सुधारात्मक कार्रवाई' },
  'f.additionalNotes': { en: 'Additional Notes', hi: 'अतिरिक्त टिप्पणियाँ' },

  'p.declaration': {
    en: 'The above-mentioned employee has been notified of this warning and has been informed of its contents. The employee is required not to repeat this violation in the future, failing which they will be subject to the prescribed disciplinary measures.',
    hi: 'उपर्युक्त कर्मचारी को इस चेतावनी की सूचना दे दी गई है और इसकी विषय-वस्तु से अवगत करा दिया गया है। कर्मचारी को भविष्य में इस उल्लंघन की पुनरावृत्ति न करने की आवश्यकता है, अन्यथा उसे निर्धारित अनुशासनात्मक कार्रवाई का सामना करना पड़ेगा।',
  },
  'sig.employee': { en: 'Employee Signature (Acknowledgment):', hi: 'कर्मचारी हस्ताक्षर (स्वीकृति):' },
  'sig.supervisor': { en: 'Supervisor Signature:', hi: 'पर्यवेक्षक हस्ताक्षर:' },
  'sig.date': { en: 'Date:', hi: 'तिथि:' },
} as const satisfies Record<string, EnHiPair>;

export type EmployeeWarningLabelKey = keyof typeof EMPLOYEE_WARNING_LABELS_EN_HI;

export function employeeWarningLabel(key: EmployeeWarningLabelKey): EnHiPair {
  return EMPLOYEE_WARNING_LABELS_EN_HI[key];
}

export function warningLevelEnHi(level: WarningLevelKey): EnHiPair {
  return WARNING_LEVELS_EN_HI[level];
}
