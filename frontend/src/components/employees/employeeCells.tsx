import { formatDate } from '../../lib/date';
import { ToneCell } from '../explorer/ToneCell';
import './employee-table.css';

/**
 * Employee Table Executive Visual Polish Pack v1.1 — presentation-only cell
 * renderers for the Employees explorer table. These read the same row fields
 * the plain columns did and change ONLY how they look: no calculations, no data
 * shape changes, no sorting/filtering impact.
 *
 * v1.1 refinement: calmer, label-free. Expiry status is communicated purely by
 * a soft tint + thin colour accent (no words, no badges); profession/nationality
 * are plain text again. Every expiry column reuses the one `ExpiryCell`, which
 * renders through the shared `ToneCell` (Equipment Table Visual Consistency
 * Pack) — the ONE tone-colour system reused by every explorer table.
 */

// ── Expiry status ──────────────────────────────────────────────────────────
export type ExpiryTone = 'green' | 'amber' | 'orange' | 'red';

const MS_PER_DAY = 86_400_000;

/**
 * Days-based status band for an expiry date — presentation only.
 *   green  → more than 90 days remaining
 *   amber  → 31–90 days
 *   orange → 0–30 days
 *   red    → already expired
 * Returns `null` when there is no valid date, so the cell shows a plain «—»
 * with no tint and no accent.
 *
 * Comparison is done on local calendar days (Y/M/D), matching the app's date
 * convention, so a document expiring "today" never flips a day on the UTC+3
 * boundary.
 */
export function expiryTone(value: unknown): ExpiryTone | null {
  if (value === null || value === undefined || value === '') return null;
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);

  if (days < 0) return 'red';
  if (days <= 30) return 'orange';
  if (days <= 90) return 'amber';
  return 'green';
}

/**
 * Expiry date with a soft cell tint + thin colour accent conveying status
 * silently — no label, no badge, no icon. The date is the only text.
 */
export function ExpiryCell({ value }: { value: unknown }) {
  return <ToneCell tone={expiryTone(value)}>{formatDate(value)}</ToneCell>;
}

// ── Name / plain-text cell — single line, ellipsis, tooltip ────────────────
/**
 * Single-line, ellipsised text with a full-value tooltip. Used for the Arabic
 * name (strong), the English name (LTR, secondary), and profession (plain).
 */
export function NameCell({ value, lang, strong }: { value: unknown; lang: 'ar' | 'en'; strong?: boolean }) {
  const text = typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
  const cls = `emp-name${strong ? ' emp-name--strong' : ''}${lang === 'en' ? ' emp-name--en' : ''}`;
  return (
    <span className={cls} dir={lang === 'en' ? 'ltr' : 'rtl'} title={text || undefined}>
      {text || '—'}
    </span>
  );
}
