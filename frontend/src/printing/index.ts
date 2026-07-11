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
  isFlagEnabled,
  isPhase2Enabled,
  setFlagOverride,
  type FlagName,
} from './flags';

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
  type CapturedStyles,
  type StyleCaptureProblem,
} from './styleCapture';

export { usePrintCenter, type PreviewSource, type PrintCenterState } from './usePrintCenter';

export { default as PrintCenterDialog, type PrintCenterDialogProps } from './components/PrintCenterDialog';

export type {
  PrintRenderSource,
  PrintPreviewRequest,
  PrintPreviewArtifact,
  PrintPreviewState,
} from './types';

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
