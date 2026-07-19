import type { HolidaySourceProvider, HolidayProviderResult } from './HolidaySourceProvider';
import { generateFixedHolidaysForYear } from '../fixedKuwaitHolidays';

/** مصدر العطل الميلادية الكويتية الثابتة (1 يناير، 25/26 فبراير) — Part 1.1 + Part 3. */
export class FixedHolidayProvider implements HolidaySourceProvider {
  readonly sourceName = 'FIXED_GREGORIAN';

  generateForYear(year: number): HolidayProviderResult {
    return { candidates: generateFixedHolidaysForYear(year), warnings: [] };
  }
}
