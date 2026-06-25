import type {
  StudioFontSize,
  StudioTextAlign,
  StudioTextColor,
  AllowedLineItemField,
} from '../templateStudioTypes';

// ─── Font size: CSS pt value → StudioFontSize token ──────────────────────────
export function mapFontSizePt(pt: number): StudioFontSize {
  if (pt < 9)  return 'small';
  if (pt < 12) return 'normal';
  if (pt < 15) return 'large';
  return 'xlarge';
}

// Extract pt number from inline style string, e.g. "font-size: 14pt" → 14
export function parseFontSizePt(inlineStyle: string): number | null {
  const m = /font-size:\s*([\d.]+)pt/i.exec(inlineStyle);
  return m ? parseFloat(m[1]) : null;
}

// ─── Alignment: CSS text-align → StudioTextAlign (RTL canvas) ────────────────
// RTL canvas: visual right = logical start, visual left = logical end
export function mapAlignment(cssAlign: string | null | undefined): StudioTextAlign {
  switch (cssAlign) {
    case 'right':   return 'start';
    case 'center':  return 'center';
    case 'left':    return 'end';
    case 'justify': return 'start'; // not supported — fallback
    default:        return 'start'; // RTL default
  }
}

// Extract text-align value from inline style, e.g. "text-align: center" → "center"
export function parseTextAlign(inlineStyle: string): string | null {
  const m = /text-align:\s*(\w+)/i.exec(inlineStyle);
  return m ? m[1] : null;
}

// ─── Text color: #rrggbb hex → nearest StudioTextColor token ─────────────────
// Euclidean distance in RGB space; threshold 60 = "close enough to a known color"
const COLOR_MAP: ReadonlyArray<{
  r: number; g: number; b: number; token: StudioTextColor;
}> = [
  { r:   0, g:   0, b:   0, token: 'black' },
  { r:  31, g:  41, b:  55, token: 'dark'  },
  { r:  15, g:  23, b:  42, token: 'dark'  },
  { r:  29, g:  78, b: 111, token: 'brand' },
  { r:  29, g:  78, b: 216, token: 'blue'  },
  { r: 107, g: 114, b: 128, token: 'gray'  },
  { r: 156, g: 163, b: 175, token: 'gray'  },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '').toLowerCase();
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function mapTextColor(cssColor: string | null | undefined): StudioTextColor {
  if (!cssColor) return 'default';
  const rgb = hexToRgb(cssColor.trim());
  if (!rgb) return 'default';
  let minDist = Infinity;
  let nearest: StudioTextColor = 'default';
  for (const entry of COLOR_MAP) {
    const d = Math.sqrt(
      (rgb.r - entry.r) ** 2 + (rgb.g - entry.g) ** 2 + (rgb.b - entry.b) ** 2,
    );
    if (d < minDist) { minDist = d; nearest = entry.token; }
  }
  return minDist < 60 ? nearest : 'default';
}

// Extract first hex color from inline style, e.g. "color: #1f2937" → "#1f2937"
export function parseColorHex(inlineStyle: string): string | null {
  const m = /color:\s*(#[0-9a-fA-F]{6})\b/i.exec(inlineStyle);
  return m ? m[1] : null;
}

// ─── Arabic normalization ─────────────────────────────────────────────────────
// Used for case-insensitive, orthographic-variant-tolerant keyword matching.
export function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا') // alef variants → bare alef
    .replace(/ة/g, 'ه')      // ta marbuta → ha
    .trim();
}

// ─── Line-items table keyword sets ───────────────────────────────────────────
// Match: normalizeArabic(cellText) === normalizeArabic(keyword)
export const KEYWORD_SETS: ReadonlyArray<{
  field:    AllowedLineItemField;
  keywords: readonly string[];
}> = [
  { field: 'index',       keywords: ['الرقم', '#', 'م', 'رقم'] },
  { field: 'description', keywords: ['الوصف', 'البيان', 'الصنف', 'البند', 'وصف'] },
  { field: 'quantity',    keywords: ['الكمية', 'الكمیة', 'كمية', 'عدد'] },
  { field: 'unit',        keywords: ['الوحدة', 'الوحده', 'وحدة'] },
  { field: 'unitPrice',   keywords: ['سعر الوحدة', 'السعر', 'سعر الوحده', 'سعر'] },
  { field: 'discount',    keywords: ['الخصم', 'خصم'] },
  { field: 'total',       keywords: ['الإجمالي', 'الاجمالي', 'المجموع', 'المبلغ', 'إجمالي'] },
] as const;

// Default column widths (percentage); visible columns sum to 100
export const DEFAULT_COLUMN_WIDTHS: Partial<Record<AllowedLineItemField, number>> = {
  index:       8,
  description: 35,
  quantity:    10,
  unit:        10,
  unitPrice:   15,
  discount:    10,
  total:       12,
};
