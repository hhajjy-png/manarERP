import { Request, Response } from 'express';
import { holidaysService } from './holidays.service';
import { ok, created } from '../../core/utils/response';
import { holidayGenerationPlanner } from '../employee-entitlements/services/HolidayGenerationPlanner';
import { holidayGenerationExecutor } from '../employee-entitlements/services/HolidayGenerationExecutor';

export const holidaysController = {
  async list(_req: Request, res: Response) {
    ok(res, await holidaysService.list());
  },
  async create(req: Request, res: Response) {
    created(res, await holidaysService.create(req.body, req), 'تمت إضافة العطلة بنجاح');
  },
  async remove(req: Request, res: Response) {
    ok(res, await holidaysService.remove(Number(req.params.id), req), 'تم حذف العطلة بنجاح');
  },
  // توليد العطل (Kuwait Holiday Intelligence Pack v1) — معاينة بلا كتابة، ثم تطبيق فقط
  // بعد تأكيد صريح من المستخدم في الواجهة (Part 1). المنطق الفعلي بالكامل في نطاق
  // employee-entitlements — هذا تفويض رقيق فقط، لا تكرار منطق (Part 8).
  async previewGeneration(req: Request, res: Response) {
    ok(res, await holidayGenerationPlanner.plan(req.body.year));
  },
  async applyGeneration(req: Request, res: Response) {
    ok(res, await holidayGenerationExecutor.execute(req.body.year, req), 'تم توليد العطل بنجاح');
  },
};
