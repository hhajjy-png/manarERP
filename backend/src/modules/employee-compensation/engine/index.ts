/**
 * محرّك احتساب مستحقات الموظف الشهرية — الواجهة العامة.
 *
 * كل ما هنا **خالص وحتمي**: لا Prisma، ولا Express، ولا React، ولا تاريخ نظام. الخدمة
 * تستهلكه، والواجهة تستهلكه عبر الخدمة، والاختبارات تستهلكه مباشرة بلا أي تهيئة.
 *
 * حين تُربط هذه الوحدة مستقبلًا بالرواتب، هذا المجلّد وحده هو ما يُعاد استخدامه —
 * لا شيء فيه يعرف من يستدعيه.
 */
export {
  LEGAL_RULES_VERSION,
  MONTHLY_WAGE_DAYS_DIVISOR,
  MONTHLY_WORK_HOURS,
  STANDARD_HOURS_PER_DAY,
  STANDARD_HOURS_PER_WEEK,
  OVERTIME_TYPES,
  OVERTIME_RULES,
  OVERTIME_LIMITS,
  WORK_WEEK_START_DAY,
  DERIVED_MONTHLY_REGULAR_OVERTIME_CEILING,
  isOvertimeType,
  overtimeRule,
  type OvertimeType,
  type OvertimeRule,
} from '../legal/kuwaitLabourLaw';

export {
  allocateAmountAcrossDays,
  evaluateOvertimeCompliance,
  isCompensatoryRestStatus,
  isValidIsoDate,
  monthOf,
  weekStartOf,
  yearOf,
  ANNUAL_EARLY_WARNING_RATIO,
  COMPENSATORY_REST_STATUSES,
  type ComplianceBasis,
  type ComplianceCode,
  type ComplianceFinding,
  type CompensatoryRestStatus,
  type OvertimeComplianceInput,
  type OvertimeComplianceResult,
  type OvertimeDayInput,
} from './overtimeComplianceEngine';

export {
  deriveOvertimeLinesFromDays,
  toDayRows,
  validateOvertimeDays,
  type DayLedgerError,
  type OvertimeDayRecord,
} from './overtimeDayLedger';

export {
  ceilHoursInFavourOfEmployee,
  normalizeHours,
  roundMoney,
  sumMoney,
  HOURS_EPSILON,
} from './rounding';

export { computeHourlyRate } from './hourlyRate';

/**
 * سياسة الشركة — تُصدَّر من الواجهة العامة نفسها كي لا يستورد أحد من `policy/` مباشرةً
 * ويتفرّع مسارُ الوصول. القانون وسياسة الشركة مفهومان منفصلان، لكن بابهما إلى بقية
 * النظام واحد.
 */
export {
  COMPANY_OVERTIME_FACTORS,
  COMPANY_OVERTIME_POLICY_VERSION,
  COMPANY_OVERTIME_RATE_SETTING_KEY,
  COMPANY_OVERTIME_SETTING_GROUP,
  FALLBACK_COMPANY_OVERTIME_BASE_RATE,
  MAX_COMPANY_OVERTIME_BASE_RATE,
  MIN_COMPANY_OVERTIME_BASE_RATE,
  companyOvertimeFactor,
  companyOvertimeRateTable,
  companyRateForType,
  normalizeCompanyOvertimeBaseRate,
  parseStoredCompanyOvertimeBaseRate,
} from '../policy/companyOvertimePolicy';

export {
  amountFromEffectiveRate,
  rateForHoursDerivation,
  resolveEffectiveOvertimeRate,
  type EffectiveOvertimeRate,
  type OvertimeRateSource,
} from './effectiveOvertimeRate';

export {
  checkOvertimeLimits,
  computeOvertimeLine,
  computeOvertimeLines,
  totalHoursOfType,
  totalOvertimeAmount,
  type CompensationWarning,
  type CompensationWarningCode,
  type ComputedOvertimeLine,
  type OvertimeCalculationMethod,
  type OvertimeLineInput,
  type OvertimeLineOptions,
} from './overtimeCalculator';

export {
  reverseOvertimeFromAmount,
  type ReverseOvertimeInput,
  type ReverseOvertimeResult,
} from './reverseOvertimeCalculator';

export {
  assertOriginalCoversPayments,
  assertPaymentWithinBalance,
  availableForMovement,
  computeDebtBalance,
  summarizeDebts,
  DEBT_PAYMENT_SOURCES,
  DEBT_TYPES,
  type DebtBalance,
  type DebtPaymentSource,
  type DebtPortfolioSummary,
  type DebtStatus,
  type DebtType,
  type LedgerMovement,
  type PaymentValidationContext,
} from './debtLedger';

export {
  computeCompensation,
  DEDUCTION_TYPES,
  EARNING_TYPES,
  type CompensationInput,
  type CompensationResult,
  type ComputedDeductionLine,
  type ComputedEarningLine,
  type DeductionLineInput,
  type DeductionType,
  type EarningLineInput,
  type EarningType,
} from './compensationTotals';
