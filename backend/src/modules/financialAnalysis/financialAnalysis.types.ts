/* ════════════════════════════════════════════════════════════════════════════
   Financial Analysis Center — عقد البيانات المشترك بين طبقة البيانات وطبقة العرض.

   هذا الملف **لا يستورد Prisma ولا Express**: هو العقد الوحيد الذي تتفق عليه
   طبقة البيانات (`financialAnalysis.dataset.ts`) وطبقة الحساب النقية
   (`financialAnalysis.compute.ts`) والواجهة. أي تغيير هنا يظهر فورًا كخطأ
   تحقّق أنواع في الطرفين — وهو المقصود.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * تصنيف الحالة المعروض في عمود «الحالة» — مقياس واحد عبر كل الأقسام.
 *
 * `critical` أُضيفت لتحليل الذمم: الدين المتقادم يحتاج درجة أشدّ من `weak`
 * («متأخر») تفصل «عالي الخطورة» عنه. بقية الأقسام لا تُنتجها إطلاقًا.
 */
export type AnalysisStatus = 'excellent' | 'good' | 'acceptable' | 'weak' | 'critical' | 'none';

/** الفترة المختارة — تظهر **مرة واحدة فقط** أعلى الصفحة (لا تتكرر في الأقسام). */
export interface AnalysisPeriod {
  /** `YYYY-MM-DD` — بداية الفترة الفعلية (بعد الحلّ من السنة/الشهر/المخصص). */
  from: string | null;
  /** `YYYY-MM-DD` — نهاية الفترة الفعلية (شاملة). */
  to: string | null;
  /** عدد الأيام في الفترة (شامل الطرفين). `null` عند غياب أحد الحدّين. */
  days: number | null;
  /** الفترة السابقة المكافئة بالطول — أساس عمود «مقارنة بالفترة السابقة». */
  previousFrom: string | null;
  previousTo: string | null;
}

// ── 1. تحليل الربحية ────────────────────────────────────────────────────────

export type ProfitabilityRowKey = 'revenue' | 'expenses' | 'profit';

export interface ProfitabilityRow {
  key: ProfitabilityRowKey;
  amount: number;
  /** نسبة البند من الإيرادات (الإيرادات نفسها = 100). `null` عند إيراد صفري. */
  percentOfRevenue: number | null;
  /** التغيّر % مقابل الفترة السابقة المكافئة. `null` إن تعذّرت المقارنة. */
  changePercent: number | null;
  status: AnalysisStatus;
}

export interface ProfitabilitySection {
  kpis: {
    revenue: number;
    expenses: number;
    profit: number;
    /** هامش الربح % — `null` عند إيراد صفري. */
    profitMargin: number | null;
  };
  rows: ProfitabilityRow[];
}

// ── 2. تحليل الإيرادات ──────────────────────────────────────────────────────

export interface RevenueMonthRow {
  /** وسم الشهر `YYYY-MM` — التنسيق المعروض مسؤولية الواجهة. */
  month: string;
  revenue: number;
  invoiceCount: number;
  averageInvoice: number;
}

export interface RevenueSection {
  kpis: {
    totalRevenue: number;
    invoiceCount: number;
    averageInvoice: number;
    /** الشهر الأعلى إيرادًا (`YYYY-MM`) — `null` عند غياب البيانات. */
    topMonth: string | null;
    topMonthRevenue: number;
  };
  rows: RevenueMonthRow[];
}

// ── 3. تحليل المصروفات ──────────────────────────────────────────────────────

export interface ExpenseCategoryRow {
  /** مفتاح التصنيف الخام (`ENUMS.expenseCategory`) — الترجمة مسؤولية الواجهة. */
  category: string;
  amount: number;
  /** نسبة البند من إجمالي المصروفات — مجموع العمود = 100.0% بالضبط. */
  percent: number;
  count: number;
}

export interface ExpenseSection {
  kpis: {
    totalExpenses: number;
    expenseCount: number;
    averageExpense: number;
    topCategory: string | null;
    topCategoryAmount: number;
  };
  rows: ExpenseCategoryRow[];
}

// ── 4. تحليل التحصيل ────────────────────────────────────────────────────────

