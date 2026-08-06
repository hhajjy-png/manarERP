/**
 * Letter Engine — find and replace (Document Studio Foundation v1).
 *
 * PURE. Matching is arithmetic over block text; replacing goes through `setBlockText`,
 * which is the same command a keystroke uses. There is no second write path into the
 * document, so a replacement is structurally identical to the author having typed it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SEARCH IS LITERAL. THERE IS NO REGULAR-EXPRESSION MODE, AND THERE WILL NOT BE.
 * ══════════════════════════════════════════════════════════════════════════
 * A user-supplied pattern compiled against every paragraph on every keystroke is a
 * denial-of-service surface (catastrophic backtracking) in an editor that must stay
 * responsive while typing. Literal matching cannot backtrack, so the cost is bounded by
 * the document's length rather than by the cleverness of the query.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ARABIC MATCHING IS NORMALISED — AND NORMALISATION CHANGES LENGTH, SO EVERY
 *  MATCH CARRIES AN INDEX MAP BACK TO THE ORIGINAL TEXT.
 * ══════════════════════════════════════════════════════════════════════════
 * Searching Arabic with a plain `indexOf` fails on text a person considers identical:
 *
 *   · ALEF FORMS. «أحمد», «إحمد» and «احمد» differ only in a hamza an author may or may
 *     not have typed. A search for one that misses the others is a search nobody trusts.
 *   · TEH MARBUTA vs HEH. «شركة» and «شركه» are the same word to most typists.
 *   · ALEF MAKSURA vs YEH. «على» and «علي» collide constantly in practice.
 *   · DIACRITICS AND TATWEEL. Harakat and the kashida are invisible to the reader's
 *     sense of "same word", so «مُحَمَّد» must be found by a search for «محمد».
 *
 * The last of those REMOVES characters, so the folded string is shorter than the
 * original and an offset into one is not an offset into the other. Substituting a
 * sentinel instead of removing would keep the lengths equal but would then fail to
 * match undiacritised text — which is the entire point of folding.
 *
 * So `fold` returns the folded text AND a map from each folded index back to the
 * original index. A hit found at folded `[a, b)` is reported at original
 * `[map[a], map[b])`, and replacement therefore always lands exactly on the run the
 * author saw highlighted, diacritics included.
 */

import { type BlockDocument } from '../model/blockTypes';
import { blockText, setBlockText } from './blockCommands';

/** Harakat, the superscript alef, and the tatweel. Removed entirely by folding. */
const DIACRITIC_OR_TATWEEL = /[ً-ْٰـ]/u;

/** Orthographic variants a reader treats as the same letter. One character to one. */
const LETTER_FOLDS: Readonly<Record<string, string>> = {
  'آ': 'ا', // آ → ا
  'أ': 'ا', // أ → ا
  'إ': 'ا', // إ → ا
  'ٱ': 'ا', // ٱ → ا
  'ة': 'ه', // ة → ه
  'ى': 'ي', // ى → ي
  'ؤ': 'ء', // ؤ → ء
  'ئ': 'ء', // ئ → ء
};

export interface SearchOptions {
  readonly matchCase: boolean;
  /** Whole-word matching, using the same word-character class the counters use. */
  readonly wholeWord: boolean;
  /**
   * Fold Arabic orthographic variants and drop diacritics. On by default — see the file
   * header for why a search that distinguishes «شركة» from «شركه» is a search nobody
   * trusts.
   */
  readonly normaliseArabicForms: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  matchCase: false,
  wholeWord: false,
  normaliseArabicForms: true,
};

/**
 * Folded text plus the way back.
 *
 * `map` has one entry per folded character, holding that character's index in the
 * ORIGINAL string, and a final sentinel entry equal to the original length — so
 * `map[end]` is always defined for an end offset that is one past the last character.
 */
interface Folded {
  readonly text: string;
  readonly map: readonly number[];
}

/**
 * Apply the search options, recording where every surviving character came from.
 *
 * One map entry is pushed per OUTPUT character rather than per input character,
 * because case folding is not universally one-to-one (U+0130 lowercases to two code
 * units). Every output character therefore points at the input character that produced
 * it, whatever the ratio.
 */
function fold(text: string, options: SearchOptions): Folded {
  const out: string[] = [];
  const map: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (options.normaliseArabicForms && DIACRITIC_OR_TATWEEL.test(char)) continue;

    let mapped = options.matchCase ? char : char.toLowerCase();
    if (options.normaliseArabicForms) {
      mapped = Object.prototype.hasOwnProperty.call(LETTER_FOLDS, mapped)
        ? LETTER_FOLDS[mapped]
        : mapped;
    }

    for (const piece of mapped) {
      out.push(piece);
      map.push(index);
    }
  }

  map.push(text.length);
  return { text: out.join(''), map };
}

/** Public form of the fold, for callers that only want the comparable string. */
export function normaliseArabic(text: string): string {
  return fold(text, { matchCase: true, wholeWord: false, normaliseArabicForms: true }).text;
}

