/**
 * نوافذ زمنية موحّدة لرسوم لوحة التحكم الشهرية.
 *
 * الغرض: منع اختفاء يناير في الرسوم. كانت الرسوم تستخدم نافذة متحركة بطول 6 أشهر
 * مثبّتة على الشهر الحالي (في يوليو ⇒ فبراير…يوليو)، فتسقط يناير. البديل الموحّد هو
 * نافذة «منذ بداية السنة حتى الشهر الحالي» (Year-To-Date): يناير من السنة الحالية حتى
 * الشهر الحالي (شاملًا). لا تُخصَّص يناير بأي حالة خاصة — القاعدة عامة لكل الأشهر.
 */

export interface MonthWindow {
  /** وسم الشهر بصيغة YYYY-MM (مطابق لما تعرضه محاور الرسوم). */
  label: string;
  /** بداية الشهر — 00:00:00.000 محليًا. */
  start: Date;
  /** نهاية الشهر — اليوم الأخير 23:59:59.999 محليًا. */
  end: Date;
}

/**
 * يُرجع نافذة YTD: شهرًا لكل شهر من يناير السنة الحالية حتى شهر `now` (شاملًا).
 * يناير (getMonth()===0) ⇒ شهر واحد؛ الشهر الحالي مُضمَّن دائمًا.
 */
export function ytdMonths(now: Date = new Date()): MonthWindow[] {
  const year = now.getFullYear();
  const count = now.getMonth() + 1; // عدد الأشهر من يناير حتى الشهر الحالي شاملًا
  return Array.from({ length: count }, (_, i) => ({
    label: `${year}-${String(i + 1).padStart(2, '0')}`,
    start: new Date(year, i, 1),
    end: new Date(year, i + 1, 0, 23, 59, 59, 999),
  }));
}

/**
 * يُرجع نافذة شهرية لكل شهر بين `start` و`end` (شاملة الطرفين)، بصرف النظر عن السنة.
 * تعميم لـ {@link ytdMonths} يقبل مدى تاريخ عشوائي بدل تثبيته على السنة الحالية.
 */
export function monthWindowsBetween(start: Date, end: Date): MonthWindow[] {
  const windows: MonthWindow[] = [];
  let year = start.getFullYear();
  let month = start.getMonth();
  const endYear = end.getFullYear();
  const endMonth = end.getMonth();
  while (year < endYear || (year === endYear && month <= endMonth)) {
    windows.push({
      label: `${year}-${String(month + 1).padStart(2, '0')}`,
      start: new Date(year, month, 1),
      end: new Date(year, month + 1, 0, 23, 59, 59, 999),
    });
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return windows;
}

/**
 * يقصّ نوافذ الأشهر على مدى فعلي، فلا تمتدّ نافذة الشهر خارج النطاق المطلوب.
 *
 * `monthWindowsBetween` تُنتج أشهرًا **كاملة** دائمًا (من اليوم الأول إلى الأخير)، وهو
 * الصحيح للوحات YTD. لكن تقريرًا يعرض في عنوانه «15/08 إلى 31/08» ثم يحسب أغسطس كاملًا
 * يضمّ بيانات ما قبل تاريخ البداية المعروض. القصّ يُبقي صفًّا لكل شهر — فيبقى التقرير
 * شهريًا كما هو — لكن كل صف يقتصر على ما يقع داخل النطاق المختار فعلًا.
 *
 * النوافذ الواقعة خارج المدى كليًا تُحذف.
 */
export function clampMonthWindows(windows: MonthWindow[], start: Date, end: Date): MonthWindow[] {
  return windows
    .filter((w) => w.end >= start && w.start <= end)
    .map((w) => ({
      label: w.label,
      start: w.start < start ? start : w.start,
      end:   w.end   > end   ? end   : w.end,
    }));
}

/**
 * نهاية اليوم محليًا (23:59:59.999).
 *
 * ضروري لتقارير «كما في تاريخ»: `asOfDate` يصل كـ `2024-12-31` أي منتصف الليل،
 * فمقارنة `lte` كانت ستُسقط كل ما جرى خلال 31/12 نفسه.
 */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * `YYYY-MM-DD` من مكوّنات التاريخ **المحلية**.
 *
 * لا تستخدم `toISOString().slice(0,10)` لعرض تاريخ محلي: التوقيت المحلي للكويت
 * هو UTC+03:00، فمنتصف ليل 15/12/2024 محليًا يصبح `2024-12-14` بتوقيت UTC.
 * الفرق يوم كامل في رسائل الأخطاء وسجل التدقيق وأسماء الملفات.
 */
export function toLocalDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// ─── حدود اليوم المحلي من نص `YYYY-MM-DD` ─────────────────────────────────────
//
// العقد الوحيد لفلترة المدى الزمني في كل الـ backend.
//
// لماذا لا `new Date('2026-08-01')`؟ لأن المواصفة تُلزم تفسير النص **المجرَّد من
// الوقت** كمنتصف ليل **UTC**، لا محليًا. النتيجة عيبان متكاملان:
//
//   • الحدّ الأدنى (`gte`): في الكويت (UTC+03:00) يصبح 03:00 صباحًا محليًا، فتختفي
//     كل حركة سُجِّلت بين 00:00 و03:00 من أول يوم في المدى.
//   • الحدّ الأعلى (`lte`): حتى مع `endOfDay`، النتيجة صحيحة صدفةً في الإزاحات
//     الموجبة فقط. في نيويورك (UTC-04:00) يصبح `new Date('2026-08-31')` مساءَ
//     **30** أغسطس محليًا، فيقفل `endOfDay` على اليوم الخطأ ويسقط 31 أغسطس كاملًا.
//
// لذلك تُبنى الحدود هنا من **مكوّنات التقويم المحلي صراحةً** (`new Date(y, m, d, …)`)
// فلا يبقى أي اعتماد على تفسير المحرّك لنص ISO. النتيجة صحيحة في أي منطقة زمنية.

/** يقبل `YYYY-MM-DD` أو أي نص ISO يبدأ به (يُتجاهل ما بعد اليوم). */
const DATE_ONLY_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * يبني تاريخًا محليًا من مكوّنات ويرفض ما ليس تاريخًا تقويميًا حقيقيًا.
 * `new Date(2026, 1, 31)` يتدحرج بصمت إلى 3 مارس — نكشفه بمقارنة المكوّنات.
 */
function buildLocal(
  y: number, m: number, d: number,
  h: number, min: number, s: number, ms: number,
): Date | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const dt = new Date(y, m - 1, d, h, min, s, ms);
  if (Number.isNaN(dt.getTime())) return undefined;
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return undefined;
  return dt;
}

