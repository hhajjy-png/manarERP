import { describe, it, expect } from 'vitest';
import {
  searchLocations,
  searchLocationsGrouped,
  KUWAIT_LOCATIONS,
  CATEGORY_LABELS,
} from '../constants/kuwaitLocations';

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

  it('every location has a category field', () => {
    for (const loc of KUWAIT_LOCATIONS) {
      expect(loc.category).toBeTruthy();
      expect(['residential', 'industrial', 'ring-road', 'highway', 'road-project', 'housing-project']).toContain(loc.category);
    }
  });

  it('finds ring roads by dائري alias', () => {
    const results = searchLocations('دائري 6');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === 'الدائري السادس')).toBe(true);
  });

  it('finds ring roads by official Arabic name alias', () => {
    const results = searchLocations('طريق الغزالي');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.category === 'ring-road' || r.category === 'highway')).toBe(true);
  });

  it('finds industrial areas', () => {
    const results = searchLocations('صبحان');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].category).toBe('industrial');
  });

  it('finds industrial area by alias', () => {
    const results = searchLocations('Subhan');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === 'صبحان')).toBe(true);
  });

  it('finds road projects', () => {
    const results = searchLocations('مشروع طريق');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.category === 'road-project')).toBe(true);
  });

  it('finds housing projects', () => {
    const results = searchLocations('مشروع جنوب خيطان');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.category === 'housing-project')).toBe(true);
  });

  it('finds new Jahra locations', () => {
    const amghara = searchLocations('أمغرة');
    expect(amghara.length).toBeGreaterThan(0);
    expect(amghara[0].name).toBe('أمغرة');

    const salmi = searchLocations('السالمي');
    expect(salmi.length).toBeGreaterThan(0);
    expect(salmi.some((r) => r.name === 'السالمي')).toBe(true);
  });

  it('finds new Farwaniya locations', () => {
    const results = searchLocations('أبرق خيطان');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('أبرق خيطان');
  });
});

describe('searchLocationsGrouped', () => {
  it('returns empty array for short queries', () => {
    expect(searchLocationsGrouped('')).toEqual([]);
    expect(searchLocationsGrouped('م')).toEqual([]);
  });

  it('returns CategoryGroup array with label and items', () => {
    const groups = searchLocationsGrouped('السالمية');
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0]).toHaveProperty('category');
    expect(groups[0]).toHaveProperty('label');
    expect(groups[0]).toHaveProperty('items');
    expect(Array.isArray(groups[0].items)).toBe(true);
  });

  it('groups results by category', () => {
    const groups = searchLocationsGrouped('طريق');
    for (const group of groups) {
      for (const item of group.items) {
        expect(item.category).toBe(group.category);
      }
    }
  });

  it('returns ring-road category for ring road query', () => {
    const groups = searchLocationsGrouped('الدائري');
    expect(groups.some((g) => g.category === 'ring-road')).toBe(true);
  });

  it('returns highway category for highway query', () => {
    const groups = searchLocationsGrouped('طريق الملك');
    expect(groups.some((g) => g.category === 'highway')).toBe(true);
  });

  it('returns industrial category for صبحان', () => {
    const groups = searchLocationsGrouped('صبحان');
    expect(groups.some((g) => g.category === 'industrial')).toBe(true);
  });

  it('respects maxResults across all groups combined', () => {
    const groups = searchLocationsGrouped('ال', 5);
    const total = groups.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBeLessThanOrEqual(5);
  });

  it('returns road-project category for road project query', () => {
    const groups = searchLocationsGrouped('مشروع تطوير');
    expect(groups.some((g) => g.category === 'road-project')).toBe(true);
  });

  it('returns housing-project category for housing project query', () => {
    const groups = searchLocationsGrouped('مشروع جنوب خيطان');
    expect(groups.some((g) => g.category === 'housing-project')).toBe(true);
  });

  it('free-text query with no catalog match returns empty', () => {
    const groups = searchLocationsGrouped('موقع غير موجود في القائمة xyzabc');
    expect(groups).toEqual([]);
  });
});

describe('CATEGORY_LABELS', () => {
  it('has a label for every category', () => {
    const categories = ['residential', 'industrial', 'ring-road', 'highway', 'road-project', 'housing-project'] as const;
    for (const cat of categories) {
      expect(CATEGORY_LABELS[cat]).toBeTruthy();
      expect(typeof CATEGORY_LABELS[cat]).toBe('string');
    }
  });

  it('residential label is in Arabic', () => {
    expect(CATEGORY_LABELS['residential']).toBe('مناطق سكنية');
  });

  it('ring-road label is in Arabic', () => {
    expect(CATEGORY_LABELS['ring-road']).toBe('طرق دائرية');
  });
});
