// @vitest-environment jsdom
// سلسلة الاستيراد تمرّ بـ uiStore الذي يقرأ localStorage عند التحميل — يلزم jsdom.
import { describe, it, expect } from 'vitest';
import { formatBalance } from '../components/financial/BalanceDisplay';
import { formatNumber } from '../lib/format';

// Use the same shared formatter the function uses so tests pass in any Node.js locale config
const fmt = (n: number) => formatNumber(Math.abs(n));

describe('formatBalance', () => {
  it('positive value shows debit indicator', () => {
    expect(formatBalance(5000)).toBe(`${fmt(5000)} مدين`);
  });

  it('negative value shows credit indicator and absolute amount', () => {
    expect(formatBalance(-5000)).toBe(`${fmt(5000)} دائن`);
  });

  it('zero shows absolute format with no indicator', () => {
    const result = formatBalance(0);
    expect(result).toBe(fmt(0));
    expect(result).not.toContain('مدين');
    expect(result).not.toContain('دائن');
  });

  it('credit-normal liability: negative net → absolute + دائن', () => {
    const result = formatBalance(-8500.75);
    expect(result).toContain('دائن');
    expect(result).not.toContain('-');
    expect(result).toContain(fmt(8500.75));
  });

  it('debit-normal asset: positive net → absolute + مدين', () => {
    const result = formatBalance(12000.5);
    expect(result).toContain('مدين');
    expect(result).not.toContain('-');
    expect(result).toContain(fmt(12000.5));
  });

  it('showIndicator=false omits indicator for positive', () => {
    const result = formatBalance(5000, false);
    expect(result).not.toContain('مدين');
    expect(result).not.toContain('دائن');
    expect(result).toBe(fmt(5000));
  });

  it('showIndicator=false omits indicator for negative and shows absolute', () => {
    const result = formatBalance(-5000, false);
    expect(result).not.toContain('مدين');
    expect(result).not.toContain('دائن');
    expect(result).not.toContain('-');
    expect(result).toBe(fmt(5000));
  });

  it('very small value treated as zero — no indicator', () => {
    const result = formatBalance(0.0001);
    expect(result).not.toContain('مدين');
    expect(result).not.toContain('دائن');
  });

  it('three decimal places on KWD amounts', () => {
    const result = formatBalance(1.5);
    expect(result).toContain('مدين');
    expect(result).toContain(fmt(1.5));
  });
});
