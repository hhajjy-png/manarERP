// Generic, business-rule-free helpers for the Smart Import Validation subsystem.
// NOTE (architectural isolation): this subsystem lives entirely under
// modules/import/warnings and must NEVER be imported by modules/bankStatementImport,
// nor import anything from it. It depends only on import.types + config/constants.

import type { ImportWarning, WarningSeverity } from '../import.types';

export const DAY_MS = 86_400_000;
export const SOON_DAYS = 90;

/** Whole days from `now` until `date` (negative ⇒ already in the past). */
export function daysUntil(date: Date, now: Date): number {
  return Math.floor((date.getTime() - now.getTime()) / DAY_MS);
}

/** Returns a valid Date or null (normalized rows already hold Date objects). */
export function asDate(v: unknown): Date | null {
  return v instanceof Date && !isNaN(v.getTime()) ? v : null;
}

/** Trimmed non-empty string, else undefined. */
export function strOf(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/**
 * Reads a field from a RAW import row, tolerating trimmed English keys and a set of
 * Arabic header aliases (raw rows may carry Arabic headers before normalization).
 */
export function rawField(raw: Record<string, unknown>, keys: string[]): string | undefined {
  const trimmed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) trimmed[k.trim()] = v;
  for (const k of keys) {
    const hit = strOf(trimmed[k]);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** Stable signature of a raw row (trimmed keys+values, order-independent) for ROW_IDENTICAL. */
export function rowSignature(raw: Record<string, unknown>): string {
  const entries = Object.entries(raw)
    .map(([k, v]) => [k.trim(), v == null ? '' : String(v).trim()] as [string, string])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(entries);
}

/** Warning factory. */
export function warn(
  code: string,
  severity: WarningSeverity,
  messageAr: string,
  messageEn: string,
  opts: { field?: string; suggestedFix?: string } = {},
): ImportWarning {
  return { code, severity, messageAr, messageEn, field: opts.field, suggestedFix: opts.suggestedFix };
}
