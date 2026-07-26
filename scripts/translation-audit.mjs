#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Translation Audit — Quality Audit Pack v1
 * ─────────────────────────────────────────────────────────────────────────────
 *  Developer-only, READ-ONLY quality utility for نظام المنار (manarERP).
 *
 *  Scans the entire frontend translation surface and reports quality issues.
 *  It NEVER modifies, fixes, renames, or creates translations. It only reads
 *  source files as text and prints a report.
 *
 *  Run:   node scripts/translation-audit.mjs
 *         node scripts/translation-audit.mjs --md   (emit Markdown report)
 *         node scripts/translation-audit.mjs --md > docs/translation-audit.md
 *
 *  Architecture it audits (verified, not assumed):
 *   - Single dictionary module: frontend/src/lib/i18n.ts
 *       const DICT: Record<Lang, Record<string,string>> = { ar: {...}, en: {...} }
 *   - Resolution: t(key, lang) = DICT[lang][key] ?? DICT.ar[key] ?? key
 *       → English silently falls back to Arabic; both fall back to the raw key.
 *   - Placeholders use SINGLE-brace {name} syntax (not i18next {{name}}).
 *   - No JSON translation files exist → checks 11 (orphan files) and 12
 *     (invalid JSON) are reframed against the single-module reality.
 *   - Backend has no translations → audit is frontend-only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FRONTEND_SRC = join(ROOT, 'frontend', 'src');
const I18N_FILE = join(FRONTEND_SRC, 'lib', 'i18n.ts');

const AS_MD = process.argv.includes('--md');

// ── severity ranking ─────────────────────────────────────────────────────────
const SEV = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };

