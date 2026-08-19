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
/** أيّ السعرين غلب في سطر العمل الإضافي. */
export type OvertimeRateSource = 'COMPANY_POLICY' | 'STATUTORY_FLOOR';

/**
 * السعر الفعلي لنوع واحد كما حسمه الخادم.
 *
 * الواجهة **لا تحسب `max` بنفسها** ولا تضرب السعر الأساسي في أي معامل: كل رقم هنا وصل
 * من `engine/effectiveOvertimeRate.ts`. تكرار المعادلة في React كان يعني أن يعرض
 * المحرّر سعرًا ويخزّن الخادم آخر.
 */
export interface EffectiveOvertimeRate {
  overtimeType: OvertimeType;
  statutoryHourlyRate: number;
  statutoryMultiplier: number;
  statutoryMinimumRate: number;
  companyBaseRate: number | null;
  companyFactor: number | null;
  companyDerivedRate: number | null;
  effectiveRate: number;
  source: OvertimeRateSource;
  companyBelowStatutory: boolean;
  policyVersion: string | null;
}

/** إعداد الافتراضي العام لسعر ساعة الإضافي — يخصّ الوحدة كلها. */
export interface CompanyOvertimeSettings {
  baseRate: number;
  /** `false` = لم يختره المستخدم بعد، والمعروض هو نقطة البدء الاحتياطية. */
  isConfigured: boolean;
  fallbackBaseRate: number;
  minBaseRate: number;
  maxBaseRate: number;
  policyVersion: string;
  factors: Record<OvertimeType, number>;
  /** أسعار الأنواع الثلاثة المشتقّة من الافتراضي — محسوبة على الخادم. */
  rates: Record<OvertimeType, number>;
}