export interface CollectionCustomerRow {
  customerId: number | null;
  customerName: string;
  /**
   * رصيد الذمم **أول المدة** — كل فاتورة ناقص كل دفعة قبل `period.from`.
   *
   * هو الجزء الغائب من المقام الذي كان يجعل نسبة التحصيل تتجاوز 100%: دفعات
   * الفترة عن فواتير أسبق كانت تُقسَم على فواتير الفترة وحدها. صفرٌ دائمًا حين
   * تكون بداية الفترة مفتوحة (لا «قبل» عندئذٍ).
   */
  openingAr: number;
  /** إجمالي الفواتير الصادرة للعميل **داخل الفترة**. */
  invoiced: number;
  /** إجمالي الدفعات المستلمة منه **داخل الفترة** (قد تخصّ فواتير أقدم). */
  collected: number;
  /**
   * رصيد **آخر المدة**: `openingAr + invoiced − collected`.
   *
   * رصيدٌ حقيقي لا فرقُ حركتين. يبقى سالبًا فقط عند سدادٍ يفوق ما استُحقّ فعلًا
   * (رصيد دائن للعميل) — لا بسبب اختلاف نطاقٍ بين بسطٍ ومقام كما كان.
   */
  outstanding: number;
  /**
   * مؤشّر فاعلية التحصيل: `collected ÷ (openingAr + invoiced)` %.
   * `null` عند قابلٍ للتحصيل غير موجب — لا أساس للنسبة أصلًا.
   */
  collectionRate: number | null;
}

export interface CollectionsSection {
  kpis: {
    /** مجموع أرصدة أول المدة — مقام النسبة مع `invoiced`. */
    openingAr: number;
    collected: number;
    /** مجموع أرصدة آخر المدة عبر الصفوف. */
    outstanding: number;
    /** `collected ÷ (openingAr + Σinvoiced)` — نفس تعريف الصفّ على مستوى القسم. */
    collectionRate: number | null;
    /** متوسط الدفعة الواحدة. */
    averageCollection: number;
  };
  rows: CollectionCustomerRow[];
}

// ── 5. تحليل الذمم المدينة ──────────────────────────────────────────────────

export interface ReceivableCustomerRow {
  customerId: number | null;
  customerName: string;
  /**
   * إجمالي ما فُوتر على العميل **حتى `asOf`** — تراكمي لا حركة فترة.
   * هذا ما يجعل `outstanding = invoiced − collected` صحيحًا داخل الصفّ نفسه.
   */
  invoiced: number;
  /** إجمالي ما سُدِّد **حتى `asOf`** — تراكمي بالمثل. */
  collected: number;
  /** الرصيد القائم — **موجب دائمًا** في هذا القسم (الصفوف مقصورة على المدينين). */
  outstanding: number;
  /** نسبة التحصيل التراكمية — لا تتجاوز 100% ولا تنزل تحت الصفر بحكم البناء. */
  collectionRate: number | null;
  /** `YYYY-MM-DD` لآخر دفعة حتى `asOf` (قد تسبق الفترة)، أو `null` إن لم يدفع قط. */
  lastPaymentDate: string | null;
  /** أقدم فاتورة لم تُغطَّ بعد بتوزيع الدفعات (الأقدم أولًا). */
  oldestOpenInvoiceDate: string | null;
  oldestOpenInvoiceNumber: string | null;
  /** عمر الدين بالأيام من أقدم فاتورة مستحقة حتى تاريخ الاحتساب. */
  debtAgeDays: number | null;
  status: AnalysisStatus;
}

export interface ReceivablesSection {
  /** تاريخ الاحتساب: نهاية الفترة، أو أحدث حركة في البيانات عند المدى المفتوح. */
  asOf: string | null;
  kpis: {
    /** مجموع الأرصدة **الموجبة** فقط — الدين الفعلي، لا صافي التدفّق. */
    totalOutstanding: number;
    debtorCount: number;
    averagePerDebtor: number;
    /** متوسط عمر الدين مرجَّحًا بالمبلغ — لا متوسطًا حسابيًا مضلِّلًا. */
    averageAgeDays: number | null;
    oldestAgeDays: number | null;
    /** مجموع أرصدة العملاء في درجتَي «متأخر» و«عالي الخطورة». */
    highRiskOutstanding: number;
  };
  rows: ReceivableCustomerRow[];
}

// ── 6. الأداء الشهري ────────────────────────────────────────────────────────

export interface MonthlyPerformanceRow {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
  collections: number;
  profitMargin: number | null;
}

export interface MonthlyPerformanceSection {
  rows: MonthlyPerformanceRow[];
  totals: Omit<MonthlyPerformanceRow, 'month'>;
}

// ── 6. أعلى القوائم ─────────────────────────────────────────────────────────

export interface TopListsSection {
  topCustomers: { customerId: number | null; customerName: string; revenue: number }[];
  topExpenseCategories: { category: string; amount: number }[];
  topProfitMonths: { month: string; profit: number }[];
}

// ── 7. المؤشرات المالية ─────────────────────────────────────────────────────

export type IndicatorKey =
  | 'expenseRatio'
  | 'daysSalesOutstanding'
  | 'returnPerRevenueDinar'
  | 'expenseCoverageByCollections'
  | 'averageMonthlyProfit';

export interface IndicatorRow {
  key: IndicatorKey;
  value: number | null;
  format: 'percent' | 'money' | 'days';
  status: AnalysisStatus;
}

export interface IndicatorsSection {
  rows: IndicatorRow[];
}

// ── التقرير الكامل ──────────────────────────────────────────────────────────

