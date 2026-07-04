export type EntityType = 'employees' | 'customers' | 'equipment' | 'suppliers' | 'prices' | 'contracts' | 'expenses' | 'invoices' | 'payroll';

export type RowStatus = 'valid' | 'invalid' | 'duplicate';

// ── Smart Import Validation (Phase 1) — additive, non-blocking ────────────────
// Warnings never change a row's status (valid/invalid/duplicate) and never block
// import. They only surface "valid but suspicious" data during PREVIEW.
export type WarningSeverity = 'info' | 'warning' | 'danger';

export interface ImportWarning {
  code: string;              // e.g. 'IDENTICAL_DATES'
  severity: WarningSeverity;
  field?: string;            // affected field, e.g. 'residencyExpiry'
  messageAr: string;         // primary (Arabic)
  messageEn: string;         // English fallback
  suggestedFix?: string;     // optional guidance (Arabic)
}

export interface RowResult {
  rowIndex: number;
  status: RowStatus;
  data: Record<string, unknown>;
  errors?: string[];
  duplicateKey?: string;
  duplicateValue?: string;
  /** Non-blocking advisory warnings (only ever set on `valid` rows). */
  warnings?: ImportWarning[];
}

export interface PreviewSummary {
  entityType: EntityType;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: RowResult[];
  /** Count of VALID rows that carry at least one warning. */
  warningRows?: number;
  /** Tally of warnings by code (for the summary card). */
  warningsByCode?: Record<string, number>;
}

export interface ExecuteSummary {
  entityType: EntityType;
  totalRows: number;
  imported: number;
  invalidRows: number;
  duplicateRows: number;
  backupId: number;
  backupFileName: string;
}
