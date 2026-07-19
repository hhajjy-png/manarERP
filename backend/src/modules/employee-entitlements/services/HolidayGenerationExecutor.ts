import { Request } from 'express';
import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';
import { HolidayGenerationPlanner, holidayGenerationPlanner } from './HolidayGenerationPlanner';

export interface HolidayGenerationReport {
  year: number;
  createdCount: number;
  skippedCount: number;
  conflictCount: number;
}

/**
 * المنفِّذ (Part 6) — يُعيد تخطيط السنة من الخادم (لا يثق بحالة عميل قديمة) ثم يكتب
 * فقط البنود المصنَّفة NEW من نتيجة المقارنة (Part 5) — لا شيء آخر يُنشأ أو يُعدَّل أو
 * يُحذَف تلقائيًا أبدًا؛ بنود CHANGED/CONFLICT تبقى تتطلّب مراجعة/تعديل يدوي عبر
 * الإضافة/الحذف العاديين في `/api/holidays` (غير مُعدَّلين في هذه الحزمة). إعادة
 * التنفيذ آمنة (Safe Regeneration): البنود المُنشأة تصبح EXISTING في المرة القادمة
 * فلا تُنشأ مجددًا.
 */
export class HolidayGenerationExecutor {
  constructor(private readonly planner: HolidayGenerationPlanner = holidayGenerationPlanner) {}

  async execute(year: number, req: Request): Promise<HolidayGenerationReport> {
    const plan = await this.planner.plan(year);
    const toCreate = plan.comparison.entries.filter((e) => e.category === 'NEW');

    let createdCount = 0;
    for (const entry of toCreate) {
      const holiday = await prisma.holiday.create({
        data: {
          date: entry.date,
          name: entry.candidateName!,
          notes: `[${entry.origin}:${entry.status}]`,
        },
      });
      await recordAudit({
        req,
        action: 'CREATE',
        module: 'employees',
        entityId: holiday.id,
        newValue: { holiday: holiday.name, date: holiday.date, source: 'GENERATED', origin: entry.origin },
      });
      createdCount += 1;
    }

    return {
      year,
      createdCount,
      skippedCount: plan.comparison.summary.SKIPPED + plan.comparison.summary.EXISTING,
      conflictCount: plan.comparison.summary.CHANGED + plan.comparison.summary.CONFLICT,
    };
  }
}

export const holidayGenerationExecutor = new HolidayGenerationExecutor();
