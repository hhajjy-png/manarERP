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

/** 2026-07-07 — filesystem-safe, LOCAL date (never UTC). Defaults to today. */
export function formatFileDate(value?: unknown): string {
  const d = value === undefined || value === null ? new Date() : parse(value) ?? new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
