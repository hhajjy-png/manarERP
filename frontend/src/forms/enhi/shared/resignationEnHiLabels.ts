/**
 * قاموس التسميات الثابتة English → हिन्दी لـ«طلب استقالة».
 *
 * ملف **جديد ومستقل** — لا يعدّل `enHiLabels.ts` المعتمد من PHASE 1. التسميات
 * الإنجليزية منقولة **حرفيًا** من `ResignationTemplate` الإنجليزي القائم.
 */
import type { EnHiPair } from './enHiLabels';

export const RESIGNATION_LABELS_EN_HI = {
  'doc.title': { en: 'Resignation Request', hi: 'इस्तीफा अनुरोध' },

  'sec.employeeInfo': { en: 'Employee Information', hi: 'कर्मचारी विवरण' },
  'sec.resignationDetails': { en: 'Resignation Details', hi: 'इस्तीफा विवरण' },

  'f.name': { en: 'Name', hi: 'नाम' },
  'f.employeeId': { en: 'Employee ID', hi: 'कर्मचारी संख्या' },
  'f.civilId': { en: 'Civil ID', hi: 'सिविल आईडी' },
  'f.jobTitle': { en: 'Job Title', hi: 'पद' },
  'f.department': { en: 'Department', hi: 'विभाग' },
  'f.dateOfHire': { en: 'Date of Hire', hi: 'नियुक्ति तिथि' },

  'f.resignationDate': { en: 'Resignation Date', hi: 'इस्तीफा तिथि' },
  'f.lastWorkingDay': { en: 'Last Working Day', hi: 'अंतिम कार्य दिवस' },
  'f.noticePeriod': { en: 'Notice Period', hi: 'सूचना अवधि' },
  'f.reason': { en: 'Reason for Resignation', hi: 'इस्तीफे का कारण' },
  'f.handover': { en: 'Handover Obligations', hi: 'हस्तांतरण दायित्व' },

  'p.declaration': {
    en: 'I hereby submit my resignation from my position at the company and pledge to complete the handover of all tasks and documents within the specified notice period.',
    hi: 'मैं एतद्द्वारा कंपनी में अपने पद से इस्तीफा प्रस्तुत करता/करती हूँ, और निर्धारित सूचना अवधि के भीतर सभी कार्यों एवं दस्तावेज़ों का हस्तांतरण पूर्ण करने का वचन देता/देती हूँ।',
  },
  'sig.employee': { en: 'Employee Signature:', hi: 'कर्मचारी हस्ताक्षर:' },
  'sig.hrReceipt': { en: 'HR Receipt / Date:', hi: 'मानव संसाधन प्राप्ति / तिथि:' },
} as const satisfies Record<string, EnHiPair>;

export type ResignationLabelKey = keyof typeof RESIGNATION_LABELS_EN_HI;

export function resignationLabel(key: ResignationLabelKey): EnHiPair {
  return RESIGNATION_LABELS_EN_HI[key];
}
