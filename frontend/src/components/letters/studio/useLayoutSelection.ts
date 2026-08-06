/**
 * Document Layout Designer — object selection.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SELECTION IS AN ORDERED LIST, NOT A SET.
 * ══════════════════════════════════════════════════════════════════════════
 * The order is load-bearing in one place and it is worth the extra care: "same width"
 * matches the FIRST object selected, because that is the reference the author had in
 * mind when they started clicking. A `Set` would lose that and the toolbar would have
 * to pick something arbitrary — usually the largest, which silently changes reference
 * on every use.
 *
 * Duplicates are still impossible; the list is deduplicated on every write.
 *
 * ── SELECTION LIVES OUTSIDE THE DOCUMENT ─────────────────────────────────
 * Selecting is not editing. Keeping it here rather than in the layout means clicking
 * an object does not mark the letter dirty, does not push an undo step, and does not
 * re-run the pagination signature or the validation pass — all of which it would if
 * selection were a document field.
 */

import { useCallback, useMemo, useState } from 'react';

export interface LayoutSelection {
  /** Selected object ids, in the order they were selected. */
  readonly ids: readonly string[];
  readonly count: number;
  /** The reference object for "same width" and for the Inspector's single-object view. */
  readonly primaryId: string | null;
  readonly has: (id: string) => boolean;
  /** Replace the selection outright — a plain click. */
  readonly select: (ids: readonly string[]) => void;
  /** Add or remove one id — Shift-click and Ctrl-click. */
  readonly toggle: (id: string) => void;
  /** Add ids without removing any — a Shift-drag marquee. */
  readonly add: (ids: readonly string[]) => void;
  readonly clear: () => void;
  /** Everything selectable becomes selected. */
  readonly selectAll: (allIds: readonly string[]) => void;
  /** Selected becomes unselected and vice versa. */
  readonly invert: (allIds: readonly string[]) => void;
}

/** Deduplicate while preserving first-seen order. */
function unique(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

/** Are two selections the same list? Guards every setter against a no-op render. */
function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function useLayoutSelection(): LayoutSelection {
  const [ids, setIds] = useState<readonly string[]>([]);

  const commit = useCallback((next: readonly string[]) => {
    const deduped = unique(next);
    setIds((current) => (same(current, deduped) ? current : deduped));
  }, []);

  const select = useCallback((next: readonly string[]) => commit(next), [commit]);

  const toggle = useCallback(
    (id: string) =>
      setIds((current) =>
        current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id],
      ),
    [],
  );

  const add = useCallback(
    (next: readonly string[]) => setIds((current) => unique([...current, ...next])),
    [],
  );

  const clear = useCallback(() => setIds((current) => (current.length === 0 ? current : [])), []);

  const selectAll = useCallback((allIds: readonly string[]) => commit(allIds), [commit]);

  const invert = useCallback(
    (allIds: readonly string[]) =>
      setIds((current) => {
        const selected = new Set(current);
        return allIds.filter((id) => !selected.has(id));
      }),
    [],
  );

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  // Memoised for the same reason the studio's other hooks are: the canvas, the Layers
  // panel, the Inspector and the shortcut map all take this object as a dependency.
  return useMemo(
    () => ({
      ids,
      count: ids.length,
      primaryId: ids[0] ?? null,
      has,
      select,
      toggle,
      add,
      clear,
      selectAll,
      invert,
    }),
    [ids, has, select, toggle, add, clear, selectAll, invert],
  );
}
