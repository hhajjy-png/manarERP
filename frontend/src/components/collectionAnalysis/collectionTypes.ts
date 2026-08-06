/* ════════════════════════════════════════════════════════════════════════════
   تحليل التحصيلات — عقد البيانات كما تراه الواجهة.

   مرآة حرفية لـ `backend/src/modules/collectionAnalysis/collectionAnalysis.types.ts`.
   الأسماء والمفاتيح متطابقة عمدًا: أي انحراف يظهر فورًا كخطأ أنواع عند الاستهلاك.
   ════════════════════════════════════════════════════════════════════════════ */

export type SettlementStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export type PerformanceDimension = 'customer' | 'contract' | 'project';

export type CollectionScope = 'all' | 'same-year' | 'other-years';

export interface CollectionFilters {
  invoiceFrom?: string;
  invoiceTo?: string;
  collectionFrom?: string;
  collectionTo?: string;
  invoiceYear?: number;
  collectionYear?: number;
  customerId?: number;
  contractId?: number;
  projectId?: number;
  settlement?: SettlementStatus;
  overdueOnly?: boolean;
  outstandingOnly?: boolean;
  collectionScope?: CollectionScope;
  search?: string;
}

export interface CollectionPeriod {
  invoiceFrom: string | null;
  invoiceTo: string | null;
  collectionFrom: string | null;
  collectionTo: string | null;
  asOf: string | null;
}

export interface CollectionKpis {
  totalInvoiceValue: number;
  totalCollected: number;
  collectionRate: number | null;
  collectedSameYear: number;
  collectedOtherYears: number;
  outstanding: number;
  averageCollectionDays: number | null;
  largestDeferredYear: number | null;
  largestDeferredAmount: number;
  invoiceCount: number;
  collectionCount: number;
}

export interface CollectionSummaryRow {
  invoiceYear: number;
  invoiceValue: number;
  collectedSameYear: number;
  collectedOtherYears: number;
  outstanding: number;
  collectionRate: number | null;
  averageDays: number | null;
  variance: number;
  invoiceCount: number;
}

export interface CollectionSummaryTotals {
  invoiceValue: number;
  collectedSameYear: number;
  collectedOtherYears: number;
  outstanding: number;
  collectionRate: number | null;
  averageDays: number | null;
  variance: number;
  invoiceCount: number;
}

export interface CollectionTransferRow {
  invoiceYear: number;
  collectionYear: number;
  amount: number;
  percent: number | null;
  invoiceCount: number;
  paymentCount: number;
}

export interface CollectionMatrix {
  invoiceYears: number[];
  collectionYears: number[];
  cells: number[][];
  rowTotals: number[];
  columnTotals: number[];
  grandTotal: number;
  rowInvoiceValue: number[];
  rowOutstanding: number[];
}

export interface OutstandingRow {
  invoiceYear: number;
  outstanding: number;
  percent: number | null;
  invoiceCount: number;
  oldestOutstandingDate: string | null;
  oldestOutstandingNumber: string | null;
  averageAgeDays: number | null;
}

export interface OutstandingTotals {
  outstanding: number;
  invoiceCount: number;
  averageAgeDays: number | null;
  oldestOutstandingDate: string | null;
}

export interface PerformanceRow {
  key: string;
  id: number | null;
  name: string;
  invoiceCount: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  collectionRate: number | null;
  averageDays: number | null;
}

export interface PerformanceSection {
  customer: PerformanceRow[];
  contract: PerformanceRow[];
  project: PerformanceRow[];
}

export interface CollectionFacets {
  invoiceYears: number[];
  collectionYears: number[];
  customers: { id: number | null; name: string }[];
  contracts: { id: number | null; name: string }[];
  projects: { id: number; name: string }[];
}

export interface CollectionAnalysisReport {
  period: CollectionPeriod;
  filters: CollectionFilters;
  kpis: CollectionKpis;
  summary: { rows: CollectionSummaryRow[]; totals: CollectionSummaryTotals };
  transfer: CollectionTransferRow[];
  matrix: CollectionMatrix;
  outstanding: { rows: OutstandingRow[]; totals: OutstandingTotals };
  performance: PerformanceSection;
  facets: CollectionFacets;
}

export interface DrilldownPayment {
  id: number;
  date: string;
  collectionYear: number;
  amount: number;
  method: string;
  reference: string | null;
  daysToCollect: number;
  remainingAfter: number;
}

export interface DrilldownInvoice {
  invoiceId: number;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  invoiceYear: number;
  total: number;
  customerName: string;
  contractCode: string | null;
  projectName: string;
  collectedInScope: number;
  collectedTotal: number;
  remaining: number;
  status: SettlementStatus;
  overdue: boolean;
  averageDaysToCollect: number | null;
  payments: DrilldownPayment[];
}

export interface CollectionDrilldownResult {
  rows: DrilldownInvoice[];
  count: number;
  truncated: boolean;
  totals: { invoiced: number; collected: number; outstanding: number };
}

export interface DrilldownScope {
  scopeInvoiceYear?: number;
  scopeCollectionYear?: number;
  dimension?: PerformanceDimension;
  dimensionId?: number;
}

/**
 * الطلب الذي تفتح به الواجهة نافذة التفصيل — الحصر + عنوان يصف الخليّة.
 * يُترجَم إلى معطيات الاستعلام كما هو، فوق فلاتر الصفحة النشطة.
 */
export interface CollectionDrilldownRequest extends DrilldownScope {
  /** عنوان النافذة (مُترجَم) — يصف الخليّة التي جاء منها الطلب. */
  title: string;
  /** وصف فرعي اختياري (مثلاً «تحصيل 2024»). */
  subtitle?: string;
}
