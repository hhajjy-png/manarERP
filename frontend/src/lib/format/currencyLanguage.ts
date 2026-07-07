/**
 * لغة عرض العملة (إعداد شركة) — نوع + تطبيع فقط. لا حالة قابلة للتغيير هنا.
 *
 * المصدر الوحيد للحقيقة هو settingsStore. تُمرَّر اللغة صراحةً إلى formatCurrency عبر
 * نقاط الدخول التطبيقية (money / خلايا التقارير)، فيبقى المُنسّق دالة صافية (deterministic).
 * الافتراضي الآمن: english.
 */
export type CurrencyLanguage = 'english' | 'arabic';

/** يحوّل قيمة الإعداد الخام إلى لغة صالحة، مع رجوع آمن إلى english. */
export function normalizeCurrencyLanguage(raw: unknown): CurrencyLanguage {
  return raw === 'arabic' ? 'arabic' : 'english';
}
