import { HolidayEngine } from '../engines/HolidayEngine';
import type { DateInterval } from '../../employees/entitlements.calc';

/**
 * خدمة أيام العمل (Part 3) — واجهة مريحة حول HolidayEngine لعدّ أيام العمل وكشف يوم
 * العمل/العطلة، لأي كود مستقبلي يحتاج هذه القدرة دون تحميل المحرّك يدويًا في كل مرة.
 */
export class WorkingDaysService {
  async countWorkingDays(interval: DateInterval): Promise<number> {
    const engine = await HolidayEngine.load();
    return engine.countWorkingDays(interval);
  }

  async isWorkingDay(date: Date): Promise<boolean> {
    const engine = await HolidayEngine.load();
    return engine.isWorkingDay(date);
  }

  async isHoliday(date: Date): Promise<boolean> {
    const engine = await HolidayEngine.load();
    return engine.isHoliday(date);
  }
}

export const workingDaysService = new WorkingDaysService();
