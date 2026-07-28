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
  TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC,
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1,
  isFlagEnabled,
  setFlagOverride,
  type FlagName,
} from './flags';

export {
  useAccurateFormPreview,
  type AccurateFormPreview,
  type AccurateFormPreviewOptions,
} from './useAccurateFormPreview';

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
  mergePageRules,
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