export interface CompensationWarning {
  code:
    | 'OVERTIME_ANNUAL_LIMIT_EXCEEDED'
    | 'OVERTIME_MONTHLY_DERIVED_CEILING_EXCEEDED'
    | 'COMPENSATORY_REST_DAY_DUE'
    | 'OVERTIME_DAILY_LIMITS_NOT_VERIFIABLE'
    | 'COMPANY_OVERTIME_RATE_BELOW_STATUTORY';
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

/** حالة يوم الراحة البديل المستحقّ (المادتان ٦٧ و٦٨). */
export type CompensatoryRestStatus = 'PENDING' | 'SCHEDULED' | 'TAKEN';

/**
 * يوم عمل إضافي واحد — **مصدر الحقيقة** لساعات الشهر منذ حزمة السجل اليومي.
 * `date` بصيغة `YYYY-MM-DD` دائمًا (تاريخ عمل محلي لا لحظة زمنية)، ويُعرض `DD/MM/YYYY`.
 */
export interface OvertimeDayEntry {
  id?: number;
  date: string;
  overtimeType: OvertimeType;
  hours: number;
  notes: string | null;
  /** `null` لأيام REGULAR — المادة ٦٦ لا تُنشئ استحقاق راحة تعويضية. */
  compensatoryRestStatus: CompensatoryRestStatus | null;
  compensatoryRestDate: string | null;
}

/** بند مخالفة أو إفصاح من محرّك الالتزام. */
export interface ComplianceFinding {
  code: string;
  /**
   * `STATUTORY`  — حدّ قانوني أثبتته بيانات الوحدة. يمنع الاعتماد.
   * `DISCLOSURE` — حدّ قانوني لا تملك الوحدة بيانات لفحصه. يُعرض ولا يمنع.
   * `ADVISORY`   — تنبيه إداري لا نصّ قانوني له. يُعرض ولا يمنع.
   */
  basis: 'STATUTORY' | 'DISCLOSURE' | 'ADVISORY';
  messageAr: string;
  date?: string;
  weekStart?: string;
  weekEnd?: string;
  limit?: number;
  actual?: number;
  excess?: number;
}

/** نتيجة تقييم الالتزام — تُعاد مع كل قراءة وحفظ، ولا تُخزَّن أبدًا. */
export interface OvertimeCompliance {
  /** `false` عند وجود أي مخالفة `STATUTORY` — وهو وحده ما يمنع الاعتماد. */
  compliant: boolean;
  /** `false` = سجل شهري قديم بلا تفاصيل يومية. */
  hasDailyDetail: boolean;
  /**
   * اكتمال التحقّق — **سؤال مختلف عن `compliant`**.
   * `compliant` يقول «لم تثبت مخالفة»؛ وهذا يقول «هل كانت البيانات كافية للفحص أصلًا».
   * `PARTIAL` = توجد أشهر مجمّعة بلا تواريخ تمنع فحص حدود الأيام.
   */
  verification: 'FULL' | 'PARTIAL';
  /** أرقام الأشهر المجمّعة التي منعت التحقّق الكامل. */
  legacyMonths: number[];
  regular: {
    monthHours: number;
    monthDays: number;
    yearHours: number;
    /** الجزء الآتي من أشهر مجمّعة بلا تواريخ. */
    yearHoursFromLegacy: number;
    yearDays: number;
    annualHoursLimit: number;
    annualDaysLimit: number;
  };
  weeklyRest: { hours: number; days: number; compensatoryPending: number };
  officialHoliday: { hours: number; days: number; compensatoryPending: number };
  violations: ComplianceFinding[];
  warnings: ComplianceFinding[];
}

export interface OvertimeLine {
  id?: number;
  overtimeType: OvertimeType;
  hours: number;
  /** أجر الساعة العادي القانوني. */
  hourlyRate: number;
  /** المعامل القانوني للنوع. */
  multiplier: number;
  // أسعار السطر — `null` في السطور المحفوظة قبل حزمة سعر الشركة.
  statutoryMinimumRate: number | null;
  companyBaseRate: number | null;
  companyDerivedRate: number | null;
  effectiveRate: number | null;
  rateSource: OvertimeRateSource | null;
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
  /**
   * تفصيل الساعة — `hours × rate = amount`، وكلاهما `null` معًا للبنود المالية البحتة.
   * شرحٌ لمبلغ سطر مالي لا واقعة عمل: لا يدخل حدود المادة ٦٦ ولا محرّك الالتزام.
   */
  hours: number | null;
  rate: number | null;
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
  /** سعر الشركة المعتمد لهذا الشهر. `null` = محفوظ قبل الحزمة: بالحد القانوني وحده. */
  companyOvertimeBaseRateSnapshot: number | null;
  companyOvertimePolicyVersion: string | null;
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
  /** تفاصيل الأيام. مصفوفة فارغة = سجل شهري قديم (Legacy) لا يُحوَّل تلقائيًا. */
  overtimeDayEntries: OvertimeDayEntry[];
  earningLines: EarningLine[];
  deductionLines: DeductionLine[];
  warnings: CompensationWarning[];
  /** تقييم الالتزام القانوني — يُعاد إنتاجه عند كل قراءة ولا يُخزَّن. */
  compliance: OvertimeCompliance;
  /** يظهر في استجابة «نسخ من الشهر السابق» وحدها. */
  copiedFrom?: {
    year: number;
    month: number;
    basicSalarySnapshot: number;
    newBasicSalarySnapshot: number;
    /** سعر شركة الشهر المنسوخ منه وسعر الشهر الجديد — للمقارنة وإبلاغ المستخدم. */
    companyOvertimeBaseRateSnapshot: number | null;
    newCompanyOvertimeBaseRateSnapshot: number | null;
    /** سطور سداد المديونيات لا تُنسخ — عددها هنا كي لا يحدث الإسقاط بصمت. */
    skippedDebtRepayments: number;
  };
}

/** نتيجة المعاينة — نفس أرقام الحفظ، بلا كتابة. */
export interface PreviewResult {
  legalRulesVersion: string;
  companyOvertimePolicyVersion: string | null;
  basicSalary: number;
  hourlyRate: number;
  companyOvertimeBaseRate: number | null;
  /** جدول الأسعار الثلاثة — يصل محسوبًا حتى بلا سطر إضافي واحد. */
  overtimeRates: Record<OvertimeType, EffectiveOvertimeRate>;
  overtimeLines: Array<Omit<OvertimeLine, 'id'> & { labelAr: string; compensatoryRestDay: boolean }>;
  earningLines: Array<Omit<EarningLine, 'id' | 'entryDate'> & { entryDate: string | null }>;
  deductionLines: Array<Omit<DeductionLine, 'id'>>;
  totalOvertimeAmount: number;
  totalOtherEarnings: number;
  grossEntitlements: number;
  totalDeductions: number;
  netAmount: number;
  warnings: CompensationWarning[];
  /**
   * تقييم الالتزام القانوني للمسودة الجارية — يصل مع كل معاينة، فيرى المستخدم
   * المخالفة لحظة إدخالها لا بعد الحفظ.
   */
  compliance: OvertimeCompliance;
  /** أخطاء شكل في الأيام (تاريخ خارج الشهر / مكرَّر) — تُعرض ولا تمنع التحرير. */
  dayErrors: Array<{ code: string; messageAr: string; date?: string }>;
}

export interface ReverseResult {
  overtimeType: OvertimeType;
  targetAmount: number;
  hourlyRate: number;
  multiplier: number;
  statutoryMinimumRate: number;
  companyDerivedRate: number | null;
  /** السعر المستعمل في الاشتقاق وفي إعادة حساب المبلغ. */
  effectiveRate: number;
  rateSource: OvertimeRateSource;
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
  /** تفصيل الشهر حسب النوع القانوني — مفصول لا مجموع (المتطلب ٣٢). */
  regularHours?: number;
  regularDays?: number;
  weeklyRestHours?: number;
  weeklyRestDays?: number;
  officialHolidayHours?: number;
  officialHolidayDays?: number;
  compensatoryRestPending?: number;
  /** `false` = سجل شهري قديم بلا تفاصيل يومية. */
  hasDailyDetail?: boolean;
  approvedAt?: string | null;
  updatedAt?: string;
}

/** سطر في سجلّ الإضافي السنوي (المتطلب ٣٣). */
export interface OvertimeHistoryRow {
  date: string;
  month: number;
  overtimeType: OvertimeType;
  hours: number;
  compensatoryRestStatus: CompensatoryRestStatus | null;
  compensatoryRestDate: string | null;
  notes: string | null;
  calculationId: number;
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
  /** إجماليات الالتزام السنوية — مفصولة بالنوع القانوني (المتطلب ٣٢). */
  overtimeYtd: {
    regularHours: number;
    regularDays: number;
    weeklyRestHours: number;
    officialHolidayHours: number;
    compensatoryRestPending: number;
    annualHoursLimit: number;
    annualDaysLimit: number;
  };
  /** سجلّ الإضافي السنوي — كل الأيام مرتَّبة زمنيًا (المتطلب ٣٣). */
  overtimeHistory: OvertimeHistoryRow[];
}

/** بيانات **الكشف الرسمي المختصر**. لاحظ ما ليس فيها: أجر الساعة، المعاملات،
 *  الحسبة العكسية، المراجع القانونية. غيابها مقصود ومحروس على الخادم. */
/**
 * صفّ واحد في فهرس **الطباعة الجماعية**: موظف له كشوف فعلًا، والسنوات التي له فيها
 * كشوف. لا مبالغ هنا ولا إجماليات — الفهرس يملأ قائمتَي الاختيار لا أكثر.
 */
export interface PrintIndexEmployee {
  id: number;
  code: string;
  fullName: string;
  jobTitle: string | null;
  status: string;
  /** تنازليًا (الأحدث أولًا)، ولا تحوي سنةً بلا كشف واحد على الأقل. */
  years: number[];
}

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
  earnings: Array<{ label: string; type: EarningType; amount: number; hours: number | null; rate: number | null }>;
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
    hours: number | null;
    rate: number | null;
  }>;
  deductions: Array<{ type: DeductionType; label: string; amount: number; notes: string | null }>;
  createdAt: string;
  updatedAt: string;
  legalRulesVersion: string;
  /** إصدار سياسة الشركة وسعرها الأساسي — `null` لشهر بلا سياسة شركة. */
  companyOvertimePolicyVersion: string | null;
  companyOvertimeBaseRate: number | null;
  hourlyRate: number;
  /** أساس اشتقاق أجر الساعة — يصل من المحرّك، ولا يُكتب نصًّا في القالب. */
  hourlyRateBasis: { daysDivisor: number; hoursPerDay: number; monthlyHours: number };
  overtimeLines: Array<{
    overtimeType: OvertimeType;
    hours: number;
    hourlyRate: number;
    multiplier: number;
    statutoryMinimumRate: number | null;
    companyBaseRate: number | null;
    companyDerivedRate: number | null;
    effectiveRate: number | null;
    rateSource: OvertimeRateSource | null;
    amount: number;
    calculationMethod: OvertimeMethod;
    reverseTargetAmount: number | null;
    rawHoursBeforeCeiling: number | null;
    roundingDifference: number | null;
    legalReference: string;
    notes: string | null;
  }>;
  warnings: CompensationWarning[];
  compliance: OvertimeCompliance;
  /**
   * جدول الأيام (المتطلب ٣٤) — **التقرير التفصيلي وحده**، غائب عن الكشف المختصر.
   * `amount` موزَّع من إجمالي سطر النوع فيجمع العمود إلى الإجمالي بالضبط.
   * مصفوفة فارغة = سجل شهري قديم بلا تفاصيل يومية.
   */
  overtimeDays: Array<{
    date: string;
    overtimeType: OvertimeType;
    hours: number;
    effectiveRate: number | null;
    amount: number;
    compensatoryRestStatus: CompensatoryRestStatus | null;
    compensatoryRestDate: string | null;
    notes: string | null;
  }>;
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
  /**
   * أيام العمل الإضافي. حين تُرسَل غير فارغة، **تُشتقّ منها ساعات السطور على الخادم**
   * وتُتجاهَل ساعات `overtime` — فلا يوجد مصدران للساعات يمكن أن يتباعدا.
   * إغفالها أو إرسالها فارغة يبقي الشهر على المسار الشهري القديم بلا تفاصيل.
   */
  overtimeDays?: Array<{
    date: string;
    overtimeType: OvertimeType;
    hours: number;
    notes?: string | null;
    compensatoryRestStatus?: CompensatoryRestStatus | null;
    compensatoryRestDate?: string | null;
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
  /**
   * سعر ساعة الإضافي المعتمد من الشركة لهذا الشهر.
   *   · رقم    ⇒ اعتمده لهذا الشهر وحده (لا يمسّ الافتراضي العام).
   *   · `null` ⇒ بالحد القانوني وحده.
   *   · الغياب ⇒ عند الإنشاء: خذ الافتراضي. عند التحديث: أبقِ المحفوظ.
   */
  companyOvertimeBaseRate?: number | null;
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
