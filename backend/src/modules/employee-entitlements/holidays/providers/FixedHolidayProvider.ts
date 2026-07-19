import type { HolidaySourceProvider } from './HolidaySourceProvider';
import type { HolidayCandidate } from '../holidayCandidate';
import { generateFixedHolidaysForYear } from '../fixedKuwaitHolidays';

/** مصدر العطل الميلادية الكويتية الثابتة (1 يناير، 25/26 فبراير) — Part 1.1 + Part 3. */
export class FixedHolidayProvider implements HolidaySourceProvider {
  readonly sourceName = 'FIXED_GREGORIAN';

  generateForYear(year: number): HolidayCandidate[] {
    return generateFixedHolidaysForYear(year);
  }
}
