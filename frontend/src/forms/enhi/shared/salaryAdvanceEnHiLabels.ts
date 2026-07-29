/**
 * قاموس التسميات الثابتة English → हिन्दी لـ«طلب سلفة راتب».
 *
 * ملف **جديد ومستقل** — لا يعدّل `enHiLabels.ts` المعتمد من PHASE 1. التسميات
 * الإنجليزية منقولة **حرفيًا** من `SalaryAdvanceTemplate` الإنجليزي القائم.
 */
import type { EnHiPair } from './enHiLabels';

export const SALARY_ADVANCE_LABELS_EN_HI = {
  'doc.title': { en: 'Salary Advance Request', hi: 'वेतन अग्रिम अनुरोध' },

  'sec.employeeInfo': { en: 'Employee Information', hi: 'कर्मचारी विवरण' },
  'sec.advanceDetails': { en: 'Salary Advance Request Details', hi: 'वेतन अग्रिम अनुरोध विवरण' },

  'f.name': { en: 'Name', hi: 'नाम' },
  'f.employeeId': { en: 'Employee ID', hi: 'कर्मचारी संख्या' },
  'f.civilId': { en: 'Civil ID', hi: 'सिविल आईडी' },
  'f.jobTitle': { en: 'Job Title', hi: 'पद' },
  'f.department': { en: 'Department', hi: 'विभाग' },
  'f.monthlySalary': { en: 'Monthly Salary', hi: 'मासिक वेतन' },

  'f.requestedAmount': { en: 'Requested Amount', hi: 'अनुरोधित राशि' },
  'f.requestDate': { en: 'Request Date', hi: 'अनुरोध तिथि' },
  'f.reason': { en: 'Purpose / Reason', hi: 'उद्देश्य / कारण' },
  'f.installments': { en: 'No. of Installments', hi: 'किस्तों की संख्या' },
  'f.installmentAmount': { en: 'Installment Amount (KWD)', hi: 'किस्त राशि (के.डी.)' },
  'f.repaymentSchedule': { en: 'Repayment Schedule', hi: 'पुनर्भुगतान अनुसूची' },

  'p.declaration': {
    en: 'The above-mentioned employee agrees to the deduction of the advance amount from their monthly salary according to the agreed repayment schedule, and acknowledges receipt of the stated amount.',
    hi: 'उपर्युक्त कर्मचारी अपने मासिक वेतन से सहमत पुनर्भुगतान अनुसूची के अनुसार अग्रिम राशि की कटौती के लिए सहमत है, और उल्लिखित राशि प्राप्त होने की पुष्टि करता/करती है।',
  },
  'sig.employee': { en: 'Employee Signature:', hi: 'कर्मचारी हस्ताक्षर:' },
} as const satisfies Record<string, EnHiPair>;

export type SalaryAdvanceLabelKey = keyof typeof SALARY_ADVANCE_LABELS_EN_HI;

export function salaryAdvanceLabel(key: SalaryAdvanceLabelKey): EnHiPair {
  return SALARY_ADVANCE_LABELS_EN_HI[key];
}
