import { prisma } from '../../../config/database';
import { generateFixedHolidaysForYear } from './fixedKuwaitHolidays';
import { hijriHolidayService } from '../services/HijriHolidayService';
import type { HolidayCandidate } from './holidayCandidate';

/** فرق موجود بالفعل — نفس اليوم مسجَّل مسبقًا (يُتخطَّى، لا يُنشأ من جديد). */
export interface HolidayGenerationDuplicate {
  date: Date;
  candidateName: string;
  existingName: string;
}

/** خطة توليد عطل سنة معيّنة — بلا أي كتابة في قاعدة البيانات (قراءة/تخطيط فقط). */
export interface HolidayGenerationPlan {
  year: number;
  toCreate: HolidayCandidate[];
  duplicates: HolidayGenerationDuplicate[];
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * تدفّق «توليد عطل سنة» (Part 1.3) — خطوة التخطيط: يولّد مرشَّحي العطل الثابتة (وحاليًا
 * الهجرية المتوقَّعة — تُرجع فارغة حتى تتوفر بنية هجرية حقيقية، انظر HijriHolidayService)،
 * ثم يقارنها بما هو مسجَّل بالفعل في قاعدة البيانات لتلك السنة فيتخطّى التكرارات — دالة
 * نقيّة القراءة، آمنة للاستدعاء المتكرر (إعادة توليد آمنة) لأنها لا تُنشئ شيئًا بنفسها.
 */
export async function planHolidayGeneration(year: number): Promise<HolidayGenerationPlan> {
  const candidates: HolidayCandidate[] = [
    ...generateFixedHolidaysForYear(year),
    ...hijriHolidayService.getExpectedHijriHolidays(year),
  ];

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const existing = await prisma.holiday.findMany({
    where: { date: { gte: yearStart, lt: yearEnd } },
    select: { date: true, name: true },
  });
  const existingByDay = new Map(existing.map((h) => [dayKey(h.date), h.name]));

  const toCreate: HolidayCandidate[] = [];
  const duplicates: HolidayGenerationDuplicate[] = [];

  for (const candidate of candidates) {
    const existingName = existingByDay.get(dayKey(candidate.date));
    if (existingName !== undefined) {
      duplicates.push({ date: candidate.date, candidateName: candidate.name, existingName });
    } else {
      toCreate.push(candidate);
    }
  }

  return { year, toCreate, duplicates };
}

/**
 * خطوة التطبيق: يكتب فقط بنود `plan.toCreate` (المُصفّاة بالفعل من التكرارات) في جدول
 * Holiday. تصنيف المصدر (`origin`/`status`) يُحفَظ كوسم نصّي داخل `notes` — لا تغيير في
 * مخطط الجدول (لا عمود جديد)؛ `classifyHoliday()` يُعيد اشتقاق نفس التصنيف وقت القراءة
 * لاحقًا بلا اعتماد على هذا الوسم أصلاً (توافق مزدوج). غير مربوط بأي مسار API بعد —
 * بنية تحتية جاهزة لحزمة مستقبلية تربطها بواجهة/مسار حقيقي.
 */
export async function applyHolidayGenerationPlan(plan: HolidayGenerationPlan): Promise<{ createdCount: number }> {
  if (plan.toCreate.length === 0) return { createdCount: 0 };

  for (const candidate of plan.toCreate) {
    await prisma.holiday.create({
      data: {
        date: candidate.date,
        name: candidate.name,
        notes: `[${candidate.origin}:${candidate.status}]`,
      },
    });
  }

  return { createdCount: plan.toCreate.length };
}
