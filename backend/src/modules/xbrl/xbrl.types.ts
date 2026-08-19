/**
 * أنواع نطاق جاهزية XBRL.
 *
 * كل ما هنا **صور مقروءة** من النظام المحاسبي (`ReadinessDataset`) أو نواتج تحقق.
 * لا نوع واحد منها يُكتب إلى جدول محاسبي، ولا يحمل أي منها مرجعًا قابلًا للتعديل
 * إلى قيد أو رصيد: الطبقة تقرأ وتصف، ولا تُعدِّل.
 */
import type {
  XbrlReadinessStatus,
  XbrlRuleCategory,
  XbrlRuleCode,
  XbrlSeverity,
} from './xbrl.constants';

// ─── صور مقروءة من النظام القائم ─────────────────────────────────────────────

/** حساب من دليل الحسابات + رصيده — للقراءة فقط. */
export interface AccountBalanceSnapshot {
  accountId: number;
  code: string;
  name: string;
  nameEn: string | null;
  type: string;
  normalBalance: string;
  isActive: boolean;
  /** مدين − دائن، مقرّبًا بدقة الدينار. */
  balance: number;
  totalDebit: number;
  totalCredit: number;
}

export interface TrialBalanceTotals {
  totalDebit: number;
  totalCredit: number;
  difference: number;
  isBalanced: boolean;
}

/** أطراف معادلة الميزانية محسوبة من نفس الأرصدة المقروءة. */
export interface BalanceSheetEquation {
  assets: number;
  liabilities: number;
  /** حقوق الملكية المسجَّلة، **قبل** إضافة نتيجة الفترة. */
  equity: number;
  revenue: number;
  expenses: number;
  /** الإيرادات − المصروفات. */
  netResult: number;
  /** حقوق الملكية + نتيجة الفترة. */
  totalEquityWithResult: number;
  /** الأصول − (الالتزامات + حقوق الملكية شاملة النتيجة). */
  difference: number;
  isBalanced: boolean;
  /** حسابات فعّالة بنوع غير معروف — سبب أي فرق في المعادلة. */
  unclassifiedAccountIds: number[];
}

export interface CompanyInfoSnapshot {
  name: string | null;
  nameEn: string | null;
  country: string | null;
  phone: string | null;
  address: string | null;
}

// ─── صور من جداول `xbrl_*` ───────────────────────────────────────────────────

export interface TaxonomySnapshot {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string | null;
  jurisdiction: string;
  version: string;
  status: string;
  isOfficial: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export interface ConceptSnapshot {
  id: number;
  taxonomyId: number;
  conceptCode: string;
  namespace: string | null;
  labelAr: string;
  labelEn: string | null;
  dataType: string;
  balanceType: string;
  periodType: string;
  statementType: string;
  parentConceptId: number | null;
  isRequired: boolean;
  displayOrder: number;
}

export interface AccountMappingSnapshot {
  id: number;
  taxonomyId: number;
  accountId: number;
  conceptId: number;
  status: string;
  isEnabled: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  source: string;
  notes: string | null;
}

export interface StatementMappingSnapshot {
  id: number;
  taxonomyId: number;
  statementType: string;
  lineCode: string;
  lineLabelAr: string;
  lineLabelEn: string | null;
  parentLineCode: string | null;
  conceptId: number | null;
  displayOrder: number;
  isTotal: boolean;
  isEnabled: boolean;
}

export interface ReportingContextSnapshot {
  id: number | null;
  name: string;
  taxonomyId: number | null;
  entityName: string;
  entityNameEn: string | null;
  entityIdentifier: string | null;
  entityScheme: string | null;
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  instantDate: string | null;
  comparativePeriodStart: string | null;
  comparativePeriodEnd: string | null;
  currency: string;
  decimals: number;
  reportingLanguage: string;
  isDefault: boolean;
}

// ─── مجموعة البيانات التي يعمل عليها محرّك التحقق ─────────────────────────────

/**
 * كل ما يحتاجه التحقق، مُجمَّعًا مسبقًا وبلا أي وصول إلى قاعدة البيانات.
 *
 * فصل التجميع عن الحكم مقصود: محرّك القواعد دالة صافية على هذه البنية، فيُختبَر
 * بمدخلات مصنوعة يدويًا بلا Prisma ولا شبكة، ولا يستطيع بحكم بنيته أن يكتب شيئًا.
 */
export interface ReadinessDataset {
  taxonomy: TaxonomySnapshot | null;
  /** هل يوجد أي تصنيف مسجَّل كرسمي في النظام كله (لا في هذا السياق وحده). */
  hasOfficialTaxonomy: boolean;
  concepts: ConceptSnapshot[];
  accounts: AccountBalanceSnapshot[];
  accountMappings: AccountMappingSnapshot[];
  statementMappings: StatementMappingSnapshot[];
  context: ReportingContextSnapshot | null;
  company: CompanyInfoSnapshot;
  trialBalance: TrialBalanceTotals;
  equation: BalanceSheetEquation;
}

// ─── نواتج التحقق والجاهزية ──────────────────────────────────────────────────

export interface ValidationFinding {
  code: XbrlRuleCode;
  severity: XbrlSeverity;
  category: XbrlRuleCategory;
  messageAr: string;
  /** الكيان المعني — للتوجيه في الواجهة فقط. */
  entityType?: 'ACCOUNT' | 'CONCEPT' | 'MAPPING' | 'STATEMENT_LINE' | 'TAXONOMY' | 'CONTEXT' | 'COMPANY';
  entityIds?: number[];
  /** تفاصيل رقمية إضافية (فروق، أعداد) — للعرض والتشخيص. */
  details?: Record<string, unknown>;
}

export interface ValidationResult {
  findings: ValidationFinding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** لا أخطاء — التنبيهات لا تمنع. */
  isValid: boolean;
}

export interface ReadinessScore {
  /** الحسابات الفعّالة ذات النوع المالي المعروف. */
  applicableAccounts: number;
  mapped: number;
  unmapped: number;
  needsReview: number;
  notApplicable: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  /** المربوط ÷ القابل للربط × 100، بمنزلة عشرية واحدة. */
  mappedPercentage: number;
  status: XbrlReadinessStatus;
  /**
   * دائمًا `false` في v1. الحقل موجود ليقرأه العميل بدل أن يستنتج، فلا تظهر في
   * الواجهة عبارة توافق رسمي بناءً على تخمين.
   */
  officialTaxonomyInstalled: boolean;
}

/** الاستجابة الكاملة لشاشة الجاهزية. */
export interface ReadinessReport {
  generatedAt: string;
  taxonomy: TaxonomySnapshot | null;
  context: ReportingContextSnapshot | null;
  company: CompanyInfoSnapshot;
  trialBalance: TrialBalanceTotals;
  equation: BalanceSheetEquation;
  score: ReadinessScore;
  validation: ValidationResult;
  /** الحسابات مع حالة ربط كل حساب — مصدر جدول «ربط الحسابات» في الواجهة. */
  accounts: AccountReadinessRow[];
}

export interface AccountReadinessRow {
  accountId: number;
  code: string;
  name: string;
  type: string;
  balance: number;
  /** UNMAPPED هنا **مشتقة** من غياب سطر ربط فعّال، لا مخزَّنة. */
  mappingStatus: 'MAPPED' | 'UNMAPPED' | 'NEEDS_REVIEW' | 'NOT_APPLICABLE';
  mappingId: number | null;
  conceptId: number | null;
  conceptCode: string | null;
  conceptLabelAr: string | null;
  notes: string | null;
}
