import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEXT_STYLE_SETTINGS,
  parseTextStyleSettings,
  serializeTextStyleSettings,
  getTextAreasForDocument,
  applyTextElementStyle,
  applyTableHeaderStyle,
  applyTableBorderStyle,
  resolveTableBorderColor,
  isValidTextFontSize,
  isValidTextFontFamily,
  isValidTextColor,
  isValidTextAlign,
  normalizeTextStyleSettings,
} from '../../print-templates/utils/textStyleOverrides';

// ─── 1. Parse valid JSON ──────────────────────────────────────────────────────

describe('parseTextStyleSettings — valid JSON', () => {
  it('parses a complete valid settings object', () => {
    const input = {
      invoice: {
        title: { fontSize: 'large', fontWeight: 'bold', color: 'brand', align: 'center' },
        tableHeader: { bgColor: 'dark', fontWeight: 'bold' },
        tableBorder: { color: 'light' },
        lineItem: { fontSize: 'small', lineHeight: 'normal' },
      },
      quotation: {
        title: { fontSize: 'xlarge', color: 'blue' },
        terms: { fontSize: 'small', lineHeight: 'relaxed' },
      },
    };
    const result = parseTextStyleSettings(JSON.stringify(input));
    expect(result.invoice.title?.fontSize).toBe('large');
    expect(result.invoice.title?.color).toBe('brand');
    expect(result.invoice.tableHeader?.bgColor).toBe('dark');
    expect(result.invoice.tableBorder?.color).toBe('light');
    expect(result.quotation.title?.fontSize).toBe('xlarge');
    expect(result.quotation.terms?.lineHeight).toBe('relaxed');
  });

  it('returns empty areas for missing document types', () => {
    const result = parseTextStyleSettings(JSON.stringify({ invoice: {}, quotation: {} }));
    expect(result.invoice).toEqual({});
    expect(result.quotation).toEqual({});
  });
});

// ─── 2. Parse invalid JSON fallback ──────────────────────────────────────────

describe('parseTextStyleSettings — invalid JSON', () => {
  it('returns defaults for null', () => {
    expect(parseTextStyleSettings(null)).toEqual(DEFAULT_TEXT_STYLE_SETTINGS);
  });
  it('returns defaults for undefined', () => {
    expect(parseTextStyleSettings(undefined)).toEqual(DEFAULT_TEXT_STYLE_SETTINGS);
  });
  it('returns defaults for empty string', () => {
    expect(parseTextStyleSettings('')).toEqual(DEFAULT_TEXT_STYLE_SETTINGS);
  });
  it('returns defaults for malformed JSON', () => {
    expect(parseTextStyleSettings('{bad json')).toEqual(DEFAULT_TEXT_STYLE_SETTINGS);
  });
  it('returns defaults for a JSON number', () => {
    expect(parseTextStyleSettings('42')).toEqual(DEFAULT_TEXT_STYLE_SETTINGS);
  });
});

// ─── 3. Unknown token ignored ─────────────────────────────────────────────────

describe('parseTextStyleSettings — unknown tokens ignored', () => {
  it('strips unknown fontSize token', () => {
    const input = JSON.stringify({ invoice: { title: { fontSize: 'gigantic' } }, quotation: {} });
    const result = parseTextStyleSettings(input);
    expect(result.invoice.title?.fontSize).toBeUndefined();
  });

  it('strips unknown color token', () => {
    const input = JSON.stringify({ invoice: { title: { color: 'purple' } }, quotation: {} });
    const result = parseTextStyleSettings(input);
    expect(result.invoice.title?.color).toBeUndefined();
  });

  it('strips unknown fontFamily token', () => {
    const input = JSON.stringify({ invoice: { title: { fontFamily: 'Arial' } }, quotation: {} });
    const result = parseTextStyleSettings(input);
    expect(result.invoice.title?.fontFamily).toBeUndefined();
  });

  it('strips CSS injection attempt from font family', () => {
    const input = JSON.stringify({
      invoice: { title: { fontFamily: 'cairo; color: red' } },
      quotation: {},
    });
    const result = parseTextStyleSettings(input);
    expect(result.invoice.title?.fontFamily).toBeUndefined();
  });

  it('strips unknown bgColor from tableHeader', () => {
    const input = JSON.stringify({
      invoice: { tableHeader: { bgColor: 'rainbow' } },
      quotation: {},
    });
    const result = parseTextStyleSettings(input);
    expect(result.invoice.tableHeader?.bgColor).toBeUndefined();
  });

  it('strips unknown tableBorder color', () => {
    const input = JSON.stringify({
      invoice: { tableBorder: { color: 'invisible' } },
      quotation: {},
    });
    const result = parseTextStyleSettings(input);
    expect(result.invoice.tableBorder?.color).toBeUndefined();
  });
});

