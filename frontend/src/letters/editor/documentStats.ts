/**
 * Letter Engine — document statistics (Document Studio Foundation v1).
 *
 * PURE. No React, no DOM, no clock. Counting is arithmetic over the block model and
 * the section values, which is what lets the status bar be tested without rendering
 * anything and what keeps the counters off the typing path.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY WORD COUNTING IS NOT `text.split(' ').length`
 * ══════════════════════════════════════════════════════════════════════════
 * Arabic is the document language, and the naive split is wrong for it in three
 * separate ways that all appear in ordinary correspondence:
 *
 *  1. ARABIC PUNCTUATION IS NOT ASCII PUNCTUATION. The comma is `،` (U+060C), the
 *     semicolon `؛` (U+061B), the question mark `؟` (U+061F). A splitter that knows
 *     only `,;?` treats «الأول،الثاني» as one word.
 *  2. TATWEEL IS NOT A LETTER. The kashida `ـ` (U+0640) stretches a joined form for
 *     justification; it carries no phonetic content and must not make a word longer or
 *     turn one word into two.
 *  3. DIACRITICS ARE NOT CHARACTERS THE AUTHOR TYPED AS CONTENT. Harakat
 *     (U+064B…U+0652) are counted by the CHARACTER counters — an author who added them
 *     did type them — but they must never split a word.
 *
 * So words are counted by matching RUNS OF WORD CHARACTERS rather than by splitting on
 * separators. That inverts the failure mode: an unrecognised separator merges two
 * words under a splitter, whereas under a matcher an unrecognised separator is simply
 * not a word character and the two runs stay separate.
 */

import { type BlockDocument } from '../model/blockTypes';
import { blockText } from './blockCommands';

/**
 * Average reading speed, words per minute.
 *
 * 180 rather than the 200–250 usually quoted for English prose: the figures for Arabic
 * are consistently lower, and an official letter is read carefully rather than skimmed.
 * A deliberate under-estimate — a reading time that proves optimistic is worse than one
 * that proves generous.
 */
export const READING_WORDS_PER_MINUTE = 180;

/**
 * What counts as part of a word.
 *
 * Arabic letters and Arabic-Indic digits, Latin letters and digits, plus the marks that
 * live INSIDE a word and must not break it: diacritics, the tatweel, and the intra-word
 * punctuation (apostrophe, hyphen) that appears in transliterated names.
 */
