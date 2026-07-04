// Import quality score + analytics (Smart Import Assistant Phase 2).
// Pure, informational functions over preview RowResults. No side effects, no DB.

import type { ImportAnalytics, ImportAnalyticsEntry, RowResult } from '../import.types';

// Deduction weights (max points removed at 100% affected). Invalid hurts most.
const W_INVALID = 60;
const W_DUPLICATE = 25;
const W_WARNING = 15;

/**
 * Informational file-quality score 0–100. Starts at 100 and deducts proportionally
 * to the fraction of invalid / duplicate / warning rows. Never blocks import.
 */
export function computeQualityScore(
  totalRows: number,
  invalidRows: number,
  duplicateRows: number,
  warningRows: number,
): number {
  if (totalRows <= 0) return 100;
  const invalidPct = invalidRows / totalRows;
  const dupPct = duplicateRows / totalRows;
  const warnPct = warningRows / totalRows;
  const score = 100 - (invalidPct * W_INVALID + dupPct * W_DUPLICATE + warnPct * W_WARNING);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function topEntries(counts: Map<string, number>, limit = 5): ImportAnalyticsEntry[] {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
    .slice(0, limit);
}

/** Aggregates warning codes, error reasons, and most-affected fields for the preview. */
export function buildAnalytics(rows: RowResult[]): ImportAnalytics {
  const warnCodes = new Map<string, number>();
  const errReasons = new Map<string, number>();
  const fields = new Map<string, number>();

  for (const r of rows) {
    if (r.status === 'invalid') {
      for (const e of r.errors ?? []) errReasons.set(e, (errReasons.get(e) ?? 0) + 1);
    }
    for (const w of r.warnings ?? []) {
      warnCodes.set(w.code, (warnCodes.get(w.code) ?? 0) + 1);
      if (w.field) fields.set(w.field, (fields.get(w.field) ?? 0) + 1);
    }
  }

  return {
    topWarningCodes: topEntries(warnCodes),
    topErrorReasons: topEntries(errReasons),
    topAffectedFields: topEntries(fields),
  };
}