// ─── 4. 'default' token produces no CSS override ─────────────────────────────

describe('applyTextElementStyle — default token produces no style', () => {
  it('color: default contributes no CSS color', () => {
    const css = applyTextElementStyle({ color: 'default' });
    expect(css.color).toBeUndefined();
  });

  it('empty style returns {}', () => {
    expect(applyTextElementStyle({})).toEqual({});
    expect(applyTextElementStyle(undefined)).toEqual({});
  });
});

// ─── 5. Font size token mapping ───────────────────────────────────────────────

describe('applyTextElementStyle — font size tokens', () => {
  it('cell context: small→9pt, normal→10pt, large→11pt, xlarge→12pt', () => {
    expect(applyTextElementStyle({ fontSize: 'small' }, 'cell').fontSize).toBe('9pt');
    expect(applyTextElementStyle({ fontSize: 'normal' }, 'cell').fontSize).toBe('10pt');
    expect(applyTextElementStyle({ fontSize: 'large' }, 'cell').fontSize).toBe('11pt');
    expect(applyTextElementStyle({ fontSize: 'xlarge' }, 'cell').fontSize).toBe('12pt');
  });

  it('title context: small→12pt, normal→14pt, large→16pt, xlarge→18pt', () => {
    expect(applyTextElementStyle({ fontSize: 'small' }, 'title').fontSize).toBe('12pt');
    expect(applyTextElementStyle({ fontSize: 'normal' }, 'title').fontSize).toBe('14pt');
    expect(applyTextElementStyle({ fontSize: 'large' }, 'title').fontSize).toBe('16pt');
    expect(applyTextElementStyle({ fontSize: 'xlarge' }, 'title').fontSize).toBe('18pt');
  });
});

// ─── 6. Font family token mapping ────────────────────────────────────────────

describe('applyTextElementStyle — font family tokens', () => {
  it('cairo maps to Cairo family string', () => {
    const css = applyTextElementStyle({ fontFamily: 'cairo' });
    expect(css.fontFamily).toMatch(/Cairo/);
  });

  it('ibmPlexArabic maps to IBM Plex Sans Arabic family string', () => {
    const css = applyTextElementStyle({ fontFamily: 'ibmPlexArabic' });
    expect(css.fontFamily).toMatch(/IBM Plex Sans Arabic/);
  });
});

// ─── 7. Color token mapping ───────────────────────────────────────────────────

describe('applyTextElementStyle — color tokens', () => {
  it('brand → #1a3a6e', () => {
    expect(applyTextElementStyle({ color: 'brand' }).color).toBe('#1a3a6e');
  });
  it('dark → #111827', () => {
    expect(applyTextElementStyle({ color: 'dark' }).color).toBe('#111827');
  });
  it('blue → #1e40af', () => {
    expect(applyTextElementStyle({ color: 'blue' }).color).toBe('#1e40af');
  });
  it('black → #000000', () => {
    expect(applyTextElementStyle({ color: 'black' }).color).toBe('#000000');
  });
  it('gray → #6b7280', () => {
    expect(applyTextElementStyle({ color: 'gray' }).color).toBe('#6b7280');
  });
});

// ─── 8. Alignment RTL-safe ────────────────────────────────────────────────────

