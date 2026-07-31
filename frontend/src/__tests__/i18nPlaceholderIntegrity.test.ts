// @vitest-environment jsdom
/**
 * PERMANENT GUARD — i18n placeholder contract integrity.
 *
 * Two real defects motivated this suite:
 *   1. Expenses  — translation wanted {year}, caller passed { y }  (fixed earlier).
 *   2. Maintenance — a11y.maint.* wanted {code}, callers passed { equip }.
 * In both cases `t()` interpolated by NAME, found no match, and leaked the raw
 * `{code}` / `{year}` text into the UI. Nothing failed; nothing warned.
 *
 * This suite tests the CONTRACT, not rendered output:
 *   • every locale of a key requires the same placeholder set (AR ↔ EN parity)
 *   • every statically-resolvable call site supplies every required placeholder
 * Calls that cannot be resolved statically are reported, never failed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  auditCallSites,
  collectSourceFiles,
  extractDictionaries,
  findParityMismatches,
  formatMissingFindings,
  formatParityMismatches,
  placeholdersOf,
  requiredPlaceholders,
  scanFile,
  type Dictionaries,
} from './helpers/i18nPlaceholderIntegrity';
import { t } from '../lib/i18n';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, '..');
const I18N_FILE = path.join(SRC_ROOT, 'lib/i18n.ts');

const DICTS = extractDictionaries(I18N_FILE);

/** Production surface only — tests and the dictionary itself are not call sites under audit. */
const isExcluded = (p: string): boolean => {
  const n = p.replace(/\\/g, '/');
  return n.includes('/__tests__/') || n.endsWith('.test.ts') || n.endsWith('.test.tsx') || n.endsWith('/lib/i18n.ts');
};

const PRODUCTION_CALLS = collectSourceFiles(SRC_ROOT, isExcluded).flatMap((f) => scanFile(f, SRC_ROOT));
const REPORT = auditCallSites(DICTS, PRODUCTION_CALLS);

// ─── Sanity: the analyzer actually parsed something ──────────────────────────
describe('i18n integrity — analyzer sanity', () => {
  it('extracts both locale dictionaries from lib/i18n.ts', () => {
    expect(Object.keys(DICTS).sort()).toEqual(['ar', 'en']);
    expect(DICTS.ar.size).toBeGreaterThan(1000);
    expect(DICTS.en.size).toBeGreaterThan(1000);
  });

  it('resolves the overwhelming majority of production call sites statically', () => {
    expect(REPORT.staticCalls.length).toBeGreaterThan(1000);
  });

  it('every statically-resolved key exists in at least one dictionary', () => {
    const orphans = REPORT.unknownKeys.map((c) => `${c.file}:${c.line}  ${c.key}`);
    expect(orphans, `Translation keys used in code but absent from DICT:\n${orphans.join('\n')}`).toEqual([]);
  });
});

// ─── A. AR/EN placeholder parity ─────────────────────────────────────────────
describe('i18n integrity — AR/EN placeholder parity', () => {
  it('every key defined in both locales requires the same placeholder set', () => {
    const mismatches = findParityMismatches(DICTS);
    expect(
      mismatches,
      mismatches.length
        ? `AR/EN placeholder contract disagreement:\n\n${formatParityMismatches(mismatches)}`
        : '',
    ).toEqual([]);
  });

  it('compares placeholder SETS, so word order alone is not a mismatch', () => {
    const dicts: Dictionaries = {
      ar: new Map([['k', 'من {from} إلى {to}']]),
      en: new Map([['k', '{to} through {from}']]),
    };
    expect(findParityMismatches(dicts)).toEqual([]);
  });

  // B. synthetic mismatch must be detected — this is the Expenses {year}/{y} shape
  it('detects a synthetic AR/EN mismatch ({year} vs {y})', () => {
    const dicts: Dictionaries = {
      ar: new Map([['lbl.x', 'سنة {year}']]),
      en: new Map([['lbl.x', 'Year {y}']]),
    };
    const found = findParityMismatches(dicts);
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe('lbl.x');
    expect(found[0].divergence.ar).toEqual(['y']);
    expect(found[0].divergence.en).toEqual(['year']);
  });

  it('does not report a key that exists in only one locale (coverage, not integrity)', () => {
    const dicts: Dictionaries = {
      ar: new Map([['only.ar', 'قيمة {v}']]),
      en: new Map(),
    };
    expect(findParityMismatches(dicts)).toEqual([]);
  });
});

