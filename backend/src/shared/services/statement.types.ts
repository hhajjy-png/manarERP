export type StatementEntityType = 'CUSTOMER' | 'SUPPLIER';

export type StatementReferenceType = 'INVOICE' | 'PAYMENT' | 'EXPENSE';

export interface StatementFilters {
  fromDate?: Date;
  toDate?: Date;
  search?: string;
  status?: string;
  referenceType?: StatementReferenceType;
}

export interface StatementEntry {
  /** Unique identifier for this row: e.g. 'INVOICE-42', 'PAYMENT-7', 'EXPENSE-15' */
  id: string;
  date: Date;
  /** Human-readable reference: invoice number, expense code, or 'PMNT-{id}' */
  reference: string;
  referenceType: StatementReferenceType;
  referenceId: number;
  description: string;
  /** Amount that INCREASES the outstanding balance (Customer: invoice total; Supplier: payment made) */
  debit: number;
  /** Amount that DECREASES the outstanding balance (Customer: payment received; Supplier: invoice/expense) */
  credit: number;
  /** Computed: openingBalance + sum(debit) - sum(credit) up to and including this row */
  runningBalance: number;
  status: string;
  entityName: string;
  entityCode: string;
}

export interface StatementSummary {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  transactionCount: number;
}

export interface StatementResult {
  entityId: number;
  entityType: StatementEntityType;
  entityName: string;
  entityCode: string;
  fromDate?: Date;
  toDate?: Date;
  openingBalance: number;
  entries: StatementEntry[];
  summary: StatementSummary;
}

export interface StatementInput {
  entityType: StatementEntityType;
  entityId: number;
  filters: StatementFilters;
}
