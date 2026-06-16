import { searchLocationsGrouped, CategoryGroup } from '../constants/kuwaitLocations';

export const RECENT_KEY = 'manarERP.recentInvoiceLocations';
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

export function addRecentLocation(location: string): void {
  const trimmed = location.trim();
  if (!trimmed) return;
  const current = getRecentLocations().filter((r) => r !== trimmed);
  const updated = [trimmed, ...current].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable — ignore
  }
}

export interface DropdownContent {
  recentMatches: string[];
  catalogGroups: CategoryGroup[];
}

export function computeDropdown(query: string): DropdownContent {
  const allRecent = getRecentLocations();

  if (!query || query.trim().length < 2) {
    return { recentMatches: allRecent, catalogGroups: [] };
  }

  const q = query.trim().toLowerCase();
  const matchingRecent = allRecent.filter((r) => r.toLowerCase().includes(q));
  const recentNameSet = new Set(matchingRecent.map((r) => r.toLowerCase()));

  const catalogGroups = searchLocationsGrouped(query, 10);
  const dedupedGroups = catalogGroups
    .map((g) => ({ ...g, items: g.items.filter((item) => !recentNameSet.has(item.name.toLowerCase())) }))
    .filter((g) => g.items.length > 0);

  return { recentMatches: matchingRecent, catalogGroups: dedupedGroups };
}