// ─────────────────────────────────────────────────────────────────────────────
//  0. Load dictionary (text parse — no import, no mutation)
// ─────────────────────────────────────────────────────────────────────────────
/** @returns {{ ar: Map<string,{value:string,line:number}[]>, en: Map<string,{value:string,line:number}[]>, structural: string[] }} */
function loadDictionary() {
  const structural = [];
  let raw;
  try {
    raw = readFileSync(I18N_FILE, 'utf8');
  } catch (e) {
    structural.push(`Cannot read dictionary file ${rel(I18N_FILE)}: ${e.message}`);
    return { ar: new Map(), en: new Map(), structural };
  }
  if (raw.charCodeAt(0) === 0xfeff) structural.push('Dictionary file begins with a UTF-8 BOM.');

  const lines = raw.split(/\r?\n/);
  // locate the two language blocks
  let arStart = -1, enStart = -1, dictEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (arStart === -1 && /^ar\s*:\s*\{/.test(trimmed)) arStart = i;
    else if (enStart === -1 && arStart !== -1 && /^en\s*:\s*\{/.test(trimmed)) enStart = i;
    else if (enStart !== -1 && dictEnd === -1 && trimmed === '};') dictEnd = i;
  }
  if (arStart === -1) structural.push("Could not locate the `ar: {` block in the dictionary.");
  if (enStart === -1) structural.push("Could not locate the `en: {` block in the dictionary.");

  const ar = parseBlock(lines, arStart + 1, enStart === -1 ? lines.length : enStart, structural, 'ar');
  const en = parseBlock(lines, enStart + 1, dictEnd === -1 ? lines.length : dictEnd, structural, 'en');
  return { ar, en, structural };
}

/**
 * Parse `'key': 'value',` entries in [from,to). Returns Map key -> array of
 * occurrences (array length > 1 means an in-block duplicate).
 */
function parseBlock(lines, from, to, structural, label) {
  /** @type {Map<string,{value:string,line:number}[]>} */
  const map = new Map();
  if (from < 1) return map;
  // key: opening quote, key chars (dotted namespace), closing quote, colon, value
  const entryRe = /^\s*(['"])((?:[^'"\\]|\\.)*?)\1\s*:\s*(['"])((?:[^\\]|\\.)*?)\3\s*,?\s*$/;
  for (let i = from; i < to; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('//') || line.trim() === '},') continue;
    const m = entryRe.exec(line);
    if (!m) {
      // an entry line we could not parse (e.g. multi-line value) — note once
      if (/^\s*['"]/.test(line) && !line.trim().startsWith('//')) {
        structural.push(`[${label}] Unparseable dictionary entry at line ${i + 1}: ${line.trim().slice(0, 60)}`);
      }
      continue;
    }
    const key = m[2];
    const value = m[4];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ value, line: i + 1 });
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
//  1. Scan source for t()/translate() key usages + hardcoded text
// ─────────────────────────────────────────────────────────────────────────────
const KEY_SHAPE = /^[a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+$/; // dotted namespace
// t( '...' )  |  translate( '...' )  — string OR template literal first arg
const CALL_RE = /(?<![\w.])(?:t|translate)\s*\(\s*(['"`])((?:[^\\`]|\\.)*?)\1/g;
const ARABIC = /[؀-ۿ]/;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(full);
  }
  return out;
}

function scanSources() {
  const files = walk(FRONTEND_SRC);
  /** @type {{key:string,file:string,line:number}[]} */
  const usages = [];
  /** @type {Set<string>} */ const usedKeys = new Set();
  /** @type {Set<string>} */ const dynamicPrefixes = new Set();
  /** @type {{file:string,line:number,text:string}[]} */ const hardcoded = [];

  const isTest = (f) => /(__tests__|\.test\.|\.spec\.)/.test(f);

  for (const file of files) {
    const relFile = rel(file);
    const isI18nDict = file === I18N_FILE;
    const src = readFileSync(file, 'utf8');
    const lines = src.split(/\r?\n/);

    // -- translation key usages (all files, incl. tests, so refs count as used)
    let m;
    CALL_RE.lastIndex = 0;
    while ((m = CALL_RE.exec(src)) !== null) {
      const quote = m[1];
      const literal = m[2];
      const line = lineOf(src, m.index);
      if (quote === '`') {
        // template literal → dynamic key; capture static prefix before ${…}
        const staticPrefix = literal.split('${')[0];
        if (staticPrefix.includes('.')) dynamicPrefixes.add(staticPrefix);
        continue;
      }
      if (!KEY_SHAPE.test(literal)) continue; // not a translation key literal
      const lineText = (lines[line - 1] ?? '').trim(); // skip matches inside comments (e.g. JSDoc examples)
      if (lineText.startsWith('//') || lineText.startsWith('*') || lineText.startsWith('/*')) continue;
      usages.push({ key: literal, file: relFile, line });
      usedKeys.add(literal);
    }

    // -- hardcoded Arabic UI text (skip the dictionary itself and test files)
    if (isI18nDict || isTest(file)) continue;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const t = ln.trim();
      if (!ARABIC.test(ln)) continue;
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue; // comments
      // Arabic inside a string literal or JSX text, NOT already wrapped by t()/translate()
      const arabicStrings = extractArabicLiterals(ln);
      for (const s of arabicStrings) {
        // heuristic: ignore if this line is clearly a t()/translate default arg
        hardcoded.push({ file: relFile, line: i + 1, text: s.slice(0, 80) });
      }
    }
  }
  return { usages, usedKeys, dynamicPrefixes, hardcoded };
}

// pull quoted Arabic-bearing literals (single/double/backtick) + bare JSX arabic
function extractArabicLiterals(line) {
  const found = [];
  const strRe = /(['"`])((?:[^\\]|\\.)*?)\1/g;
  let m;
  let hadString = false;
  while ((m = strRe.exec(line)) !== null) {
    hadString = true;
    if (ARABIC.test(m[2])) found.push(m[2].trim());
  }
  // JSX text node: >  عربي  <  (no quotes involved)
  if (!hadString) {
    const jsx = line.match(/>\s*([^<>{}]*[؀-ۿ][^<>{}]*)</);
    if (jsx && jsx[1].trim()) found.push(jsx[1].trim());
  }
  return found;
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

// ─────────────────────────────────────────────────────────────────────────────
//  helpers
// ─────────────────────────────────────────────────────────────────────────────
function rel(p) { return relative(ROOT, p).split(sep).join('/'); }
function placeholders(str) {
  const set = new Set();
  const re = /\{([a-zA-Z0-9_]+)\}/g;
  let m; while ((m = re.exec(str)) !== null) set.add(m[1]);
  return set;
}
function hasDoubleBrace(str) { return /\{\{[a-zA-Z0-9_]+\}\}/.test(str); }
function namespaceOf(key) { const i = key.indexOf('.'); return i === -1 ? key : key.slice(0, i); }
function parentPath(key) { const i = key.lastIndexOf('.'); return i === -1 ? '' : key.slice(0, i); }
function leaf(key) { const i = key.lastIndexOf('.'); return i === -1 ? key : key.slice(i + 1); }
const normSeg = (s) => s.toLowerCase().replace(/_/g, '');
// antonym / directional token pairs that legitimately produce near-identical keys
const ANTONYMS = [
  ['from', 'to'], ['on', 'off'], ['min', 'max'], ['start', 'end'], ['prev', 'next'],
  ['next', 'back'], ['in', 'out'], ['up', 'down'], ['add', 'edit'], ['asc', 'desc'],
  ['open', 'close'], ['first', 'last'], ['top', 'bottom'], ['left', 'right'],
  ['before', 'after'], ['yes', 'no'], ['old', 'new'], ['show', 'hide'], ['inc', 'exc'],
  ['export', 'import'], ['debit', 'credit'], ['sales', 'purchase'], ['income', 'expense'],
  ['asset', 'liability'], ['create', 'delete'], ['add', 'remove'], ['enable', 'disable'],
];
// enumerated siblings that differ only by a trailing number: step1↔step2, day1↔day2
function isEnumerated(a, b) {
  const sa = a.replace(/\d+$/, ''), sb = b.replace(/\d+$/, '');
  return a !== b && sa.length > 0 && sa === sb;
}
function isAntonymPair(a, b) {
  const ta = a.split('_'), tb = b.split('_');
  if (ta.length !== tb.length) return false;
  const diff = [];
  for (let k = 0; k < ta.length; k++) if (ta[k].toLowerCase() !== tb[k].toLowerCase()) diff.push([ta[k].toLowerCase(), tb[k].toLowerCase()]);
  if (diff.length !== 1) return false;
  const [x, y] = diff[0];
  return ANTONYMS.some(([p, q]) => (x === p && y === q) || (x === q && y === p));
}
const isPlural = (a, b) => { const x = a.toLowerCase(), y = b.toLowerCase(); return x + 's' === y || y + 's' === x; };
// grammatical inflection (plural / tense / gerund): generate↔generated, save↔saved
function isInflection(a, b) {
  const x = a.toLowerCase(), y = b.toLowerCase();
  const [lo, hi] = x.length < y.length ? [x, y] : [y, x];
  return ['s', 'd', 'es', 'ed', 'ing'].some((suf) => lo + suf === hi);
}
// negation prefix: active↔inactive, valid↔invalid, done↔undone
const isNegation = (a, b) => {
  const x = a.toLowerCase(), y = b.toLowerCase();
  return ['in', 'un', 'non', 'no'].some((p) => p + x === y || p + y === x);
};
// language-suffix pair: field.fullname_ar ↔ field.fullname_en
function isLangSuffixPair(a, b) {
  const ta = a.split('_'), tb = b.split('_');
  if (ta.length !== tb.length || ta.length < 2) return false;
  for (let k = 0; k < ta.length - 1; k++) if (ta[k] !== tb[k]) return false;
  const codes = new Set(['ar', 'en', 'fr', 'ku']);
  return ta.at(-1) !== tb.at(-1) && codes.has(ta.at(-1).toLowerCase()) && codes.has(tb.at(-1).toLowerCase());
}
function levenshtein(a, b) {
  if (a === b) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0]; dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[a.length];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Run all checks
// ─────────────────────────────────────────────────────────────────────────────
const dict = loadDictionary();
const { usages, usedKeys, dynamicPrefixes, hardcoded } = scanSources();

const arKeys = new Set(dict.ar.keys());
const enKeys = new Set(dict.en.keys());
const allKeys = new Set([...arKeys, ...enKeys]);

/** @type {{type:string,severity:keyof typeof SEV,file:string,line:(number|string),key:string,detail:string,fix:string}[]} */
const findings = [];
const add = (f) => findings.push(f);

// -- 1. Missing translation keys (referenced but absent in BOTH languages) -----
const uniqueMissing = new Map(); // key -> first site
for (const u of usages) {
  if (!allKeys.has(u.key)) {
    if (!uniqueMissing.has(u.key)) uniqueMissing.set(u.key, u);
  }
}
for (const [key, site] of uniqueMissing) {
  const refs = usages.filter((x) => x.key === key).length;
  add({
    type: 'Missing translation key', severity: 'CRITICAL', file: site.file, line: site.line, key,
    detail: `Referenced ${refs} time(s) but absent from both ar and en → renders the raw key on screen.`,
    fix: `Add '${key}' to both the ar and en blocks of frontend/src/lib/i18n.ts, or fix the key at the call site.`,
  });
}

// -- 2. Missing language coverage ---------------------------------------------
for (const key of arKeys) {
  if (!enKeys.has(key)) {
    add({
      type: 'Missing English coverage', severity: 'HIGH', file: rel(I18N_FILE), line: dict.ar.get(key)[0].line, key,
      detail: 'Exists in ar but not en → English users silently see the Arabic value (t() falls back to ar).',
      fix: `Add an English entry for '${key}' in the en block.`,
    });
  }
}
for (const key of enKeys) {
  if (!arKeys.has(key)) {
    add({
      type: 'Missing Arabic coverage', severity: 'MEDIUM', file: rel(I18N_FILE), line: dict.en.get(key)[0].line, key,
      detail: 'Exists in en but not ar → unusual for an Arabic-first app; ar is the ultimate fallback so a wrong-language leak is possible.',
      fix: `Add an Arabic entry for '${key}' in the ar block (or remove the stray en entry).`,
    });
  }
}

// -- 3. Duplicate keys (within the same language block) ------------------------
for (const [label, map] of [['ar', dict.ar], ['en', dict.en]]) {
  for (const [key, occ] of map) {
    if (occ.length > 1) {
      add({
        type: `Duplicate key (${label} block)`, severity: 'HIGH', file: rel(I18N_FILE),
        line: occ.map((o) => o.line).join(', '), key,
        detail: `Defined ${occ.length} times in the ${label} block (lines ${occ.map((o) => o.line).join(', ')}). The last definition silently wins.`,
        fix: `Remove the redundant '${key}' definition(s) in the ${label} block, keeping the intended value.`,
      });
    }
  }
}

// -- 4. Unused keys (never referenced; dynamic-prefix aware) -------------------
const dynPrefixArr = [...dynamicPrefixes];
const maybeDynamic = (key) => dynPrefixArr.some((p) => key.startsWith(p));
let unusedCount = 0;
const unusedList = [];
for (const key of allKeys) {
  if (usedKeys.has(key)) continue;
  if (maybeDynamic(key)) continue; // possibly reached via a computed key
  unusedCount++;
  unusedList.push(key);
}
for (const key of unusedList) {
  const src = arKeys.has(key) ? dict.ar.get(key)[0].line : dict.en.get(key)[0].line;
  add({
    type: 'Potentially unused key', severity: 'LOW', file: rel(I18N_FILE), line: src, key,
    detail: 'No static t()/translate() reference found. May still be reached via a computed key — verify before removing.',
    fix: 'Confirm no dynamic reference exists, then consider removing to reduce dictionary weight. Do NOT auto-delete.',
  });
}

// -- 5 & 6. Namespace consistency — compare SIBLING namespace prefixes only -----
// (comparing arbitrary segments by raw edit distance is meaningless: "menu"⇄"send".
//  Real split namespaces are siblings under one parent: page.salaryCert ⇄ page.salary_cert.)
const childrenByParent = new Map(); // parentPath -> Map<segment, firstLine>
for (const key of allKeys) {
  const parts = key.split('.');
  for (let d = 0; d < parts.length - 1; d++) { // every ancestor prefix (exclude leaf)
    const parent = parts.slice(0, d).join('.');
    const seg = parts[d];
    if (!childrenByParent.has(parent)) childrenByParent.set(parent, new Map());
    const kids = childrenByParent.get(parent);
    if (!kids.has(seg)) {
      const line = dict.ar.get(key)?.[0]?.line ?? dict.en.get(key)?.[0]?.line ?? '—';
      kids.set(seg, line);
    }
  }
}
const reportedSegPairs = new Set();
for (const [parent, kids] of childrenByParent) {
  const segs = [...kids.keys()];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i], b = segs[j];
      const na = normSeg(a), nb = normSeg(b);
      const sameConcept = na === nb;                       // camelCase vs snake_case
      const plural = isPlural(a, b);                        // singular/plural split
      // pure edit-distance similarity only makes sense DEEP in the tree, where
      // siblings share a domain. At the top level, short real words collide by
      // coincidence (report⇄import, today⇄modal) → not a namespace split.
      const near = parent !== '' && !sameConcept && Math.min(a.length, b.length) >= 5 &&
        levenshtein(na, nb) <= 2 && !isAntonymPair(a, b) && !plural && !isInflection(a, b) && !isEnumerated(a, b);
      if (!(sameConcept || plural || near)) continue;
      const pk = parent + '|' + [a, b].sort().join('~');
      if (reportedSegPairs.has(pk)) continue;
      reportedSegPairs.add(pk);
      const under = parent ? `under '${parent}.'` : 'at the top level';
      add({
        type: 'Inconsistent namespace', severity: sameConcept ? 'HIGH' : 'MEDIUM',
        file: rel(I18N_FILE), line: kids.get(a),
        key: `${parent ? parent + '.' : ''}{ ${a} ⇄ ${b} }`,
        detail: sameConcept
          ? `Two sibling namespaces ${under} normalise to the same name ("${a}" vs "${b}") — the same concept is split across camelCase/snake_case spellings.`
          : plural
            ? `Sibling namespaces ${under} differ only by pluralisation ("${a}" vs "${b}") — likely the same concept under two names.`
            : `Sibling namespaces ${under} are near-identical ("${a}" vs "${b}", edit distance ${levenshtein(na, nb)}) — possible split namespace.`,
        fix: 'Standardise on one spelling for this namespace and migrate all keys + their call sites.',
      });
    }
  }
}

// -- 7. Hardcoded UI text ------------------------------------------------------
const hardByFile = new Map();
for (const h of hardcoded) {
  if (!hardByFile.has(h.file)) hardByFile.set(h.file, []);
  hardByFile.get(h.file).push(h);
}
for (const [file, items] of hardByFile) {
  for (const it of items) {
    add({
      type: 'Hardcoded UI text (Arabic literal)', severity: 'MEDIUM', file, line: it.line, key: '—',
      detail: `Arabic string literal outside the dictionary: "${it.text}"`,
      fix: 'If user-facing, move the string into i18n.ts and reference it via t(). If it is a non-UI constant, ignore.',
    });
  }
}

// -- 8. Empty translation values ----------------------------------------------
for (const [label, map] of [['ar', dict.ar], ['en', dict.en]]) {
  for (const [key, occ] of map) {
    for (const o of occ) {
      if (o.value.trim() === '') {
        add({
          type: `Empty value (${label})`, severity: 'HIGH', file: rel(I18N_FILE), line: o.line, key,
          detail: `The ${label} value is empty/whitespace-only → renders blank in the UI.`,
          fix: `Provide a real ${label} translation for '${key}'.`,
        });
      }
    }
  }
}

// -- 9. Placeholder validation (single-brace) ---------------------------------
for (const key of allKeys) {
  const arV = dict.ar.get(key)?.[0]?.value;
  const enV = dict.en.get(key)?.[0]?.value;
  // double-brace mistake (won't be substituted by the single-brace runtime)
  for (const [label, v] of [['ar', arV], ['en', enV]]) {
    if (v && hasDoubleBrace(v)) {
      add({
        type: 'Placeholder syntax error', severity: 'HIGH', file: rel(I18N_FILE),
        line: (label === 'ar' ? dict.ar : dict.en).get(key)[0].line, key,
        detail: `The ${label} value uses double-brace {{…}} but the runtime substitutes single-brace {…} only → the token prints literally.`,
        fix: 'Change {{token}} to {token} to match t()\'s replaceAll("{token}", …).',
      });
    }
  }
  if (arV == null || enV == null) continue; // coverage handled in check 2
  const pa = placeholders(arV), pe = placeholders(enV);
  const onlyAr = [...pa].filter((x) => !pe.has(x));
  const onlyEn = [...pe].filter((x) => !pa.has(x));
  if (onlyAr.length || onlyEn.length) {
    add({
      type: 'Placeholder mismatch', severity: 'HIGH', file: rel(I18N_FILE), line: dict.ar.get(key)[0].line, key,
      detail: `ar placeholders {${[...pa].join(', ')}} vs en {${[...pe].join(', ')}}` +
        `${onlyAr.length ? ` — missing in en: {${onlyAr.join(', ')}}` : ''}` +
        `${onlyEn.length ? ` — missing in ar: {${onlyEn.join(', ')}}` : ''}.`,
      fix: 'Make both languages use the same placeholder token set so values interpolate correctly.',
    });
  }
}

// -- 10. Similar keys / possible typos (same parent, near-identical leaf) ------
const byParent = new Map();
for (const key of allKeys) {
  const p = parentPath(key);
  if (!byParent.has(p)) byParent.set(p, []);
  byParent.get(p).push(key);
}
const reportedKeyPairs = new Set();
for (const [, keys] of byParent) {
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const la = leaf(keys[i]), lb = leaf(keys[j]);
      if (Math.abs(la.length - lb.length) > 3) continue;
      if (Math.min(la.length, lb.length) < 5) continue;   // too short → noisy
      // drop legitimate near-identical pairs: from/to, plural, tense, negation, _ar/_en
      if (isAntonymPair(la, lb) || isInflection(la, lb) || isNegation(la, lb) || isLangSuffixPair(la, lb) || isEnumerated(la, lb)) continue;
      const d = levenshtein(la.toLowerCase(), lb.toLowerCase());
      if (d > 0 && d <= 2) {
        const pk = [keys[i], keys[j]].sort().join('~');
        if (reportedKeyPairs.has(pk)) continue;
        reportedKeyPairs.add(pk);
        add({
          type: 'Similar keys / possible typo', severity: 'LOW', file: rel(I18N_FILE), line: '—',
          key: `${keys[i]}  ⇄  ${keys[j]}`,
          detail: `Leaf segments differ by edit distance ${d} — one may be a typo of the other.`,
          fix: 'Verify both are intentional; if one is a misspelling, converge call sites onto the correct key.',
        });
      }
    }
  }
}

