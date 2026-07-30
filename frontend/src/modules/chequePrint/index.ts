/**
 * Cheque printing — shared contract barrel (Deterministic Geometry & Unified
 * Pipeline Pack v1). The single import point for the physical page contract and
 * the resolved print job used by every cheque print entry point.
 */
export {
  MM_PER_CM,
  MICRONS_PER_MM,
  CSS_PX_PER_MM,
  MIN_PAGE_MICRONS,
  A4_PORTRAIT_MM,
  A4_LANDSCAPE_MM,
  A4_LANDSCAPE_PAGE,
  cmToMm,
  mmToMicrons,
  mmToCssPx,
  realChequePage,
  physicalPageFor,
  cssPageRule,
  printOptionsFor,
} from './physicalPage';
export type { PhysicalPageSpec, ChequePaperKind, ChequePrintOptions } from './physicalPage';

export { buildChequePrintJob } from './chequePrintJob';
export type {
  ChequePrintJob,
  ChequePrintItem,
  ChequePrintPurpose,
  ResolvedTemplateRef,
  ChequeTrackingRef,
  BuildChequePrintJobInput,
} from './chequePrintJob';

export { DEFAULT_TEMPLATE_MISSING_MESSAGE, resolveDefaultPrintTemplate } from './resolveTemplate';
export type { TemplateResolution } from './resolveTemplate';

export {
  MIN_GLYPH_ADVANCE_EM,
  surfaceWidthPx,
  fontSizeToCqw,
  estimateTextWidthPx,
  textDefinitelyOverflows,
} from './textFit';