// ─── B/C. Caller ↔ translation contract ──────────────────────────────────────
describe('i18n integrity — caller supplies every required placeholder', () => {
  it('has no production call site missing a required placeholder', () => {
    expect(
      REPORT.missing,
      REPORT.missing.length
        ? `Translation placeholders that will leak literally to the UI:\n\n${formatMissingFindings(REPORT.missing)}`
        : '',
    ).toEqual([]);
  });
});

// ─── Synthetic detection tests for the guard logic itself ────────────────────
describe('i18n integrity — guard logic detection', () => {
  const dicts: Dictionaries = {
    ar: new Map([
      ['k.one', 'تفاصيل صيانة {code}'],
      ['k.range', 'عرض {from}–{to} من {total}'],
      ['k.plain', 'بدون متغيرات'],
    ]),
    en: new Map([
      ['k.one', 'Maintenance details {code}'],
      ['k.range', 'Showing {from}–{to} of {total}'],
      ['k.plain', 'No variables'],
    ]),
  };

  const auditSnippet = (code: string) => {
    const tmp = path.join(HERE, '__i18n_snippet__.tsx');
    fs.writeFileSync(tmp, code, 'utf8');
    try {
      return auditCallSites(dicts, scanFile(tmp, HERE));
    } finally {
      fs.unlinkSync(tmp);
    }
  };

  // C. wrong variable name → missing required variable
  it('detects a wrong variable name (the Maintenance {code}/{equip} shape)', () => {
    const r = auditSnippet(`const x = t('k.one', { equip: e.code });`);
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0].missing).toEqual(['code']);
    expect(r.missing[0].supplied).toEqual(['equip']);
  });

  // F. translation requires variables but caller supplies none
  it('detects a call with no interpolation object at all', () => {
    const r = auditSnippet(`const x = t('k.one');`);
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0].supplied).toBeNull();
  });

  it('detects a missing variable in the 3-argument t(key, lang, vars) signature', () => {
    const r = auditSnippet(`const x = translate('k.one', lang, { equip: v });`);
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0].missing).toEqual(['code']);
  });

  // D + E. correct multi-variable contract, supplied via ES shorthand
  it('accepts a correct multi-placeholder contract written with ES shorthand', () => {
    const r = auditSnippet(`const x = t('k.range', { from, to, total });`);
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([]);
  });

  it('accepts a correct contract mixing shorthand and explicit properties', () => {
    const r = auditSnippet(`const x = t('k.range', { from: a, to, total: n });`);
    expect(r.missing).toEqual([]);
  });

  it('accepts a placeholder-free key called with no variables', () => {
    const r = auditSnippet(`const x = t('k.plain');`);
    expect(r.missing).toEqual([]);
  });

  // Extra variables are reported, never failed (§7 of the pack).
  it('classifies an unused extra variable as extra, not missing', () => {
    const r = auditSnippet(`const x = t('k.one', { code: c, foo: 1 });`);
    expect(r.missing).toEqual([]);
    expect(r.extra).toHaveLength(1);
    expect(r.extra[0].extra).toEqual(['foo']);
  });

  // K. dynamic / unresolvable calls must never be reported as definite defects
  it('classifies a dynamic key as unresolved rather than a defect', () => {
    const r = auditSnippet(`const x = t(someKey, { code: c });`);
    expect(r.missing).toEqual([]);
    expect(r.unresolved).toHaveLength(1);
    expect(r.unresolved[0].resolution).toBe('dynamic-key');
  });

  it('classifies a template-literal key as unresolved rather than a defect', () => {
    const r = auditSnippet('const x = t(`prefix.${type}`, { code: c });');
    expect(r.missing).toEqual([]);
    expect(r.unresolved[0].resolution).toBe('dynamic-key');
  });

  it('classifies a spread interpolation object as unresolved rather than a defect', () => {
    const r = auditSnippet(`const x = t('k.one', { ...vars });`);
    expect(r.missing).toEqual([]);
    expect(r.unresolved[0].resolution).toBe('unresolved-vars');
  });

  it('does not mistake a lang argument for an interpolation object', () => {
    const r = auditSnippet(`const a = t('k.plain', 'ar'); const b = t('k.plain', lang); const c = translate('k.plain', currentLang());`);
    expect(r.missing).toEqual([]);
  });

  // L. non-i18n braces must not be treated as placeholders
  it('treats only {name} as a placeholder — braces with spaces or symbols are not', () => {
    expect([...placeholdersOf('.cls { color: red; }')]).toEqual([]);
    expect([...placeholdersOf('{ "a": 1 }')]).toEqual([]);
    expect([...placeholdersOf('use {} for an empty object')]).toEqual([]);
    expect([...placeholdersOf('{0} and {a-b}')]).toEqual([]);
    expect([...placeholdersOf('total {total} of {n}')].sort()).toEqual(['n', 'total']);
  });
});

