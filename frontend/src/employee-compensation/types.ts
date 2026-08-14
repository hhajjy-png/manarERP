/**
 * أنواع وحدة مستحقات الموظف الشهرية — الواجهة.
 *
 * تُطابق ما تُعيده مسارات `/api/employee-compensation`. **لا معادلة حسابية هنا ولا في
 * أي مكوّن**: كل رقم يصل محسوبًا من محرّك الخادم (`backend/.../engine`). هذا هو ما
 * يمنع أن يعرض الكشفُ رقمًا ويخزّن الجدولُ آخر.
 */

export type OvertimeType = 'REGULAR' | 'WEEKLY_REST' | 'OFFICIAL_HOLIDAY';
export type OvertimeMethod = 'MANUAL_HOURS' | 'REVERSE_FROM_AMOUNT';
export type EarningType = 'BONUS' | 'GRANT' | 'INCENTIVE' | 'ALLOWANCE' | 'EXPENSE_REIMBURSEMENT' | 'CUSTOM';
export type DeductionType = 'ABSENCE' | 'ADVANCE' | 'PENALTY' | 'DISCOUNT' | 'CUSTOM' | 'DEBT_REPAYMENT';
export type CalculationStatus = 'DRAFT' | 'APPROVED';

export interface CompensationWarning {
  code:
    | 'OVERTIME_ANNUAL_LIMIT_EXCEEDED'
    | 'OVERTIME_MONTHLY_DERIVED_CEILING_EXCEEDED'
    | 'COMPENSATORY_REST_DAY_DUE'
    | 'OVERTIME_DAILY_LIMITS_NOT_VERIFIABLE';
  messageAr: string;
  /**
   * أساس التنبيه — ثلاث حالات لا يجوز خلطها بصريًا:
   *   `STATUTORY` — حدّ منصوص عليه **وفحصه النظام فعلًا**.
   *   `DERIVED`   — سقف مُشتَقّ حسابيًا لا نصّ له.
   *   `DISCLOSURE`— حدّ منصوص عليه **لم يفحصه النظام** ولا يستطيع (لا سجل يومي).
   */
  basis: 'STATUTORY' | 'DERIVED' | 'DISCLOSURE';
  limit?: number;
  actual?: number;
  excess?: number;
}

export interface OvertimeLine {
  id?: number;
  overtimeType: OvertimeType;
  hours: number;
  hourlyRate: number;
  multiplier: number;
  amount: number;
  calculationMethod: OvertimeMethod;
  reverseTargetAmount: number | null;
  rawHoursBeforeCeiling: number | null;
  legalReference: string;
  notes: string | null;
  sortOrder: number;
}

export interface EarningLine {
  id?: number;
  type: EarningType;
  label: string;
  amount: number;
  entryDate: string | null;
  reason: string | null;
  notes: string | null;
  recurring: boolean;
  sortOrder: number;
}

export interface DeductionLine {
  id?: number;
  type: DeductionType;
  label: string;
  amount: number;
  notes: string | null;
  /** سجل المديونية الذي يسدّده السطر — موجود لنوع `DEBT_REPAYMENT` وحده. */
  debtId: number | null;
  sortOrder: number;
}

export interface Calculation {
  id: number;
  employeeId: number;
  year: number;
  month: number;
  status: CalculationStatus;
  employeeNumberSnapshot: string;
  employeeNameSnapshot: string;
  jobTitleSnapshot: string | null;
  departmentSnapshot: string | null;
  nationalitySnapshot: string | null;
  civilIdSnapshot: string | null;
  basicSalarySnapshot: number;
  hourlyRateSnapshot: number;
  legalRulesVersion: string;
  totalOvertimeAmount: number;
  totalOtherEarnings: number;
  grossEntitlements: number;
  totalDeductions: number;
  netAmount: number;
  notes: string | null;
  createdByName: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  createdAt: string;
  updatedAt: string;
  overtimeLines: OvertimeLine[];
  earningLines: EarningLine[];
  deductionLines: DeductionLine[];
  warnings: CompensationWarning[];
  /** يظهر في استجابة «نسخ من الشهر السابق» وحدها. */
  copiedFrom?: {
    year: number;
    month: number;
    basicSalarySnapshot: number;
    newBasicSalarySnapshot: number;
    /** سطور سداد المديونيات لا تُنسخ — عددها هنا كي لا يحدث الإسقاط بصمت. */
    skippedDebtRepayments: number;
  };
}

