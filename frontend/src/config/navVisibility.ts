/**
 * ظهور عناصر الشريط الجانبي — منطق صافٍ فوق تعريف `NAV` الموجود في `config/modules.tsx`.
 *
 * لا قائمة ثانية هنا: المصدر الوحيد للحقيقة يبقى `NAV`، وهذا الملف يشتقّ منه ما يُعرض
 * في القائمة الجانبية (Layout) وما يُعرض في إعداد «إدارة الشريط الجانبي» (Settings).
 *
 * الصلاحيات فوق التفضيل دائمًا:
 *   visible = (لا صلاحية مطلوبة || المستخدم يملكها) && ليس مخفيًا بتفضيل المستخدم
 * فتفضيل الإظهار لا يستطيع كشف صفحة لا يملك المستخدم صلاحيتها — الترشيح الأمني يسبقه.
 *
 * لا استيراد لـ `modules.tsx` من هنا (وهو يستورد `uiStore` الذي يستورد هذا الملف):
 * الأنواع مُعرَّفة بنيويًا، فلا حلقة استيراد.
 */

/**
 * عناصر لا يجوز إخفاؤها.
 *
 * «الإعدادات» هي المسار الوحيد إلى إعداد إدارة الشريط الجانبي نفسه؛ إخفاؤها يحبس
 * المستخدم خارج الإعداد الذي أخفاها. تبقى ظاهرة (لمن يملك صلاحيتها) بلا زرّ أو مسار
 * جديد يُضاف لأجل ذلك.
 */
export const PROTECTED_NAV_KEYS: readonly string[] = ['settings'];

export function isProtectedNavKey(key: string): boolean {
  return PROTECTED_NAV_KEYS.includes(key);
}

/** الحد الأدنى الذي يحتاجه الترشيح من عنصر القائمة — `NAV` مطابق بنيويًا. */
export interface NavItemLike {
  key: string;
  permission?: string;
}

export interface NavSectionLike<I extends NavItemLike = NavItemLike> {
  group: string;
  items: I[];
}

/**
 * يقرأ قائمة المفاتيح المخفية من مصدر غير موثوق (تخزين محلي) إلى قيمة صالحة.
 * أي شكل غير متوقّع ⇒ لا شيء مخفي (السلوك الحالي 100%).
 */
export function sanitizeHiddenNavKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const valid = raw.filter(
    (k): k is string => typeof k === 'string' && k !== '' && !isProtectedNavKey(k),
  );
  return Array.from(new Set(valid));
}

/**
 * يرشّح أقسام القائمة بمُسنِد على العنصر، ويُسقط أي مجموعة لم يبقَ فيها عنصر ظاهر
 * (فلا عنوان مجموعة فارغ ولا فاصل بلا محتوى). لا يُعدَّل المصدر: نسخ جديدة دائمًا،
 * والترتيب الأصلي — للمجموعات وللعناصر داخلها — كما هو.
 */
function filterNavSections<I extends NavItemLike, S extends NavSectionLike<I>>(
  sections: readonly S[],
  keep: (item: I) => boolean,
): S[] {
  return sections
    .map((section) => ({ ...section, items: section.items.filter(keep) }))
    .filter((section) => section.items.length > 0);
}

/**
 * عناصر القائمة التي يملك المستخدم صلاحيتها — بصرف النظر عن تفضيل الإظهار.
 * هذه هي القائمة المعروضة في إعداد «إدارة الشريط الجانبي»: لا يُعرض فيها ما لا
 * يستطيع المستخدم الوصول إليه أصلًا، فلا يوهمه مفتاح بأنه قادر على إظهاره.
 */
export function permittedNav<I extends NavItemLike, S extends NavSectionLike<I>>(
  sections: readonly S[],
  hasPermission: (perm: string) => boolean,
): S[] {
  return filterNavSections(sections, (it) => !it.permission || hasPermission(it.permission));
}

/** ما يُعرض فعليًا في الشريط الجانبي: صلاحية المستخدم ثمّ تفضيل الإظهار. */
export function visibleNav<I extends NavItemLike, S extends NavSectionLike<I>>(
  sections: readonly S[],
  hasPermission: (perm: string) => boolean,
  hiddenKeys: readonly string[],
): S[] {
  return filterNavSections(
    sections,
    (it) => (!it.permission || hasPermission(it.permission)) && !hiddenKeys.includes(it.key),
  );
}
