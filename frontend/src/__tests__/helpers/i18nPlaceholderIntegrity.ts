/**
 * i18n placeholder-contract analyzer (test-only).
 *
 * Purpose: prove that every placeholder a translation REQUIRES actually receives
 * a value from its caller, and that AR and EN agree on the placeholder contract
 * for the same key. This catches the defect class where `t('k', { equip })` is
 * silently interpolated against `'… {code}'` and leaks a literal `{code}` to the
 * user, because `t()` interpolates by name and never reports a mismatch.
 *
 * Analysis is done over the TypeScript AST — not a text regex — so ES shorthand
 * (`{ from, to }`), multi-line calls, nested values and both call signatures are
 * handled exactly. Anything that cannot be resolved statically (dynamic keys,
 * spread var objects) is reported as UNRESOLVED and never as a defect.
 *
 * Supported call signatures (both real in this codebase):
 *   t(key, vars?)          — the object returned by useT()
 *   t(key, lang, vars?)    — the module-level t / `t as translate` import
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type Lang = string;

/** A placeholder is `{name}` — no spaces, so CSS/JSON/template braces never match. */
const PLACEHOLDER_RE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export function placeholdersOf(value: string): Set<string> {
  return new Set([...value.matchAll(PLACEHOLDER_RE)].map((m) => m[1]));
}

export type Dictionaries = Record<Lang, Map<string, string>>;

