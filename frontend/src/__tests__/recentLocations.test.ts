import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRecentLocations,
  addRecentLocation,
  computeDropdown,
  getTopLocations,
  MAX_RECENT,
  RECENT_KEY,
  USAGE_COUNTS_KEY,
} from '../utils/recentLocations';

// Vitest runs in Node — localStorage doesn't exist. Provide a minimal in-memory mock.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    length: 0,
    key: (_i: number) => null,
  } satisfies Storage;
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

beforeEach(() => {
  localStorage.clear();
});

// ─── getRecentLocations / addRecentLocation ───────────────────────────────────

describe('getRecentLocations', () => {
  it('returns empty array when nothing stored', () => {
    expect(getRecentLocations()).toEqual([]);
  });

  it('returns empty array when localStorage has invalid JSON', () => {
    localStorage.setItem(RECENT_KEY, 'not-json');
    expect(getRecentLocations()).toEqual([]);
  });

  it('returns empty array when stored value is not an array', () => {
    localStorage.setItem(RECENT_KEY, JSON.stringify({ x: 1 }));
    expect(getRecentLocations()).toEqual([]);
  });
});

describe('addRecentLocation', () => {
  it('adds a location and reads it back', () => {
    addRecentLocation('السالمية');
    expect(getRecentLocations()).toContain('السالمية');
  });

  it('most recently added location appears first', () => {
    addRecentLocation('الجابرية');
    addRecentLocation('السالمية');
    expect(getRecentLocations()[0]).toBe('السالمية');
  });

  it('does not duplicate — moves existing location to top', () => {
    addRecentLocation('السالمية');
    addRecentLocation('الجابرية');
    addRecentLocation('السالمية');
    const recent = getRecentLocations();
    expect(recent[0]).toBe('السالمية');
    expect(recent.filter((r) => r === 'السالمية').length).toBe(1);
    expect(recent.length).toBe(2);
  });

  it('respects MAX_RECENT limit', () => {
    for (let i = 0; i < MAX_RECENT + 5; i++) {
      addRecentLocation(`موقع ${i}`);
    }
    expect(getRecentLocations().length).toBe(MAX_RECENT);
  });

  it('the oldest entry is dropped when limit is exceeded', () => {
    for (let i = 0; i < MAX_RECENT + 1; i++) {
      addRecentLocation(`موقع ${i}`);
    }
    // موقع 0 was added first — should be gone
    expect(getRecentLocations()).not.toContain('موقع 0');
  });

  it('ignores empty string', () => {
    addRecentLocation('');
    expect(getRecentLocations()).toEqual([]);
  });

  it('ignores whitespace-only string', () => {
    addRecentLocation('   ');
    expect(getRecentLocations()).toEqual([]);
  });

  it('trims whitespace before storing', () => {
    addRecentLocation('  السالمية  ');
    expect(getRecentLocations()[0]).toBe('السالمية');
  });

  it('stores free-text location not found in catalog', () => {
    addRecentLocation('الدائري السادس - تقاطع الغزالي');
    expect(getRecentLocations()).toContain('الدائري السادس - تقاطع الغزالي');
  });

  it('stores location with Arabic digits and special characters', () => {
    const loc = 'قطعة 3 - شارع 105 - المطلاع';
    addRecentLocation(loc);
    expect(getRecentLocations()).toContain(loc);
  });
});

// ─── computeDropdown ─────────────────────────────────────────────────────────

describe('computeDropdown — short or empty query', () => {
  it('returns all recent and no catalog when query is empty', () => {
    addRecentLocation('السالمية');
    addRecentLocation('الجابرية');
    const { recentMatches, catalogGroups } = computeDropdown('');
    expect(recentMatches).toEqual(['الجابرية', 'السالمية']);
    expect(catalogGroups).toEqual([]);
  });

  it('returns all recent and no catalog when query is one char', () => {
    addRecentLocation('بيان');
    const { recentMatches, catalogGroups } = computeDropdown('ب');
    expect(recentMatches).toContain('بيان');
    expect(catalogGroups).toEqual([]);
  });

  it('returns empty when nothing stored and short query', () => {
    const { recentMatches, catalogGroups } = computeDropdown('');
    expect(recentMatches).toEqual([]);
    expect(catalogGroups).toEqual([]);
  });
});

