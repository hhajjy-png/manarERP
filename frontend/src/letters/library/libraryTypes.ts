/**
 * Letter Engine — the content libraries (Professional Document Automation v1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FOUR LIBRARIES, ONE SHAPE, ZERO SCHEMA CHANGE.
 * ══════════════════════════════════════════════════════════════════════════
 * Templates, reusable blocks, header/footer presets and design assets are all
 * CROSS-DOCUMENT: they belong to the company, not to any one letter, so none of them
 * can live in a letter's `contentJson`.
 *
 * They live in the `Setting` table instead, as JSON under one key each — the exact
 * pattern the company branding registry already uses for `print.signatures` and
 * `print.stamps`. That is why this whole subsystem needs no migration, no new table
 * and no new endpoint: `GET /settings` and `PUT /settings` already exist and already
 * carry frontend-owned JSON the backend stores verbatim and never parses.
 *
 * ── THE SIGNATURE AND STAMP LIBRARIES ARE NOT HERE ───────────────────────
 * Deliberately. `print-templates/branding` already owns the company's signatures and
 * stamps, they are already uploaded in Settings, and every printed document in the ERP
 * already reads them. INV-12 forbids a second signature-management system, so this
 * pack gives those assets a BROWSER — search, categories, favourites, quick insert —
 * and stores not one byte of them. A second store would be the thing that lets a
 * letter's idea of the company signature drift from everyone else's.
 *
 * ── AN ENTRY IS DATA, NOT A DOCUMENT ─────────────────────────────────────
 * A template or a block stores the serialised `BlockDocument` fragment it inserts,
 * exactly as `contentJson` does. Nothing here is HTML, nothing is parsed, and nothing
 * is executed — inserting a block is `parseDocument` plus a splice, which is the same
 * path a paste takes.
 */

/** The `Setting` keys the libraries live under, in the `letters` group. */
export const LIBRARY_KEYS = {
  templates: 'letters.templates',
  blocks: 'letters.blocks',
  headerFooters: 'letters.headerFooters',
  assets: 'letters.assets',
} as const;

export const LIBRARY_SETTING_GROUP = 'letters';