// -- 11 & 12. Structural integrity (reframed: no JSON files in this arch) ------
for (const s of dict.structural) {
  add({
    type: 'Dictionary structural integrity', severity: 'HIGH', file: rel(I18N_FILE), line: '—', key: '—',
    detail: s, fix: 'Inspect the dictionary structure manually; the parser flagged an anomaly.',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Report
// ─────────────────────────────────────────────────────────────────────────────
findings.sort((a, b) => SEV[a.severity] - SEV[b.severity] || a.type.localeCompare(b.type));

const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
for (const f of findings) bySeverity[f.severity]++;

const countType = (t) => findings.filter((f) => f.type.startsWith(t) || f.type === t).length;
const namespaces = new Set([...allKeys].map(namespaceOf));

const summary = {
  'Translation source files': '1 (frontend/src/lib/i18n.ts — single-module dictionary; no JSON files)',
  'Languages': 'ar, en',
  'Total namespaces (top-level)': namespaces.size,
  'Total keys (union ar∪en)': allKeys.size,
  'Keys in ar': arKeys.size,
  'Keys in en': enKeys.size,
  'Distinct keys referenced in code': usedKeys.size,
  'Dynamic/computed key prefixes': dynamicPrefixes.size,
  'Missing keys (referenced, undefined)': uniqueMissing.size,
  'Missing Arabic entries': countType('Missing Arabic'),
  'Missing English entries': countType('Missing English'),
  'Duplicate keys': countType('Duplicate key'),
  'Potentially unused keys': unusedCount,
  'Hardcoded Arabic literals': hardcoded.length,
  'Namespace issues': countType('Inconsistent namespace'),
  'Similar keys / typos': countType('Similar keys'),
  'Placeholder problems': countType('Placeholder'),
  'Empty values': countType('Empty value'),
  'Structural anomalies': dict.structural.length,
};

// ---- printers ----
const H = AS_MD ? '## ' : '\n═══ ';
const HEND = AS_MD ? '' : ' ═══';
function out(s = '') { process.stdout.write(s + '\n'); }

out(AS_MD ? '# Translation Audit Report — manarERP' : '\n████████████████████████████████████████████████████████████████████');
if (!AS_MD) out('   TRANSLATION AUDIT REPORT — نظام المنار (manarERP)');
if (!AS_MD) out('████████████████████████████████████████████████████████████████████');
out(`Generated by scripts/translation-audit.mjs (read-only)`);

out(`${H}Summary${HEND}`);
const maxK = Math.max(...Object.keys(summary).map((k) => k.length));
for (const [k, v] of Object.entries(summary)) {
  out(AS_MD ? `- **${k}:** ${v}` : `  ${k.padEnd(maxK)} : ${v}`);
}
out('');
out(AS_MD ? `**Findings by severity:** ${severityLine()}` : `  Findings by severity — ${severityLine()}`);
function severityLine() {
  return `CRITICAL ${bySeverity.CRITICAL} · HIGH ${bySeverity.HIGH} · MEDIUM ${bySeverity.MEDIUM} · LOW ${bySeverity.LOW}`;
}

// grouped detail sections, most severe first
const order = [
  'Missing translation key',
  'Dictionary structural integrity',
  'Placeholder syntax error',
  'Placeholder mismatch',
  'Empty value',
  'Duplicate key',
  'Missing English coverage',
  'Missing Arabic coverage',
  'Inconsistent namespace',
  'Hardcoded UI text (Arabic literal)',
  'Similar keys / possible typo',
  'Potentially unused key',
];
const grouped = new Map();
for (const f of findings) {
  const bucket = order.find((o) => f.type.startsWith(o.split(' (')[0])) || f.type;
  if (!grouped.has(bucket)) grouped.set(bucket, []);
  grouped.get(bucket).push(f);
}

const HARD_CAP = 40; // avoid drowning the report; note the truncation explicitly
for (const bucket of order) {
  const items = grouped.get(bucket);
  if (!items || !items.length) continue;

  // Missing keys are the critical finding → show ALL, grouped by file (never capped).
  if (bucket === 'Missing translation key') {
    out(`${H}Missing translation keys — referenced in code, absent from the dictionary  (${items.length})${HEND}`);
    out(bullet('CRITICAL: t() falls back to the raw key, so the literal string (e.g. "page.leaveReq.opt.sick") prints on screen in both languages.'));
    const byFile = new Map();
    for (const it of items) {
      if (!byFile.has(it.file)) byFile.set(it.file, []);
      byFile.get(it.file).push(it);
    }
    for (const [file, arr] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
      out(AS_MD ? `\n**\`${file}\`** — ${arr.length} missing key(s):` : `\n  ${file}  (${arr.length}):`);
      for (const f of arr.sort((a, b) => a.line - b.line)) {
        out(AS_MD ? `- \`${f.key}\`  (line ${f.line})` : `      :${f.line}  ${f.key}`);
      }
    }
    out(AS_MD ? '\nFix: add each key to BOTH the ar and en blocks of frontend/src/lib/i18n.ts, or correct the key at the call site.'
              : '\n  fix: add each key to BOTH ar and en blocks of i18n.ts, or correct the key at the call site.');
    out('');
    continue;
  }

  // Hardcoded text is high-volume → render a per-file rollup, not one line each.
  if (bucket === 'Hardcoded UI text (Arabic literal)') {
    out(`${H}Hardcoded UI text (Arabic literals outside the dictionary)  (${items.length})${HEND}`);
    out(bullet('Caveat: some are intentional non-UI constants (e.g. AI intent-routing patterns in frontend/src/ai/*). Focus on page/component/dialog files first.'));
    const byFile = new Map();
    for (const it of items) {
      if (!byFile.has(it.file)) byFile.set(it.file, []);
      byFile.get(it.file).push(it);
    }
    const ranked = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [file, arr] of ranked.slice(0, 25)) {
      const sample = arr[0].detail.replace('Arabic string literal outside the dictionary: ', '');
      out(AS_MD ? `- \`${file}\` — **${arr.length}** literal(s); e.g. line ${arr[0].line}: ${sample}`
                : `  ${String(arr.length).padStart(4)} × ${file}   (e.g. :${arr[0].line} ${sample})`);
    }
    if (ranked.length > 25) out(`  … and ${ranked.length - 25} more file(s).`);
    out('');
    continue;
  }

  out(`${H}${bucket}  (${items.length})${HEND}`);
  const shown = items.slice(0, HARD_CAP);
  for (const f of shown) {
    if (AS_MD) {
      out(`- **[${f.severity}]** \`${f.key}\` — ${f.detail}`);
      out(`  - File: \`${f.file}\`${f.line !== '—' ? ` : ${f.line}` : ''}`);
      out(`  - Fix: ${f.fix}`);
    } else {
      out(`  [${f.severity}] ${f.key}`);
      out(`      ${f.detail}`);
      out(`      ↳ ${f.file}${f.line !== '—' ? `:${f.line}` : ''}`);
      out(`      fix: ${f.fix}`);
    }
  }
  if (items.length > HARD_CAP) out(`  … and ${items.length - HARD_CAP} more (capped for readability; rerun and pipe to a file for the full list).`);
  out('');
}

out(`${H}Not applicable in this architecture${HEND}`);
out(bullet('Orphan translation files (check 11): N/A — translations live in a single TypeScript module; there are no per-file/per-locale JSON files to be orphaned.'));
out(bullet('Invalid JSON (check 12): N/A — no JSON translation files. Reframed as "Dictionary structural integrity" above; TypeScript compilation (tsc) already guards syntax.'));
out(bullet('Backend translations: none exist — the audit is frontend-only by design.'));
function bullet(s) { return AS_MD ? `- ${s}` : `  • ${s}`; }

out(AS_MD ? '\n---\n_Read-only audit. Nothing was modified, renamed, created, or deleted._'
          : '\nRead-only audit — nothing was modified, renamed, created, or deleted.');

// exit code: non-zero if CRITICAL/HIGH exist (useful for pre-release gating)
process.exitCode = bySeverity.CRITICAL + bySeverity.HIGH > 0 ? 1 : 0;
