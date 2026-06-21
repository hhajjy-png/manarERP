import { describe, it, expect } from 'vitest';
import { splitKWD, formatKWD, formatKWDAr } from '../../print-templates/utils/formatKWD';

describe('splitKWD', () => {
  it('0 → dinars 0, fils 0', () => {
    const { dinars, fils } = splitKWD(0);
    expect(dinars).toBe(0);
    expect(fils).toBe(0);
  });

  it('1 → dinars 1, fils 0', () => {
    const { dinars, fils } = splitKWD(1);
    expect(dinars).toBe(1);
    expect(fils).toBe(0);
  });

  it('1.5 → dinars 1, fils 500', () => {
    const { dinars, fils } = splitKWD(1.5);
    expect(dinars).toBe(1);
    expect(fils).toBe(500);
  });

  it('150 → dinars 150, fils 0', () => {
    const { dinars, fils } = splitKWD(150);
    expect(dinars).toBe(150);
    expect(fils).toBe(0);
  });

  it('1284 → dinars 1284, fils 0', () => {
    const { dinars, fils } = splitKWD(1284);
    expect(dinars).toBe(1284);
    expect(fils).toBe(0);
  });

  it('1284.75 → dinars 1284, fils 750', () => {
    const { dinars, fils } = splitKWD(1284.75);
    expect(dinars).toBe(1284);
    expect(fils).toBe(750);
  });

  it('filsPadded is always 3 digits', () => {
    expect(splitKWD(1.05).filsPadded).toBe('050');
    expect(splitKWD(1.5).filsPadded).toBe('500');
    expect(splitKWD(1).filsPadded).toBe('000');
  });
});

describe('formatKWD', () => {
  it('0 → "0.000"', () => {
    expect(formatKWD(0)).toBe('0.000');
  });

  it('1 → "1.000"', () => {
    expect(formatKWD(1)).toBe('1.000');
  });

  it('1.5 → "1.500"', () => {
    expect(formatKWD(1.5)).toBe('1.500');
  });

  it('1284 → "1,284.000"', () => {
    expect(formatKWD(1284)).toBe('1,284.000');
  });

  it('1284.75 → "1,284.750"', () => {
    expect(formatKWD(1284.75)).toBe('1,284.750');
  });

  it('10.5 → "10.500"', () => {
    expect(formatKWD(10.5)).toBe('10.500');
  });

  it('10.5556 rounds to 3 decimal places → "10.556"', () => {
    expect(formatKWD(10.5556)).toBe('10.556');
  });

  it('always has exactly 3 decimal places', () => {
    [0, 1, 1.5, 10.5, 150, 1284, 1284.75].forEach((n) => {
      const parts = formatKWD(n).split('.');
      expect(parts[1]).toHaveLength(3);
    });
  });
});

describe('formatKWDAr', () => {
  it('appends د.ك suffix', () => {
    expect(formatKWDAr(100)).toBe('100.000 د.ك');
  });

  it('uses comma separator for thousands', () => {
    expect(formatKWDAr(1284)).toBe('1,284.000 د.ك');
  });
});
