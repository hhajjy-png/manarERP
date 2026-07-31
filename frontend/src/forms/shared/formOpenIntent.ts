import { useLocation } from 'react-router-dom';

/**
 * «فتح» بدل «طباعة» — نيّة الفتح القادمة من صفحة **النماذج الإدارية** وحدها.
 *
 * **إضافي بحت.** لا يبني معاينة جديدة ولا يغيّر مسار طباعة. كل ما يفعله: يحمل في
 * الرابط علامةً واحدة تقول «هذا النموذج فُتح للعرض، لا للطباعة الفورية»، فتقرأها
 * طبقة العرض المشتركة (`FormLayout` / `PrintWorkspace`) فتفعل شيئين لا ثالث لهما:
 *
 *   1. لا تُشغّل الطباعة التلقائية عند الجاهزية (المستخدم يطبع من داخل المعاينة).
 *   2. تفتح معاينة مساحة العمل القائمة على تكبير ابتدائي 80% بدل «ملاءمة الصفحة».
 *
 * **لماذا الرابط لا خاصية (prop)؟** لأن نفس الشاشات تُفتح من مسارات أخرى لا تخصّ
 * صفحة النماذج الإدارية إطلاقًا — أوضحها `Cheques.tsx` التي تنتقل إلى
 * `/forms/payment-voucher/<chequeId>` ضمن مسار الشيكات، وأي رابط عميق مباشر.
 * تلك المسارات لا تحمل العلامة، فتبقى سلوكًا مطابقًا لما كان حرفًا بحرف: طباعة
 * تلقائية كما كانت، وتكبير ابتدائي «ملاءمة الصفحة» كما كان.
 *
 * **لا أثر على الطباعة الفعلية**: العلامة لا تصل إلى `@page` ولا إلى الهوامش ولا
 * إلى `webContents.print` ولا إلى تصدير PDF — هي وسيط قرارٍ في واجهة الشاشة فقط.
 */
export const FORM_OPEN_INTENT_PARAM = 'open';
export const FORM_OPEN_INTENT_VALUE = 'preview';

/**
 * التكبير الابتدائي لمعاينة أي نموذج إداري يُفتح عبر زر «فتح».
 *
 * **ابتدائي فقط**: قيمة أول تصيير لحالة التكبير في `PrintWorkspace`. بعدها التكبير
 * ملك المستخدم — أزرار −/+، «ملاءمة العرض/الصفحة»، «إعادة التكبير»، و Ctrl+عجلة —
 * ولا شيء يعيد فرض 80% ما دامت المعاينة مفتوحة. وبما أن الحالة تعيش داخل
 * `PrintWorkspace`، فكل فتحة جديدة (تركيب جديد للشاشة) تبدأ من 80% من جديد.
 */
export const ADMIN_FORM_PREVIEW_INITIAL_ZOOM = 0.8;

/** يُذيّل مسار تنقّل بعلامة نيّة الفتح، مع احترام أي معاملات قائمة (مثل printMode). */
export function withFormOpenIntent(path: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${FORM_OPEN_INTENT_PARAM}=${FORM_OPEN_INTENT_VALUE}`;
}

/** هل يحمل هذا الـ search علامة «فُتح للعرض»؟ دالة نقية — تُختبر بلا تصيير. */
export function hasFormOpenIntent(search: string): boolean {
  try {
    return new URLSearchParams(search).get(FORM_OPEN_INTENT_PARAM) === FORM_OPEN_INTENT_VALUE;
  } catch {
    return false;
  }
}

/** نفس الفحص أعلاه على رابط الشاشة الحالي. */
export function useFormOpenIntent(): boolean {
  const { search } = useLocation();
  return hasFormOpenIntent(search);
}

/**
 * التكبير الابتدائي الذي يُمرَّر إلى `PrintWorkspace`: 80% حين فُتح النموذج عبر
 * «فتح»، و`undefined` (أي: لا تغيير إطلاقًا — «ملاءمة الصفحة» كما كان) خلاف ذلك.
 */
export function useFormPreviewInitialZoom(): number | undefined {
  return useFormOpenIntent() ? ADMIN_FORM_PREVIEW_INITIAL_ZOOM : undefined;
}