describe('applyTextElementStyle — alignment tokens (RTL-safe logical values)', () => {
  it('start, center, end map to textAlign verbatim (logical CSS values)', () => {
    expect(applyTextElementStyle({ align: 'start' }).textAlign).toBe('start');
    expect(applyTextElementStyle({ align: 'center' }).textAlign).toBe('center');
    expect(applyTextElementStyle({ align: 'end' }).textAlign).toBe('end');
  });
});

// ─── 9. Table header bgColor token ───────────────────────────────────────────

describe('applyTableHeaderStyle — bgColor tokens', () => {
  it('default produces no background', () => {
    const css = applyTableHeaderStyle({ bgColor: 'default' });
    expect(css.background).toBeUndefined();
  });
  it('brand sets background to #1a3a6e and color to white', () => {
    const css = applyTableHeaderStyle({ bgColor: 'brand' });
    expect(css.background).toBe('#1a3a6e');
    expect(css.color).toBe('#ffffff');
  });
  it('dark sets background to #1f2937', () => {
    expect(applyTableHeaderStyle({ bgColor: 'dark' }).background).toBe('#1f2937');
  });
  it('blue sets background to #1e40af', () => {
    expect(applyTableHeaderStyle({ bgColor: 'blue' }).background).toBe('#1e40af');
  });
});

// ─── 10. Table border color token ────────────────────────────────────────────

describe('applyTableBorderStyle', () => {
  it('default returns {}', () => {
    expect(applyTableBorderStyle({ color: 'default' })).toEqual({});
    expect(applyTableBorderStyle(undefined)).toEqual({});
  });
  it('light sets CSS variable', () => {
    const css = applyTableBorderStyle({ color: 'light' });
    expect((css as Record<string, unknown>)['--designer-table-border']).toBe('#e5e7eb');
  });
  it('none sets CSS variable to transparent', () => {
    const css = applyTableBorderStyle({ color: 'none' });
    expect((css as Record<string, unknown>)['--designer-table-border']).toBe('transparent');
  });
});

describe('resolveTableBorderColor', () => {
  it('returns undefined for default', () => {
    expect(resolveTableBorderColor({ color: 'default' })).toBeUndefined();
    expect(resolveTableBorderColor(undefined)).toBeUndefined();
  });
  it('returns color string for medium', () => {
    expect(resolveTableBorderColor({ color: 'medium' })).toBe('#9ca3af');
  });
});

// ─── 11. Invoice vs quotation independence ────────────────────────────────────

describe('getTextAreasForDocument — invoice/quotation independence', () => {
  it('invoice and quotation areas are independent', () => {
    const settings = {
      invoice: { title: { color: 'brand' as const } },
      quotation: { title: { color: 'dark' as const } },
    };
    const invAreas = getTextAreasForDocument(settings, 'invoice');
    const quotAreas = getTextAreasForDocument(settings, 'quotation');
    expect(invAreas.title?.color).toBe('brand');
    expect(quotAreas.title?.color).toBe('dark');
  });

  it('returns {} for undefined settings', () => {
    expect(getTextAreasForDocument(undefined, 'invoice')).toEqual({});
    expect(getTextAreasForDocument(undefined, 'quotation')).toEqual({});
  });
});

// ─── 12. Serialize/parse round-trip ──────────────────────────────────────────

describe('serializeTextStyleSettings / parseTextStyleSettings round-trip', () => {
  it('round-trip preserves all valid tokens', () => {
    const original: Parameters<typeof serializeTextStyleSettings>[0] = {
      invoice: {
        title: { fontSize: 'large', fontFamily: 'cairo', fontWeight: 'bold', color: 'brand', align: 'center' },
        tableHeader: { bgColor: 'dark', fontWeight: 'bold' },
        tableBorder: { color: 'medium' },
        lineItem: { fontSize: 'small', lineHeight: 'relaxed' },
        totals: { fontWeight: 'bold' },
      },
      quotation: {
        title: { fontSize: 'xlarge', color: 'blue' },
        introText: { lineHeight: 'relaxed', letterSpacing: 'wide' },
        terms: { fontSize: 'small' },
      },
    };
    const roundTripped = parseTextStyleSettings(serializeTextStyleSettings(original));
    expect(roundTripped).toEqual(original);
  });
});

