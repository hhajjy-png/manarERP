/**
 * محرّك الالتزام القانوني للعمل الإضافي — يفحص **الأيام** لا الإجماليات.
 *
 * ═══ ما يفعله وما لا يفعله ═══
 * دالّة خالصة واحدة (`evaluateOvertimeCompliance`) تأخذ أيام العمل الإضافي وتعيد تقييمًا
 * مُصنَّفًا. **لا Prisma، ولا تاريخ نظام، ولا حالة.** كل ما تحتاجه يُمرَّر إليها: أيام
 * الشهر، وأيام السنة كلها (لعدّادات السنة)، وأيام الأسابيع المتاخمة (لأسبوع يعبر حدّ
 * الشهر). الخدمة هي من تجلب، والمحرّك هو من يحكم — وهذا ما يجعل كل قاعدة قابلة للاختبار
 * بلا قاعدة بيانات.
 *
 * ═══ الفصل القانوني بين الأنواع — أهمّ مبدأ في هذا الملف ═══
 * حدود المادة ٦٦ (ساعتان يوميًا · ٣ أيام أسبوعيًا · ٩٠ يومًا سنويًا · ١٨٠ ساعة سنويًا)
 * تحكم **العمل الإضافي في يوم عمل عادي وحده**. العمل في الراحة الأسبوعية مادته ٦٧،
 * والعمل في العطلة الرسمية مادته ٦٨، ولكلٍّ منهما معامله واستحقاقه الخاص.
 *
 * لذلك: كل عدّادات المادة ٦٦ في هذا الملف تُرشَّح على `REGULAR` **حصرًا**. جمع الأنواع
 * الثلاثة في عدّاد واحد ثم تطبيق حدود المادة ٦٦ عليه كان سيخترع مخالفات لا وجود لها
 * قانونًا — موظف عمل ٨ ساعات في يوم راحته الأسبوعية ليس متجاوزًا «حدّ الساعتين» لأن ذلك
 * الحدّ لا يحكم يومه أصلًا.
 *
 * ═══ ثلاثة تصنيفات لا تُخلط ═══
 *   `STATUTORY`  — حدّ منصوص عليه **وأثبتته بيانات الوحدة**. يمنع الاعتماد.
 *   `DISCLOSURE` — حدّ منصوص عليه **لا تملك الوحدة بيانات لفحصه**. يُعرض ولا يمنع.
 *   `ADVISORY`   — تنبيه إداري من الشركة **لا نصّ قانوني له**. يُعرض ولا يمنع.
 *
 * ولا يتحوّل `STATUTORY` إلى تحذير لأن المستخدم يريد الحفظ: الحفظ مسموح دائمًا كمسودة،
 * والمخالفة تبقى مخالفة معروضة بتصنيفها حتى تُصحَّح. الحفظ ليس الاعتماد.
 */
import {
  OVERTIME_LIMITS,
  STANDARD_HOURS_PER_DAY,
  STANDARD_HOURS_PER_WEEK,
  WORK_WEEK_START_DAY,
  type OvertimeType,
} from '../legal/kuwaitLabourLaw';
import { normalizeHours } from './rounding';

/** أقصى ما يمكن أن يحتويه يوم تقويمي — حسابٌ لا قانون. */
const HOURS_IN_CALENDAR_DAY = 24;

/** أسماء الأشهر — تُذكر بالاسم في إفصاح الأشهر المجمّعة بدل أرقام مجرَّدة. */
const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const;

/** عتبة التنبيه المبكّر: ٨٠٪ من الحد السنوي. **إدارية بحتة، لا سند قانوني لها.** */
export const ANNUAL_EARLY_WARNING_RATIO = 0.8;

/** يوم عمل إضافي واحد كما يصل إلى المحرّك. `date` بصيغة `YYYY-MM-DD`. */
export interface OvertimeDayInput {
  date: string;
  overtimeType: OvertimeType;
  hours: number;
}

export type ComplianceBasis = 'STATUTORY' | 'DISCLOSURE' | 'ADVISORY';

