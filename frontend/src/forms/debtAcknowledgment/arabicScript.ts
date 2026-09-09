/**
 * كاشف الحرف العربي — حارس القالبين الإنجليزي والهندي.
 *
 * ═══ لماذا يوجد ═══
 * القالبان الإنجليزي والهندي يُسلَّمان لعامل لا يقرأ العربية. أي قيمة عربية تتسرّب
 * إليهما (اسم، مهنة، جنسية، عنوان) تجعل المستند غير مفهوم لمن يوقّعه — وهو مستند
 * يُقرّ فيه بدَين. المراجعة البصرية لا تكفي حارسًا: قيمة واحدة تُنسى في وثيقة من خمس
 * صفحات، فيُبنى الحارس على نقاط الترميز لا على النظر.
 *
 * ═══ ما يُرفَض وما لا يُرفَض ═══
 * يُرفَض **الخط العربي** وحده. الديفاناغارية في القالب الهندي طبيعية ومطلوبة، واللاتينية
 * والأرقام الغربية مقبولة في الاثنين. الأرقام العربية-الهندية (٠١٢…) تُطبَّع إلى غربية
 * **قبل** الفحص (`toWesternDigits`)، فرقمٌ كُتب بلوحة مفاتيح عربية يُصحَّح ولا يُعامَل
 * كتسرّب.
 */
import { toWesternDigits } from '../../lib/dateInput';

/**
 * كتل يونيكود العربية كاملةً — لا `[؀-ۿ]` وحدها، فهي تفوت أشكال العرض
 * (التي يُنتجها اللصق من PDF أو من برامج قديمة) وتفوت الامتدادات:
 *
 *   U+0600–U+06FF  Arabic
 *   U+0750–U+077F  Arabic Supplement
 *   U+0870–U+089F  Arabic Extended-B
 *   U+08A0–U+08FF  Arabic Extended-A
 *   U+FB50–U+FDFF  Arabic Presentation Forms-A
 *   U+FE70–U+FEFF  Arabic Presentation Forms-B
 *   U+10E60–U+10E7F Rumi Numeral Symbols
 *   U+1EC70–U+1ECBF Indic Siyaq Numbers
 *   U+1ED00–U+1ED4F Ottoman Siyaq Numbers
 *   U+1EE00–U+1EEFF Arabic Mathematical Alphabetic Symbols
 *
 * الكتل الأربع الأخيرة فوق BMP، فيلزم العلم `u` — بدونه يفحص المحرك أنصاف الأزواج
 * البديلة ويخطئ.
 */
const ARABIC_BLOCKS =
  /[؀-ۿݐ-ݿࡰ-࢟ࢠ-ࣿﭐ-﷿ﹰ-﻿]|[\u{10E60}-\u{10E7F}\u{1EC70}-\u{1ECBF}\u{1ED00}-\u{1ED4F}\u{1EE00}-\u{1EEFF}]/u;

/**
 * هل يحمل النصّ حرفًا عربيًا بعد تطبيع الأرقام؟
 *
 * `''`/`null`/`undefined` ⇒ `false`: الحقل الفارغ يطبع فراغ النموذج (سلسلة النقاط)،
 * وهو خانة غير معبّأة لا تسرّبًا لغويًا.
 */
export function containsArabicScript(value: string | null | undefined): boolean {
  if (!value) return false;
  return ARABIC_BLOCKS.test(toWesternDigits(value));
}

/** حقل واحد سرّبت قيمته العربية إلى قالب أجنبي. */
export interface ArabicLeak<K extends string = string> {
  /** معرّف الحقل — تترجمه الواجهة إلى تسمية يفهمها المستخدم. */
  field: K;
  /** القيمة المسرَّبة كما ستُطبع. */
  value: string;
}

/**
 * يفحص خريطة «الحقل ← القيمة النهائية المعروضة» ويعيد ما يحمل منها حرفًا عربيًا.
 *
 * يُستدعى على **القيم النهائية بعد الحلّ** (أي ما سيُطبع فعلًا)، لا على الحالة الخام:
 * فحص الحالة الخام كان سيرفض القالب العربي نفسه، ويغفل عن قيمة عربية دخلت خانة
 * لاتينية.
 */
export function findArabicLeaks<K extends string>(values: Readonly<Record<K, string>>): ArabicLeak<K>[] {
  return (Object.keys(values) as K[])
    .filter((field) => containsArabicScript(values[field]))
    .map((field) => ({ field, value: values[field] }));
}
