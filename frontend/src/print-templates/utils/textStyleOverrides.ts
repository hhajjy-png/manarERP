import type { CSSProperties } from 'react';
import type {
  TextFontSize,
  TextFontFamily,
  TextFontWeight,
  TextColor,
  TextAlign,
  TextLineHeight,
  TextLetterSpacing,
  TableBgColor,
  TableBorderColor,
  TextElementStyle,
  TableHeaderStyle,
  TableBorderStyle,
  InvoiceTextAreas,
  QuotationTextAreas,
  PrintTextStyleSettings,
} from '../engine/textStyleTypes';
import type { PrintDocumentType } from '../engine/types';

// ─── Token resolution maps ────────────────────────────────────────────────────

const FONT_SIZE_CELL_MAP: Record<TextFontSize, string> = {
  small: '9pt', normal: '10pt', large: '11pt', xlarge: '12pt',
};

const FONT_SIZE_TITLE_MAP: Record<TextFontSize, string> = {
  small: '12pt', normal: '14pt', large: '16pt', xlarge: '18pt',
};

const FONT_FAMILY_MAP: Record<TextFontFamily, string> = {
  cairo: '"Cairo", Arial, sans-serif',
  ibmPlexArabic: '"IBM Plex Sans Arabic", "Cairo", Arial, sans-serif',
};

const FONT_WEIGHT_MAP: Record<TextFontWeight, number> = {
  regular: 400, medium: 500, bold: 700,
};

const COLOR_MAP: Record<TextColor, string | undefined> = {
  default: undefined,
  brand: '#1a3a6e',
  dark: '#111827',
  blue: '#1e40af',
  black: '#000000',
  gray: '#6b7280',
};

const TABLE_BG_MAP: Record<TableBgColor, string | undefined> = {
  default: undefined,
  brand: '#1a3a6e',
  dark: '#1f2937',
  blue: '#1e40af',
  black: '#111111',
  gray: '#6b7280',
};

const TABLE_BORDER_MAP: Record<TableBorderColor, string | undefined> = {
  default: undefined,
  light: '#e5e7eb',
  medium: '#9ca3af',
  dark: '#374151',
  none: 'transparent',
};

const LINE_HEIGHT_MAP: Record<TextLineHeight, number> = {
  tight: 1.3, normal: 1.5, relaxed: 1.7,
};

