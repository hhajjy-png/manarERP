import type { HolidayCandidate } from '../holidayCandidate';

/** رمز تصنيف رسالة تحقّق صادرة عن مصدر توليد عطل (Part 5). */
export type HolidayProviderWarningCode = 'UNSUPPORTED_YEAR' | 'PROVIDER_FAILURE' | 'INVALID_DATA';

export interface HolidayProviderWarning {
  code: HolidayProviderWarningCode;
  /** اسم المصدر الذي أصدر التحذير (HolidaySourceProvider.sourceName). */
  sourceName: string;
  /** رسالة عربية واضحة تُعرض في معاينة التوليد مباشرةً (Part 4 + Part 6). */
  message: string;
}

/** نتيجة توليد مصدر واحد — مرشَّحون صالحون + أي رسائل تحقّق (سنة غير مدعومة، فشل مصدر...). */
export interface HolidayProviderResult {
  candidates: HolidayCandidate[];
  warnings: HolidayProviderWarning[];
}

/**
 * واجهة موحَّدة لأي مصدر توليد عطل (Part 3) — كل مصدر (ثابت ميلادي، هجري، أو أي مصدر
 * مستقبلي) يُنفِّذ هذه الواجهة فقط. يسمح هذا بإضافة مصادر جديدة (مثل تقويم دولة أخرى،
 * أو عطل خاصة بالشركة) دون تعديل أي كود تخطيط/توليد قائم — انظر
 * engines/HolidayEngine.ts (المستهلك الوحيد لقائمة المزوِّدين — Part 7 من حزمة Al-Ojairi
 * Integration) الذي يستهلك قائمة مزوِّدين فقط، بلا معرفة تفاصيل أي مصدر بعينه.
 */
export interface HolidaySourceProvider {
  /** اسم المصدر (لأغراض العرض والتشخيص فقط). */
  readonly sourceName: string;

  /**
   * يولّد مرشَّحي عطل لسنة ميلادية معيّنة — بلا أي كتابة في قاعدة البيانات. يجب ألا يرمي
   * استثناءً أبدًا لحالات متوقَّعة (سنة غير مدعومة مثلاً) — يُعبَّر عنها بـ warnings
   * ضمن النتيجة («توليد آمن دائمًا» — Part 5)؛ استثناء غير متوقَّع يُلتقَط ويُحوَّل إلى
   * تحذير PROVIDER_FAILURE من قِبَل HolidayEngine.generateCandidates على أي حال.
   */
  generateForYear(year: number): HolidayProviderResult | Promise<HolidayProviderResult>;
}
