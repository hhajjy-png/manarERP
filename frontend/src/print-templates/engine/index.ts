// Types — re-exported for consumers who need to type print data or definitions
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
} from './types';

// Registry functions — the public API for all production pages
export {
  getPrintTemplates,
  getPrintTemplate,
  getDefaultPrintTemplate,
  getLetterheadVariant,
} from './registry';