/**
 * `'2026-08-01'` → **أول لحظة** في 1 أغسطس 2026 بالتوقيت المحلي (00:00:00.000).
 *
 * أي نص لا يبدأ بـ`YYYY-MM-DD` صالح (فارغ/مشوَّه/تاريخ غير موجود) يُعيد `undefined`
 * فيُعامَل كحدّ غائب — وهو نفس تسامح `resolvePeriod` السابق مع `Invalid Date`،
 * ويبقى الفشل «مدى أوسع» لا «استعلام ينهار».
 */
export function startOfLocalDay(dateStr?: string | null): Date | undefined {
  if (!dateStr) return undefined;
  const m = DATE_ONLY_PREFIX.exec(String(dateStr).trim());
  if (!m) return undefined;
  return buildLocal(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, 0, 0);
}

/**
 * `'2026-08-31'` → **آخر لحظة** في 31 أغسطس 2026 بالتوقيت المحلي (23:59:59.999).
 * الطرف شامل دائمًا: سجلّ عند 23:59:59.999 يقع داخل المدى.
 */
export function endOfLocalDay(dateStr?: string | null): Date | undefined {
  if (!dateStr) return undefined;
  const m = DATE_ONLY_PREFIX.exec(String(dateStr).trim());
  if (!m) return undefined;
  return buildLocal(Number(m[1]), Number(m[2]), Number(m[3]), 23, 59, 59, 999);
}

/** فلتر Prisma لمدى تقويمي محلي شامل الطرفين، أو `undefined` عند غياب الحدّين. */
export interface LocalDateRange {
  gte?: Date;
  lte?: Date;
}

/**
 * `from`/`to` بصيغة `YYYY-MM-DD` → فلتر `{ gte, lte }` على المدى التقويمي المحلي
 * الكامل، شامل اليوم الأخير.
 *
 * يدعم الحدّ الواحد (`from` فقط أو `to` فقط) كما كانت كل النقاط تفعل.
 * غياب الحدّين معًا → `undefined` فيبقى الاستعلام بلا قيد زمني (كل الفترات).
 */
export function localDateRange(from?: string | null, to?: string | null): LocalDateRange | undefined {
  const gte = startOfLocalDay(from);
  const lte = endOfLocalDay(to);
  if (!gte && !lte) return undefined;
  const range: LocalDateRange = {};
  if (gte) range.gte = gte;
  if (lte) range.lte = lte;
  return range;
}
