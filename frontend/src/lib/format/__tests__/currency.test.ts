import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber, formatInteger, formatPercent, formatCompact, formatReportCell } from '../currency';
import { currencyConfig } from '../currencyConfig';
import { normalizeCurrencyLanguage } from '../currencyLanguage';

describe('currencyConfig', () => {
  it('defaults to en-US / KWD', () => {
    expect(currencyConfig.locale).toBe('en-US');
    expect(currencyConfig.code).toBe('KWD');
  });
});

describe('formatCurrency', () => {
  it.each([
    [0, '0.000 KWD'],
    [1, '1.000 KWD'],
    [15.25, '15.250 KWD'],
    [125.5, '125.500 KWD'],
    [1250.75, '1,250.750 KWD'],
    [12500, '12,500.000 KWD'],
    [125900.125, '125,900.125 KWD'],
    [2450000, '2,450,000.000 KWD'],
    [144922.4, '144,922.400 KWD'],
  ])('formats %d as %s', (input, expected) => {
    expect(formatCurrency(input)).toBe(expected);
  });

  it('nullish/NaN/empty → 0.000 KWD', () => {
    expect(formatCurrency(null)).toBe('0.000 KWD');
    expect(formatCurrency(undefined)).toBe('0.000 KWD');
    expect(formatCurrency(NaN)).toBe('0.000 KWD');
    expect(formatCurrency('')).toBe('0.000 KWD');
  });

  it('parses numeric strings', () => {
    expect(formatCurrency('1250.75')).toBe('1,250.750 KWD');
  });

  it('keeps negative sign', () => {
    expect(formatCurrency(-15.25)).toBe('-15.250 KWD');
  });

  it('rounds to 3 decimals, no scientific notation', () => {
    expect(formatCurrency(10.5556)).toBe('10.556 KWD');
    expect(formatCurrency(0.0000001)).toBe('0.000 KWD');
  });
});

describe('formatNumber', () => {
  it('bare number, no currency code', () => {
    expect(formatNumber(144922.4)).toBe('144,922.400');
    expect(formatNumber(0)).toBe('0.000');
  });
});

describe('formatInteger', () => {
  it('no decimals, thousands separator', () => {
    expect(formatInteger(144922.4)).toBe('144,922');
    expect(formatInteger(1000)).toBe('1,000');
  });
});

describe('formatPercent', () => {
  it('default 1 fraction digit', () => {
    expect(formatPercent(12.5)).toBe('12.5%');
  });
  it('custom precision', () => {
    expect(formatPercent(33.3333, 2)).toBe('33.33%');
    expect(formatPercent(50, 0)).toBe('50%');
  });
});

describe('Invoice module reference standard', () => {
  it('a representative invoice total renders identically to the global standard', () => {
    // Invoice line: total 2,540,125.500 must read the same everywhere.
    expect(formatCurrency(2540125.5)).toBe('2,540,125.500 KWD');
  });
});

describe('Currency Display Language — pure formatCurrency (deterministic, no hidden state)', () => {
  it('defaults SAFELY to english when no language is provided', () => {
    expect(formatCurrency(1250)).toBe('1,250.000 KWD');
    expect(formatCurrency(0)).toBe('0.000 KWD');
  });

  it('normalizeCurrencyLanguage falls back safely to english', () => {
    expect(normalizeCurrencyLanguage('arabic')).toBe('arabic');
    expect(normalizeCurrencyLanguage('english')).toBe('english');
    expect(normalizeCurrencyLanguage('')).toBe('english');
    expect(normalizeCurrencyLanguage(undefined)).toBe('english');
    expect(normalizeCurrencyLanguage('AR')).toBe('english');
  });

  it('english (explicit) — en-US digits + KWD', () => {
    expect(formatCurrency(1250, { language: 'english' })).toBe('1,250.000 KWD');
    expect(formatCurrency(144922.4, { language: 'english' })).toBe('144,922.400 KWD');
  });

  it('arabic: Arabic-Indic digits + separators + د.ك suffix, 3 decimals', () => {
    expect(formatCurrency(1250, { language: 'arabic' })).toBe('١٬٢٥٠٫٠٠٠ د.ك');
    expect(formatCurrency(144922.4, { language: 'arabic' })).toBe('١٤٤٬٩٢٢٫٤٠٠ د.ك');
    expect(formatCurrency(0, { language: 'arabic' })).toBe('٠٫٠٠٠ د.ك');
    expect(formatCurrency(null, { language: 'arabic' })).toBe('٠٫٠٠٠ د.ك');
  });

  it('is deterministic — identical args always produce identical output; the default is never affected by prior arabic calls', () => {
    expect(formatCurrency(15.25, { language: 'arabic' })).toBe(formatCurrency(15.25, { language: 'arabic' }));
    formatCurrency(999, { language: 'arabic' });
    expect(formatCurrency(15.25)).toBe('15.250 KWD'); // default path unchanged
  });
});

describe('formatCompact (axis ticks)', () => {
  it.each([
    [0, '0'],
    [500, '500'],
    [1200, '1.2K'],
    [25000, '25K'],
    [2500000, '2.5M'],
    [1100000000, '1.1B'],
  ])('formats %d as %s', (input, expected) => {
    expect(formatCompact(input)).toBe(expected);
  });
  it('keeps negative sign', () => {
    expect(formatCompact(-2500)).toBe('-2.5K');
  });
  it('nullish → 0', () => {
    expect(formatCompact(null)).toBe('0');
  });
});

describe('formatReportCell (shared report/print cell)', () => {
  it('currency column → full KWD (default english)', () => {
    expect(formatReportCell(1500.5, { format: 'currency' })).toBe('1,500.500 KWD');
  });
  it('currency column respects an explicit arabic language', () => {
    expect(formatReportCell(1500.5, { format: 'currency' }, { language: 'arabic' })).toBe('١٬٥٠٠٫٥٠٠ د.ك');
  });
  it('non-currency numeric column → plain en-US, 0–3 decimals, no forced trailing zeros', () => {
    expect(formatReportCell(1500.5, {})).toBe('1,500.5');
    expect(formatReportCell(1500, {})).toBe('1,500');
    expect(formatReportCell(1500.125, {})).toBe('1,500.125');
  });
  it('empty/null → ""', () => {
    expect(formatReportCell(null, { format: 'currency' })).toBe('');
    expect(formatReportCell('', {})).toBe('');
  });
  it('non-numeric string passes through', () => {
    expect(formatReportCell('نشط', {})).toBe('نشط');
  });
});