/** Parse the `DICT` object literal out of lib/i18n.ts into per-locale key→value maps. */
export function extractDictionaries(i18nFile: string): Dictionaries {
  const src = ts.createSourceFile(
    i18nFile,
    fs.readFileSync(i18nFile, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const out: Dictionaries = {};

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText() === 'DICT' &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const langProp of node.initializer.properties) {
        if (!ts.isPropertyAssignment(langProp) || !ts.isObjectLiteralExpression(langProp.initializer)) continue;
        const lang = langProp.name.getText().replace(/^['"]|['"]$/g, '');
        const map = new Map<string, string>();
        for (const p of langProp.initializer.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          if (!ts.isStringLiteral(p.initializer) && !ts.isNoSubstitutionTemplateLiteral(p.initializer)) continue;
          map.set(p.name.getText().replace(/^['"]|['"]$/g, ''), p.initializer.text);
        }
        out[lang] = map;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(src);
  return out;
}

export interface ParityMismatch {
  key: string;
  values: Record<Lang, string>;
  /** locale → placeholders required by that locale but absent from at least one other */
  divergence: Record<Lang, string[]>;
}

/**
 * AR ↔ EN placeholder-set parity. Compares SETS, so `'{from} إلى {to}'` and
 * `'{to} through {from}'` are contract-compatible — word order is not a defect.
 * Keys absent from a locale are skipped: missing translation COVERAGE is a
 * separate concern from placeholder INTEGRITY.
 */
export function findParityMismatches(dicts: Dictionaries): ParityMismatch[] {
  const langs = Object.keys(dicts);
  const allKeys = new Set<string>(langs.flatMap((l) => [...dicts[l].keys()]));
  const mismatches: ParityMismatch[] = [];

  for (const key of allKeys) {
    const present = langs.filter((l) => dicts[l].has(key));
    if (present.length < 2) continue;

    const sets = new Map<Lang, Set<string>>(present.map((l) => [l, placeholdersOf(dicts[l].get(key)!)]));
    const union = new Set<string>([...sets.values()].flatMap((s) => [...s]));

    const divergence: Record<Lang, string[]> = {};
    for (const l of present) {
      const missing = [...union].filter((p) => !sets.get(l)!.has(p));
      if (missing.length) divergence[l] = missing.sort();
    }
    if (Object.keys(divergence).length) {
      const values: Record<Lang, string> = {};
      for (const l of present) values[l] = dicts[l].get(key)!;
      mismatches.push({ key, values, divergence });
    }
  }
  return mismatches.sort((a, b) => a.key.localeCompare(b.key));
}

/** Placeholders required by ANY locale that defines the key, with the locales that require each. */
export function requiredPlaceholders(dicts: Dictionaries, key: string): Map<string, Lang[]> {
  const req = new Map<string, Lang[]>();
  for (const lang of Object.keys(dicts)) {
    const value = dicts[lang].get(key);
    if (value === undefined) continue;
    for (const p of placeholdersOf(value)) {
      if (!req.has(p)) req.set(p, []);
      req.get(p)!.push(lang);
    }
  }
  return req;
}

export type CallResolution = 'static' | 'dynamic-key' | 'unresolved-vars';

export interface CallSite {
  file: string;
  line: number;
  /** null when the key is not a string literal */
  key: string | null;
  /** null = no interpolation object supplied; otherwise the supplied variable names */
  vars: string[] | null;
  resolution: CallResolution;
  /** source text of the first argument, for diagnostics on unresolved calls */
  rawKey: string;
}

/** Identifiers that read as a `lang` argument in `t(key, lang, vars?)`. */
const LANG_IDENTIFIERS = new Set(['lang', 'l', 'language', 'locale', 'currentLang']);

function isLangArgument(node: ts.Expression): boolean {
  if (ts.isStringLiteral(node)) return true;
  if (ts.isIdentifier(node)) return LANG_IDENTIFIERS.has(node.text);
  // `currentLang()` and similar accessor calls
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    return LANG_IDENTIFIERS.has(node.expression.text);
  }
  return false;
}

export function scanFile(file: string, rootForRelativePaths: string): CallSite[] {
  const src = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const rel = path.relative(rootForRelativePaths, file).replace(/\\/g, '/');
  const found: CallSite[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null;

      if (name === 't' || name === 'translate') {
        const args = node.arguments;
        const line = src.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const a0: ts.Expression | undefined = args[0];
        const rawKey = a0 ? a0.getText().slice(0, 60) : '';
        const key =
          a0 && (ts.isStringLiteral(a0) || ts.isNoSubstitutionTemplateLiteral(a0)) ? a0.text : null;

        // Locate the interpolation object across both supported signatures.
        let varsNode: ts.Expression | null = null;
        let ambiguous = false;
        if (args.length >= 3) {
          varsNode = args[2];
        } else if (args.length === 2) {
          const a1 = args[1];
          if (ts.isObjectLiteralExpression(a1)) varsNode = a1;
          else if (isLangArgument(a1)) varsNode = null; // t(key, lang) — no vars
          else ambiguous = true; // could be a lang expression OR a vars expression
        }

        let vars: string[] | null = null;
        let resolution: CallResolution = 'static';
        if (ambiguous) {
          resolution = 'unresolved-vars';
        } else if (varsNode) {
          if (ts.isObjectLiteralExpression(varsNode)) {
            const names: string[] = [];
            for (const p of varsNode.properties) {
              if (ts.isPropertyAssignment(p)) {
                // Computed keys (`[expr]: v`) cannot be resolved to a name.
                if (ts.isComputedPropertyName(p.name)) resolution = 'unresolved-vars';
                else names.push(p.name.getText().replace(/^['"]|['"]$/g, ''));
              } else if (ts.isShorthandPropertyAssignment(p)) {
                names.push(p.name.text); // ES shorthand: { from, to }
              } else {
                resolution = 'unresolved-vars'; // spread — contents unknown
              }
            }
            if (resolution === 'static') vars = names;
          } else {
            resolution = 'unresolved-vars';
          }
        }
        if (key === null && resolution === 'static') resolution = 'dynamic-key';

        found.push({ file: rel, line, key, vars, resolution, rawKey });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(src);
  return found;
}

export function collectSourceFiles(dir: string, exclude: (p: string) => boolean): string[] {
  const acc: string[] = [];
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !exclude(p)) acc.push(p);
    }
  };
  walk(dir);
  return acc;
}

export interface MissingVarFinding {
  file: string;
  line: number;
  key: string;
  missing: string[];
  supplied: string[] | null;
  /** for each missing placeholder, which locales require it */
  requiredBy: Record<string, Lang[]>;
}

export interface ExtraVarFinding {
  file: string;
  line: number;
  key: string;
  extra: string[];
}

export interface AuditReport {
  calls: CallSite[];
  staticCalls: CallSite[];
  unresolved: CallSite[];
  missing: MissingVarFinding[];
  extra: ExtraVarFinding[];
  unknownKeys: CallSite[];
}

/** Cross-check every statically-resolvable call against the dictionaries. */
export function auditCallSites(dicts: Dictionaries, calls: CallSite[]): AuditReport {
  const staticCalls = calls.filter((c) => c.resolution === 'static' && c.key !== null);
  const unresolved = calls.filter((c) => c.resolution !== 'static');
  const missing: MissingVarFinding[] = [];
  const extra: ExtraVarFinding[] = [];
  const unknownKeys: CallSite[] = [];

  for (const c of staticCalls) {
    const key = c.key!;
    if (!Object.keys(dicts).some((l) => dicts[l].has(key))) {
      unknownKeys.push(c);
      continue;
    }
    const req = requiredPlaceholders(dicts, key);
    const supplied = new Set(c.vars ?? []);

    const miss = [...req.keys()].filter((p) => !supplied.has(p)).sort();
    if (miss.length) {
      const requiredBy: Record<string, Lang[]> = {};
      for (const p of miss) requiredBy[p] = req.get(p)!;
      missing.push({ file: c.file, line: c.line, key, missing: miss, supplied: c.vars, requiredBy });
    }

    const ext = [...supplied].filter((p) => !req.has(p)).sort();
    if (ext.length) extra.push({ file: c.file, line: c.line, key, extra: ext });
  }

  return { calls, staticCalls, unresolved, missing, extra, unknownKeys };
}

export function formatMissingFindings(findings: MissingVarFinding[]): string {
  return findings
    .map(
      (f) =>
        `  ${f.file}:${f.line}\n` +
        `    key       : ${f.key}\n` +
        `    expected  : ${f.missing.map((p) => `{${p}}` + ` (required by ${f.requiredBy[p].join(', ')})`).join(', ')}\n` +
        `    supplied  : ${f.supplied === null ? '(no interpolation object)' : f.supplied.length ? f.supplied.join(', ') : '(empty object)'}`,
    )
    .join('\n\n');
}

export function formatParityMismatches(mismatches: ParityMismatch[]): string {
  return mismatches
    .map((m) => {
      const locales = Object.keys(m.values)
        .map((l) => `    ${l}: "${m.values[l]}"  [placeholders: ${[...placeholdersOf(m.values[l])].join(', ') || 'none'}]`)
        .join('\n');
      const div = Object.entries(m.divergence)
        .map(([l, ps]) => `${l} is missing ${ps.map((p) => `{${p}}`).join(', ')}`)
        .join('; ');
      return `  key: ${m.key}\n${locales}\n    divergence: ${div}`;
    })
    .join('\n\n');
}
