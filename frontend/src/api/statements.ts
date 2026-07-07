import { api } from './client';
import { downloadBlob } from '../utils/exportUtils';
import { generateExportFileName, ReportName } from '../utils/exportFilename';

export type StatementReferenceType = 'INVOICE' | 'PAYMENT' | 'EXPENSE';

export interface StatementEntry {
  id: string;
  date: string;
  reference: string;
  referenceType: StatementReferenceType;
  referenceId: number;
  description: string;
  debit: number;
  credit: number;
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
  entityType: 'CUSTOMER' | 'SUPPLIER';
  entityName: string;
  entityCode: string;
  fromDate?: string;
  toDate?: string;
  openingBalance: number;
  entries: StatementEntry[];
  summary: StatementSummary;
}

export interface StatementFilters {
  fromDate?: string;
  toDate?: string;
  search?: string;
  status?: string;
  referenceType?: StatementReferenceType;
}

export const statementsApi = {
  async getCustomerStatement(entityId: number, filters: StatementFilters = {}): Promise<StatementResult> {
    const res = await api.get(`/statements/customers/${entityId}`, { params: cleanFilters(filters) });
    return res.data.data as StatementResult;
  },

  async getSupplierStatement(entityId: number, filters: StatementFilters = {}): Promise<StatementResult> {
    const res = await api.get(`/statements/suppliers/${entityId}`, { params: cleanFilters(filters) });
    return res.data.data as StatementResult;
  },

  async exportCustomer(entityId: number, filters: StatementFilters = {}, entityName: string): Promise<void> {
    const res = await api.get(`/statements/customers/${entityId}/export`, {
      params: cleanFilters(filters),
      responseType: 'blob',
    });
    downloadBlob(
      new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      generateExportFileName({
        reportName: ReportName.CustomerStatement,
        identifier: entityName,
        extension: 'xlsx',
      }),
    );
  },

  async exportSupplier(entityId: number, filters: StatementFilters = {}, entityName: string): Promise<void> {
    const res = await api.get(`/statements/suppliers/${entityId}/export`, {
      params: cleanFilters(filters),
      responseType: 'blob',
    });
    downloadBlob(
      new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      generateExportFileName({
        reportName: ReportName.SupplierStatement,
        identifier: entityName,
        extension: 'xlsx',
      }),
    );
  },
};

function cleanFilters(filters: StatementFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
  ) as Record<string, string>;
}
