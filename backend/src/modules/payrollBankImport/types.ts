// ── Bank Templates ─────────────────────────────────────────────────────────────

export type BankTemplate =
  | 'KFH'
  | 'NBK'
  | 'Boubyan'
  | 'GulfBank'
  | 'Warba'
  | 'AhliUnited'
  | 'Unknown';

// ── Parsed Input Row ───────────────────────────────────────────────────────────

/** One normalized row from any bank template, already parsed by the frontend. */
export interface ParsedBankRow {
  employeeCode: string | null;    // رقم الموظف
  civilId: string | null;         // الرقم المدني
  iban: string | null;            // IBAN
  bankAccount: string | null;     // رقم الحساب
  beneficiaryName: string;        // اسم المستفيد
  amount: number;                 // المبلغ
  currency: string;               // العملة
  transactionId: string | null;   // رقم المعاملة
  paymentDate: string | null;     // تاريخ الدفع (ISO string or raw)
  paymentStatus: string | null;   // حالة الدفع من البنك
  payrollMonth: number;           // شهر الرواتب (1-12)
  payrollYear: number;            // سنة الرواتب
  // Source tracking
  _rowIndex: number;
  _sheetName: string;
}

// ── Matching ───────────────────────────────────────────────────────────────────

export type MatchConfidence = 'CODE_100' | 'CIVIL_ID_100' | 'BANK_ACCOUNT_90' | 'MANUAL';

export interface MatchResult {
  employeeId: number | null;
  employeeName: string | null;
  employeeCode: string | null;
  employeeStatus: string | null;
  confidence: MatchConfidence | null;
  isMatched: boolean;
}

// ── Validation ─────────────────────────────────────────────────────────────────

export interface RowValidation {
  errors: string[];    // blocking
  warnings: string[]; // non-blocking
}

// ── Preview ────────────────────────────────────────────────────────────────────

export type PreviewRowStatus = 'valid' | 'warning' | 'error';

export interface PreviewRow {
  // Source
  _rowIndex: number;
  _sheetName: string;
  payrollMonth: number;
  payrollYear: number;
  // Parsed fields
  employeeCode: string | null;
  civilId: string | null;
  iban: string | null;
  bankAccount: string | null;
  beneficiaryName: string;
  amount: number;
  currency: string;
  transactionId: string | null;
  paymentDate: string | null;
  // Match
  matchedEmployeeId: number | null;
  matchedEmployeeName: string | null;
  matchedEmployeeCode: string | null;
  matchConfidence: MatchConfidence | null;
  isMatched: boolean;
  // Validation
  errors: string[];
  warnings: string[];
  isValid: boolean;
  isDuplicate: boolean;
  // Computed
  status: PreviewRowStatus;
}

export interface PreviewSummary {
  templateName: string;
  totalRows: number;
  matched: number;
  unmatched: number;
  valid: number;
  withWarnings: number;
  invalid: number;
  duplicates: number;
  totalAmount: number;
  canExecute: boolean;
  rows: PreviewRow[];
}

// ── Execute ────────────────────────────────────────────────────────────────────

export interface ExecuteInput {
  templateName: string;
  rows: ParsedBankRow[];
}

export interface ImportReportRow {
  employeeCode: string | null;
  employeeName: string | null;
  civilId: string | null;
  amount: number;
  currency: string;
  transactionId: string | null;
  paymentDate: string | null;
  payrollMonth: number;
  payrollYear: number;
  status: 'imported' | 'skipped';
  reason?: string;
}

export interface ImportReport {
  templateName: string;
  importedAt: string;
  importedBy: string;
  imported: number;
  skipped: number;
  withWarnings: number;
  totalAmount: number;
  rows: ImportReportRow[];
}

// ── Service interface ──────────────────────────────────────────────────────────

export interface PreviewInput {
  templateName: string;
  rows: ParsedBankRow[];
}
