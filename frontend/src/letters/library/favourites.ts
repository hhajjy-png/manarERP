/**
 * Letter Engine — favourites and recents (Professional Document Automation v1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THESE ARE THE USER'S, NOT THE COMPANY'S. THEY LIVE IN localStorage.
 * ══════════════════════════════════════════════════════════════════════════
 * "Which variables do I reach for" and "which templates did I use last week" are facts
 * about a PERSON at a MACHINE. Putting them in the `Setting` table would make one
 * user's habits everyone's, and putting them in the document would make them part of
 * the letter — neither is what a favourite is.
 *
 * The same reasoning the composer already applies to zoom, ruler visibility and the
 * navigator tab, all of which are `usePersistedState` under `manarERP.letters.*`.
 *
 * ── LOSING THEM IS HARMLESS, AND THAT IS WHY THIS IS THE RIGHT STORE ─────
 * A cleared cache costs the user a re-favourite. Nothing about the document, the
 * library or the register depends on any of it, so there is no recovery path to build
 * and no synchronisation to get wrong.
 *
 * PURE except for the storage calls, which are guarded: a browser with storage
 * disabled or full returns the default rather than throwing, because a full disk must
 * not stop someone writing a letter.
 */

/** What can be favourited. One namespace per kind so ids never collide. */
export type FavouriteKind = 'variable' | 'template' | 'block' | 'asset' | 'signature' | 'stamp' | 'headerFooter';

const FAVOURITE_KEY = 'manarERP.letters.favourites';
const RECENT_KEY = 'manarERP.letters.recents';

/** How many recents are remembered per kind. Beyond this it is a search, not a list. */
export const RECENT_LIMIT = 8;

type Buckets = Partial<Record<FavouriteKind, string[]>>;

/** Read a bucket map, tolerating every storage failure. */
function read(key: string): Buckets {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Buckets;
  } catch {
    // Storage disabled, quota exceeded, or corrupt JSON. All three mean the same
    // thing here — there are no favourites — and none of them is worth an error.
    return {};
  }
}

/**
 * أين تُكتب المفضّلات فعلًا — منفذ يُركَّب من الخارج (Zero Data Loss Certification
 * Pack v1).
 *
 * المفضّلات والمؤخّرات بيانات اختارها المستخدم، وكانت حبيسة `localStorage` أي خارج
 * النسخ الاحتياطي والمزامنة. لكن `src/letters/` محرك مستقل يمنع اختبارُ حدوده
 * (`engineBoundary.test.ts`) أي استيراد خارجه عدا سجلّ الخطوط — والالتفاف على ذلك
 * الحد لتمرير هذه الحزمة كان سيهدم ثابتًا معماريًا قائمًا مقابل مكسب يمكن تحقيقه
 * دون كسره.
 *
 * لذلك يُعرَّف المنفذ هنا ويُركِّبه مُركِّب التطبيق (`main.tsx`) بكاتب التفضيلات.
 * الافتراضي هو سلوك ما قبل الحزمة حرفيًا، فالمحرك يبقى صالحًا للعمل والاختبار وحده.
 */
type PreferenceWriter = (key: string, rawValue: string) => void;

let writePreference: PreferenceWriter = (key, rawValue) => {
  window.localStorage.setItem(key, rawValue);
};

/** يُركِّب كاتب التفضيلات المتزامن مع قاعدة البيانات. يُستدعى مرة واحدة عند الإقلاع. */
export function setFavouritesPersistence(writer: PreferenceWriter): void {
  writePreference = writer;
}

function write(key: string, buckets: Buckets): void {
  try {
    writePreference(key, JSON.stringify(buckets));
  } catch {
    // A full quota must never stop someone writing a letter.
  }
}

/* ── Favourites ─────────────────────────────────────────────────────────── */

export function getFavourites(kind: FavouriteKind): string[] {
  return read(FAVOURITE_KEY)[kind] ?? [];
}

export function isFavourite(kind: FavouriteKind, id: string): boolean {
  return getFavourites(kind).includes(id);
}

/** Toggle, returning the new list so a caller can update state without re-reading. */
export function toggleFavourite(kind: FavouriteKind, id: string): string[] {
  const buckets = read(FAVOURITE_KEY);
  const current = buckets[kind] ?? [];
  const next = current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id];
  write(FAVOURITE_KEY, { ...buckets, [kind]: next });
  return next;
}

/* ── Recents ────────────────────────────────────────────────────────────── */

export function getRecents(kind: FavouriteKind): string[] {
  return read(RECENT_KEY)[kind] ?? [];
}

/**
 * Record a use.
 *
 * Most-recent first, deduplicated, capped. Re-using something already in the list
 * MOVES it to the front rather than adding a second entry — a recents list with
 * duplicates is a list that tells you less the more you use it.
 */
export function recordRecent(kind: FavouriteKind, id: string): string[] {
  const buckets = read(RECENT_KEY);
  const current = buckets[kind] ?? [];
  const next = [id, ...current.filter((existing) => existing !== id)].slice(0, RECENT_LIMIT);
  write(RECENT_KEY, { ...buckets, [kind]: next });
  return next;
}

/**
 * Order a list by favourites first, then recents, then the rest.
 *
 * PURE — the storage reads are the caller's. This is the ordering every panel in the
 * pack uses, written once so "favourites at the top" cannot mean three different
 * things in three panels.
 */
export function orderByPreference<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  favourites: readonly string[],
  recents: readonly string[],
): T[] {
  const favouriteSet = new Set(favourites);
  const recentRank = new Map(recents.map((id, index) => [id, index]));

  return [...items].sort((a, b) => {
    const aFav = favouriteSet.has(idOf(a));
    const bFav = favouriteSet.has(idOf(b));
    if (aFav !== bFav) return aFav ? -1 : 1;

    const aRecent = recentRank.get(idOf(a));
    const bRecent = recentRank.get(idOf(b));
    if (aRecent !== undefined && bRecent !== undefined) return aRecent - bRecent;
    if (aRecent !== undefined) return -1;
    if (bRecent !== undefined) return 1;

    // Neither favourited nor recent: keep the source order, which is the catalogue's
    // or the library's own. A name sort here would fight the deliberate ordering
    // those already carry.
    return 0;
  });
}