export type ComplianceCode =
  | 'REGULAR_DAILY_HOURS_EXCEEDED'
  | 'REGULAR_WEEKLY_DAYS_EXCEEDED'
  | 'REGULAR_ANNUAL_HOURS_EXCEEDED'
  | 'REGULAR_ANNUAL_DAYS_EXCEEDED'
  | 'DAY_TOTAL_HOURS_IMPOSSIBLE'
  | 'DAY_TOTAL_EXCEEDS_STANDARD_DAY'
  | 'WEEKLY_TOTAL_WORKING_HOURS_UNKNOWN'
  | 'REGULAR_ANNUAL_HOURS_NEAR_LIMIT'
  | 'REGULAR_ANNUAL_DAYS_NEAR_LIMIT'
  | 'COMPENSATORY_REST_PENDING'
  /** أشهر مجمّعة بلا تواريخ تمنع التحقّق الكامل من الحدود التي تحتاج أيامًا. */
  | 'LEGACY_MONTHS_LIMIT_VERIFICATION_INCOMPLETE';

/**
 * درجة اكتمال التحقّق — **منفصلة عن `compliant`**، ولا تُخلط بها.
 *
 * `compliant` يجيب: «هل ثبتت مخالفة؟». وهذا يجيب سؤالًا آخر تمامًا: «هل كانت البيانات
 * كافية أصلًا للفحص؟». خلطهما كان يجعل سنةً نصفُها أشهرٌ مجمّعة بلا تواريخ تُعرض
 * «✓ ضمن الحدود» — وهو ادّعاءُ تحقّقٍ لم يقع، لا نتيجةَ فحص.
 *
 * `FULL`    — كل أشهر السنة تحمل تفاصيل يومية: الحدود الأربعة كلها مفحوصة.
 * `PARTIAL` — توجد أشهر مجمّعة بلا تواريخ: الساعات السنوية مفحوصة (لأنها مجموع تراكمي
 *             يعرفه السجل القديم)، أما «٩٠ يومًا سنويًا» و«٣ أيام أسبوعيًا» فلا.
 */
export type VerificationState = 'FULL' | 'PARTIAL';

/**
 * أشهرٌ محفوظة بإجماليات شهرية بلا تواريخ (ما قبل السجل اليومي).
 *
 * ساعاتها **معلومة ولا يجوز أن تختفي** من العدّاد السنوي: موظف عمل ١٧٠ ساعة إضافي
 * مسجَّلة بالطريقة القديمة ثم ٢٠ ساعة بالسجل اليومي تجاوز الحد السنوي فعلًا (١٩٠)،
 * وإسقاطُ القديم كان سيعرض ٢٠ ويسمح بالاعتماد.
 *
 * أما أيامها فغير معلومة أصلًا — ولا تُخترع. لذلك تدخل ساعاتها في عدّاد الساعات، ولا
 * تدخل في عدّاد الأيام، ويُعلَن النقص صراحةً بدل أن يُسكت عنه.
 */
export interface LegacyAggregate {
  /** مجموع ساعات الإضافي **العادي** في الأشهر المجمّعة من هذه السنة. */
  regularHours: number;
  /** أرقام تلك الأشهر (١..١٢) — تُذكر بالاسم في الإفصاح. */
  months: readonly number[];
}

export interface ComplianceFinding {
  code: ComplianceCode;
  basis: ComplianceBasis;
  /** نصّ عربي جاهز للعرض — الواجهة لا تركّب نصوص المخالفات بنفسها. */
  messageAr: string;
  /** التاريخ المعنيّ (`YYYY-MM-DD`) إن كانت المخالفة تخصّ يومًا بعينه. */
  date?: string;
  /** أول أيام الأسبوع المعنيّ إن كانت المخالفة أسبوعية. */
  weekStart?: string;
  weekEnd?: string;
  limit?: number;
  actual?: number;
  excess?: number;
}

