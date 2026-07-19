import { FIXED_KUWAIT_HOLIDAYS } from './fixedKuwaitHolidays';
import type { HolidayOrigin, HolidayStatus } from '../models/Holiday';

const NOTES_TAG_PATTERN = /^\[(FIXED_GREGORIAN|HIJRI):(OFFICIAL|EXPECTED_ALOJAIRI|MANUALLY_ADJUSTED)\]/;

/**
 * يصنّف عطلة مخزَّنة بالفعل (origin/status) وقت القراءة فقط — تصنيف عرضي مُشتقّ، وليس
 * عمودًا مخزَّنًا (لا تغيير في مخطط جدول Holiday).
 *
 * الأولوية (Al-Ojairi Integration Pack v1، Part 3): إن كانت `notes` تحمل وسمًا صريحًا
 * بصيغة `[ORIGIN:STATUS]` — وهو ما يكتبه HolidayGenerationExecutor تلقائيًا لكل عطلة
 * أُنشئت عبر توليد العطل (`services/HolidayGenerationExecutor.ts`) — يُستخدَم هذا الوسم
 * مباشرةً بلا تخمين، فتبقى عطلة هجرية مُولَّدة تلقائيًا «متوقَّعة (العجيري)»
 * EXPECTED_ALOJAIRI عند القراءة أيضًا، لا «مُعدَّلة يدويًا» فقط لأنها ليست تاريخًا ثابتًا
 * — تمامًا وفق «Official status must only be assigned manually» (لا ترقية تلقائية).
 *
 * إن لم يوجد وسم (عطل أُدخلت يدويًا قبل هذه الحزمة أو عبر `/api/holidays` مباشرةً): يُستخدَم
 * الاستدلال بالشهر/اليوم مقابل `FIXED_KUWAIT_HOLIDAYS` كما كان (Kuwait Holiday
 * Intelligence Pack v1) — لا تغيير في هذا المسار الاحتياطي.
 */
export function classifyHoliday(date: Date, notes?: string | null): { origin: HolidayOrigin; status: HolidayStatus } {
  const tagMatch = notes?.match(NOTES_TAG_PATTERN);
  if (tagMatch) {
    return { origin: tagMatch[1] as HolidayOrigin, status: tagMatch[2] as HolidayStatus };
  }

  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const isFixed = FIXED_KUWAIT_HOLIDAYS.some((h) => h.month === month && h.day === day);
  if (isFixed) return { origin: 'FIXED_GREGORIAN', status: 'OFFICIAL' };
  return { origin: 'HIJRI', status: 'MANUALLY_ADJUSTED' };
}