/** What every library entry carries, whatever its kind. */
export interface LibraryEntryBase {
  readonly id: string;
  readonly name: string;
  /** Free-text grouping the author types. Not a closed set — see `categoriesOf`. */
  readonly category: string;
  readonly description: string;
  /** ISO timestamp. Written by the store, never by a caller. */
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A whole-letter starting point.
 *
 * `contentJson` is a serialised `BlockDocument` — blocks, layout objects and bindings
 * together, because a template that restored the text but not the logo it was designed
 * with would not be the template anyone saved.
 */
export interface LetterTemplateEntry extends LibraryEntryBase {
  readonly kind: 'template';
  readonly contentJson: string;
  /** Pre-filled subject. Empty means "leave the subject alone". */
  readonly subject: string;
  /** Material Symbols name, for the card. */
  readonly icon: string;
}

/**
 * A reusable fragment — a greeting, a closing, a legal disclaimer.
 *
 * Stores blocks only, never a whole document: a block library entry is spliced INTO
 * an existing letter at the caret, so carrying a layout layer or bindings with it
 * would silently overwrite the host document's.
 */
export interface ReusableBlockEntry extends LibraryEntryBase {
  readonly kind: 'block';
  /** Serialised `BlockDocument` whose blocks are the fragment. */
  readonly contentJson: string;
  /** First line, cached for the card so the panel need not parse every entry to draw. */
  readonly preview: string;
}

/**
 * A header or footer preset — a band of positioned objects.
 *
 * NOT the pre-printed letterhead, which is physically on the stock and which the
 * engine never prints. This is an author-designed band for the writable area: a
 * "Confidential" label, a revision stamp, a page-number block.
 */
export interface HeaderFooterEntry extends LibraryEntryBase {
  readonly kind: 'headerFooter';
  readonly placement: 'header' | 'footer';
  /** Serialised `DocumentLayout` holding the objects the preset places. */
  readonly layoutJson: string;
}

/** An image the author reuses — a project logo, a certification mark, a QR. */
export interface DesignAssetEntry extends LibraryEntryBase {
  readonly kind: 'asset';
  /** Data URL. Travels inside the setting, exactly as a branding asset does. */
  readonly imageUrl: string;
  readonly alt: string;
}

export type LibraryEntry =
  | LetterTemplateEntry
  | ReusableBlockEntry
  | HeaderFooterEntry
  | DesignAssetEntry;

export type LibraryKind = LibraryEntry['kind'];

export const LIBRARY_KIND_LABELS_AR: Readonly<Record<LibraryKind, string>> = {
  template: 'قالب',
  block: 'مقطع جاهز',
  headerFooter: 'ترويسة/تذييل',
  asset: 'أصل تصميم',
};

export const LIBRARY_KIND_ICONS: Readonly<Record<LibraryKind, string>> = {
  template: 'lab_profile',
  block: 'dashboard_customize',
  headerFooter: 'view_agenda',
  asset: 'photo_library',
};

/** The whole library, as one value. */
export interface DocumentLibrary {
  readonly templates: readonly LetterTemplateEntry[];
  readonly blocks: readonly ReusableBlockEntry[];
  readonly headerFooters: readonly HeaderFooterEntry[];
  readonly assets: readonly DesignAssetEntry[];
}

export const EMPTY_LIBRARY: DocumentLibrary = {
  templates: [],
  blocks: [],
  headerFooters: [],
  assets: [],
};

/* ── Parsing ────────────────────────────────────────────────────────────── */

/**
 * Parse one library's JSON, tolerantly.
 *
 * A malformed entry is DROPPED rather than failing the whole library. These values are
 * frontend-owned JSON in a free-text column: a half-written entry from an interrupted
 * save must not make every template in the company unreachable. The dropped entry is
 * reported by `parseLibraryList`'s second return value so the panel can say so.
 */
export function parseLibraryList<T extends LibraryEntry>(
  raw: string | null | undefined,
  kind: LibraryKind,
  isValid: (value: Record<string, unknown>) => boolean,
): { entries: T[]; dropped: number } {
  if (!raw || raw.trim().length === 0) return { entries: [], dropped: 0 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { entries: [], dropped: 0 };
  }
  if (!Array.isArray(parsed)) return { entries: [], dropped: 0 };

  const entries: T[] = [];
  let dropped = 0;

  for (const candidate of parsed) {
    if (!candidate || typeof candidate !== 'object') {
      dropped += 1;
      continue;
    }
    const record = candidate as Record<string, unknown>;
    const ok =
      typeof record.id === 'string' &&
      record.id.length > 0 &&
      typeof record.name === 'string' &&
      isValid(record);

    if (!ok) {
      dropped += 1;
      continue;
    }
    // The kind is stamped from the KEY it was read under rather than trusted from the
    // record: a template stored under the blocks key is a storage bug, and honouring
    // its self-declared kind would make it appear in the wrong panel for ever.
    entries.push({ ...(record as unknown as T), kind } as T);
  }

  return { entries, dropped };
}

export function isTemplateRecord(record: Record<string, unknown>): boolean {
  return typeof record.contentJson === 'string';
}

export function isBlockRecord(record: Record<string, unknown>): boolean {
  return typeof record.contentJson === 'string';
}

export function isHeaderFooterRecord(record: Record<string, unknown>): boolean {
  return typeof record.layoutJson === 'string' && (record.placement === 'header' || record.placement === 'footer');
}

export function isAssetRecord(record: Record<string, unknown>): boolean {
  return typeof record.imageUrl === 'string' && record.imageUrl.length > 0;
}

/* ── Queries ────────────────────────────────────────────────────────────── */

/**
 * Distinct categories present in a list, sorted, with untagged entries last.
 *
 * Categories are free text the author types rather than a closed set, because the
 * useful groupings for one company's letters are not the useful groupings for
 * another's — and a fixed list would mean every company that needed a seventh
 * category could not have one.
 */
export function categoriesOf(entries: readonly LibraryEntry[]): string[] {
  const named = new Set<string>();
  for (const entry of entries) {
    const category = entry.category.trim();
    if (category.length > 0) named.add(category);
  }
  return [...named].sort((a, b) => a.localeCompare(b, 'ar'));
}

/** Search across name, category and description. */
export function searchEntries<T extends LibraryEntry>(entries: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [...entries];
  return entries.filter(
    (entry) =>
      entry.name.toLowerCase().includes(needle) ||
      entry.category.toLowerCase().includes(needle) ||
      entry.description.toLowerCase().includes(needle),
  );
}

/** Serialise a list for storage. Stable key order so an unchanged list is unchanged. */
export function serialiseLibraryList(entries: readonly LibraryEntry[]): string {
  return JSON.stringify(entries);
}
