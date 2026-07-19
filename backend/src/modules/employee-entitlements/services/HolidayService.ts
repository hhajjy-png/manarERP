import { prisma } from '../../../config/database';
import { HolidayEngine } from '../engines/HolidayEngine';
import { classifyHoliday } from '../holidays/classifyHoliday';
import type { Holiday } from '../models/Holiday';

/**
 * خدمة العطل (Part 3) — قراءة العطل الرسمية المسجَّلة وتحويلها إلى النموذج العام
 * (Holiday) مع تصنيف origin/status المُشتقّ. طبقة قراءة نظيفة فوق جدول Holiday — لا
 * تكرار لمنطق إنشاء/حذف العطل المُدار حاليًا عبر backend/src/modules/holidays
 * (`/api/holidays`، غير مُعدَّل في هذه الحزمة).
 */
export class HolidayService {
  async listHolidays(range?: { from?: Date; to?: Date }): Promise<Holiday[]> {
    const rows = await prisma.holiday.findMany({
      where: range?.from || range?.to
        ? { date: { gte: range.from, lte: range.to } }
        : undefined,
      orderBy: { date: 'asc' },
    });
    return rows.map((row) => ({ ...row, ...classifyHoliday(row.date) }));
  }

  /** يبني محرّك العطل (HolidayEngine) محمَّلاً من كل العطل المسجَّلة حاليًا. */
  async loadEngine(): Promise<HolidayEngine> {
    return HolidayEngine.load();
  }
}

export const holidayService = new HolidayService();
