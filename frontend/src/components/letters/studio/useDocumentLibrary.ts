/**
 * Document Automation — the library store.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE READ, ONE WRITE, THROUGH THE ENDPOINTS THAT ALREADY EXIST.
 * ══════════════════════════════════════════════════════════════════════════
 * The four libraries are JSON under four `Setting` keys — the same mechanism the
 * company branding registry uses. `GET /settings` returns every row in one request and
 * `PUT /settings` writes a batch, so this hook needs no new endpoint, no new table and
 * no migration.
 *
 * ── A WRITE REPLACES ONE KEY, NEVER THE WHOLE LIBRARY ────────────────────
 * Saving a block writes `letters.blocks` alone. Writing all four every time would mean
 * two people editing different libraries could overwrite each other's work with stale
 * copies of keys neither of them touched — the classic last-write-wins bug in a
 * key/value store, and the reason the write is per-key rather than per-library.
 *
 * ── FAILURE IS REPORTED, NEVER SWALLOWED ─────────────────────────────────
 * A failed save leaves the in-memory library UNCHANGED and returns the reason. An
 * optimistic update that quietly reverted on the next load would let an author believe
 * they had saved a template that does not exist.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import {
  type DesignAssetEntry,
  type DocumentLibrary,
  type HeaderFooterEntry,
  type LetterTemplateEntry,
  type LibraryEntry,
  type ReusableBlockEntry,
  EMPTY_LIBRARY,
  LIBRARY_KEYS,
  LIBRARY_SETTING_GROUP,
  isAssetRecord,
  isBlockRecord,
  isHeaderFooterRecord,
  isTemplateRecord,
  parseLibraryList,
  serialiseLibraryList,
} from '../../../letters/library/libraryTypes';

/** Which library a mutation targets. */
export type LibrarySlot = keyof DocumentLibrary;

const SLOT_KEYS: Readonly<Record<LibrarySlot, string>> = {
  templates: LIBRARY_KEYS.templates,
  blocks: LIBRARY_KEYS.blocks,
  headerFooters: LIBRARY_KEYS.headerFooters,
  assets: LIBRARY_KEYS.assets,
};

export interface DocumentLibraryStore {
  readonly library: DocumentLibrary;
  readonly loading: boolean;
  readonly error: string | null;
  /** Entries dropped as malformed on the last load. Surfaced, never hidden. */
  readonly dropped: number;
  /** Add or replace one entry. Returns `null` on success, the reason on failure. */
  readonly save: (slot: LibrarySlot, entry: LibraryEntry) => Promise<string | null>;
  readonly remove: (slot: LibrarySlot, id: string) => Promise<string | null>;
  readonly reload: () => Promise<void>;
}

/** ISO timestamp. Written here so no caller has to remember the format. */
function now(): string {
  return new Date().toISOString();
}

export function useDocumentLibrary(): DocumentLibraryStore {
  const [library, setLibrary] = useState<DocumentLibrary>(EMPTY_LIBRARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/settings');
      const rows = (data.data ?? data) as { key: string; value: string }[];
      const byKey = new Map(rows.map((row) => [row.key, row.value]));

      const templates = parseLibraryList<LetterTemplateEntry>(
        byKey.get(LIBRARY_KEYS.templates), 'template', isTemplateRecord,
      );
      const blocks = parseLibraryList<ReusableBlockEntry>(
        byKey.get(LIBRARY_KEYS.blocks), 'block', isBlockRecord,
      );
      const headerFooters = parseLibraryList<HeaderFooterEntry>(
        byKey.get(LIBRARY_KEYS.headerFooters), 'headerFooter', isHeaderFooterRecord,
      );
      const assets = parseLibraryList<DesignAssetEntry>(
        byKey.get(LIBRARY_KEYS.assets), 'asset', isAssetRecord,
      );

      setLibrary({
        templates: templates.entries,
        blocks: blocks.entries,
        headerFooters: headerFooters.entries,
        assets: assets.entries,
      });
      setDropped(templates.dropped + blocks.dropped + headerFooters.dropped + assets.dropped);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Write one key, then adopt the result only if the request succeeded. */
  const writeSlot = useCallback(
    async (slot: LibrarySlot, entries: readonly LibraryEntry[]): Promise<string | null> => {
      try {
        await api.put('/settings', {
          settings: [
            { key: SLOT_KEYS[slot], value: serialiseLibraryList(entries), group: LIBRARY_SETTING_GROUP },
          ],
        });
        setLibrary((current) => ({ ...current, [slot]: entries }) as DocumentLibrary);
        return null;
      } catch (err) {
        // The in-memory library is untouched — an author must never be shown a
        // template that failed to save as though it had.
        return errorMessage(err);
      }
    },
    [],
  );

  const save = useCallback(
    (slot: LibrarySlot, entry: LibraryEntry) => {
      const current = library[slot] as readonly LibraryEntry[];
      const existing = current.findIndex((candidate) => candidate.id === entry.id);
      const stamped = {
        ...entry,
        createdAt: existing >= 0 ? current[existing].createdAt : entry.createdAt || now(),
        updatedAt: now(),
      } as LibraryEntry;

      const next = existing >= 0
        ? current.map((candidate, index) => (index === existing ? stamped : candidate))
        : [...current, stamped];

      return writeSlot(slot, next);
    },
    [library, writeSlot],
  );

  const remove = useCallback(
    (slot: LibrarySlot, id: string) => {
      const current = library[slot] as readonly LibraryEntry[];
      return writeSlot(slot, current.filter((entry) => entry.id !== id));
    },
    [library, writeSlot],
  );

  return useMemo(
    () => ({ library, loading, error, dropped, save, remove, reload: load }),
    [library, loading, error, dropped, save, remove, load],
  );
}
