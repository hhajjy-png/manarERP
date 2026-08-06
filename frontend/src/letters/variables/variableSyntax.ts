/**
 * Letter Engine — variable token syntax (Professional Document Automation v1).
 *
 * PURE. Finding, replacing and validating `{{Name}}` tokens in plain text.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE TOKEN IS WHAT IS STORED. THE VALUE IS ONLY EVER RENDERED.
 * ══════════════════════════════════════════════════════════════════════════
 * A block's text holds `{{Employee}}` for the whole life of the draft. Substitution
 * happens on the way to the screen and on the way to the paper, never on the way to
 * the database. That direction is the entire design:
 *
 *   · The letter stays re-resolvable. Bind a different employee and every occurrence
 *     updates, because the document never lost the question it was asking.
 *   · Nothing has to be un-substituted. An engine that stored resolved text would need
 *     an inverse to edit the variable again, and there is no inverse — "أحمد محمد" in
 *     a letter cannot be told from a name that was typed.
 *   · The frozen snapshot stays meaningful. Registration records the VALUES separately,
 *     so an issued letter has both what it asked and what it got.
 *
 * ── THE SYNTAX IS DELIBERATELY POOR ──────────────────────────────────────
 * `{{Name}}` and nothing else. No filters, no defaults, no nesting, no expressions.
 * Every one of those would be a small language, and a small language in a document
 * template is the thing that eventually needs a parser, a sandbox and a security
 * review. A name is enough.
 */

import { findVariable, isVariableName } from './variableCatalog';

/**
 * The token pattern.
 *
 * `[A-Za-z][A-Za-z0-9]*` — Latin, no spaces, no punctuation. Restrictive on purpose:
 * a pattern that matched anything between braces would swallow ordinary Arabic prose
 * containing a brace, and would make "is this a token?" a question about context.
 *
 * Not global — `matchAll` supplies its own iteration, and a shared global regex
 * carries `lastIndex` between calls, which is the classic way a "find all" silently
 * returns different results on its second invocation.
 */
const TOKEN = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/;

/** Global form, built fresh at each use so no `lastIndex` is ever shared. */
function tokenPattern(): RegExp {
  return new RegExp(TOKEN, 'g');
}

/** One token found in a string. */
export interface VariableToken {
  /** The name between the braces. */
  readonly name: string;
  /** Offsets of the whole `{{Name}}` run in the ORIGINAL string. */
  readonly start: number;
  readonly end: number;
  /** False when the catalogue does not declare this name. */
  readonly known: boolean;
}

/** Every token in a string, in order, including unknown ones. */
export function findTokens(text: string): VariableToken[] {
  if (!text.includes('{{')) return [];

  const tokens: VariableToken[] = [];
  for (const match of text.matchAll(tokenPattern())) {
    const name = match[1];
    tokens.push({
      name,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      known: isVariableName(name),
    });
  }
  return tokens;
}

/** Does this text contain any token at all? Cheap guard before the full scan. */
export function hasTokens(text: string): boolean {
  return text.includes('{{') && tokenPattern().test(text);
}

/** Distinct variable names used in a string, in first-seen order. */
export function tokenNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const token of findTokens(text)) {
    if (seen.has(token.name)) continue;
    seen.add(token.name);
    names.push(token.name);
  }
  return names;
}

/** Names used here that the catalogue does not declare. */
export function unknownTokenNames(text: string): string[] {
  return tokenNames(text).filter((name) => !isVariableName(name));
}

/** Wrap a name into its token form — the one place braces are written. */
export function toToken(name: string): string {
  return `{{${name}}}`;
}

/**
 * How an unresolved token renders.
 *
 * `pending` keeps the token visible, which is right on screen: the author can see the
 * question the letter is asking and knows it has not been answered yet.
 *
 * `blank` erases it, which is right for MEASUREMENT and for a preview of the finished
 * page — but never for print, because a letter that silently drops a value is worse
 * than one that visibly still has a hole in it. Printing an unresolved letter is
 * refused by `E18_unresolvedVariable` before this choice can matter.
 */
export type UnresolvedMode = 'pending' | 'blank';

/**
 * Substitute every token.
 *
 * `values` maps a name to its resolved value. A name absent from the map, or mapped to
 * `null`, is UNRESOLVED and rendered per `mode` — the two are the same case
 * deliberately: "no binding yet" and "bound to an employee with no phone number" are
 * both "there is no value", and making the author distinguish them would be asking
 * them to care about the difference between empty and missing.
 */
export function resolveTokens(
  text: string,
  values: Readonly<Record<string, string | null | undefined>>,
  mode: UnresolvedMode = 'pending',
): string {
  if (!text.includes('{{')) return text;

  return text.replace(tokenPattern(), (whole, name: string) => {
    const value = values[name];
    if (value !== undefined && value !== null && value !== '') return value;
    return mode === 'blank' ? '' : whole;
  });
}

/**
 * Insert a token at a caret position, returning the new text and where the caret
 * should land.
 *
 * The caret goes AFTER the inserted token rather than inside it — an author who has
 * just inserted a variable is going on to write the next word, not to edit the name
 * they picked from a list.
 */
export function insertTokenAt(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  name: string,
): { text: string; caret: number } {
  const token = toToken(name);
  const start = Math.min(Math.max(0, selectionStart), text.length);
  const end = Math.min(Math.max(start, selectionEnd), text.length);
  return {
    text: text.slice(0, start) + token + text.slice(end),
    caret: start + token.length,
  };
}

/** A token's human label, for a browser preview. Falls back to the raw name. */
export function tokenLabel(name: string): string {
  return findVariable(name)?.labelAr ?? name;
}