// ─── F/G/H/I. Maintenance defect closed, in both locales ─────────────────────
describe('i18n integrity — Maintenance accessibility labels (regression)', () => {
  const MAINT_KEYS = [
    'a11y.maint.record_details',
    'a11y.maint.fuel_details',
    'a11y.maint.breakdown_details',
  ] as const;

  it.each(MAINT_KEYS)('%s requires {code} in both locales', (key) => {
    expect([...requiredPlaceholders(DICTS, key).keys()]).toEqual(['code']);
  });

  it.each(MAINT_KEYS)('%s interpolates the equipment code in ar and en', (key) => {
    for (const lang of ['ar', 'en'] as const) {
      const out = t(key, lang, { code: 'EQ-118' });
      expect(out).toContain('EQ-118');
      expect(out).not.toMatch(/\{[A-Za-z_][A-Za-z0-9_]*\}/);
    }
  });

  it('every Maintenance a11y call site now supplies { code }', () => {
    const calls = PRODUCTION_CALLS.filter((c) => c.key !== null && MAINT_KEYS.includes(c.key as (typeof MAINT_KEYS)[number]));
    expect(calls.length).toBe(3);
    for (const c of calls) expect(c.vars, `${c.file}:${c.line}`).toEqual(['code']);
  });
});

// ─── J. previously released Expenses fix stays correct ───────────────────────
describe('i18n integrity — lbl.year_prefix (previously released fix)', () => {
  it('requires {year} in both locales', () => {
    expect([...requiredPlaceholders(DICTS, 'lbl.year_prefix').keys()]).toEqual(['year']);
  });

  it('interpolates the year with no residual placeholder in ar and en', () => {
    expect(t('lbl.year_prefix', 'ar', { year: 2026 })).toBe('سنة 2026');
    expect(t('lbl.year_prefix', 'en', { year: 2026 })).toBe('Year 2026');
  });
});

// ─── M. existing correct interpolation behaviour is unchanged ────────────────
describe('i18n integrity — runtime interpolation unchanged', () => {
  it('replaces every occurrence of a placeholder', () => {
    expect(t('msg.showing_range', 'en', { from: 1, to: 10, total: 42 })).toBe('Showing 1–10 of 42');
  });

  it('leaves a key without variables untouched', () => {
    expect(t('action.save', 'en')).toBe('Save');
  });

  it('returns the key itself when it is unknown (existing fallback)', () => {
    expect(t('no.such.key.exists', 'en')).toBe('no.such.key.exists');
  });
});
