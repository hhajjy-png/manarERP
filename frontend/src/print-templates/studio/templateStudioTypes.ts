// ─── Document types ────────────────────────────────────────────────────────────
export type TemplateStudioDocumentType = 'invoice' | 'quotation';

// ─── Style tokens — no arbitrary CSS allowed ──────────────────────────────────
export type StudioFontSize    = 'small' | 'normal' | 'large' | 'xlarge';
export type StudioFontWeight  = 'regular' | 'medium' | 'bold';
export type StudioTextColor   = 'default' | 'brand' | 'dark' | 'blue' | 'black' | 'gray';
export type StudioTextAlign   = 'start' | 'center' | 'end';
export type StudioColorToken  = 'transparent' | 'white' | 'light' | 'gray' | 'brand' | 'dark' | 'black';

export interface StudioTextStyle {
  fontSize?:   StudioFontSize;
  fontWeight?: StudioFontWeight;
  color?:      StudioTextColor;
  align?:      StudioTextAlign;
}

// ─── Base element ─────────────────────────────────────────────────────────────
interface BaseElement {
  id:        string;  // unique within template
  label:     string;  // human-readable label for editor UI
  x:         number;  // mm from left edge
  y:         number;  // mm from top edge
  w:         number;  // mm width
  h:         number;  // mm height
  rotation:  number;  // degrees (0 = no rotation)
  locked?:   boolean;
  hidden?:   boolean;
}

// ─── Element types (discriminated union on `type`) ────────────────────────────
export interface TextElement extends BaseElement {
  type:    'text';
  content: string;
  style:   StudioTextStyle;
}

export interface DynamicFieldElement extends BaseElement {
  type:  'dynamicField';
  field: string; // must be in INVOICE_ALLOWED_FIELDS or QUOTATION_ALLOWED_FIELDS
  style?: StudioTextStyle;
}

export interface QrElement extends BaseElement {
  type:  'qr';
  field: string; // allowed field to encode; empty = encode template name
}

export interface BarcodeElement extends BaseElement {
  type:  'barcode';
  field: string; // allowed field value to encode
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src:  string; // data URL only (no external URLs)
  alt:  string;
}

export interface LineElement extends BaseElement {
  type:        'line';
  orientation: 'horizontal' | 'vertical';
  color:       StudioColorToken;
  thickness:   number; // mm
}

export interface RectElement extends BaseElement {
  type:         'rect';
  fillColor:    StudioColorToken;
  borderColor:  StudioColorToken;
  borderRadius: number; // mm
}

export interface CircleElement extends BaseElement {
  type:        'circle';
  fillColor:   StudioColorToken;
  borderColor: StudioColorToken;
}

// ─── Line-items table allowlists ─────────────────────────────────────────────
export const INVOICE_LINE_ITEM_FIELDS = [
  'index', 'description', 'quantity', 'unit', 'unitPrice', 'discount', 'total',
] as const;

export const QUOTATION_LINE_ITEM_FIELDS = [
  'index', 'description', 'quantity', 'unit', 'unitPrice', 'total',
] as const;

export type AllowedLineItemField =
  | (typeof INVOICE_LINE_ITEM_FIELDS)[number]
  | (typeof QUOTATION_LINE_ITEM_FIELDS)[number];

export interface LineItemsColumn {
  id:      string;
  field:   AllowedLineItemField;
  label:   string;
  width:   number;   // percentage; visible columns should sum to ~100
  align:   'start' | 'center' | 'end';
  visible: boolean;
}

// ─── Table sub-styles (token-only) ───────────────────────────────────────────
export interface TableHeaderStyle {
  background: StudioColorToken;
  color:      StudioTextColor;
  fontSize:   StudioFontSize;
  fontWeight: StudioFontWeight;
}

export interface TableRowStyle {
  fontSize: StudioFontSize;
  color:    StudioTextColor;
}

export interface TableBorderStyle {
  color: StudioColorToken;
}

// ─── Line items table element ─────────────────────────────────────────────────
export interface LineItemsTableElement extends BaseElement {
  type:                 'lineItemsTable';
  columns:              LineItemsColumn[];
  headerStyle:          TableHeaderStyle;
  rowStyle:             TableRowStyle;
  borderStyle:          TableBorderStyle;
  autoHideZeroColumns?: boolean;  // hide columns where all row values are zero/empty
  rowStriping?:         boolean;  // alternate row background color
  totals?: {
    showSubtotal?:   boolean;
    showDiscount?:   boolean;
    showTax?:        boolean;
    showGrandTotal?: boolean;
    labelAlign?: 'start' | 'center' | 'end';  // footer label cell alignment
    valueAlign?: 'start' | 'center' | 'end';  // footer value cell alignment
  };
}

// ─── Normalized row (resolver output) ────────────────────────────────────────
export interface NormalizedLineRow {
  index:       number;
  description: string;
  quantity:    string;
  unit:        string;
  unitPrice:   string;
  discount?:   string;
  total:       string;
}

export type TemplateStudioElement =
  | TextElement
  | DynamicFieldElement
  | QrElement
  | BarcodeElement
  | ImageElement
  | LineElement
  | RectElement
  | CircleElement
  | LineItemsTableElement;

export type TemplateStudioElementType = TemplateStudioElement['type'];

// Validated set of known element types
export const ALLOWED_ELEMENT_TYPES: ReadonlySet<TemplateStudioElementType> = new Set([
  'text', 'dynamicField', 'qr', 'barcode', 'image', 'line', 'rect', 'circle', 'lineItemsTable',
]);

// ─── Template page settings ───────────────────────────────────────────────────
export interface TemplatePageSettings {
  size:        'A4';
  orientation: 'portrait';
  marginMm:    number; // uniform page margin in mm
}

// ─── Template ─────────────────────────────────────────────────────────────────
export interface TemplateStudioTemplate {
  id:           string;
  name:         string;  // max 60 chars (sanitized)
  documentType: TemplateStudioDocumentType;
  page:         TemplatePageSettings;
  elements:     TemplateStudioElement[];
  createdAt:    string;  // ISO date string
  updatedAt:    string;  // ISO date string
}

// ─── Root settings blob stored at print.templateStudio.templates ──────────────
export interface TemplateStudioSettings {
  version:   1;
  templates: TemplateStudioTemplate[];
}

// ─── Dynamic field allowlists ─────────────────────────────────────────────────
export const INVOICE_ALLOWED_FIELDS = [
  'invoice.number',
  'invoice.date',
  'invoice.customerName',
  'invoice.customerAddress',
  'invoice.total',
  'invoice.subtotal',
  'invoice.discount',
  'invoice.tax',
  'invoice.grandTotal',
  'invoice.notes',
] as const;

export const QUOTATION_ALLOWED_FIELDS = [
  'quotation.number',
  'quotation.date',
  'quotation.customerName',
  'quotation.customerAddress',
  'quotation.total',
  'quotation.notes',
] as const;

export type InvoiceAllowedField  = (typeof INVOICE_ALLOWED_FIELDS)[number];
export type QuotationAllowedField = (typeof QUOTATION_ALLOWED_FIELDS)[number];

// ─── Result types ─────────────────────────────────────────────────────────────
export interface ValidationResult {
  valid:  boolean;
  errors: string[];
}

export type ImportResult =
  | { ok: true;  template: TemplateStudioTemplate }
  | { ok: false; error: string };
