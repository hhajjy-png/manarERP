// Bank Statement Import — shared TypeScript types (no external deps)

export type ReconcileStatus = 'UNMATCHED' | 'MATCHED' | 'IGNORED' | 'DUPLICATE' | 'REVIEW';
export type MatchedType = 'invoice' | 'payment' | 'expense' | 'journal' | 'cheque' | 'payroll';
export type MatchConfidence = 100 | 90 | 75 | 0;

export type BankFeeType =
  | 'TRANSFER_FEE'
  | 'MONTHLY_FEE'
  | 'INTEREST'
  | 'CHARGE'
  | 'ATM_FEE'
  | 'CHEQUEBOOK_FEE'
  | 'OTHER_FEE';

// ── Template / Parser ──────────────────────────────────────────────────────────

export interface BankColumnMap {
  transactionId?: string;
  statementDate: string;
  postingDate?: string;
  description: string;
  reference?: string;
  debit?: string;
  credit?: string;
  amount?: string;   // signed: positive = credit, negative = debit
  balance?: string;
  currency?: string;
  accountNumber?: string;
  iban?: string;
  chequeNumber?: string;
}

export interface BankTemplate {
  bankName: string;
  displayNameAr: string;
  headerRow: number;    // 0-based row index where column headers are found
  dataStartRow: number; // 0-based row index where data begins
  columnMap: BankColumnMap;
  amountSign?: 'standard' | 'inverted'; // inverted: debit positive, credit negative
  dateFormats: string[]; // ordered preference list for date parsing
  currencyDefault: string;
}

// ── Raw / Normalized transaction ───────────────────────────────────────────────

export interface StatementTransaction {
  transactionId:  string | null;
  bankName:       string;
  statementDate:  string | null;  // ISO8601 or null
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

// ── Validation ─────────────────────────────────────────────────────────────────

export type ValidationRule =
  | 'INVALID_CURRENCY'
  | 'INVALID_DATE'
  | 'NEGATIVE_AMOUNT'
  | 'BALANCE_BREAK'
  | 'DUPLICATE_IN_FILE'
  | 'MISSING_DESCRIPTION'
  | 'MISSING_TRANSACTION_ID'
  | 'ZERO_AMOUNT'
  | 'DESCRIPTION_TOO_LONG';

export interface RowValidation {
  rowIndex: number;
  errors:   ValidationRule[];
  warnings: ValidationRule[];
}

// ── Bank Fee Detection ─────────────────────────────────────────────────────────

export interface BankFeeDetection {
  isBankFee:   boolean;
  bankFeeType: BankFeeType | null;
}

// ── Matching ───────────────────────────────────────────────────────────────────

export interface MatchCandidate {
  type:       MatchedType;
  id:         number;
  ref:        string;
  confidence: MatchConfidence;
  matchedBy:  string; // human-readable reason e.g. 'cheque_number', 'invoice_ref'
}

export interface MatchResult {
  best:        MatchCandidate | null;
  candidates:  MatchCandidate[];
}

// ── Preview ────────────────────────────────────────────────────────────────────

export interface PreviewRow extends StatementTransaction {
  rowIndex:        number;
  errors:          ValidationRule[];
  warnings:        ValidationRule[];
  isDuplicate:     boolean;
  isBankFee:       boolean;
  bankFeeType:     BankFeeType | null;
  matchResult:     MatchResult;
  normalizedText:  string;
}

export interface ImportPreviewSummary {
  bankName:     string;
  fileName:     string;
  fromDate:     string | null;
  toDate:       string | null;
  totalRows:    number;
  totalDebits:  number;
  totalCredits: number;
  valid:        number;
  invalid:      number;
  warnings:     number;
  duplicates:   number;
  bankFees:     number;
  matched:      number;   // rows with confidence >= 75
  canImport:    boolean;  // invalid === 0
  rows:         PreviewRow[];
}

// ── Import execution ───────────────────────────────────────────────────────────

export interface ImportInput {
  bankName:  string;
  fileName:  string;
  fromDate?: string;
  toDate?:   string;
  rows:      StatementTransaction[];
}

export interface ImportResult {
  importId:     number;
  bankName:     string;
  fileName:     string;
  totalRows:    number;
  totalDebits:  number;
  totalCredits: number;
  importedAt:   string;
}

// ── Reconciliation Workspace ───────────────────────────────────────────────────

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
  errors:          ValidationRule[];
  warnings:        ValidationRule[];
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

// ── Posting suggestions ────────────────────────────────────────────────────────

export type PostingSuggestionType =
  | 'EXPENSE_LINK'
  | 'INVOICE_PAYMENT'
  | 'JOURNAL_ENTRY'
  | 'IGNORE';

export interface PostingSuggestion {
  type:        PostingSuggestionType;
  label:       string;    // Arabic display label
  description: string;    // Arabic description
  linkedType?: MatchedType;
  linkedId?:   number;
  linkedRef?:  string;
  confidence:  MatchConfidence;
}

// ── Report ─────────────────────────────────────────────────────────────────────

export interface ReconciliationReportRow {
  id:              number;
  bankName:        string;
  statementDate:   string | null;
  description:     string;
  reference:       string | null;
  debit:           number;
  credit:          number;
  reconcileStatus: ReconcileStatus;
  matchedType:     MatchedType | null;
  matchedRef:      string | null;
  matchConfidence: MatchConfidence | null;
  isBankFee:       boolean;
  bankFeeType:     BankFeeType | null;
}

export interface ReconciliationReport {
  importId:     number;
  bankName:     string;
  fileName:     string;
  importedAt:   string;
  generatedAt:  string;
  totalRows:    number;
  totalDebits:  number;
  totalCredits: number;
  matched:      ReconciliationReportRow[];
  unmatched:    ReconciliationReportRow[];
  bankFees:     ReconciliationReportRow[];
}
