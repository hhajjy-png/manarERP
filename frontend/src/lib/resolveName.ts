import type { Lang } from '../stores/uiStore';

export interface BilingualNameEntity {
  name: string;
  nameEn?: string | null;
}

/**
 * يختار الاسم المعروض حسب لغة الواجهة الحالية. العربي هو المصدر الوحيد الموثوق —
 * الإنجليزي اختياري ويعود تلقائيًا للعربي عند غيابه. مصدر واحد للقاعدة، يقابله
 * `pickName` في الخلفية بنفس المنطق تمامًا.
 */
export function resolveName(entity: BilingualNameEntity | null | undefined, lang: Lang): string {
  if (!entity) return '';
  if (lang === 'en' && entity.nameEn && entity.nameEn.trim()) return entity.nameEn;
  return entity.name;
}
