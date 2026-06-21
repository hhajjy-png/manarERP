/**
 * Print Templates — public API for Phase 2 production pages.
 *
 * Production pages should import ONLY from this barrel:
 *
 * ```ts
 * import {
 *   usePrintTemplate,
 *   usePrintProfile,
 *   buildInvoicePrintData,
 *   resolveTemplateForProfile,
 *   PrintTemplateSelector,
 *   tafqeet,
 * } from '../print-templates';
 * ```
 *
 * Direct imports from sub-packages are reserved for cross-package composition
 * inside print-templates/ itself.
 *
 * Architecture layers (bottom → top):
 *   Reference Templates → Engine → Service → Adapters → Builders → Hooks → Production Pages
 */

// ── Engine: types + registry ──────────────────────────────────────────────────
export type {
  PrintTemplateCategory,
  PrintTemplateLanguage,
  PrintTemplatePaper,
  PrintTemplateComponent,
  PrintTemplateDefinition,
  CompanyPrintData,
  PrintLineItem,
  InvoicePrintData,
  QuotationPrintData,
  PurchaseOrderPrintData,
  RFQPrintData,
} from './engine';

export {
  getPrintTemplates,
  getPrintTemplate,
  getDefaultPrintTemplate,
  getLetterheadVariant,
} from './engine';

// ── Storage ───────────────────────────────────────────────────────────────────
export {
  loadPrintProfile,
  savePrintProfile,
  resetPrintProfile,
  PRINT_PROFILE_DEFAULTS,
} from './storage';

export type { PrintProfile, PrintPaperType } from './storage';

// ── Service ───────────────────────────────────────────────────────────────────
export {
  listTemplates,
  findTemplate,
  getDefaultTemplate,
  resolveTemplateForProfile,
} from './service';

// ── Adapters — types and company helpers only ─────────────────────────────────
// Raw adapter functions (adaptInvoice, adaptPurchaseOrder, etc.) are NOT
// exported here. Production pages must go through builders instead.
// Adapters remain accessible from adapters/index.ts for internal tests.
export type {
  ApiInvoice,
  ApiInvoiceItem,
  ApiInvoicePayment,
  ApiInvoiceCustomer,
  ApiInvoiceSupplier,
  ApiInvoiceContract,
  ApiQuotation,
  ApiQuotationItem,
  ApiRFQ,
  ApiRFQItem,
} from './adapters';

export {
  ALMANAR_COMPANY,
  getDefaultCompanyPrintData,
  createCompanyPrintData,
} from './adapters';

// ── Builders ──────────────────────────────────────────────────────────────────
export {
  buildInvoicePrintData,
  buildQuotationPrintData,
  buildPurchaseOrderPrintData,
  buildRFQPrintData,
} from './builders';

export type {
  InvoiceBuildOptions,
  QuotationBuildOptions,
  PurchaseOrderBuildOptions,
  RFQBuildOptions,
} from './builders';

// ── Utils ─────────────────────────────────────────────────────────────────────
export { tafqeet } from './utils';
export { splitKWD, formatKWD, formatKWDAr } from './utils';
export type { KWDParts } from './utils';
export { formatDateForPrint, formatDateCompact, formatDateArabicLong } from './utils';

// ── Hooks ─────────────────────────────────────────────────────────────────────
export { usePrintProfile, getPrintProfile } from './hooks';
export { usePrintTemplate } from './hooks';
export type { UsePrintTemplateResult } from './hooks';

// ── Components ────────────────────────────────────────────────────────────────
export { PrintTemplateSelector } from './components';
