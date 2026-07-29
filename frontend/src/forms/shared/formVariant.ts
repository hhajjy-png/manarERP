import type { Lang } from '../../stores/uiStore';

/**
 * نسخة مستند النموذج الإداري — **منفصلة تمامًا عن `Lang`**.
 *
 * لماذا نوع مستقل ولا نوسّع `Lang`
 * ────────────────────────────────
 * `Lang` (`'ar' | 'en'`) هو لغة **الواجهة**، ويغذّي `DICT: Record<Lang, …>` في
 * `lib/i18n.ts` — أي أن إضافة عضو ثالث إليه تفرض قاموس واجهة ثالثًا كاملًا
 * (آلاف المفاتيح) وتكسر `formsTranslationKeyCompleteness.test.ts`. والقالب
 * الثنائي لا يحتاج ذلك إطلاقًا: اتجاهه LTR، وكل ما حوله (شريط الأدوات، عنوان
 * المستند، كتلة الاعتماد) إنجليزي — أي `'en'` بالضبط.
 *
 * لذلك تعيش هذه النسخة في نوعها الخاص، وتُترجَم إلى `Lang` عند حدود الـShell
 * عبر `toLayoutLang` أدناه.
 */
export type FormDocVariant = 'ar' | 'en' | 'en-hi';

export const FORM_DOC_VARIANTS: readonly FormDocVariant[] = ['ar', 'en', 'en-hi'] as const;

export const DEFAULT_FORM_DOC_VARIANT: FormDocVariant = 'ar';

/**
 * لغة الـShell (`FormLayout`, `ApprovalSection`, `FormHeader`,
 * `composeStyledFromNode`, `t()`) المقابلة لهذه النسخة.
 *
 * `'en-hi'` تُصرَف إلى `'en'`: نفس الاتجاه (LTR)، ونفس هوامش/بروفايلات الطباعة،
 * ونفس مسار المعاينة والطباعة و PDF — فلا يرى أي مكوّن مشترك قيمة لم يكن يراها
 * من قبل، ولا يتغيّر سلوكه.
 */
export function toLayoutLang(variant: FormDocVariant): Lang {
  return variant === 'ar' ? 'ar' : 'en';
}

/** هل هذه النسخة هي القالب الثنائي English + हिन्दी؟ */
export function isEnHiVariant(variant: FormDocVariant): boolean {
  return variant === 'en-hi';
}
