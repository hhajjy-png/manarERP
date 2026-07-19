import type { HolidaySourceProvider } from './HolidaySourceProvider';
import { FixedHolidayProvider } from './FixedHolidayProvider';
import { HijriHolidayProvider } from './HijriHolidayProvider';

export type { HolidaySourceProvider } from './HolidaySourceProvider';
export { FixedHolidayProvider } from './FixedHolidayProvider';
export { HijriHolidayProvider } from './HijriHolidayProvider';

/**
 * قائمة مزوِّدي العطل الافتراضية التي يستهلكها HolidayGenerationPlanner. إضافة مصدر
 * مستقبلي (مثل عطل خاصة بالشركة) تكون بإضافة عنصر واحد هنا فقط — بلا تعديل أي منطق
 * تخطيط/مقارنة/تعارض قائم.
 */
export const DEFAULT_HOLIDAY_PROVIDERS: readonly HolidaySourceProvider[] = [
  new FixedHolidayProvider(),
  new HijriHolidayProvider(),
];