const LETTER_SPACING_MAP: Record<TextLetterSpacing, string> = {
  tight: '-0.02em', normal: '0em', wide: '0.05em',
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_TEXT_STYLE_SETTINGS: Readonly<PrintTextStyleSettings> = {
  invoice: {},
  quotation: {},
};

// ─── Token validators ─────────────────────────────────────────────────────────

const VALID_FONT_SIZES   = new Set<string>(['small', 'normal', 'large', 'xlarge']);
const VALID_FONT_FAMILIES = new Set<string>(['cairo', 'ibmPlexArabic']);
const VALID_FONT_WEIGHTS  = new Set<string>(['regular', 'medium', 'bold']);
const VALID_COLORS        = new Set<string>(['default', 'brand', 'dark', 'blue', 'black', 'gray']);
const VALID_ALIGNS        = new Set<string>(['start', 'center', 'end']);
const VALID_LINE_HEIGHTS  = new Set<string>(['tight', 'normal', 'relaxed']);
const VALID_LETTER_SPACINGS = new Set<string>(['tight', 'normal', 'wide']);
const VALID_TABLE_BG      = new Set<string>(['default', 'brand', 'dark', 'blue', 'black', 'gray']);
const VALID_TABLE_BORDER  = new Set<string>(['default', 'light', 'medium', 'dark', 'none']);

export function isValidTextFontSize(v: unknown): v is TextFontSize {
  return typeof v === 'string' && VALID_FONT_SIZES.has(v);
}
export function isValidTextFontFamily(v: unknown): v is TextFontFamily {
  return typeof v === 'string' && VALID_FONT_FAMILIES.has(v);
}
export function isValidTextFontWeight(v: unknown): v is TextFontWeight {
  return typeof v === 'string' && VALID_FONT_WEIGHTS.has(v);
}
export function isValidTextColor(v: unknown): v is TextColor {
  return typeof v === 'string' && VALID_COLORS.has(v);
}
export function isValidTextAlign(v: unknown): v is TextAlign {
  return typeof v === 'string' && VALID_ALIGNS.has(v);
}
export function isValidTextLineHeight(v: unknown): v is TextLineHeight {
  return typeof v === 'string' && VALID_LINE_HEIGHTS.has(v);
}
export function isValidTextLetterSpacing(v: unknown): v is TextLetterSpacing {
  return typeof v === 'string' && VALID_LETTER_SPACINGS.has(v);
}
export function isValidTableBgColor(v: unknown): v is TableBgColor {
  return typeof v === 'string' && VALID_TABLE_BG.has(v);
}
export function isValidTableBorderColor(v: unknown): v is TableBorderColor {
  return typeof v === 'string' && VALID_TABLE_BORDER.has(v);
}

// ─── Normalizers — strip invalid/unknown tokens ───────────────────────────────

function normalizeTextElementStyle(raw: unknown): TextElementStyle {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: TextElementStyle = {};
  if (isValidTextFontSize(r.fontSize))       out.fontSize = r.fontSize;
  if (isValidTextFontFamily(r.fontFamily))   out.fontFamily = r.fontFamily;
  if (isValidTextFontWeight(r.fontWeight))   out.fontWeight = r.fontWeight;
  if (isValidTextColor(r.color))             out.color = r.color;
  if (isValidTextAlign(r.align))             out.align = r.align;
  if (isValidTextLineHeight(r.lineHeight))   out.lineHeight = r.lineHeight;
  if (isValidTextLetterSpacing(r.letterSpacing)) out.letterSpacing = r.letterSpacing;
  return out;
}

function normalizeTableHeaderStyle(raw: unknown): TableHeaderStyle {
  const base = normalizeTextElementStyle(raw);
  const out: TableHeaderStyle = { ...base };
  if (typeof raw === 'object' && raw !== null) {
    const r = raw as Record<string, unknown>;
    if (isValidTableBgColor(r.bgColor)) out.bgColor = r.bgColor;
  }
  return out;
}

function normalizeTableBorderStyle(raw: unknown): TableBorderStyle {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: TableBorderStyle = {};
  if (isValidTableBorderColor(r.color)) out.color = r.color;
  return out;
}

function normalizeInvoiceTextAreas(raw: unknown): InvoiceTextAreas {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: InvoiceTextAreas = {};
  if (r.title)          out.title          = normalizeTextElementStyle(r.title);
  if (r.customerBlock)  out.customerBlock  = normalizeTextElementStyle(r.customerBlock);
  if (r.metadataLabels) out.metadataLabels = normalizeTextElementStyle(r.metadataLabels);
  if (r.tableHeader)    out.tableHeader    = normalizeTableHeaderStyle(r.tableHeader);
  if (r.tableBorder)    out.tableBorder    = normalizeTableBorderStyle(r.tableBorder);
  if (r.lineItem)       out.lineItem       = normalizeTextElementStyle(r.lineItem);
  if (r.totals)         out.totals         = normalizeTextElementStyle(r.totals);
  if (r.sectionTitle)   out.sectionTitle   = normalizeTextElementStyle(r.sectionTitle);
  if (r.footerNote)     out.footerNote     = normalizeTextElementStyle(r.footerNote);
  return out;
}

function normalizeQuotationTextAreas(raw: unknown): QuotationTextAreas {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: QuotationTextAreas = {};
  if (r.title)          out.title          = normalizeTextElementStyle(r.title);
  if (r.customerBlock)  out.customerBlock  = normalizeTextElementStyle(r.customerBlock);
  if (r.metadataLabels) out.metadataLabels = normalizeTextElementStyle(r.metadataLabels);
  if (r.tableHeader)    out.tableHeader    = normalizeTableHeaderStyle(r.tableHeader);
  if (r.tableBorder)    out.tableBorder    = normalizeTableBorderStyle(r.tableBorder);
  if (r.lineItem)       out.lineItem       = normalizeTextElementStyle(r.lineItem);
  if (r.totals)         out.totals         = normalizeTextElementStyle(r.totals);
  if (r.introText)      out.introText      = normalizeTextElementStyle(r.introText);
  if (r.terms)          out.terms          = normalizeTextElementStyle(r.terms);
  if (r.sectionTitle)   out.sectionTitle   = normalizeTextElementStyle(r.sectionTitle);
  if (r.footerNote)     out.footerNote     = normalizeTextElementStyle(r.footerNote);
  return out;
}

export function normalizeTextStyleSettings(raw: unknown): PrintTextStyleSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_TEXT_STYLE_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    invoice: normalizeInvoiceTextAreas(r.invoice),
    quotation: normalizeQuotationTextAreas(r.quotation),
  };
}