// ─── 13. CSS injection attempt blocked ───────────────────────────────────────

describe('CSS injection attempt is ignored', () => {
  it('CSS injection via fontFamily is stripped', () => {
    const malicious = JSON.stringify({
      invoice: { title: { fontFamily: 'cairo); color: red; font-family: (cairo' } },
      quotation: {},
    });
    const result = parseTextStyleSettings(malicious);
    expect(result.invoice.title?.fontFamily).toBeUndefined();
  });

  it('CSS injection via color is stripped', () => {
    const malicious = JSON.stringify({
      invoice: { title: { color: 'red; background: url(evil)' } },
      quotation: {},
    });
    const result = parseTextStyleSettings(malicious);
    expect(result.invoice.title?.color).toBeUndefined();
  });

  it('Object prototype properties are ignored', () => {
    const malicious = JSON.stringify({
      invoice: { title: { '__proto__': { fontSize: 'large' }, color: 'brand' } },
      quotation: {},
    });
    const result = parseTextStyleSettings(malicious);
    expect(result.invoice.title?.color).toBe('brand');
  });
});

// ─── 14. Token validators ─────────────────────────────────────────────────────

describe('token validators', () => {
  it('isValidTextFontSize accepts only valid tokens', () => {
    expect(isValidTextFontSize('small')).toBe(true);
    expect(isValidTextFontSize('normal')).toBe(true);
    expect(isValidTextFontSize('large')).toBe(true);
    expect(isValidTextFontSize('xlarge')).toBe(true);
    expect(isValidTextFontSize('huge')).toBe(false);
    expect(isValidTextFontSize(12)).toBe(false);
    expect(isValidTextFontSize(null)).toBe(false);
  });

  it('isValidTextFontFamily accepts only known local fonts', () => {
    expect(isValidTextFontFamily('cairo')).toBe(true);
    expect(isValidTextFontFamily('ibmPlexArabic')).toBe(true);
    expect(isValidTextFontFamily('Arial')).toBe(false);
    expect(isValidTextFontFamily('Tajawal')).toBe(false);
  });

  it('isValidTextColor accepts only defined palette tokens', () => {
    expect(isValidTextColor('brand')).toBe(true);
    expect(isValidTextColor('default')).toBe(true);
    expect(isValidTextColor('#ff0000')).toBe(false);
    expect(isValidTextColor('red')).toBe(false);
  });

  it('isValidTextAlign only accepts logical values', () => {
    expect(isValidTextAlign('start')).toBe(true);
    expect(isValidTextAlign('center')).toBe(true);
    expect(isValidTextAlign('end')).toBe(true);
    expect(isValidTextAlign('left')).toBe(false);
    expect(isValidTextAlign('right')).toBe(false);
  });
});

// ─── normalizeTextStyleSettings ──────────────────────────────────────────────

describe('normalizeTextStyleSettings', () => {
  it('handles non-object input gracefully', () => {
    expect(normalizeTextStyleSettings(null)).toEqual(DEFAULT_TEXT_STYLE_SETTINGS);
    expect(normalizeTextStyleSettings('string')).toEqual(DEFAULT_TEXT_STYLE_SETTINGS);
    expect(normalizeTextStyleSettings(42)).toEqual(DEFAULT_TEXT_STYLE_SETTINGS);
  });

  it('keeps valid tokens, strips invalid ones', () => {
    const mixed = {
      invoice: {
        title: { fontSize: 'large', color: 'INVALID', fontWeight: 'bold' },
      },
      quotation: {
        introText: { lineHeight: 'relaxed', fontSize: 'unknown' },
      },
    };
    const result = normalizeTextStyleSettings(mixed);
    expect(result.invoice.title?.fontSize).toBe('large');
    expect(result.invoice.title?.color).toBeUndefined();
    expect(result.invoice.title?.fontWeight).toBe('bold');
    expect(result.quotation.introText?.lineHeight).toBe('relaxed');
    expect(result.quotation.introText?.fontSize).toBeUndefined();
  });
});