describe('computeDropdown — search query', () => {
  it('searches recent by query (case-insensitive Arabic)', () => {
    addRecentLocation('السالمية');
    addRecentLocation('الجهراء');
    const { recentMatches } = computeDropdown('سالمية');
    expect(recentMatches).toContain('السالمية');
    expect(recentMatches).not.toContain('الجهراء');
  });

  it('recent results appear before catalog (recentMatches is first in return)', () => {
    addRecentLocation('السالمية');
    const { recentMatches, catalogGroups } = computeDropdown('السالمية');
    expect(recentMatches.length).toBeGreaterThan(0);
    // السالمية from recent must NOT appear in any catalog group
    const catalogNames = catalogGroups.flatMap((g) => g.items.map((i) => i.name));
    for (const r of recentMatches) {
      expect(catalogNames).not.toContain(r);
    }
  });

  it('deduplicates: catalog excludes names already in recentMatches', () => {
    addRecentLocation('السالمية');
    const { recentMatches, catalogGroups } = computeDropdown('سالمية');
    const catalogNames = catalogGroups.flatMap((g) => g.items.map((i) => i.name));
    const recentLower = new Set(recentMatches.map((r) => r.toLowerCase()));
    for (const name of catalogNames) {
      expect(recentLower.has(name.toLowerCase())).toBe(false);
    }
  });

  it('returns catalog results even when recent has no match', () => {
    addRecentLocation('موقع غير ذي صلة xyz');
    const { catalogGroups } = computeDropdown('السالمية');
    expect(catalogGroups.length).toBeGreaterThan(0);
  });

  it('free-text location in recent is searchable', () => {
    addRecentLocation('الدائري السادس - تقاطع الغزالي');
    const { recentMatches } = computeDropdown('تقاطع الغزالي');
    expect(recentMatches).toContain('الدائري السادس - تقاطع الغزالي');
  });

  it('free-text location appears in recent even when not in catalog', () => {
    const freeText = 'مواقف مدرسة زيد بن حارثة - الجهراء';
    addRecentLocation(freeText);
    const { recentMatches } = computeDropdown('زيد');
    expect(recentMatches).toContain(freeText);
  });

  it('returns empty recentMatches when no recent matches the query', () => {
    addRecentLocation('بيان');
    const { recentMatches } = computeDropdown('السالمية');
    expect(recentMatches).not.toContain('بيان');
  });
});

// ─── getTopLocations / usage ranking ─────────────────────────────────────────

describe('getTopLocations', () => {
  it('returns empty array when no usage recorded', () => {
    expect(getTopLocations()).toEqual([]);
  });

  it('returns locations sorted by usage count (most used first)', () => {
    addRecentLocation('السالمية');
    addRecentLocation('السالمية');
    addRecentLocation('الجابرية');
    const top = getTopLocations(2);
    expect(top[0]).toBe('السالمية');
    expect(top[1]).toBe('الجابرية');
  });

  it('respects n limit', () => {
    for (let i = 0; i < 10; i++) addRecentLocation(`موقع ${i}`);
    expect(getTopLocations(3).length).toBe(3);
  });

  it('addRecentLocation increments usage count each call', () => {
    addRecentLocation('الفروانية');
    addRecentLocation('الفروانية');
    addRecentLocation('الجهراء');
    expect(getTopLocations(1)[0]).toBe('الفروانية');
  });

  it('USAGE_COUNTS_KEY is a distinct key from RECENT_KEY', () => {
    expect(USAGE_COUNTS_KEY).not.toBe(RECENT_KEY);
  });
});

describe('computeDropdown — topLocations', () => {
  it('returns top locations in browse mode (empty query)', () => {
    addRecentLocation('السالمية');
    addRecentLocation('السالمية');
    addRecentLocation('الجابرية');
    const { topLocations } = computeDropdown('');
    expect(topLocations[0]).toBe('السالمية');
    expect(topLocations.length).toBeGreaterThan(0);
  });

  it('returns empty topLocations in search mode (query >= 2 chars)', () => {
    addRecentLocation('السالمية');
    addRecentLocation('السالمية');
    const { topLocations } = computeDropdown('السالمية');
    expect(topLocations).toEqual([]);
  });

  it('topLocations is a field on DropdownContent', () => {
    const result = computeDropdown('');
    expect(result).toHaveProperty('topLocations');
    expect(Array.isArray(result.topLocations)).toBe(true);
  });
});