export interface OvertimeComplianceResult {
  /** `false` عند وجود أي مخالفة `STATUTORY` — وهو وحده ما يمنع الاعتماد. */
  compliant: boolean;
  /** هل يملك هذا الشهر تفاصيل يومية أصلًا؟ `false` = سجل شهري قديم. */
  hasDailyDetail: boolean;
  /** اكتمال التحقّق عبر السنة — `PARTIAL` عند وجود أشهر مجمّعة بلا تواريخ. */
  verification: VerificationState;
  /** الأشهر المجمّعة التي منعت التحقّق الكامل (فارغة عند `FULL`). */
  legacyMonths: readonly number[];
  regular: {
    monthHours: number;
    monthDays: number;
    /** ساعات السنة = المشتقّ من الأيام **+ ساعات الأشهر المجمّعة**. */
    yearHours: number;
    /** الجزء الآتي من الأشهر المجمّعة بلا تواريخ — معروض كي لا يبدو الرقم كله مؤرَّخًا. */
    yearHoursFromLegacy: number;
    /** أيام السنة — من الأيام المؤرَّخة **وحدها**؛ ناقصة حتمًا عند `PARTIAL`. */
    yearDays: number;
    annualHoursLimit: number;
    annualDaysLimit: number;
  };
  weeklyRest: { hours: number; days: number; compensatoryPending: number };
  officialHoliday: { hours: number; days: number; compensatoryPending: number };
  /** مخالفات مؤكَّدة من بيانات الوحدة — تمنع الاعتماد. */
  violations: ComplianceFinding[];
  /** إفصاحات وتنبيهات إدارية — تُعرض ولا تمنع شيئًا. */
  warnings: ComplianceFinding[];
}

/** حالة يوم الراحة التعويضي المستحقّ (المادتان ٦٧ و٦٨). */
export const COMPENSATORY_REST_STATUSES = ['PENDING', 'SCHEDULED', 'TAKEN'] as const;
export type CompensatoryRestStatus = (typeof COMPENSATORY_REST_STATUSES)[number];

export function isCompensatoryRestStatus(v: unknown): v is CompensatoryRestStatus {
  return typeof v === 'string' && (COMPENSATORY_REST_STATUSES as readonly string[]).includes(v);
}

// ────────────────────────── أدوات التاريخ ──────────────────────────
// كلها تعمل على نصّ `YYYY-MM-DD` ولا تنشئ `Date` إلا بمكوّنات صريحة عند منتصف النهار
// بتوقيت UTC. السبب: `new Date('2026-08-03')` تُفسَّر منتصفَ ليل UTC، فتصير في الكويت
// (UTC+3) هي نفسها اليوم، لكن أي عملية محلية عليها قد تُرجع يومًا للخلف. منتصف النهار
// يترك هامش ±١٢ ساعة فلا ينزلق اليوم في أي منطقة زمنية.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** يتحقّق أن النصّ تاريخ تقويمي صالح بصيغة `YYYY-MM-DD` (يرفض ٢٠٢٦-٠٢-٣٠). */
export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, mo - 1, d, 12));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

