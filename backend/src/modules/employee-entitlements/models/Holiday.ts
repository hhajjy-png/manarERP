/** مصدر توليد العطلة — عطلة ميلادية ثابتة أم عطلة هجرية. */
export type HolidayOrigin = 'FIXED_GREGORIAN' | 'HIJRI';

/**
 * حالة اعتماد العطلة الهجرية (لا معنى لها للعطل الميلادية الثابتة — تبقى OFFICIAL دائمًا):
 * - OFFICIAL: صدر إعلان رسمي بالتاريخ.
 * - EXPECTED_ALOJAIRI: تاريخ متوقَّع وفق تقويم العجيري الفلكي، قبل الإعلان الرسمي.
 * - MANUALLY_ADJUSTED: أُدخل/عُدِّل يدويًا (تصحيح بعد رصد الهلال مثلاً).
 */
export type HolidayStatus = 'OFFICIAL' | 'EXPECTED_ALOJAIRI' | 'MANUALLY_ADJUSTED';

/**
 * العطلة العامة (قراءة فقط) لنطاق Employee Entitlements — تطابق حقول Holiday في
 * schema.prisma تمامًا (لا تغيير في المخطط). `origin`/`status` مُشتقّان وقت القراءة فقط
 * (انظر holidays/classifyHoliday.ts) وليسا عمودين مخزَّنين — تصنيف عرضي إضافي بلا أي
 * أثر على أي احتساب أو استعلام قائم.
 */
export interface Holiday {
  id: number;
  date: Date;
  name: string;
  notes: string | null;
  origin: HolidayOrigin;
  status: HolidayStatus;
}
