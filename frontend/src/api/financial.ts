import { api } from './client';
import type {
  FinancialResponse, StatementRow, ArAgingRow, ApAgingRow,
  GlStatementRow, GlReportResponse, TrialBalanceAsOfRow, TrialBalancePeriodRow,
  JournalBookRow, DashboardSummary,
} from '../types/financial.types';

export type {
  FinancialResponse, StatementRow, ArAgingRow, ApAgingRow,
  GlStatementRow, GlReportResponse, TrialBalanceAsOfRow, TrialBalancePeriodRow,
  JournalBookRow, DashboardSummary,
};

type StatementFilters = {
  fromDate?: string;
  toDate?: string;
  search?: string;
  referenceType?: string;
  format?: 'pdf' | 'excel';
};

type AgingFilters = {
  asOfDate?: string;
  search?: string;
  customerType?: string;
  hideZero?: boolean;
};

type GlFilters = {
  fromDate?: string;
  toDate?: string;
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

type TrialBalanceFilters = {
  mode: 'as-of' | 'period';
  asOfDate?: string;
  fromDate?: string;
  toDate?: string;
  showZeroBalances?: boolean;
  accountType?: string;
};

type JournalFilters = {
  fromDate?: string;
  toDate?: string;
  status?: string;
  referenceType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export const financialApi = {
  // ── Statement ─────────────────────────────────────────────────────────────
  getStatement(entityType: 'customer' | 'supplier', entityId: number, filters: Omit<StatementFilters, 'format'>) {
    return api.get<{ data: FinancialResponse<StatementRow> }>(
      `/financial/statements/${entityType}/${entityId}`,
      { params: filters }
    ).then(r => r.data.data);
  },
  exportStatement(entityType: 'customer' | 'supplier', entityId: number, filters: StatementFilters) {
    return api.get(
      `/financial/statements/${entityType}/${entityId}/export`,
      { params: filters, responseType: 'blob' }
    ).then(r => r.data as Blob);
  },

  // ── Aging (routes added in Part 3) ────────────────────────────────────────
  getArAging(filters: AgingFilters) {
    return api.get<{ data: FinancialResponse<ArAgingRow> }>(
      '/financial/ar-aging', { params: filters }
    ).then(r => r.data.data);
  },
  getApAging(filters: AgingFilters) {
    return api.get<{ data: FinancialResponse<ApAgingRow> }>(
      '/financial/ap-aging', { params: filters }
    ).then(r => r.data.data);
  },
  exportArAging(filters: AgingFilters & { format: 'pdf' | 'excel' }) {
    return api.get('/financial/ar-aging/export', { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },
  exportApAging(filters: AgingFilters & { format: 'pdf' | 'excel' }) {
    return api.get('/financial/ap-aging/export', { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },

  // ── GL Statement (routes added in Part 4) ─────────────────────────────────
  getGlStatement(accountId: number, filters: GlFilters) {
    return api.get<{ data: FinancialResponse<GlStatementRow> }>(
      `/financial/gl-statement/${accountId}`, { params: filters }
    ).then(r => r.data.data);
  },
  exportGlStatement(accountId: number, filters: GlFilters & { format: 'pdf' | 'excel' }) {
    return api.get(`/financial/gl-statement/${accountId}/export`, { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },

  // ── GL Report (routes added in Part 4) ───────────────────────────────────
  getGlReport(filters: { fromDate?: string; toDate?: string; accountType?: string; page?: number; pageSize?: number }) {
    return api.get<{ data: GlReportResponse }>(
      '/financial/gl-report', { params: filters }
    ).then(r => r.data.data);
  },
  exportGlReport(filters: { fromDate?: string; toDate?: string; format: 'pdf' | 'excel' }) {
    return api.get('/financial/gl-report/export', { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },

  // ── Trial Balance (routes added in Part 4) ────────────────────────────────
  getTrialBalance(filters: TrialBalanceFilters) {
    return api.get<{ data: FinancialResponse<TrialBalanceAsOfRow | TrialBalancePeriodRow> }>(
      '/financial/trial-balance', { params: filters }
    ).then(r => r.data.data);
  },
  exportTrialBalance(filters: TrialBalanceFilters & { format: 'pdf' | 'excel' }) {
    return api.get('/financial/trial-balance/export', { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },

  // ── Journal Book (routes added in Part 4) ─────────────────────────────────
  getJournalBook(filters: JournalFilters) {
    return api.get<{ data: FinancialResponse<JournalBookRow> }>(
      '/financial/journal-book', { params: filters }
    ).then(r => r.data.data);
  },
  exportJournalBook(filters: JournalFilters & { format: 'pdf' | 'excel' }) {
    return api.get('/financial/journal-book/export', { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },

  // ── Financial Summary (routes added in Part 5) ────────────────────────────
  getFinancialSummary(filters: { fromDate?: string; toDate?: string }) {
    return api.get<{ data: FinancialResponse<never> }>(
      '/financial/summary', { params: filters }
    ).then(r => r.data.data);
  },
  exportFinancialSummary(filters: { fromDate?: string; toDate?: string; format: 'pdf' | 'excel' }) {
    return api.get('/financial/summary/export', { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },

  // ── Dashboard Summary (routes added in Part 5) ────────────────────────────
  getDashboardSummary() {
    return api.get<{ data: DashboardSummary }>('/financial/dashboard-summary').then(r => r.data.data);
  },
};