function toUtcNoon(iso: string): Date {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new Error(`تاريخ غير صالح: ${iso}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

function addDays(iso: string, days: number): string {
  const d = toUtcNoon(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** السنة المستخرَجة من التاريخ النصّي — بلا أي تحويل منطقة زمنية. */
export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** الشهر (١..١٢) المستخرَج من التاريخ النصّي. */
export function monthOf(iso: string): number {
  return Number(iso.slice(5, 7));
}

/**
 * أول يوم في أسبوع العمل الذي يقع فيه هذا التاريخ.
 *
 * هذه الدالّة هي ما يجعل فحص «٣ أيام أسبوعيًا» صحيحًا عبر حدود الشهر: الأسبوع يُعرَّف
 * بالتقويم لا بالشهر، فيوما ٣٠/٠٨ و٠١/٠٩ يقعان في أسبوع واحد ويحملان **نفس** مفتاح
 * البداية رغم اختلاف شهرهما. لولا ذلك لأمكن تسجيل ٣ أيام آخر أغسطس و٣ أيام أول سبتمبر
 * داخل أسبوع تقويمي واحد بلا أي مخالفة — وهو تحديدًا الثغرة التي يغلقها المتطلب ٣٩.
 */
export function weekStartOf(iso: string): string {
  const d = toUtcNoon(iso);
  const shift = (d.getUTCDay() - WORK_WEEK_START_DAY + 7) % 7;
  return addDays(iso, -shift);
}

// ────────────────────────── التجميع ──────────────────────────

/** مجموع ساعات كل تاريخ لنوع بعينه. */
function hoursByDate(days: readonly OvertimeDayInput[], type: OvertimeType): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of days) {
    if (d.overtimeType !== type) continue;
    map.set(d.date, normalizeHours((map.get(d.date) ?? 0) + d.hours));
  }
  return map;
}

/** التواريخ الفريدة التي فيها ساعات > 0 من نوع بعينه. */
function activeDates(days: readonly OvertimeDayInput[], type: OvertimeType): string[] {
  const out = new Set<string>();
  for (const [date, hours] of hoursByDate(days, type)) if (hours > 0) out.add(date);
  return [...out].sort();
}

function sumHours(days: readonly OvertimeDayInput[], type: OvertimeType): number {
  return normalizeHours(
    days.filter((d) => d.overtimeType === type).reduce((s, d) => s + d.hours, 0),
  );
}

/** `DD/MM/YYYY` — صيغة العرض المعتمدة في المشروع. */
function display(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export interface OvertimeComplianceInput {
  /** أيام الشهر الجاري — محلّ التحرير. */
  monthDays: readonly OvertimeDayInput[];
  /**
   * كل أيام السنة التقويمية للموظف **عدا** الشهر الجاري (١/١ → ٣١/١٢).
   * تُستعمل لعدّادات السنة، ولإكمال الأسابيع التي تعبر حدّ الشهر.
   */
  otherDaysThisYear?: readonly OvertimeDayInput[];
  /**
   * أيام الأشهر المتاخمة الواقعة خارج السنة الجارية (ديسمبر السابق/يناير التالي).
   * لازمة **للأسابيع وحدها**: أسبوع يعبر رأس السنة يجب أن يُفحص كاملًا، بينما عدّادات
   * السنة تبقى محصورة في ١/١ → ٣١/١٢ (المتطلب ٤٠).
   */
  adjacentYearDays?: readonly OvertimeDayInput[];
  /** عدد استحقاقات الراحة التعويضية التي لم تُؤخذ بعد (تُحسب في الخدمة من الحالات). */
  compensatoryPendingWeeklyRest?: number;
  compensatoryPendingOfficialHoliday?: number;
  /**
   * الأشهر المجمّعة بلا تواريخ من السنة نفسها. غيابها يعني «كل السنة مؤرَّخة».
   * ساعاتها تدخل العدّاد السنوي، وأيامها غير معلومة فتُخفض درجة التحقّق إلى `PARTIAL`.
   */
  legacyAggregate?: LegacyAggregate;
}

/**
 * التقييم الكامل. تُستدعى عند كل حفظ وعند كل عرض، ونتيجتها هي وحدها ما يقرّر الاعتماد.
 */
export function evaluateOvertimeCompliance(input: OvertimeComplianceInput): OvertimeComplianceResult {
  const monthDays = input.monthDays;
  const otherYear = input.otherDaysThisYear ?? [];
  const adjacent = input.adjacentYearDays ?? [];

  const violations: ComplianceFinding[] = [];
  const warnings: ComplianceFinding[] = [];

  const hasDailyDetail = monthDays.length > 0;

  // ═══ عدّادات المادة ٦٦ — REGULAR وحده ═══
  const yearDays = [...monthDays, ...otherYear];
  const monthRegularHours = sumHours(monthDays, 'REGULAR');
  const monthRegularDates = activeDates(monthDays, 'REGULAR');

  // ═══ الأشهر المجمّعة: ساعاتها تُحسب، وأيامها لا تُخترع ═══
  const legacy = input.legacyAggregate;
  const legacyHours = normalizeHours(Math.max(0, legacy?.regularHours ?? 0));
  const legacyMonths = [...(legacy?.months ?? [])].sort((a, b) => a - b);
  const hasLegacy = legacyHours > 0 || legacyMonths.length > 0;

  // ساعات السنة = المؤرَّخة + المجمّعة. الحدّ السنوي للساعات يبقى **مفحوصًا فعلًا**
  // لأن السجل القديم يعرف مجموعه وإن جهل توزيعه.
  const datedRegularHours = sumHours(yearDays, 'REGULAR');
  const yearRegularHours = normalizeHours(datedRegularHours + legacyHours);

  // أيام السنة من التواريخ وحدها — ولا يُقدَّر عنها بديل.
  const yearRegularDates = activeDates(yearDays, 'REGULAR');

  const verification: VerificationState = hasLegacy ? 'PARTIAL' : 'FULL';

  const { maxHoursPerDay, maxDaysPerWeek, maxHoursPerYear, maxDaysPerYear } = OVERTIME_LIMITS;

  // ── القاعدة ١: ساعتان في اليوم (المادة ٦٦) — تُفحص على أيام الشهر الجاري وحدها،
  //    لأن أيام الأشهر الأخرى فُحصت في أشهرها ولا يصحّ أن تمنع اعتماد هذا الشهر.
  for (const [date, hours] of [...hoursByDate(monthDays, 'REGULAR')].sort()) {
    if (hours > maxHoursPerDay.value) {
      violations.push({
        code: 'REGULAR_DAILY_HOURS_EXCEEDED',
        basis: 'STATUTORY',
        date,
        limit: maxHoursPerDay.value,
        actual: hours,
        excess: normalizeHours(hours - maxHoursPerDay.value),
        messageAr:
          `${display(date)}: ${hours.toFixed(2)} ساعة عمل إضافي عادي — تجاوز الحد اليومي ` +
          `للعمل الإضافي (${maxHoursPerDay.value.toFixed(2)} ساعة، المادة ٦٦).`,
      });
    }
  }

  // ── القاعدة ٢: ٣ أيام في الأسبوع (المادة ٦٦).
  //    الأسبوع يُبنى من **كل** المصادر (الشهر + بقية السنة + الأشهر المتاخمة خارج
  //    السنة) حتى لا يُفلت تجاوزٌ لأن الأسبوع انقسم بين شهرين أو بين سنتين.
  const weekBuckets = new Map<string, Set<string>>();
  for (const date of activeDates([...yearDays, ...adjacent], 'REGULAR')) {
    const key = weekStartOf(date);
    const bucket = weekBuckets.get(key) ?? new Set<string>();
    bucket.add(date);
    weekBuckets.set(key, bucket);
  }
  // تُبلَّغ الأسابيع التي **يشارك فيها هذا الشهر** فقط: مخالفة أسبوع لا علاقة له بالشهر
  // المفتوح لا يجوز أن تمنع اعتماده — يُعالجها شهرها.
  const monthWeekKeys = new Set(monthRegularDates.map(weekStartOf));
  for (const [weekStart, dates] of [...weekBuckets].sort()) {
    if (!monthWeekKeys.has(weekStart)) continue;
    if (dates.size > maxDaysPerWeek.value) {
      const sorted = [...dates].sort();
      violations.push({
        code: 'REGULAR_WEEKLY_DAYS_EXCEEDED',
        basis: 'STATUTORY',
        weekStart,
        weekEnd: addDays(weekStart, 6),
        limit: maxDaysPerWeek.value,
        actual: dates.size,
        excess: dates.size - maxDaysPerWeek.value,
        messageAr:
          `الأسبوع ${display(weekStart)}–${display(addDays(weekStart, 6))}: ` +
          `${dates.size} أيام عمل إضافي عادي (${sorted.map(display).join('، ')}) — ` +
          `تجاوز الحد الأسبوعي (${maxDaysPerWeek.value} أيام، المادة ٦٦).`,
      });
    }
  }

  // ── القاعدة ٣: ١٨٠ ساعة سنويًا (المادة ٦٦).
  if (yearRegularHours > maxHoursPerYear.value) {
    violations.push({
      code: 'REGULAR_ANNUAL_HOURS_EXCEEDED',
      basis: 'STATUTORY',
      limit: maxHoursPerYear.value,
      actual: yearRegularHours,
      excess: normalizeHours(yearRegularHours - maxHoursPerYear.value),
      messageAr:
        `الرصيد السنوي للعمل الإضافي العادي بعد هذا الشهر: ${yearRegularHours} ساعة — ` +
        `تجاوز الحد السنوي (${maxHoursPerYear.value} ساعة، المادة ٦٦).`,
    });
  } else if (yearRegularHours >= maxHoursPerYear.value * ANNUAL_EARLY_WARNING_RATIO) {
    warnings.push({
      code: 'REGULAR_ANNUAL_HOURS_NEAR_LIMIT',
      basis: 'ADVISORY',
      limit: maxHoursPerYear.value,
      actual: yearRegularHours,
      messageAr:
        `اقترب الموظف من الحد السنوي للعمل الإضافي: ${yearRegularHours} من ` +
        `${maxHoursPerYear.value} ساعة. **تنبيه إداري داخلي لا قاعدة قانونية** — ` +
        'الحد القانوني وحده هو المذكور في المادة ٦٦.',
    });
  }

  // ── القاعدة ٤: ٩٠ يومًا سنويًا (المادة ٦٦).
  if (yearRegularDates.length > maxDaysPerYear.value) {
    violations.push({
      code: 'REGULAR_ANNUAL_DAYS_EXCEEDED',
      basis: 'STATUTORY',
      limit: maxDaysPerYear.value,
      actual: yearRegularDates.length,
      excess: yearRegularDates.length - maxDaysPerYear.value,
      messageAr:
        `عدد أيام العمل الإضافي العادي هذه السنة: ${yearRegularDates.length} يومًا — ` +
        `تجاوز الحد السنوي (${maxDaysPerYear.value} يومًا، المادة ٦٦).`,
    });
  } else if (yearRegularDates.length >= maxDaysPerYear.value * ANNUAL_EARLY_WARNING_RATIO) {
    warnings.push({
      code: 'REGULAR_ANNUAL_DAYS_NEAR_LIMIT',
      basis: 'ADVISORY',
      limit: maxDaysPerYear.value,
      actual: yearRegularDates.length,
      messageAr:
        `اقترب الموظف من الحد السنوي لأيام العمل الإضافي: ${yearRegularDates.length} من ` +
        `${maxDaysPerYear.value} يومًا. **تنبيه إداري داخلي لا قاعدة قانونية.**`,
    });
  }

  // ═══ إفصاح: الأشهر المجمّعة تمنع التحقّق الكامل ═══
  //
  // يُقال صراحةً أيُّ حدٍّ بقي مفحوصًا وأيُّه سقط، بدل «تحذير عام» يترك القارئ يخمّن:
  //   · ١٨٠ ساعة سنويًا  → **ما زال مفحوصًا** (المجموع معروف من السجل القديم).
  //   · ٩٠ يومًا سنويًا · ٣ أيام أسبوعيًا → **غير مفحوصين** (لا تواريخ).
  // ولا يُخفَّض هذا إلى «مطابق» ولا يُرفَع إلى «مخالفة»: هو نقصُ بيانات لا واقعةُ تجاوز.
  if (hasLegacy) {
    const monthsAr = legacyMonths.map((m) => ARABIC_MONTHS[m - 1] ?? String(m)).join('، ');
    warnings.push({
      code: 'LEGACY_MONTHS_LIMIT_VERIFICATION_INCOMPLETE',
      basis: 'DISCLOSURE',
      actual: legacyHours,
      messageAr:
        `التحقّق من حدود المادة ٦٦ **غير مكتمل لهذه السنة**: ` +
        `${legacyMonths.length > 0 ? `الأشهر المحفوظة بإجماليات شهرية بلا تواريخ (${monthsAr})` : 'أشهر محفوظة بإجماليات شهرية بلا تواريخ'}` +
        ` تحمل ${legacyHours} ساعة عمل إضافي عادي دخلت في العدّاد السنوي للساعات ` +
        `(${yearRegularHours} من ${maxHoursPerYear.value})، لكنها **بلا أيام معلومة** — ` +
        `فحدّ «${maxDaysPerYear.value} يومًا في السنة» وحدّ «${maxDaysPerWeek.value} أيام في الأسبوع» ` +
        `لا يمكن التحقّق منهما لتلك الفترات. الرقم المعروض لأيام السنة ` +
        `(${yearRegularDates.length}) يشمل الأشهر المؤرَّخة وحدها.`,
    });
  }

  // ═══ ساعات اليوم الواحد عبر كل الأنواع ═══
  //
  // فصل الأنواع عن عدّادات المادة ٦٦ **لا يعني أن يوم الراحة أو العطلة بلا حدّ**. لكن
  // النصّ القانوني المعتمد في هذا المستودع لا يذكر سقفًا لساعات العمل في يوم راحة
  // أسبوعية أو عطلة رسمية، ولا يحسم كيف تنطبق المادة ٦٤ (٨ ساعات يوميًا) على ذلك اليوم.
  // القرار الوزاري ١٨٨/٢٠١٠ **غير موجود في مصادر المشروع إطلاقًا**.
  //
  // فالسلوك هنا: لا يُخترع رقم. يُفصح عن الرقم القانوني القائم فعلًا (٨ ساعات، المادة
  // ٦٤) بوصفه `DISCLOSURE` لا يمنع شيئًا، ويبقى المنع محصورًا في المستحيل حسابيًا (>٢٤).
  const totalsByDate = new Map<string, number>();
  for (const d of monthDays) {
    totalsByDate.set(d.date, normalizeHours((totalsByDate.get(d.date) ?? 0) + d.hours));
  }
  for (const [date, total] of [...totalsByDate].sort()) {
    if (total > HOURS_IN_CALENDAR_DAY) {
      violations.push({
        code: 'DAY_TOTAL_HOURS_IMPOSSIBLE',
        basis: 'STATUTORY',
        date,
        limit: HOURS_IN_CALENDAR_DAY,
        actual: total,
        excess: normalizeHours(total - HOURS_IN_CALENDAR_DAY),
        messageAr:
          `${display(date)}: مجموع الساعات المسجَّلة ${total} — اليوم التقويمي لا يتّسع ` +
          `لأكثر من ${HOURS_IN_CALENDAR_DAY} ساعة. هذا خطأ إدخال لا مخالفة تشغيل.`,
      });
    } else if (total > STANDARD_HOURS_PER_DAY) {
      warnings.push({
        code: 'DAY_TOTAL_EXCEEDS_STANDARD_DAY',
        basis: 'DISCLOSURE',
        date,
        limit: STANDARD_HOURS_PER_DAY,
        actual: total,
        messageAr:
          `${display(date)}: مجموع ساعات العمل المسجَّلة في هذا اليوم ${total} ساعة، وهو ` +
          `أعلى من يوم العمل القياسي (${STANDARD_HOURS_PER_DAY} ساعات، المادة ٦٤). ` +
          'النصّ القانوني المعتمد لا يحدّد سقفًا صريحًا لساعات العمل في يوم الراحة ' +
          'الأسبوعية أو العطلة الرسمية، فلا يمنع النظام الاعتماد بسبب هذا البند — ' +
          'يُعرض للإفصاح والمراجعة التشغيلية.',
      });
    }
  }

  // ═══ إفصاح دائم: ساعات العمل الأسبوعية الكلية غير معلومة لهذه الوحدة ═══
  // المادة ٦٤ تحدّ ٤٨ ساعة أسبوعيًا لمجموع العمل، وهذه الوحدة تسجّل **الإضافي وحده**
  // ولا ترى ساعات العمل العادية إطلاقًا. الفحص مستحيل بنيويًا هنا — لا اليوم ولا بعد
  // هذه الحزمة — ويُقال ذلك صراحةً بدل أن يُفهم الصمت على أنه استيفاء.
  if (hasDailyDetail) {
    warnings.push({
      code: 'WEEKLY_TOTAL_WORKING_HOURS_UNKNOWN',
      basis: 'DISCLOSURE',
      limit: STANDARD_HOURS_PER_WEEK,
      messageAr:
        `تنصّ المادة ٦٤ على ألّا تتجاوز ساعات العمل ${STANDARD_HOURS_PER_WEEK} ساعة أسبوعيًا. ` +
        'هذه الوحدة تسجّل ساعات العمل الإضافي وحدها ولا تسجّل ساعات العمل العادية، ' +
        'فلا تستطيع احتساب مجموع ساعات الأسبوع ولا تدّعي التحقّق منه.',
    });
  }

  // ═══ المادتان ٦٧ و٦٨ — الراحة التعويضية ═══
  const weeklyRestHours = sumHours(monthDays, 'WEEKLY_REST');
  const weeklyRestDates = activeDates(monthDays, 'WEEKLY_REST');
  const holidayHours = sumHours(monthDays, 'OFFICIAL_HOLIDAY');
  const holidayDates = activeDates(monthDays, 'OFFICIAL_HOLIDAY');

  const pendingRest = input.compensatoryPendingWeeklyRest ?? weeklyRestDates.length;
  const pendingHoliday = input.compensatoryPendingOfficialHoliday ?? holidayDates.length;

  if (pendingRest > 0 || pendingHoliday > 0) {
    const parts = [
      pendingRest > 0 ? `${pendingRest} يوم راحة أسبوعية (المادة ٦٧)` : null,
      pendingHoliday > 0 ? `${pendingHoliday} عطلة رسمية (المادة ٦٨)` : null,
    ].filter(Boolean);
    warnings.push({
      code: 'COMPENSATORY_REST_PENDING',
      basis: 'STATUTORY',
      actual: pendingRest + pendingHoliday,
      messageAr:
        `يوم الراحة التعويضي: مستحقّ عن ${parts.join(' و')}. التزام **غير نقدي** ` +
        'إضافةً إلى الأجر، لا تعالجه هذه الوحدة ماليًا ولا يمنع اعتماد الشهر — ' +
        'يبقى مسجَّلًا حتى تُحدَّد حالته.',
    });
  }

  return {
    compliant: violations.length === 0,
    hasDailyDetail,
    verification,
    legacyMonths,
    regular: {
      monthHours: monthRegularHours,
      monthDays: monthRegularDates.length,
      yearHours: yearRegularHours,
      yearHoursFromLegacy: legacyHours,
      yearDays: yearRegularDates.length,
      annualHoursLimit: maxHoursPerYear.value,
      annualDaysLimit: maxDaysPerYear.value,
    },
    weeklyRest: {
      hours: weeklyRestHours,
      days: weeklyRestDates.length,
      compensatoryPending: pendingRest,
    },
    officialHoliday: {
      hours: holidayHours,
      days: holidayDates.length,
      compensatoryPending: pendingHoliday,
    },
    violations,
    warnings,
  };
}

/**
 * توزيع مبلغ السطر الشهري على أيامه — **بأكبر البواقي** كي يطابق المجموع تمامًا.
 *
 * لماذا لا يُحسب مبلغ كل يوم مستقلًا: `Σ round(hoursᵢ × rate) ≠ round(Σ hoursᵢ × rate)`.
 * جدولٌ مطبوع لا تجمع أعمدته إلى إجماليه يبدو خطأً حسابيًا في مستند رسمي. المبلغ
 * المخزَّن على `OvertimeLine` يبقى **هو المرجع**، وهذه الدالّة توزّعه فلا يتغيّر مجموعه
 * ولا يظهر فرق فلس واحد في الطباعة.
 */
export function allocateAmountAcrossDays(
  totalAmount: number,
  hoursPerDay: readonly number[],
): number[] {
  const totalHours = hoursPerDay.reduce((s, h) => s + h, 0);
  if (hoursPerDay.length === 0) return [];
  if (totalHours <= 0) return hoursPerDay.map(() => 0);

  // الفلس هو أصغر وحدة في الدينار الكويتي (ثلاث خانات عشرية).
  const totalFils = Math.round(totalAmount * 1000);
  const exact = hoursPerDay.map((h) => (h / totalHours) * totalFils);
  const floors = exact.map(Math.floor);
  let remainder = totalFils - floors.reduce((s, f) => s + f, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k += 1, remainder -= 1) {
    out[order[k].i] += 1;
  }
  return out.map((fils) => fils / 1000);
}
