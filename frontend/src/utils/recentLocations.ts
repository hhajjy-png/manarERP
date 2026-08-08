import { searchLocationsGrouped, CategoryGroup } from '../constants/kuwaitLocations';
// Zero Data Loss Certification Pack v1 — ذكاء المواقع مُتعلَّم من إدخال المستخدم
// نفسه، فيُحفظ في قاعدة البيانات لينتقل مع النسخة الاحتياطية والمزامنة.
import { persistPreference } from '../lib/syncedPreferences';

export const RECENT_KEY = 'manarERP.recentInvoiceLocations';
export const USAGE_COUNTS_KEY = 'manarERP.locationUsageCounts';
export const MAX_RECENT = 20;

export function getRecentLocations(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  } catch {
    return [];
  }
}

function getUsageCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(USAGE_COUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function incrementUsageCount(location: string): void {
  const counts = getUsageCounts();
  counts[location] = (counts[location] ?? 0) + 1;
  try {
    persistPreference(USAGE_COUNTS_KEY, JSON.stringify(counts));
  } catch {
    // localStorage unavailable — ignore
  }
}

export function getTopLocations(n = 5): string[] {
  const counts = getUsageCounts();
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([loc]) => loc);
}

export function addRecentLocation(location: string): void {
  const trimmed = location.trim();
  if (!trimmed) return;
  incrementUsageCount(trimmed);
  const current = getRecentLocations().filter((r) => r !== trimmed);
  const updated = [trimmed, ...current].slice(0, MAX_RECENT);
  try {
    persistPreference(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable — ignore
  }
}

export interface DropdownContent {
  topLocations: string[];
  recentMatches: string[];
  catalogGroups: CategoryGroup[];
}

export function computeDropdown(query: string): DropdownContent {
  const allRecent = getRecentLocations();
  const top = getTopLocations(5);

  if (!query || query.trim().length < 2) {
    return { topLocations: top, recentMatches: allRecent, catalogGroups: [] };
  }

  const q = query.trim().toLowerCase();
  const matchingRecent = allRecent.filter((r) => r.toLowerCase().includes(q));
  const recentNameSet = new Set(matchingRecent.map((r) => r.toLowerCase()));

  const catalogGroups = searchLocationsGrouped(query, 10);
  const dedupedGroups = catalogGroups
    .map((g) => ({ ...g, items: g.items.filter((item) => !recentNameSet.has(item.name.toLowerCase())) }))
    .filter((g) => g.items.length > 0);

  return { topLocations: [], recentMatches: matchingRecent, catalogGroups: dedupedGroups };
}