const WORD_RUN = /[ؠ-يٮ-ۓ٠-٩۰-۹ً-ْـA-Za-z0-9'’\-_]+/gu;

/** Characters that are present but are not content the author "wrote". */
const WHITESPACE = /\s/gu;

export interface TextStats {
  readonly words: number;
  /** Every character, including spaces — the figure a form field's limit refers to. */
  readonly characters: number;
  /** Characters excluding whitespace — the figure a typographer means by "length". */
  readonly charactersNoSpaces: number;
}

export interface DocumentStats extends TextStats {
  /** Content paragraphs, headings and list items. Excludes page breaks. */
  readonly paragraphs: number;
  /** Blocks whose kind is `heading` — the outline's length. */
  readonly headings: number;
  /** Rounded UP to a whole minute, and never below 1 for a non-empty document. */
  readonly readingMinutes: number;
}

/** Statistics for one plain string. */
export function textStats(text: string): TextStats {
  if (!text) return { words: 0, characters: 0, charactersNoSpaces: 0 };
  const words = text.match(WORD_RUN);
  return {
    words: words ? words.length : 0,
    characters: [...text].length,
    charactersNoSpaces: [...text.replace(WHITESPACE, '')].length,
  };
}

/**
 * Statistics for the editable content of a whole letter.
 *
 * `extraText` carries the section values the block model does not hold — subject,
 * recipient — so the status bar reports the LETTER's length rather than the body's.
 * Passed in rather than imported because this module knows about blocks, not sections,
 * and reaching into the composer's state from here would invert the dependency.
 */
export function documentStats(
  document: BlockDocument | null,
  extraText: readonly string[] = [],
): DocumentStats {
  const blocks = document?.blocks ?? [];
  const textual = blocks.filter((block) => block.kind !== 'pageBreak');

  const pieces = [...textual.map(blockText), ...extraText.filter((t) => t.length > 0)];
  const combined = pieces.join('\n');
  const stats = textStats(combined);

  return {
    ...stats,
    paragraphs: textual.length,
    headings: blocks.filter((block) => block.kind === 'heading').length,
    readingMinutes: stats.words === 0 ? 0 : Math.max(1, Math.ceil(stats.words / READING_WORDS_PER_MINUTE)),
  };
}

/* ── Caret and selection ────────────────────────────────────────────────── */

/**
 * Where the caret is inside one paragraph, and how much is selected.
 *
 * Line and column are one-based because they are shown to a person; every other index
 * in the engine is zero-based because it addresses an array. Mixing the two conventions
 * inside one value would guarantee an off-by-one somewhere, so the boundary is here and
 * it is documented.
 */
export interface CaretStats {
  /** One-based line within the paragraph, counting soft line breaks. */
  readonly line: number;
  /** One-based column within that line. */
  readonly column: number;
  /** Characters currently selected. Zero when the selection is collapsed. */
  readonly selectedCharacters: number;
  /** Words currently selected. Zero when the selection is collapsed. */
  readonly selectedWords: number;
}

export const EMPTY_CARET_STATS: CaretStats = {
  line: 1,
  column: 1,
  selectedCharacters: 0,
  selectedWords: 0,
};

/**
 * Caret position and selection size within one paragraph's text.
 *
 * Offsets are clamped rather than trusted: they arrive from a DOM control whose value
 * may already have changed under a re-render, and a clamped reading is always
 * meaningful where an out-of-range one would produce a negative column.
 */
export function caretStats(text: string, selectionStart: number, selectionEnd: number): CaretStats {
  const length = text.length;
  const start = Math.min(Math.max(0, selectionStart), length);
  const end = Math.min(Math.max(start, selectionEnd), length);

  const before = text.slice(0, start);
  const lastBreak = before.lastIndexOf('\n');
  const selected = text.slice(start, end);

  return {
    line: before.split('\n').length,
    column: (lastBreak === -1 ? before.length : before.length - lastBreak - 1) + 1,
    selectedCharacters: [...selected].length,
    selectedWords: selected.length === 0 ? 0 : textStats(selected).words,
  };
}

/* ── Language ───────────────────────────────────────────────────────────── */

/** What the status bar reports as the document's language. */
export type DocumentLanguage = 'ar' | 'en' | 'mixed' | 'unknown';

const ARABIC_LETTER = /[ؠ-يٮ-ۓ]/u;
const LATIN_LETTER = /[A-Za-z]/u;

/**
 * The script the document is predominantly written in.
 *
 * Reported rather than configured: an official letter is Arabic, but a letter quoting a
 * contract clause or a supplier's name legitimately mixes scripts, and telling the
 * author which one they are actually in is more useful than asserting one. `mixed` is a
 * legitimate answer, not a failure to decide.
 *
 * The 15% threshold is deliberately low — a single English product name in an otherwise
 * Arabic letter should NOT flip the reading to "mixed", but a paragraph of quoted
 * English should.
 */
export function detectLanguage(text: string): DocumentLanguage {
  const arabic = (text.match(new RegExp(ARABIC_LETTER, 'gu')) ?? []).length;
  const latin = (text.match(new RegExp(LATIN_LETTER, 'gu')) ?? []).length;
  const total = arabic + latin;
  if (total === 0) return 'unknown';

  const minorityShare = Math.min(arabic, latin) / total;
  if (minorityShare >= 0.15) return 'mixed';
  return arabic >= latin ? 'ar' : 'en';
}

export const LANGUAGE_LABEL_AR: Readonly<Record<DocumentLanguage, string>> = {
  ar: 'العربية',
  en: 'الإنجليزية',
  mixed: 'مختلط',
  unknown: '—',
};
