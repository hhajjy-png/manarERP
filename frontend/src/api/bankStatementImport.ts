import { api } from './client';

// ── Types (mirrors backend types.ts) ──────────────────────────────────────────

export type ReconcileStatus = 'UNMATCHED' | 'MATCHED' | 'IGNORED' | 'DUPLICATE' | 'REVIEW';
export type MatchedType     = 'invoice' | 'payment' | 'expense' | 'journal' | 'cheque' | 'payroll';
export type MatchConfidence = 100 | 90 | 75 | 0;
export type BankFeeType     =
  | 'TRANSFER_FEE' | 'MONTHLY_FEE' | 'INTEREST' | 'CHARGE' | 'ATM_FEE' | 'CHEQUEBOOK_FEE' | 'OTHER_FEE'
  // Transaction categories (isBankFee=false)
  | 'CASH_WITHDRAWAL' | 'CHEQUE_PAYMENT' | 'BANK_TRANSFER';
export type PostingSuggestionType = 'EXPENSE_LINK' | 'INVOICE_PAYMENT' | 'JOURNAL_ENTRY' | 'IGNORE';

export interface StatementTransaction {
  transactionId:  string | null;
  bankName:       string;
  statementDate:  string | null;
  postingDate:    string | null;
  description:    string;
  reference:      string | null;
  debit:          number;
  credit:         number;
  balance:        number | null;
  currency:       string;
  accountNumber:  string | null;
  iban:           string | null;
  chequeNumber:   string | null;
  rawRow:         Record<string, unknown>;
}

export interface MatchCandidate {
  type:       MatchedType;
  id:         number;
  ref:        string;
  confidence: MatchConfidence;
  matchedBy:  string;
}

export interface MatchResult {
  best:       MatchCandidate | null;
  candidates: MatchCandidate[];
}

export interface PreviewRow extends StatementTransaction {
  rowIndex:       number;
  errors:         string[];
  warnings:       string[];
  isDuplicate:    boolean;
  isBankFee:      boolean;
  bankFeeType:    BankFeeType | null;
  matchResult:    MatchResult;
  normalizedText: string;
}

export interface ImportPreviewSummary {
  bankName:        string;
  fileName:        string;
  fromDate:        string | null;
  toDate:          string | null;
  totalRows:       number;
  totalDebits:     number;
  totalCredits:    number;
  valid:           number;
  invalid:         number;
  warnings:        number;
  duplicates:      number;
  bankFees:        number;
  matched:         number;
  canImport:       boolean;
  rows:            PreviewRow[];
  dedupSummary:    DedupSummary | null;
  coverageSummary: CoverageSummary | null;
}

export interface DedupSummary {
  accountKey:           string;
  totalInFile:          number;
  wouldInsert:          number;
  wouldSkipExact:       number;
  wouldSkipPotential:   number;
  duplicateRate:        number;
  newDataRate:          number;
}

export interface CoverageSummary {
  accountKey:    string;
  hasExisting:   boolean;
  existingFrom:  string | null;
  existingTo:    string | null;
  existingCount: number;
}

export interface ImportResult {
  importId:                number;
  bankName:                string;
  fileName:                string;
  totalRows:               number;
  totalDebits:             number;
  totalCredits:            number;
  importedAt:              string;
  accountKey:              string | null;
  insertedNewCount:        number;
  skippedDuplicateCount:   number;
  potentialDuplicateCount: number;
  duplicateRate:           number;
  newDataRate:             number;
  executionTimeMs:         number;
}

export interface TimelineTransaction {
  id:               number;
  importId:         number;
  importBatchLabel: string;
  fileName:         string;
  importedAt:       string;
  bankName:         string;
  accountKey:       string | null;
  statementDate:    string | null;
  postingDate:      string | null;
  description:      string;
  reference:        string | null;
  debit:            number;
  credit:           number;
  balance:          number | null;
  currency:         string;
  chequeNumber:     string | null;
  reconcileStatus:  ReconcileStatus;
  matchedType:      MatchedType | null;
  matchedRef:       string | null;
  isDuplicate:      boolean;
  isBankFee:        boolean;
}

export interface TimelineResult {
  accountKey:   string;
  totalCount:   number;
  fromDate:     string | null;
  toDate:       string | null;
  importCount:  number;
  transactions: TimelineTransaction[];
  page:         number;
  pageSize:     number;
}

export interface ReconciliationTransaction {
  id:              number;
  importId:        number;
  transactionId:   string | null;
  bankName:        string;
  statementDate:   string | null;
  postingDate:     string | null;
  description:     string;
  reference:       string | null;
  debit:           number;
  credit:          number;
  balance:         number | null;
  currency:        string;
  chequeNumber:    string | null;
  reconcileStatus: ReconcileStatus;
  matchedType:     MatchedType | null;
  matchedId:       number | null;
  matchedRef:      string | null;
  matchConfidence: MatchConfidence | null;
  isDuplicate:     boolean;
  isBankFee:       boolean;
  bankFeeType:     BankFeeType | null;
  errors:          string[];
  warnings:        string[];
}

export interface ReconciliationWorkspace {
  importId:        number;
  bankName:        string;
  fileName:        string;
  importedAt:      string;
  totalRows:       number;
  unmatched:       number;
  matched:         number;
  ignored:         number;
  duplicates:      number;
  review:          number;
  transactions:    ReconciliationTransaction[];
  page:            number;
  pageSize:        number;
  total:           number;
}

export interface PostingSuggestion {
  type:        PostingSuggestionType;
  label:       string;
  description: string;
  linkedType?: MatchedType;
  linkedId?:   number;
  linkedRef?:  string;
  confidence:  MatchConfidence;
}

