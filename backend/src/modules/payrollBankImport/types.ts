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
  // Assistant (v1) — preview-only, non-blocking
  matchConfidencePct: number | null;
  assistantWarnings: AssistantWarning[];
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
  // Assistant (v1) — preview-only, non-blocking. Absent on the raw buildPreview output.
  assistant?: AssistantSummary;
}

// ── Payroll Bank Import Assistant (v1) ──────────────────────────────────────────
// All assistant output is preview-only and non-blocking. It never affects
// `canExecute` (which stays a pure function of blocking errors + unmatched rows).

export type AssistantSeverity = 'info' | 'warning' | 'danger';

/** A single structured, non-blocking assistant finding attached to a row. */
export interface AssistantWarning {
  code: string;              // stable machine code, e.g. 'IBAN_INVALID'
  severity: AssistantSeverity;
  messageAr: string;         // Arabic-first message shown in the UI
  field?: string;            // optional source field the finding relates to
}

/** One payroll period (source month) summary within the uploaded file. */
export interface PeriodSummary {
  label: string;             // sourceMonth label, e.g. 'Mar-25'
  month: number;
  year: number;
  rowCount: number;
  totalAmount: number;
  existingInPeriod: number;  // salary_payments already recorded for this period
}

/** An employee expected (paid last comparable period) but absent from the file. */
export interface MissingEmployee {
  employeeId: number;
  code: string;
  fullName: string;
  lastAmount: number | null;
}

export interface VarianceReport {
  totalImported: number;             // Σ amount of non-error rows
  totalMatched: number;              // Σ amount of matched non-error rows
  totalUnmatched: number;            // Σ amount of unmatched rows
  employeesInFile: number;           // distinct matched employees
  matchedCount: number;              // matched rows
  unmatchedCount: number;            // unmatched rows
  rowCount: number;
  previousPeriodLabel: string | null; // comparable prior month label, if found
  previousTotal: number | null;       // Σ amount recorded for the prior month
  varianceAmount: number | null;      // totalImported − previousTotal
  variancePercent: number | null;     // variance as % of previousTotal
  byPeriod: PeriodSummary[];
  missingEmployees: MissingEmployee[];
}

export interface QualityBreakdown {
  score: number;             // 0..100, informational only
  matchScore: number;        // positive contribution from match coverage
  errorPenalty: number;
  unmatchedPenalty: number;
  warningPenalty: number;
  duplicatePenalty: number;
  ibanPenalty: number;
  anomalyPenalty: number;
  missingPenalty: number;
}

/** Employee-index / file ambiguities that could misroute a payment. */
export interface CollisionReport {
  civilId: string[];         // civil IDs shared by >1 employee
  bankAccount: string[];     // bank accounts shared by >1 employee
  employeeCode: string[];    // employee codes shared by >1 employee (normally none)
  ibanInFile: string[];      // IBANs appearing on >1 uploaded row
}

export interface AssistantSummary {
  variance: VarianceReport;
  quality: QualityBreakdown;
  collisions: CollisionReport;
  warningCounts: Record<string, number>; // assistant warning code → occurrences
  ibanChecked: number;
  ibanValid: number;
  ibanInvalid: number;
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