/** One hit, addressed by block and by offset into that block's ORIGINAL text. */
export interface SearchMatch {
  readonly blockId: string;
  /** Index of the block in the document — for ordering and for page lookup. */
  readonly blockIndex: number;
  readonly start: number;
  readonly end: number;
}

export interface SearchResult {
  readonly matches: readonly SearchMatch[];
  /** The query as searched, after folding. Empty when the query was blank. */
  readonly normalisedQuery: string;
}

export const EMPTY_SEARCH_RESULT: SearchResult = { matches: [], normalisedQuery: '' };

const WORD_CHARACTER = /[ؠ-يٮ-ۓ٠-٩۰-۹A-Za-z0-9'’\-_]/u;

function isWordCharacter(char: string | undefined): boolean {
  return char !== undefined && WORD_CHARACTER.test(char);
}

/**
 * Every occurrence of `query` in one string, non-overlapping, in order, and expressed
 * in the ORIGINAL string's offsets.
 *
 * Non-overlapping because replacement must be unambiguous: with overlapping matches,
 * "replace all" of «اا» in «ااا» has two defensible answers and would silently pick one.
 */
export function findInText(
  text: string,
  query: string,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
): { start: number; end: number }[] {
  if (query.length === 0) return [];

  const haystack = fold(text, options);
  const needle = fold(query, options).text;
  if (needle.length === 0) return [];

  const hits: { start: number; end: number }[] = [];
  let from = 0;

  for (;;) {
    const at = haystack.text.indexOf(needle, from);
    if (at === -1) break;
    const foldedEnd = at + needle.length;

    // Boundaries are tested against the FOLDED text, whose neighbours are the real
    // neighbours once diacritics are out of the way — «مُحَمَّدٌ» must count as one word.
    const boundedStart = !options.wholeWord || !isWordCharacter(haystack.text[at - 1]);
    const boundedEnd = !options.wholeWord || !isWordCharacter(haystack.text[foldedEnd]);

    if (boundedStart && boundedEnd) {
      hits.push({ start: haystack.map[at], end: haystack.map[foldedEnd] });
    }

    // Advance past the hit when it counted, past one character when it did not — a
    // rejected whole-word candidate must not be re-tested for ever.
    from = boundedStart && boundedEnd ? foldedEnd : at + 1;
  }

  return hits;
}

/** Every occurrence across the document's content blocks, in document order. */
export function findInDocument(
  document: BlockDocument | null,
  query: string,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
): SearchResult {
  if (!document || query.length === 0) return EMPTY_SEARCH_RESULT;

  const matches: SearchMatch[] = [];
  document.blocks.forEach((block, blockIndex) => {
    if (block.kind === 'pageBreak') return;
    for (const hit of findInText(blockText(block), query, options)) {
      matches.push({ blockId: block.id, blockIndex, start: hit.start, end: hit.end });
    }
  });

  return { matches, normalisedQuery: fold(query, options).text };
}

/**
 * Replace ONE match.
 *
 * Takes the match rather than an index into a result list, so a stale list cannot cause
 * a replacement at the wrong offset — the match carries the block it belongs to, and a
 * block whose text has changed underneath is re-checked below.
 *
 * The offsets are re-verified against the CURRENT text before writing: between building
 * a result list and pressing Replace, an autosave round trip or an undo may have changed
 * the paragraph. Writing blindly would corrupt it; returning the document unchanged is
 * the honest answer, and the caller re-runs the search.
 */
export function replaceMatch(
  document: BlockDocument,
  match: SearchMatch,
  replacement: string,
  query: string,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
): BlockDocument {
  const block = document.blocks.find((b) => b.id === match.blockId);
  if (!block) return document;

  const text = blockText(block);
  if (match.end > text.length) return document;

  const stillMatches = findInText(text, query, options).some(
    (hit) => hit.start === match.start && hit.end === match.end,
  );
  if (!stillMatches) return document;

  return setBlockText(
    document,
    match.blockId,
    text.slice(0, match.start) + replacement + text.slice(match.end),
  );
}

/**
 * Replace every match in the document, and report how many.
 *
 * Each block is rewritten ONCE, from its own hit list, walking backwards so that an
 * earlier replacement cannot shift the offsets of a later one. Replacing forwards and
 * re-searching after each hit is the classic way to make "replace all" loop for ever
 * when the replacement contains the query.
 */
export function replaceAllInDocument(
  document: BlockDocument,
  query: string,
  replacement: string,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
): { document: BlockDocument; replaced: number } {
  if (query.length === 0) return { document, replaced: 0 };

  let next = document;
  let replaced = 0;

  for (const block of document.blocks) {
    if (block.kind === 'pageBreak') continue;
    const text = blockText(block);
    const hits = findInText(text, query, options);
    if (hits.length === 0) continue;

    let rewritten = text;
    for (let i = hits.length - 1; i >= 0; i -= 1) {
      const hit = hits[i];
      rewritten = rewritten.slice(0, hit.start) + replacement + rewritten.slice(hit.end);
    }

    next = setBlockText(next, block.id, rewritten);
    replaced += hits.length;
  }

  return { document: next, replaced };
}
