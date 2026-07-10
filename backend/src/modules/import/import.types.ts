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

// ── Smart Import Assistant (Phase 2) — analytics + quality, additive ──────────
export interface ImportAnalyticsEntry { key: string; count: number }
export interface ImportAnalytics {
  topWarningCodes: ImportAnalyticsEntry[];
  topErrorReasons: ImportAnalyticsEntry[];
  topAffectedFields: ImportAnalyticsEntry[];
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
  /** Informational file-quality score 0–100 (Phase 2). */
  qualityScore?: number;
  /** Preview analytics summary (Phase 2). */
  analytics?: ImportAnalytics;
}

export interface ExecuteSummary {
  entityType: EntityType;
  totalRows: number;
  imported: number;
  invalidRows: number;
  duplicateRows: number;
  backupId: number;
  backupFileName: string;
  /**
   * هل أنشأ الاستيراد قيودًا محاسبية؟ **دائمًا `false` حاليًا.**
   *
   * الاستيراد يكتب المستندات مباشرةً (`tx.invoice.create`…) ولا يستدعي طبقة GL،
   * تفاديًا للترحيل المزدوج. النتيجة أن بيانات السنوات السابقة المستوردة تظهر في
   * قوائم الفواتير والمصروفات لكنها **لا تدخل** قائمة الدخل ولا ميزان المراجعة
   * ولا دفتر الأستاذ حتى تُعتمد يدويًا.
   *
   * انظر: docs/HISTORICAL_IMPORT_POSTING_RISK.md
   */
  accountingPosted: false;
  /** تحذير للعرض عندما يكون النوع ماليًا؛ `null` للأنواع غير المالية. */
  accountingNotice: string | null;
}
