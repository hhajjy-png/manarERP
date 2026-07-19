import type { Request } from 'express';
import { HolidayGenerationPlanner, holidayGenerationPlanner, type HolidayGenerationPlan } from '../services/HolidayGenerationPlanner';
import { HolidayGenerationExecutor, holidayGenerationExecutor, type HolidayGenerationReport } from '../services/HolidayGenerationExecutor';

export type { HolidayGenerationPlan } from '../services/HolidayGenerationPlanner';
export type { HolidayGenerationReport } from '../services/HolidayGenerationExecutor';

/**
 * @deprecated غلاف توافق فقط — استُبدل بـ HolidayGenerationPlanner/HolidayGenerationExecutor
 * (Kuwait Holiday Intelligence Pack v1، Part 6) اللذين يضيفان معاينة كاملة (New/Existing/
 * Changed/Skipped/Conflict) واكتشاف تعارض حقيقي بدل التخطيط الأولي البسيط هنا. أُبقي هذا
 * الملف كتفويض رقيق (لا تكرار منطق) بدل حذفه. استخدم الخدمتين الجديدتين مباشرةً في أي
 * كود جديد.
 */
export async function planHolidayGeneration(year: number, planner: HolidayGenerationPlanner = holidayGenerationPlanner): Promise<HolidayGenerationPlan> {
  return planner.plan(year);
}

/** @deprecated استخدم HolidayGenerationExecutor.execute مباشرةً — يتطلّب req حقيقيًا للتدقيق (recordAudit). */
export async function applyHolidayGenerationPlan(year: number, req: Request, executor: HolidayGenerationExecutor = holidayGenerationExecutor): Promise<HolidayGenerationReport> {
  return executor.execute(year, req);
}
