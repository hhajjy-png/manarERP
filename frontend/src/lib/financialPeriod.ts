import { formatFileDate } from './date';

/**
 * نموذج الفترة المالية — طبقة خفيفة في الواجهة فقط. لا Prisma ولا Migration.
 *
 * كل التواريخ تُمثَّل بصيغة `YYYY-MM-DD` **محلية** (لا UTC): نفس ما يتوقّعه
 * `<input type="date">` وما يرسله الـ backend. توليد السلسلة يمرّ دائمًا عبر
 * `formatFileDate` الذي يستخدم توابع محلية (getFullYear/getMonth/getDate)، تفاديًا
 * لانزلاق يوم في توقيت الكويت (UTC+03:00) الذي يسبّبه `toISOString().slice(0,10)`.
 */

export type FinancialPeriodPreset =
  | 'current-year'
  | 'previous-year'
  | 'current-month'
  | 'previous-month'
  | 'year-to-date'
  | 'year'      // سنة محددة (selectedYear)
  | 'custom'    // نطاق مخصص (fromDate/toDate)
  | 'all';      // كل الفترات — لا حدود

export interface FinancialPeriod {
  preset: FinancialPeriodPreset;
  /** بداية النطاق (شاملة) — غائبة لـ 'all'. */
  fromDate?: string;
  /** نهاية النطاق (شاملة) — غائبة لـ 'all'. */
  toDate?: string;
  /** تاريخ مرجعي للتقارير اللحظية (Trial Balance/Aging) = نهاية النطاق. غائب لـ 'all'. */
  asOfDate?: string;
  /** السنة المختارة عند preset='year'. */
  selectedYear?: number;
  /** وسم عربي جاهز للعرض. */
  label: string;
  /** هل الفترة تخصّ سنة سابقة بالكامل؟ (لتلوين تحذيري خفيف). */
  isHistorical: boolean;
  /** هل الفترة = كل الفترات؟ (لتمييز بصري صريح). */
  isAllPeriods: boolean;
}

// ─── أدوات تاريخ محلية ────────────────────────────────────────────────────────

/** أول لحظة في اليوم محليًا (كائن Date). */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** `YYYY-MM-DD` من مكوّنات محلية — نفس منطق formatFileDate. */
export function toLocalDateString(d: Date): string {
  return formatFileDate(d);
}

/** أول يوم في الشهر (0-based month). */
function firstOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

/** آخر يوم في الشهر (0-based month) — اليوم صفر من الشهر التالي. */
function lastOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