/** نتيجة المعاينة — نفس أرقام الحفظ، بلا كتابة. */
export interface PreviewResult {
  legalRulesVersion: string;
  basicSalary: number;
  hourlyRate: number;
  overtimeLines: Array<Omit<OvertimeLine, 'id'> & { labelAr: string; compensatoryRestDay: boolean }>;
  earningLines: Array<Omit<EarningLine, 'id' | 'entryDate'> & { entryDate: string | null }>;
  deductionLines: Array<Omit<DeductionLine, 'id'>>;
  totalOvertimeAmount: number;
  totalOtherEarnings: number;
  grossEntitlements: number;
  totalDeductions: number;
  netAmount: number;
  warnings: CompensationWarning[];
}

export interface ReverseResult {
  overtimeType: OvertimeType;
  targetAmount: number;
  hourlyRate: number;
  multiplier: number;
  rawHours: number;
  hours: number;
  amount: number;
  difference: number;
}

export interface EmployeeSummary {
  id: number;
  code: string;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  status: string;
  currentBasicSalary: number;
  completedMonths: number;
  approvedMonths: number;
  lastCalculatedMonth: number | null;
  yearNetTotal: number;
}

export interface MonthCell {
  month: number;
  exists: boolean;
  id?: number;
  status: CalculationStatus | 'NOT_CREATED';
  basicSalarySnapshot?: number;
  totalOvertimeAmount?: number;
  totalOtherEarnings?: number;
  totalDeductions?: number;
  grossEntitlements?: number;
  netAmount?: number;
  overtimeHours?: number;
  approvedAt?: string | null;
  updatedAt?: string;
}

export interface AnnualFile {
  employee: {
    id: number;
    code: string;
    fullName: string;
    jobTitle: string | null;
    department: string | null;
    nationality: string | null;
    civilId: string | null;
    status: string;
    currentBasicSalary: number;
  };
  year: number;
  months: MonthCell[];
  yearSummary: {
    createdMonths: number;
    approvedMonths: number;
    totalBasic: number;
    totalOvertime: number;
    totalOtherEarnings: number;
    totalDeductions: number;
    totalGross: number;
    totalNet: number;
  };
}

/** بيانات **الكشف الرسمي المختصر**. لاحظ ما ليس فيها: أجر الساعة، المعاملات،
 *  الحسبة العكسية، المراجع القانونية. غيابها مقصود ومحروس على الخادم. */
export interface StatementData {
  id: number;
  year: number;
  month: number;
  status: CalculationStatus;
  approvedAt: string | null;
  approvedByName: string | null;
  preparedByName: string | null;
  employee: {
    code: string;
    fullName: string;
    /**
     * الاسم الإنجليزي المخزَّن في ملف الموظف (`Employee.fullNameEn`) — **عرض فقط**،
     * ولا يدخل أي حساب. اختياري لأن مسار «التقرير التفصيلي» يشتقّ نوعه من هذا النوع
     * ولا يرسله؛ وغيابه يعني «لا مصدر معتمد» فيُعرض الاسم العربي وحده.
     */
    fullNameEn?: string | null;
    jobTitle: string | null;
    department: string | null;
    nationality: string | null;
    civilId: string | null;
  };
  basicSalary: number;
  overtime: Array<{ overtimeType: OvertimeType; hours: number; amount: number }>;
  earnings: Array<{ label: string; type: EarningType; amount: number }>;
  deductions: Array<{ label: string; type: DeductionType; amount: number }>;
  totals: {
    totalOvertimeAmount: number;
    totalOtherEarnings: number;
    grossEntitlements: number;
    totalDeductions: number;
    netAmount: number;
  };
  notes: string | null;
}

/**
 * بيانات **التقرير التفصيلي الداخلي** — هنا وحدها تظهر خطوات الحساب.
 *
 * `earnings` و`deductions` أوسع من نظيرتيهما في الكشف المختصر: التقرير الداخلي يحمل
 * السبب والملاحظات وعلامة التكرار، والكشف الموقَّع لا يحملها.
 */
