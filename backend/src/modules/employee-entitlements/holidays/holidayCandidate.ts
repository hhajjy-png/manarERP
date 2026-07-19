import type { HolidayOrigin, HolidayStatus } from '../models/Holiday';

/**
 * مرشَّح عطلة قبل إنشائه في قاعدة البيانات — الشكل الموحَّد الذي تُنتجه كل مصادر توليد
 * العطل (الثابتة الميلادية، الهجرية المتوقَّعة) قبل تسويتها في خطة توليد واحدة
 * (holidays/generateHolidaysWorkflow.ts).
 */
export interface HolidayCandidate {
  date: Date;
  name: string;
  origin: HolidayOrigin;
  status: HolidayStatus;
}
