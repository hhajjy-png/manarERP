import { describe, it, expect } from 'vitest';
import { formatCurrency, formatNumber, formatInteger, formatPercent } from '../currency';
import { currencyConfig } from '../../config/currencyConfig';

describe('backend currencyConfig', () => {
  it('defaults to en-US / KWD', () => {
    expect(currencyConfig.locale).toBe('en-US');
    expect(currencyConfig.code).toBe('KWD');
  });
});

describe('backend formatCurrency', () => {
  it.each([
    [0, '0.000 KWD'],
    [1250.75, '1,250.750 KWD'],
    [144922.4, '144,922.400 KWD'],
    [2450000, '2,450,000.000 KWD'],
  ])('formats %d as %s', (input, expected) => {
    expect(formatCurrency(input)).toBe(expected);
  });
  it('nullish → 0.000 KWD', () => {
    expect(formatCurrency(null)).toBe('0.000 KWD');
    expect(formatCurrency(undefined)).toBe('0.000 KWD');
    expect(formatCurrency(NaN)).toBe('0.000 KWD');
  });
  it('keeps negative sign', () => {
    expect(formatCurrency(-15.25)).toBe('-15.250 KWD');
  });
});

describe('backend formatNumber / formatInteger / formatPercent', () => {
  it('formatNumber is bare', () => {
    expect(formatNumber(144922.4)).toBe('144,922.400');
  });
  it('formatInteger has no decimals', () => {
    expect(formatInteger(144922.4)).toBe('144,922');
  });
  it('formatPercent default 1 digit', () => {
    expect(formatPercent(12.5)).toBe('12.5%');
  });
});