// ─── Parse / Serialize ────────────────────────────────────────────────────────

export function parseTextStyleSettings(value: string | null | undefined): PrintTextStyleSettings {
  if (!value) return { invoice: {}, quotation: {} };
  try {
    return normalizeTextStyleSettings(JSON.parse(value));
  } catch {
    return { invoice: {}, quotation: {} };
  }
}

export function serializeTextStyleSettings(settings: PrintTextStyleSettings): string {
  return JSON.stringify(settings);
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

export function getTextAreasForDocument(
  settings: PrintTextStyleSettings | undefined,
  docType: PrintDocumentType,
): InvoiceTextAreas | QuotationTextAreas {
  return settings?.[docType] ?? {};
}

// ─── CSS helpers ──────────────────────────────────────────────────────────────

/**
 * Converts a TextElementStyle into React CSSProperties.
 *
 * context='title' uses a larger font size range (12–18pt).
 * context='cell'  uses a table-cell range (9–12pt).
 * Default context is 'cell'.
 *
 * Returns {} when style is undefined or all tokens are 'default'.
 */
export function applyTextElementStyle(
  style: TextElementStyle | undefined,
  context: 'title' | 'cell' = 'cell',
): CSSProperties {
  if (!style) return {};
  const css: CSSProperties = {};
  const sizeMap = context === 'title' ? FONT_SIZE_TITLE_MAP : FONT_SIZE_CELL_MAP;

  if (style.fontSize && style.fontSize !== 'normal') {
    css.fontSize = sizeMap[style.fontSize];
  } else if (style.fontSize === 'normal') {
    css.fontSize = sizeMap.normal;
  }
  if (style.fontFamily) {
    css.fontFamily = FONT_FAMILY_MAP[style.fontFamily];
  }
  if (style.fontWeight) {
    css.fontWeight = FONT_WEIGHT_MAP[style.fontWeight];
  }
  if (style.color && style.color !== 'default') {
    css.color = COLOR_MAP[style.color];
  }
  if (style.align) {
    css.textAlign = style.align as CSSProperties['textAlign'];
  }
  if (style.lineHeight) {
    css.lineHeight = LINE_HEIGHT_MAP[style.lineHeight];
  }
  if (style.letterSpacing) {
    css.letterSpacing = LETTER_SPACING_MAP[style.letterSpacing];
  }
  return css;
}

/**
 * Converts a TableHeaderStyle into React CSSProperties.
 * Extends applyTextElementStyle with bgColor support.
 */
export function applyTableHeaderStyle(style: TableHeaderStyle | undefined): CSSProperties {
  if (!style) return {};
  const base = applyTextElementStyle(style, 'cell');
  if (style.bgColor && style.bgColor !== 'default') {
    const bg = TABLE_BG_MAP[style.bgColor];
    if (bg) {
      base.background = bg;
      base.color = base.color ?? '#ffffff';
    }
  }
  return base;
}

/**
 * Returns a CSS custom property value for table border color.
 *
 * Apply as: style={{ '--designer-table-border': resolvedColor } as CSSProperties}
 * on the <table> element. Table cells can then use var(--designer-table-border).
 *
 * Returns {} if color is undefined or 'default' (no override).
 */
export function applyTableBorderStyle(
  style: TableBorderStyle | undefined,
): CSSProperties {
  if (!style?.color || style.color === 'default') return {};
  const resolved = TABLE_BORDER_MAP[style.color];
  if (!resolved) return {};
  return { '--designer-table-border': resolved } as CSSProperties;
}

/**
 * Returns resolved border color string (for direct use in borderColor CSS).
 * Returns undefined if no override.
 */
export function resolveTableBorderColor(style: TableBorderStyle | undefined): string | undefined {
  if (!style?.color || style.color === 'default') return undefined;
  return TABLE_BORDER_MAP[style.color];
}
