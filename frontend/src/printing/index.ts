/**
 * Print Center — public barrel.
 *
 * Pages must import from here, never from the internal modules directly (the same
 * rule print-templates already enforces). Legacy print paths are untouched and keep
 * importing `utils/print`.
 */

export {
  PRINT_CONTRACT_VERSION,
  assertNeverDocType,
  type PrintJob,
  type PrintJobResult,
  type PrintJobStatus,
  type PrintDocType,
  type PrintDestination,
  type PrintOrientation,
  type PrinterDescriptor,
  type PaperSize,
  type PageSpecId,
} from './types';

export {
  PAGE_SPECS,
  RECEIPT_VOUCHER_PAGE_SPEC,
  getPageSpec,
  listPageSpecs,
  toPageCss,
  type PageSpec,
  type PageMargins,
} from './pageSpec';

export {
  PRINT_CENTER_FOUNDATION_V1,
  PRINT_CENTER_PHASE2,
  PRINT_CENTER_PHASE2_RECEIPT_VOUCHER,
  PRINT_CENTER_PHASE2_INVOICE,
  PRINT_CENTER_PHASE2_QUOTATION,
  PRINT_PREVIEW_LEGACY_FORMS_V1,
  PRINT_PREVIEW_LEGACY_FORMS_FINANCE,
  PRINT_PREVIEW_LEGACY_FORMS_HR,
  PRINT_PREVIEW_LEGACY_FORMS_SPECIAL,
  TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC,
  isFlagEnabled,
  isPhase2Enabled,
  isLegacyFormsPreviewEnabled,
  setFlagOverride,
  type FlagName,
} from './flags';

export {
  useLegacyFormPreview,
  type LegacyFormPreview,
  type LegacyFormPreviewOptions,
} from './useLegacyFormPreview';

// ── Phase 2 ─────────────────────────────────────────────────────────────────────
export {
  composeFromNode,
  composeFromHtml,
  composeStyledFromNode,
  MAX_COMPOSED_HTML_BYTES,
  type ComposeOptions,
  type ComposeStyledOptions,
} from './composeDocument';

export {
  capturePrintStyles,
  absolutizeUrls,
  type CapturedStyles,
  type StyleCaptureProblem,
} from './styleCapture';

export { default as PrintPreviewDialog, type PrintPreviewDialogProps } from './components/PrintPreviewDialog';

export type { PrintRenderSource } from './types';

export {
  waitForPrintReady,
  DEFAULT_PRINT_READY_TIMEOUT_MS,
  type PrintReadyResult,
} from './readiness';

export {
  submitPrintJob,
  createPrintJob,
  listPrinters,
  normalizeCopies,
  isPrintInFlight,
  MAX_PRINT_COPIES,
  type SubmitOptions,
} from './printCenter';

export { recordPrintEvent, type PrintAuditEvent, type PrintAuditAction } from './auditClient';
