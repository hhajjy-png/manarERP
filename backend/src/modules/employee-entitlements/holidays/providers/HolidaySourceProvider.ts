import type { HolidayCandidate } from '../holidayCandidate';

/**
 * واجهة موحَّدة لأي مصدر توليد عطل (Part 3) — كل مصدر (ثابت ميلادي، هجري، أو أي مصدر
 * مستقبلي) يُنفِّذ هذه الواجهة فقط. يسمح هذا بإضافة مصادر جديدة (مثل تقويم دولة أخرى،
 * أو عطل خاصة بالشركة) دون تعديل أي كود تخطيط/توليد قائم — انظر
 * services/HolidayGenerationPlanner.ts الذي يستهلك قائمة مزوِّدين فقط، بلا معرفة
 * تفاصيل أي مصدر بعينه.
 */
export interface HolidaySourceProvider {
  /** اسم المصدر (لأغراض العرض والتشخيص فقط). */
  readonly sourceName: string;

  /** يولّد مرشَّحي عطل لسنة ميلادية معيّنة — بلا أي كتابة في قاعدة البيانات. */
  generateForYear(year: number): HolidayCandidate[] | Promise<HolidayCandidate[]>;
}
