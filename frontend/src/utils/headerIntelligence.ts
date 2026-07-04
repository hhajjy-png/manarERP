// Smart Import Assistant (Phase 2A) — deterministic header intelligence.
// No AI/cloud: normalized Arabic/English text + alias dictionary + Levenshtein.
// Used client-side to suggest a system field for each uploaded Excel header, then
// (after user review) to rename row keys before /import/preview. Backend unchanged.

import { IMPORT_ENTITY_MAP } from '../config/importEntities';

export const IGNORE_FIELD = '__ignore__';
const SUGGEST_THRESHOLD = 0.72; // min similarity to offer a suggestion

export interface HeaderAnalysis {
  header: string;                 // original Excel header
  field: string | null;           // suggested/matched system field key (null = unknown)
  confidence: number;             // 0..1
  status: 'exact' | 'suggested' | 'unknown';
}

/** Normalize a header for matching: strip hints/tatweel/diacritics, unify Arabic letters, lowercase. */
export function normalizeHeader(input: string): string {
  let s = String(input ?? '').trim();
  s = s.replace(/\s*\(.*?\)\s*$/, '');            // drop trailing "(YYYY-MM-DD)" hints
  s = s.replace(/[ً-ْٰـ]/g, ''); // Arabic diacritics + tatweel
  s = s.replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '');
  s = s.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.toLowerCase();
}

// Hand-curated extra aliases per system field (normalized at build time).
const FIELD_ALIASES: Record<string, string[]> = {
  code: ['الرقم الوظيفي', 'كود الموظف', 'الكود', 'رقم', 'رمز', 'id'],
  fullName: ['اسم الموظف', 'الاسم العربي', 'الاسم بالعربي', 'الاسم', 'اسم', 'الاسم الكامل', 'name'],
  fullNameEn: ['الاسم بالانجليزي', 'اسم الموظف بالانجليزي', 'name en'],
  civilId: ['الرقم المدني', 'رقم مدني', 'البطاقة المدنية', 'civil id', 'civilid'],
  phone: ['الهاتف', 'رقم الهاتف', 'موبايل', 'جوال', 'تليفون', 'mobile', 'tel', 'phone number'],
  email: ['البريد الالكتروني', 'الايميل', 'ايميل', 'بريد', 'mail', 'e mail'],
  nationality: ['الجنسية', 'جنسيه'],
  passportNumber: ['رقم جواز السفر', 'رقم الجواز', 'passport no'],
  passportExpiry: ['تاريخ انتهاء جواز السفر', 'تاريخ انتهاء الجواز', 'انتهاء الجواز', 'passport expiry'],
  residencyExpiry: ['تاريخ انتهاء الاقامة', 'انتهاء الاقامة', 'residency expiry'],
  licenseExpiry: ['تاريخ انتهاء رخصة القيادة', 'انتهاء الرخصة', 'license expiry'],
  vehiclePlate: ['رقم لوحة المركبة', 'رقم اللوحة', 'plate'],
  plateNumber: ['رقم اللوحة', 'اللوحة', 'plate', 'plate number'],
  birthDate: ['تاريخ الميلاد', 'الميلاد', 'birth date', 'dob'],
  salary: ['الراتب الشهري', 'الراتب', 'salary'],
  hireDate: ['تاريخ التعيين', 'hire date'],
  address: ['العنوان'],
  notes: ['ملاحظات', 'notes'],
  name: ['اسم العميل', 'الاسم', 'name'],
  amount: ['المبلغ', 'القيمة', 'amount'],
  date: ['التاريخ', 'date'],
  total: ['الاجمالي', 'الإجمالي', 'المجموع', 'total'],
  unitPrice: ['سعر الوحدة', 'السعر', 'price'],
  price: ['سعر الوحدة', 'السعر', 'price'],
};

/** Build normalized-alias → field index for an entity (columns + curated aliases). */
export function buildAliasIndex(entityKey: string): Map<string, string> {
  const idx = new Map<string, string>();
  const put = (text: string, field: string) => {
    const k = normalizeHeader(text);
    if (k && !idx.has(k)) idx.set(k, field);
  };
  const cfg = IMPORT_ENTITY_MAP[entityKey];
  if (cfg) {
    for (const col of cfg.columns) {
      put(col.key, col.key);       // English key
      put(col.labelAr, col.key);   // Arabic label (hints stripped by normalizeHeader)
      for (const alias of FIELD_ALIASES[col.key] ?? []) put(alias, col.key);
    }
  }
  return idx;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
}

/** Suggest a system field for one header. */
export function suggestField(header: string, entityKey: string): HeaderAnalysis {
  const idx = buildAliasIndex(entityKey);
  const norm = normalizeHeader(header);
  if (idx.has(norm)) return { header, field: idx.get(norm)!, confidence: 1, status: 'exact' };

  let best: { field: string; score: number } | null = null;
  for (const [aliasNorm, field] of idx.entries()) {
    const score = similarity(norm, aliasNorm);
    if (!best || score > best.score) best = { field, score };
  }
  if (best && best.score >= SUGGEST_THRESHOLD) {
    return { header, field: best.field, confidence: Math.round(best.score * 100) / 100, status: 'suggested' };
  }
  return { header, field: null, confidence: 0, status: 'unknown' };
}

export function analyzeHeaders(headers: string[], entityKey: string): HeaderAnalysis[] {
  return headers.map((h) => suggestField(h, entityKey));
}

/** True when at least one header is not an exact match (i.e. the mapping step is useful). */
export function needsMapping(analysis: HeaderAnalysis[]): boolean {
  return analysis.some((a) => a.status !== 'exact');
}

/**
 * Apply a header→field mapping to raw rows: rename keys to system field keys,
 * dropping columns mapped to IGNORE_FIELD. Unmapped headers are dropped too.
 * Pure — returns new row objects.
 */
export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(row)) {
      const target = mapping[header];
      if (!target || target === IGNORE_FIELD) continue;
      out[target] = value;
    }
    return out;
  });
}