export interface ImportListItem {
  id:           number;
  bankName:     string;
  fileName:     string;
  importedBy:   string;
  importedAt:   string;
  fromDate:     string | null;
  toDate:       string | null;
  totalRows:    number;
  totalDebits:  number;
  totalCredits: number;
}

export interface ImportListResult {
  total:    number;
  page:     number;
  pageSize: number;
  items:    ImportListItem[];
}

// ── API functions ──────────────────────────────────────────────────────────────

export interface PreviewRequest {
  bankName: string;
  fileName: string;
  fromDate?: string;
  toDate?:   string;
  rows:      StatementTransaction[];
}

export async function previewImport(req: PreviewRequest): Promise<ImportPreviewSummary> {
  const res = await api.post<{ data: ImportPreviewSummary }>('/bank-statement-import/preview', req);
  return res.data.data;
}

export async function executeImport(req: PreviewRequest): Promise<ImportResult> {
  const res = await api.post<{ data: ImportResult }>('/bank-statement-import/execute', req);
  return res.data.data;
}

export async function listImports(page = 1, pageSize = 20): Promise<ImportListResult> {
  const res = await api.get<{ data: ImportListResult }>('/bank-statement-import', { params: { page, pageSize } });
  return res.data.data;
}

export interface WorkspaceFilter {
  status?:      ReconcileStatus;
  isBankFee?:   boolean;
  isDuplicate?: boolean;
  search?:      string;
  fromDate?:    string;
  toDate?:      string;
  minAmount?:   number;
  maxAmount?:   number;
  page?:        number;
  pageSize?:    number;
}

export async function getWorkspace(importId: number, filter: WorkspaceFilter = {}): Promise<ReconciliationWorkspace> {
  const params: Record<string, string> = {};
  if (filter.status)                       params.status      = filter.status;
  if (filter.isBankFee   != null)          params.isBankFee   = String(filter.isBankFee);
  if (filter.isDuplicate != null)          params.isDuplicate = String(filter.isDuplicate);
  if (filter.search)                       params.search      = filter.search;
  if (filter.fromDate)                     params.fromDate    = filter.fromDate;
  if (filter.toDate)                       params.toDate      = filter.toDate;
  if (filter.minAmount != null)            params.minAmount   = String(filter.minAmount);
  if (filter.maxAmount != null)            params.maxAmount   = String(filter.maxAmount);
  if (filter.page     != null)             params.page        = String(filter.page);
  if (filter.pageSize != null)             params.pageSize    = String(filter.pageSize);

  const res = await api.get<{ data: ReconciliationWorkspace }>(
    `/bank-statement-import/${importId}/workspace`,
    { params },
  );
  return res.data.data;
}

export async function updateStatus(
  importId: number,
  transactionId: number,
  body: {
    status:          ReconcileStatus;
    matchedType?:    MatchedType | null;
    matchedId?:      number | null;
    matchedRef?:     string | null;
    matchConfidence?: MatchConfidence | null;
  },
): Promise<void> {
  await api.patch(`/bank-statement-import/${importId}/transactions/${transactionId}/status`, body);
}

export async function bulkUpdateStatus(
  importId: number,
  ids: number[],
  status: ReconcileStatus,
): Promise<{ updated: number }> {
  const res = await api.post<{ data: { updated: number } }>(
    `/bank-statement-import/${importId}/bulk-status`,
    { ids, status },
  );
  return res.data.data;
}

export async function getPostingSuggestions(
  importId: number,
  transactionId: number,
): Promise<PostingSuggestion[]> {
  const res = await api.get<{ data: PostingSuggestion[] }>(
    `/bank-statement-import/${importId}/transactions/${transactionId}/suggestions`,
  );
  return res.data.data;
}

export function getExportUrl(importId: number, format: 'excel' | 'pdf'): string {
  return `${api.defaults.baseURL}/bank-statement-import/${importId}/export?format=${format}`;
}

export async function downloadExport(importId: number, format: 'excel' | 'pdf'): Promise<void> {
  const resp = await api.get<Blob>(
    `/bank-statement-import/${importId}/export`,
    { params: { format }, responseType: 'blob' },
  );
  const ext  = format === 'excel' ? 'xlsx' : 'pdf';
  const mime = format === 'excel'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/pdf';
  const blob = new Blob([resp.data], { type: mime });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `bank-statement-${importId}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export function exportToCsv(transactions: ReconciliationTransaction[], filename: string): void {
  const headers = ['التاريخ', 'الوصف', 'المرجع', 'مدين', 'دائن', 'الرصيد', 'العملة', 'النوع'];
  const rows = transactions.map((t) => [
    t.statementDate ?? '',
    `"${t.description.replace(/"/g, '""')}"`,
    t.reference ?? '',
    t.debit  > 0 ? t.debit.toFixed(3)  : '',
    t.credit > 0 ? t.credit.toFixed(3) : '',
    t.balance != null ? t.balance.toFixed(3) : '',
    t.currency,
    t.bankFeeType ?? '',
  ]);
  const csv  = '﻿' + [headers, ...rows].map((r) => r.join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export async function deleteImport(importId: number): Promise<void> {
  await api.delete(`/bank-statement-import/${importId}`);
}

export async function bulkDeleteImports(ids: number[]): Promise<{ deleted: number }> {
  const res = await api.post<{ data: { deleted: number } }>('/bank-statement-import/bulk-delete', { ids });
  return res.data.data;
}

export async function getTimeline(
  accountKey: string,
  page     = 1,
  pageSize = 50,
): Promise<TimelineResult> {
  const res = await api.get<{ data: TimelineResult }>(
    `/bank-statement-import/timeline/${encodeURIComponent(accountKey)}`,
    { params: { page, pageSize } },
  );
  return res.data.data;
}