export interface DetailedReportData extends Omit<StatementData, 'overtime' | 'earnings' | 'deductions'> {
  earnings: Array<{
    type: EarningType;
    label: string;
    amount: number;
    entryDate: string | null;
    reason: string | null;
    notes: string | null;
    recurring: boolean;
  }>;
  deductions: Array<{ type: DeductionType; label: string; amount: number; notes: string | null }>;
  createdAt: string;
  updatedAt: string;
  legalRulesVersion: string;
  hourlyRate: number;
  /** أساس اشتقاق أجر الساعة — يصل من المحرّك، ولا يُكتب نصًّا في القالب. */
  hourlyRateBasis: { daysDivisor: number; hoursPerDay: number; monthlyHours: number };
  overtimeLines: Array<{
    overtimeType: OvertimeType;
    hours: number;
    hourlyRate: number;
    multiplier: number;
    amount: number;
    calculationMethod: OvertimeMethod;
    reverseTargetAmount: number | null;
    rawHoursBeforeCeiling: number | null;
    roundingDifference: number | null;
    legalReference: string;
    notes: string | null;
  }>;
  warnings: CompensationWarning[];
  /**
   * تفاصيل سداد المديونيات — **التقرير الداخلي وحده** (المتطلب ٢١).
   * غائبة عن `StatementData` بنيويًا، فلا يمكن أن تتسرّب إلى الكشف الموقَّع.
   */
  debtRepayments: DebtRepaymentBreakdown[];
}

/** جسم الحفظ — ما ترسله الواجهة، بلا أي مبلغ محسوب. */
export interface CalculationDraft {
  overtime: Array<{
    overtimeType: OvertimeType;
    hours: number;
    calculationMethod?: OvertimeMethod;
    reverseTargetAmount?: number | null;
    rawHoursBeforeCeiling?: number | null;
    notes?: string | null;
  }>;
  earnings: Array<{
    type: EarningType;
    label: string;
    amount: number;
    entryDate?: string | null;
    reason?: string | null;
    notes?: string | null;
    recurring?: boolean;
  }>;
  deductions: Array<{ type: DeductionType; label: string; amount: number; notes?: string | null; debtId?: number | null }>;
  notes?: string | null;
}

// ─── سجل المديونيات والسلف ────────────────────────────────────────────────────

export type DebtType = 'ADVANCE' | 'DEBT' | 'CUSTOM';
export type DebtStatus = 'OPEN' | 'SETTLED';
export type DebtPaymentSource = 'MONTHLY_COMPENSATION' | 'MANUAL_PAYMENT';

/**
 * سجل مديونية مع رصيده.
 *
 * `paidAmount` و`remainingAmount` و`status` **مشتقّة على الخادم** من دفتر الحركات، لا
 * أعمدة مخزَّنة. لا تحسبها الواجهة ولا تخزّنها: مصدر الحقيقة واحد.
 */
export interface Debt {
  id: number;
  employeeId: number;
  type: DebtType;
  label: string;
  debtDate: string;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: DebtStatus;
  paymentsCount: number;
}

export interface DebtPayment {
  id: number;
  amount: number;
  paymentDate: string;
  sourceType: DebtPaymentSource;
  calculationId: number | null;
  /** الشهر/السنة المصدر — يمكّن زر «فتح الحسبة» بلا استعلام إضافي. */
  calculationPeriod: { year: number; month: number; status: CalculationStatus } | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface DebtDetail extends Debt {
  employee: { id: number; code: string; fullName: string; jobTitle: string | null } | null;
  payments: DebtPayment[];
}

export interface DebtSummary {
  totalDebts: number;
  openDebts: number;
  settledDebts: number;
  totalOriginal: number;
  totalPaid: number;
  totalRemaining: number;
}

export interface DebtLedger {
  employee: { id: number; code: string; fullName: string; jobTitle: string | null; status: string };
  debts: Debt[];
  summary: DebtSummary;
}

/** تفصيل سداد مديونية داخل حسبة شهر — **التقرير الداخلي وحده**. */
export interface DebtRepaymentBreakdown {
  debtId: number;
  debtLabel: string;
  debtType: DebtType;
  debtDate: string;
  originalAmount: number;
  balanceBefore: number;
  paidNow: number;
  balanceAfter: number;
  status: DebtStatus;
  paymentId: number;
}
