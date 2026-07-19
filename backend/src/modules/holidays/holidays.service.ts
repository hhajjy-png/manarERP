import { Request } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { CreateHolidayInput } from './holidays.schema';

/**
 * الحد الأدنى من البنية التحتية لإدارة العطلات الرسمية (المادة 70 — استثناء العطلات
 * الرسمية من عدّ أيام الإجازة السنوية المستهلكة). قراءة فقط من محرك الاحتساب
 * (entitlements.calc.ts عبر employees.service.ts) — لا علاقة لهذه الوحدة بأي احتساب آخر.
 */
class HolidaysService {
  async list() {
    return prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  }

  async create(input: CreateHolidayInput, req: Request) {
    const existing = await prisma.holiday.findUnique({ where: { date: input.date } });
    if (existing) throw AppError.conflict(`يوجد بالفعل عطلة مسجّلة بتاريخ ${input.date.toISOString().slice(0, 10)}`);

    const holiday = await prisma.holiday.create({
      data: { date: input.date, name: input.name, notes: input.notes ?? null },
    });
    await recordAudit({
      req,
      action: 'CREATE',
      module: 'employees',
      entityId: holiday.id,
      newValue: { holiday: holiday.name, date: holiday.date },
    });
    return holiday;
  }

  async remove(id: number, req: Request) {
    const existing = await prisma.holiday.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound('العطلة غير موجودة');

    await prisma.holiday.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: 'employees', entityId: id, oldValue: existing });
    return { deleted: true };
  }
}

export const holidaysService = new HolidaysService();