export interface FinancialAnalysisReport {
  period: AnalysisPeriod;
  profitability: ProfitabilitySection;
  revenue: RevenueSection;
  expenses: ExpenseSection;
  collections: CollectionsSection;
  receivables: ReceivablesSection;
  monthlyPerformance: MonthlyPerformanceSection;
  topLists: TopListsSection;
  indicators: IndicatorsSection;
  /** صحيح حين قُصّ محور الأشهر إلى «الأشهر ذات البيانات فقط» (تجاوز 36 شهرًا). */
  monthAxisTruncated: boolean;
}

// ── الحقائق الخام (طبقة البيانات → طبقة الحساب) ─────────────────────────────

/** فاتورة مبيعات فعّالة داخل الفترة — أدنى مجموعة حقول تكفي كل الأقسام. */
export interface InvoiceFact {
  id: number;
  invoiceNumber: string;
  issueDate: Date;
  total: number;
  customerId: number | null;
  customerName: string | null;
}

/** مصروف معتمد داخل الفترة. */
export interface ExpenseFact {
  id: number;
  code: string;
  date: Date;
  amount: number;
  category: string;
  description: string;
}

/** دفعة تحصيل داخل الفترة (لفاتورة مبيعات غير ملغاة). */
export interface PaymentFact {
  id: number;
  date: Date;
  amount: number;
  invoiceId: number;
  invoiceNumber: string;
  customerId: number | null;
  customerName: string | null;
}

/**
 * مجموعة البيانات الموحّدة — **المصدر الوحيد** الذي تُشتقّ منه الأقسام السبعة.
 *
 * تُحمَّل مرّة واحدة لكل طلب، ثم تُمرَّر إلى دوال الحساب النقية. لا يقرأ أي قسم
 * من قاعدة البيانات مباشرة، فلا يمكن أن ينحرف رقم قسم عن آخر.
 */
export interface AnalysisDataset {
  period: AnalysisPeriod;
  invoices: InvoiceFact[];
  expenses: ExpenseFact[];
  payments: PaymentFact[];
  /**
   * **الأستاذ حتى نهاية الفترة** — كل فاتورة مبيعات فعّالة وكل دفعة وقعت في أو قبل
   * `period.to`، بلا حدّ أدنى.
   *
   * لماذا مصفوفتان إضافيتان بدل الاكتفاء بحقائق الفترة؟ لأن «الذمم المدينة» (§5)
   * رصيدٌ **كما في تاريخ** لا صافي حركة فترة: عميل فوتِر في يناير ولم يسدِّد لا
   * يظهر مدينًا إطلاقًا لو حُسب الرصيد من فواتير مارس وحدها، ودفعةٌ في مارس عن
   * فاتورة يناير كانت تُطرح من فواتير مارس فتُنقص الرصيد خطأً. هذا هو بالضبط
   * «الرصيد المرحَّل بين الفترات»، وهو تعريف الذمم المعتمد في المشروع حرفيًا
   * (`shared/services/operational.reporting.getAccountsReceivable`).
   *
   * الأقسام §1–§4 و§6 تبقى على `invoices`/`expenses`/`payments` — حركة الفترة
   * وحدها — فلا يتسرّب أي رقم تاريخي إلى الإيراد أو التحصيل أو الأداء الشهري.
   *
   * الكلفة: استعلاما الفواتير والدفعات يفقدان حدّهما الأدنى، فيقرآن تاريخ المبيعات
   * كاملًا حتى نهاية الفترة. حقولٌ قليلة لكل صفّ وقاعدة SQLite محلية، وهو الحدّ
   * الأدنى الذي يتطلّبه رصيدٌ صحيح — لا يمكن اشتقاق التقادم FIFO من مجاميع فقط.
   */
  ledger: { invoices: InvoiceFact[]; payments: PaymentFact[] };
  /** أرقام الفترة السابقة المكافئة — للمقارنة فقط، لا تدخل أي جدول. */
  previous: { revenue: number; expenses: number; profit: number };
}

// ── التنقّل التفصيلي (Drill-down) ───────────────────────────────────────────

export type DrilldownKind = 'revenue' | 'expenses' | 'collections';

export interface DrilldownRow {
  id: number;
  /** `YYYY-MM-DD`. */
  date: string;
  /** رقم الفاتورة / كود المصروف — المرجع القابل للتتبّع. */
  reference: string;
  /** اسم العميل، أو وصف المصروف. */
  label: string;
  amount: number;
}

export interface DrilldownResult {
  kind: DrilldownKind;
  rows: DrilldownRow[];
  /** مجموع **كل** السجلات المطابقة (لا الصفحات المعروضة فقط). */
  total: number;
  /** العدد الكلي المطابق قبل القصّ. */
  count: number;
  /** صحيح حين تجاوز العدد حدّ العرض وقُصّت القائمة. */
  truncated: boolean;
}
