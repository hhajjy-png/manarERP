/**
 * Date DISPLAY formatting (backend) — labels only, never values.
 *
 * The user-facing standard is `DD/MM/YYYY`; ISO (`2026-01-31`) is an internal wire
 * format and must not reach a report title, subtitle or cell.
 *
 * NOTE: kept in sync (by behaviour) with `frontend/src/lib/date.ts`. The two TS
 * projects build independently, so the helpers are intentionally mirrored — exactly
 * as `currencyConfig` / `currency.ts` already are.
 *
 * This module formats. It never parses a business date into a value, never rounds,
 * and is never used in a query, a comparison or a stored field.
 */

/**
 * A date-only value (`'2026-01-31'`) → `31/01/2026`, **without constructing a
 * `Date`**: the string is re-ordered, not re-interpreted, so no timezone can shift
 * the day. A real timestamp (or a `Date`) is formatted from its LOCAL parts — never
 * `toISOString()`, which would report the UTC day and can read as "yesterday"
 * shortly after local midnight in Kuwait (UTC+03:00).
 *
 * Empty / unparsable → `—`.
 */
export function formatDisplayDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';

  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }

  const d = value instanceof Date ? value : new Date(value as string);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** `31/01/2026 14:35` — 24-hour, local, Western digits. */
export function formatDisplayDateTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const d = value instanceof Date ? value : new Date(value as string);
  if (isNaN(d.getTime())) return '—';
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${formatDisplayDate(d)} ${hh}:${min}`;
}

/**
 * A report period → `من 01/01/2026 إلى 31/01/2026`. A missing bound renders `—`
 * rather than dropping the word, so a half-open period never reads as a closed one.
 */
export function formatDateRange(from: unknown, to: unknown): string {
  return `من ${formatDisplayDate(from)} إلى ${formatDisplayDate(to)}`;
}
