/* ════════════════════════════════════════════════════════════════════════════
   مركز التحليل المالي — عقد البيانات كما تراه الواجهة.

   مرآة حرفية لـ `backend/src/modules/financialAnalysis/financialAnalysis.types.ts`.
   الأسماء والمفاتيح متطابقة عمدًا: أي انحراف يظهر فورًا كخطأ أنواع عند الاستهلاك.
   ════════════════════════════════════════════════════════════════════════════ */

export type AnalysisStatus = 'excellent' | 'good' | 'acceptable' | 'weak' | 'critical' | 'none';

export interface AnalysisPeriod {
  from: string | null;
  to: string | null;
  days: number | null;
  previousFrom: string | null;
  previousTo: string | null;
}

export type ProfitabilityRowKey = 'revenue' | 'expenses' | 'profit';

export interface ProfitabilityRow {
  key: ProfitabilityRowKey;
  amount: number;
  percentOfRevenue: number | null;
  changePercent: number | null;
  status: AnalysisStatus;
}

export interface ProfitabilitySection {
  kpis: { revenue: number; expenses: number; profit: number; profitMargin: number | null };
  rows: ProfitabilityRow[];
}

export interface RevenueMonthRow {
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
    topMonth: string | null;
    topMonthRevenue: number;
  };
  rows: RevenueMonthRow[];
}

export interface ExpenseCategoryRow {
  category: string;
  amount: number;
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

export interface CollectionCustomerRow {
  customerId: number | null;
  customerName: string;
  /** رصيد الذمم أول المدة — مقام نسبة التحصيل مع `invoiced`. لا يُعرض كعمود. */
  openingAr: number;
  invoiced: number;
  collected: number;
  /** رصيد آخر المدة: `openingAr + invoiced − collected`. */
  outstanding: number;
  /** `collected ÷ (openingAr + invoiced)` %. */
  collectionRate: number | null;
}

export interface CollectionsSection {
  kpis: {
    openingAr: number;
    collected: number;
    outstanding: number;
    collectionRate: number | null;
    averageCollection: number;
  };
  rows: CollectionCustomerRow[];
}

export interface ReceivableCustomerRow {
  customerId: number | null;
  customerName: string;
  invoiced: number;
  collected: number;
  outstanding: number;
  collectionRate: number | null;
  lastPaymentDate: string | null;
  oldestOpenInvoiceDate: string | null;
  oldestOpenInvoiceNumber: string | null;
  debtAgeDays: number | null;
  status: AnalysisStatus;
}

export interface ReceivablesSection {
  asOf: string | null;
  kpis: {
    totalOutstanding: number;
    debtorCount: number;
    averagePerDebtor: number;
    averageAgeDays: number | null;
    oldestAgeDays: number | null;
    highRiskOutstanding: number;
  };
  rows: ReceivableCustomerRow[];
}

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

export interface TopListsSection {
  topCustomers: { customerId: number | null; customerName: string; revenue: number }[];
  topExpenseCategories: { category: string; amount: number }[];
  topProfitMonths: { month: string; profit: number }[];
}

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
  monthAxisTruncated: boolean;
}

export type DrilldownKind = 'revenue' | 'expenses' | 'collections';

export interface DrilldownRow {
  id: number;
  date: string;
  reference: string;
  label: string;
  amount: number;
}

export interface DrilldownResult {
  kind: DrilldownKind;
  rows: DrilldownRow[];
  total: number;
  count: number;
  truncated: boolean;
}

/** الطلب الذي تفتح به الواجهة نافذة التفصيل — يُترجم إلى معطيات الاستعلام كما هو. */
export interface DrilldownRequest {
  kind: DrilldownKind;
  /** عنوان النافذة (مُترجَم) — يصف الخليّة التي جاء منها الطلب. */
  title: string;
  month?: string;
  category?: string;
  customerId?: number;
}
