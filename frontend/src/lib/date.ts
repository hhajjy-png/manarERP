const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function parse(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d;
}

/** 15/06/2026 */
export function formatDate(value: unknown): string {
  const d = parse(value);
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** 15/06/2026 14:35 */
export function formatDateTime(value: unknown): string {
  const d = parse(value);
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}`;
}

/** 15/06/2026 14:35:22 */
export function formatDateTimeWithSeconds(value: unknown): string {
  const d = parse(value);
  if (!d) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${min}:${sec}`;
}

/** مايو 2026 */
export function formatMonthYear(month: number, year: number): string {
  return `${ARABIC_MONTHS[month - 1] ?? ''} ${year}`;
}

/**
 * محوّل وسم شهر رسم بياني بصيغة YYYY-MM إلى عربي — عرض فقط، لا يغيّر البيانات.
 * يعيد القيمة كما هي إن لم تطابق YYYY-MM (آمن لأي وسم مُنسّق مسبقًا).
 */
function formatMonth(value: unknown, withYear: boolean): string {
  if (typeof value !== 'string') return value == null ? '' : String(value);
  const m = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return value;
  return withYear ? formatMonthYear(month, Number(m[1])) : ARABIC_MONTHS[month - 1];
}

/** وسم شهر رسم بياني: '2026-01' → 'يناير 2026' (للتلميحات). */
export const formatMonthLabel = (value: unknown): string => formatMonth(value, true);

/**
 * اسم الشهر فقط لمحور الرسم: '2026-01' → 'يناير' (نافذة YTD ضمن سنة واحدة،
 * فحذف السنة المكرّرة يقلّل الازدحام).
 */
export const formatMonthShort = (value: unknown): string => formatMonth(value, false);

/**
 * A date-only value (`'2026-01-31'`) → `31/01/2026`, **without ever constructing a
 * `Date`**. `new Date('2026-01-31')` parses as UTC midnight, which in Kuwait
 * (UTC+03:00) is still the 31st — but the same trick applied to a `Date` built from
 * local parts can slip a day, and this has bitten the project before. So the string
 * is re-ordered, not re-interpreted: no timezone is involved at all.
 *
 * Anything that is not a `YYYY-MM-DD` string falls back to the general `formatDate`
 * (which handles real timestamps), and an empty value yields `—`.
 */
export function formatDisplayDate(value: unknown): string {
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return formatDate(value);
}

/**
 * A report period → `من 01/01/2026 إلى 31/01/2026` (Arabic) or
 * `From 01/01/2026 to 31/01/2026` (English). Date-only strings stay string-safe
 * (see `formatDisplayDate`). A missing bound renders `—` rather than silently
 * dropping the word, so a half-open period never reads as a closed one.
 */
export function formatDateRange(from: unknown, to: unknown, lang: 'ar' | 'en' = 'ar'): string {
  const a = formatDisplayDate(from);
  const b = formatDisplayDate(to);
  return lang === 'en' ? `From ${a} to ${b}` : `من ${a} إلى ${b}`;
}

/** 2026-07-07 — filesystem-safe, LOCAL date (never UTC). Defaults to today. */
export function formatFileDate(value?: unknown): string {
  const d = value === undefined || value === null ? new Date() : parse(value) ?? new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * A Date's LOCAL calendar date as 'YYYY-MM-DD'. Uses local getters
 * (getFullYear/getMonth/getDate) — NEVER `toISOString()` — so a date-only business
 * date can't slip a day in Kuwait (UTC+03:00). Invalid Date → ''.
 */
export function toLocalDateOnly(date: Date): string {
  if (isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Today's LOCAL calendar date as 'YYYY-MM-DD' — the correct default for a new
 * business document's date field. Accepts an optional `now` for deterministic tests.
 * Replaces the unsafe `new Date().toISOString().slice(0, 10)` (which returns the UTC
 * day and can render "yesterday" shortly after local midnight in UTC+3).
 */
export function todayDateOnly(now: Date = new Date()): string {
  return toLocalDateOnly(now);
}
