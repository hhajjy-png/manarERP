import { useCallback, useState } from 'react';
import type { PrintTemplateCategory } from '../engine/types';
import {
  loadPrintProfile,
  savePrintProfile,
  resetPrintProfile as storageReset,
} from '../storage/printProfileStorage';

// Re-export types so existing consumers of usePrintProfile keep working.
export type { PrintProfile, PrintPaperType } from '../storage/printProfileStorage';

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * React hook: persists the user's preferred template + paper type for a
 * document category.  Storage is fully delegated to the storage layer —
 * this hook contains zero direct localStorage access.
 *
 * Usage (Phase 2):
 * ```tsx
 * const [profile, setProfile] = usePrintProfile('invoice');
 * // profile.templateId → "invoice-design-2"
 * // profile.paperType  → "plain-a4"
 * ```
 */
export function usePrintProfile(
  category: PrintTemplateCategory,
): [ReturnType<typeof loadPrintProfile>, (p: ReturnType<typeof loadPrintProfile>) => void] {
  const [profile, setProfileState] = useState(() => loadPrintProfile(category));

  const setProfile = useCallback(
    (next: ReturnType<typeof loadPrintProfile>) => {
      savePrintProfile(category, next);
      setProfileState(next);
    },
    [category],
  );

  return [profile, setProfile];
}

// ─── Non-React helpers (re-exported from storage for convenience) ─────────────

/**
 * Reads the stored profile without subscribing to updates.
 * Safe to call outside React (e.g. print-trigger callbacks).
 */
export { loadPrintProfile as getPrintProfile } from '../storage/printProfileStorage';

/**
 * Clears the stored profile for a category, reverting to the default.
 */
export function resetPrintProfile(category: PrintTemplateCategory): void {
  storageReset(category);
}
