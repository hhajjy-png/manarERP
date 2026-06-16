import { describe, it, expect } from 'vitest';
import { searchLocations, KUWAIT_LOCATIONS } from '../constants/kuwaitLocations';

describe('searchLocations', () => {
  it('returns empty array for query shorter than 2 chars', () => {
    expect(searchLocations('')).toEqual([]);
    expect(searchLocations('م')).toEqual([]);
  });

  it('returns empty array for blank/whitespace-only query', () => {
    expect(searchLocations('  ')).toEqual([]);
  });

  it('finds location by exact Arabic name match', () => {
    const results = searchLocations('السالمية');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('السالمية');
  });

  it('finds location by partial Arabic name', () => {
    const results = searchLocations('الجابر');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name.includes('جابر'))).toBe(true);
  });

  it('finds location by English alias', () => {
    const results = searchLocations('Salmiya');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('السالمية');
  });

  it('finds مشروع المطلاع by alias Mutlaa', () => {
    const results = searchLocations('Mutlaa');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name.includes('مطلاع') || r.name.includes('المطلاع'))).toBe(true);
  });

  it('respects maxResults cap (default 8)', () => {
    const results = searchLocations('ال');
    expect(results.length).toBeLessThanOrEqual(8);
  });

  it('respects custom maxResults', () => {
    const results = searchLocations('ال', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('deduplicates results by name', () => {
    const results = searchLocations('ال');
    const names = results.map((r) => r.name);
    expect(names.length).toBe(new Set(names).size);
  });

  it('KUWAIT_LOCATIONS catalog has more than 100 entries', () => {
    expect(KUWAIT_LOCATIONS.length).toBeGreaterThan(100);
  });

  it('returns no results for nonsense query', () => {
    const results = searchLocations('xyzxyzxyz');
    expect(results).toEqual([]);
  });

  it('search is case-insensitive for English aliases', () => {
    const lower = searchLocations('salmiya');
    const upper = searchLocations('SALMIYA');
    expect(lower.length).toBe(upper.length);
    expect(lower[0]?.name).toBe(upper[0]?.name);
  });
});
