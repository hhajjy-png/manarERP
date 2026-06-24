// Mirrored from backend/src/shared/services/financial/financial.types.ts
// Keep in sync when adding new report types.

export interface DrillDownRef {
  entityType: string;
  entityId: number;
  route?: string;
  label: string;
}

export interface FinancialRow {
  id: string;
  drillDown?: DrillDownRef;
  [key: string]: unknown;
}

export interface FinancialSummary {
  openingBalance?: number;
  totalDebit?: number;
  totalCredit?: number;
  closingBalance?: number;
  transactionCount?: number;
  totalOutstanding?: number;
  criticalOver90?: number;
  entityCount?: number;
  isBalanced?: boolean;
  difference?: number;
  [key: string]: number | boolean | undefined;
}

export interface FinancialPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface FinancialResponse<T extends FinancialRow = FinancialRow> {
  reportType: string;
  generatedAt: string;
  filters: Record<string, unknown>;
  summary: FinancialSummary;
  rows: T[];
  totals?: Partial<T>;
  metadata?: Record<string, unknown>;
  pagination?: FinancialPagination;
}

export interface StatementRow extends FinancialRow {
  date: string;
  reference: string;
  referenceType: string;
  referenceId?: number;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: string;
}

export interface ArAgingRow extends FinancialRow {
  customerId: number;
  customerCode: string;
  customerName: string;
  current: number;
  '0_30': number;
  '31_60': number;
  '61_90': number;
  '91_120': number;
  over_120: number;
  total: number;
  lastInvoiceDate?: string;
  invoiceCount: number;
}

export interface ApAgingRow extends FinancialRow {
  supplierId: number;
  supplierCode: string;
  supplierName: string;
  current: number;
  '0_30': number;
  '31_60': number;
  '61_90': number;
  '91_120': number;
  over_120: number;
  total: number;
  lastInvoiceDate?: string;
  invoiceCount: number;
}

export interface GlStatementRow extends FinancialRow {
  date: string;
  journalNumber: string;
  journalEntryId: number;
  referenceType: string;
  referenceId?: number;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: string;
}

export interface GlReportAccount {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: 'DEBIT' | 'CREDIT';
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  rows: GlStatementRow[];
}

export interface GlReportResponse {
  generatedAt: string;
  filters: Record<string, unknown>;
  accounts: GlReportAccount[];
  summary: { totalAccounts: number; fromDate?: string; toDate?: string };
  pagination: FinancialPagination;
}

export interface TrialBalanceAsOfRow extends FinancialRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: 'DEBIT' | 'CREDIT';
  totalDebit: number;
  totalCredit: number;
  balance: number;
  balanceType: 'DEBIT' | 'CREDIT';
}

export interface TrialBalancePeriodRow extends FinancialRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: 'DEBIT' | 'CREDIT';
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
}

export interface JournalBookRow extends FinancialRow {
  entryNumber: string;
  date: string;
  description: string;
  referenceType: string;
  referenceId?: number;
  status: string;
  totalDebit: number;
  totalCredit: number;
  lineCount: number;
  lines: {
    accountCode: string;
    accountName: string;
    description?: string;
    debit: number;
    credit: number;
  }[];
}

export interface TopEntitySummary {
  id: number;
  name: string;
  outstanding: number;
}

export interface DashboardSummary {
  generatedAt: string;
  arSummary: { totalOutstanding: number; criticalOver90: number; entityCount: number };
  apSummary: { totalOutstanding: number; criticalOver90: number; entityCount: number };
  topCustomers: TopEntitySummary[];
  topSuppliers: TopEntitySummary[];
  collectionsLast30: number;
  paymentsLast30: number;
  activeAccountsCount: number;
}
