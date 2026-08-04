import { z } from 'zod';

/**
 * العقد الموحّد الوحيد لحقول API من نوع DATE-ONLY (تاريخ شيك، تاريخ فاتورة، تاريخ
 * تعيين، انتهاء جواز…). يقبل حصرًا `YYYY-MM-DD` (أو أي نص ISO يبدأ به — انظر أدناه)
 * ويرفض أي صيغة غامضة يمكن أن يُساء تفسيرها.
 *
 * ── لماذا `z.coerce.date()` كانت خطرة ────────────────────────────────────────
 *
 * `z.coerce.date()` تُمرِّر القيمة مباشرةً إلى `new Date(value)`. نصّ ISO خالص من نوع
 * `YYYY-MM-DD` غير غامض إطلاقًا بنص المواصفة (ECMA-262) — يُفسَّر دائمًا كمنتصف ليل
 * **UTC**. لكن أي نص آخر (`'02/08/2026'`، `'08-02-2026'`…) يسقط في المسار البديل:
 * محرّك JS يستخدم خوارزمية تفسير **غير قياسية وتعتمد على المحرّك** (V8 يفترض عادةً
 * `MM/DD/YYYY` الأمريكي) — فـ«2 أغسطس» يتحوّل صامتًا إلى «8 فبراير»، أو يصبح
 * `Invalid Date` بصمت. هذا المدقّق لا يمنح المحرّك فرصة التخمين إطلاقًا: يتحقق من
 * الشكل القانوني أولًا، ثم من صحة التاريخ تقويميًا بحساب صريح (لا `Date` rollover)،
 * وبعدها فقط يبني `Date` من مكوّنات مُتحقَّق منها.
 *
 * ── لماذا `/^(\d{4})-(\d{2})-(\d{2})/` كبادئة لا مطابقة تامة ─────────────────
 *
 * بعض المستدعين الحاليين (المُتحقَّق منهم جميعًا في تدقيق التوافق) يرسلون
 * `new Date('YYYY-MM-DD').toISOString()` أو كائن `Date` يُسلسِله axios تلقائيًا إلى
 * JSON — كلاهما ينتج `'YYYY-MM-DDT00:00:00.000Z'` لا `'YYYY-MM-DD'` الخالصة. مطابقة
 * تامة (`^...$`) كانت سترفض هؤلاء المستدعين الشرعيين بلا داعٍ. البادئة تقبلهم لأنها
 * **نفس عقد** `dateWindows.ts`'s `DATE_ONLY_PREFIX` الموجود فعلًا في هذا الـ backend —
 * لا مدقّق جديد، بل نفس التسامح المُثبَت مسبقًا. أي شيء بعد اليوم (وقت، منطقة زمنية)
 * يُتجاهَل عمدًا: هذه حقول DATE-ONLY، فتُطبَّع دائمًا إلى منتصف ليل UTC — يطابق تمامًا
 * ما كانت تُنتجه `new Date('YYYY-MM-DD')` أصلًا للمُدخَل القانوني، فلا تغيير دلالي على
 * أي طلب صالح حاليًا؛ التشديد يستهدف فقط الصيغ الغامضة التي لم تكن لتُطابق هذه البادئة
 * إطلاقًا (`'02/08/2026'`، `'08/02/2026'`… لا تبدأ بـ `YYYY-`).
 *
 * لا تُستخدم لحقول DATETIME حقيقية (checkIn/checkOut بوقت فعلي، createdAt/updatedAt)
 * ولا لفلاتر المدى الزمني (from/to — تلك محكومة بـ `periodFilter.ts`/`dateWindows.ts`).
 */

const DATE_ONLY_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** عدد أيام الشهر التقويمي الحقيقي (28/29/30/31) — مُصدَّرة لإعادة استخدامها في تحقّقات أخرى (مثل مطابقة تاريخ المستند لشهر الحساب). */
export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

/** صحيح فقط لتاريخ تقويمي حقيقي — يرفض 2026-02-29، 2026-04-31، شهر/يوم صفر أو خارج المدى. */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

const FORMAT_MESSAGE = 'صيغة التاريخ غير صحيحة — الصيغة المطلوبة YYYY-MM-DD';
const CALENDAR_MESSAGE = 'تاريخ غير موجود في التقويم';

/**
 * حقل DATE-ONLY قانوني: `'YYYY-MM-DD'` (أو نص ISO يبدأ بها) → `Date` عند منتصف ليل
 * ذلك اليوم بتوقيت UTC. يُركَّب مع `.optional()`/`.nullable()` كأي نوع Zod آخر — هذا
 * يستبدل `z.coerce.date()` فقط، ولا يُغيّر عقد الحقل (مطلوب/اختياري/nullable).
 */
export const dateOnlySchema = z
  .string({ invalid_type_error: FORMAT_MESSAGE, required_error: FORMAT_MESSAGE })
  .trim()
  .regex(DATE_ONLY_PREFIX, FORMAT_MESSAGE)
  .refine((s) => {
    const m = DATE_ONLY_PREFIX.exec(s);
    return !!m && isRealCalendarDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }, CALENDAR_MESSAGE)
  .transform((s, ctx) => {
    const m = DATE_ONLY_PREFIX.exec(s);
    if (!m) {
      // لا يُفترَض بلوغ هذا مع اجتياز الفحصين أعلاه — حارس دفاعي فقط، لا مسار حي.
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: FORMAT_MESSAGE });
      return z.NEVER;
    }
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  });

export type DateOnlyInput = z.infer<typeof dateOnlySchema>;
