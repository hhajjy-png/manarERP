export interface BilingualNameEntity {
  name: string;
  nameEn?: string | null;
}

/**
 * يختار الاسم المعروض حسب لغة الواجهة/المستند. العربي هو المصدر الوحيد الموثوق —
 * الإنجليزي اختياري ويعود تلقائيًا للعربي عند غيابه. مصدر واحد للقاعدة، يقابله
 * `resolveName` في الواجهة الأمامية بنفس المنطق تمامًا.
 */
export function pickName(entity: BilingualNameEntity | null | undefined, lang: 'ar' | 'en' = 'ar'): string {
  if (!entity) return '';
  if (lang === 'en' && entity.nameEn && entity.nameEn.trim()) return entity.nameEn;
  return entity.name;
}