/** `DD/MM/YYYY` من `YYYY-MM-DD` — للعرض في الوسوم. */
export function displayDate(iso?: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// ─── بناء الفترة ─────────────────────────────────────────────────────────────

const PRESET_LABELS: Record<Exclude<FinancialPeriodPreset, 'year' | 'custom' | 'all'>, string> = {
  'current-year':   'السنة الحالية',
  'previous-year':  'السنة السابقة',
  'current-month':  'الشهر الحالي',
  'previous-month': 'الشهر السابق',
  'year-to-date':   'السنة حتى اليوم',
};

function buildLabel(preset: FinancialPeriodPreset, from?: string, to?: string, year?: number): string {
  if (preset === 'all') return 'كل الفترات';
  if (preset === 'year' && year) return `السنة المالية: ${year}`;
  if (from && to) {
    // فترة داخل سنة واحدة تُختصر؛ غير ذلك تُعرض بالكامل.
    return `الفترة المعروضة: ${displayDate(from)} – ${displayDate(to)}`;
  }
  return PRESET_LABELS[preset as keyof typeof PRESET_LABELS] ?? 'الفترة المعروضة';
}

/** Reuses the same i18n keys as `PeriodControl.tsx`'s PRESETS list — the Arabic text is identical. */
const PRESET_LABEL_KEYS: Record<Exclude<FinancialPeriodPreset, 'year' | 'custom' | 'all'>, string> = {
  'current-year':   'fc.period.current_year',
  'previous-year':  'fc.period.previous_year',
  'current-month':  'fc.period.current_month',
  'previous-month': 'fc.period.previous_month',
  'year-to-date':   'fc.period.year_to_date',
};

/**
 * Language-aware equivalent of `buildLabel()`, for callers that display
 * `FinancialPeriod.label` in the UI. `FinancialPeriod.label` itself stays
 * Arabic-only (backward-compatible for existing tests/consumers) — callers
 * that need the active UI language should call this with their `t()` instead
 * of reading `.label` directly.
 */
export function buildLocalizedPeriodLabel(
  period: Pick<FinancialPeriod, 'preset' | 'fromDate' | 'toDate' | 'selectedYear'>,
  t: (key: string, vars?: Record<string, string | number>) => string,
  /** When true, the range case returns the bare "{from} – {to}" without a "Period:" prefix — for embedding inline in a sentence (e.g. "No expenses in {period}."), mirroring the Arabic original's `.replace('الفترة المعروضة: ', 'الفترة ')` shortening. */
  short = false,
): string {
  if (period.preset === 'all') return t('fc.period.all');
  if (period.preset === 'year' && period.selectedYear) {
    return t('fc.period.label_year', { year: period.selectedYear });
  }
  if (period.fromDate && period.toDate) {
    const from = displayDate(period.fromDate), to = displayDate(period.toDate);
    return short ? t('fc.period.range_bare', { from, to }) : t('fc.period.label_range', { from, to });
  }
  const key = PRESET_LABEL_KEYS[period.preset as keyof typeof PRESET_LABEL_KEYS];
  return key ? t(key) : t('fc.period.label_generic');
}

/**
 * يحسب حدود الفترة من preset (وسنة/نطاق مخصص عند اللزوم).
 *
 * `now` قابل للحقن للاختبارات — لا يُستدعى `new Date()` داخليًا إلا كافتراضي.
 * `asOfDate` = نهاية النطاق دائمًا (التقارير اللحظية تنظر «كما في» آخر يوم).
 */
export function computePeriod(
  input: {
    preset: FinancialPeriodPreset;
    selectedYear?: number;
    fromDate?: string;
    toDate?: string;
  },
  now: Date = new Date(),
): FinancialPeriod {
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  let from: string | undefined;
  let to: string | undefined;
  let selectedYear: number | undefined;

  switch (input.preset) {
    case 'current-year':
      from = toLocalDateString(firstOfMonth(curYear, 0));
      to = toLocalDateString(lastOfMonth(curYear, 11));
      break;
    case 'previous-year':
      from = toLocalDateString(firstOfMonth(curYear - 1, 0));
      to = toLocalDateString(lastOfMonth(curYear - 1, 11));
      break;
    case 'current-month':
      from = toLocalDateString(firstOfMonth(curYear, curMonth));
      to = toLocalDateString(lastOfMonth(curYear, curMonth));
      break;
    case 'previous-month': {
      // يناير → ديسمبر السنة السابقة.
      const py = curMonth === 0 ? curYear - 1 : curYear;
      const pm = curMonth === 0 ? 11 : curMonth - 1;
      from = toLocalDateString(firstOfMonth(py, pm));
      to = toLocalDateString(lastOfMonth(py, pm));
      break;
    }
    case 'year-to-date':
      from = toLocalDateString(firstOfMonth(curYear, 0));
      to = toLocalDateString(startOfLocalDay(now));
      break;
    case 'year': {
      const y = input.selectedYear ?? curYear;
      selectedYear = y;
      from = toLocalDateString(firstOfMonth(y, 0));
      to = toLocalDateString(lastOfMonth(y, 11));
      break;
    }
    case 'custom':
      from = input.fromDate;
      to = input.toDate;
      break;
    case 'all':
      from = undefined;
      to = undefined;
      break;
  }

  const isAllPeriods = input.preset === 'all';
  const asOfDate = to;
  // سنة سابقة بالكامل: نهاية النطاق قبل السنة الحالية.
  const toYear = to ? Number(to.slice(0, 4)) : curYear;
  const isHistorical = !isAllPeriods && toYear < curYear;

  return {
    preset: input.preset,
    fromDate: from,
    toDate: to,
    asOfDate,
    selectedYear,
    label: buildLabel(input.preset, from, to, selectedYear),
    isHistorical,
    isAllPeriods,
  };
}

/** الفترة الافتراضية عند تشغيل التطبيق: 01/01/السنة الحالية → اليوم. ليست All Periods. */
export function defaultPeriod(now: Date = new Date()): FinancialPeriod {
  return computePeriod({ preset: 'year-to-date' }, now);
}

/**
 * ترجمة الفترة إلى معاملات backend حسب عائلة نقطة النهاية.
 * عائلة Financial تستخدم fromDate/toDate/asOfDate؛ Reports/Expenses تستخدم from/to.
 * عند 'all' تُحذف كل الحدود فيعمل الاستعلام على كل الفترات صراحةً.
 */
export function periodToRangeParams(p: FinancialPeriod): { fromDate?: string; toDate?: string; asOfDate?: string } {
  if (p.isAllPeriods) return {};
  return { fromDate: p.fromDate, toDate: p.toDate, asOfDate: p.asOfDate };
}

export function periodToReportParams(p: FinancialPeriod): { from?: string; to?: string } {
  if (p.isAllPeriods) return {};
  return { from: p.fromDate, to: p.toDate };
}
