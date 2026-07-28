/**
 * fonts — المصدر الوحيد لخط محرّك التقارير في الخادم (Font Foundation Pack v1).
 *
 * نظير `frontend/src/styles/fontRegistry.ts`. الملفان **منفصلان عمدًا**: الواجهة
 * والخادم يُبنَيان ببرنامجَي TypeScript مستقلَّين (`frontend/tsconfig` مقابل
 * `backend/tsconfig`) بلا مجلد مشترك، فلا سبيل لاستيراد واحد من الآخر دون إدخال
 * حزمة مشتركة جديدة إلى بنية البناء — وهو تغيير أكبر من هذه الحزمة. القيمتان يجب
 * أن تبقيا متطابقتين.
 *
 * سياسة الحزمة الأولى: **معماري لا بصري.** القيم هنا مطابقة حرفيًا لما كان مكتوبًا
 * في `html.service.ts` و`styles.template.ts` — نفس العائلة، نفس الاحتياط، نفس الوزن.
 */

/** العائلة المضمَّنة base64 في كل تقرير مُولَّد. وزن واحد (Regular) — كما هو اليوم. */
export const EMBEDDED_REPORT_FONT_FAMILY = 'Cairo';

/**
 * سلسلة خط التقارير — مطابقة لما كان في `styles.template.ts`.
 * (كانت مكتوبة هناك بصيغتين: `'Cairo', 'Arial', sans-serif` و`'Cairo', Arial,
 * sans-serif`؛ القيمة المحسوبة واحدة — علامات الاقتباس حول اسم عائلة من كلمة
 * واحدة لا أثر لها في CSS.)
 */
export const REPORT_FONT_STACK = `'${EMBEDDED_REPORT_FONT_FAMILY}', Arial, sans-serif`;

/**
 * يبني كتلة `@font-face` للخط المضمَّن في تقرير HTML.
 *
 * @param base64 محتوى ملف TTF مُرمَّزًا base64. سلسلة فارغة (فشل قراءة الملف) تُرجِع
 *   سلسلة فارغة — نفس التدهور اللطيف القائم: يسقط التقرير إلى الاحتياط بدل أن
 *   يُصدِر `@font-face` مكسورة.
 */
export function buildEmbeddedFontFaceCss(base64: string): string {
  if (!base64) return '';
  return `@font-face {
        font-family: '${EMBEDDED_REPORT_FONT_FAMILY}';
        src: url('data:font/truetype;base64,${base64}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }`;
}
