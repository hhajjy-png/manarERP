import type { Font, Alignment, Fill, Borders } from 'exceljs';

/**
 * نظام تصميم موحّد لجميع تصديرات Excel في نظام المنار.
 * يضمن شكلاً احترافيًا ومتناسقًا عبر كل التقارير (تقارير، كشوف حسابات، تقارير مالية...).
 *
 * ملاحظة أداء: جميع الكائنات هنا مجمّدة (Object.freeze) ومُصدَّرة كثوابت بدل
 * إعادة إنشاء كائنات حرفية داخل حلقات الصفوف — لتفادي ضغط الذاكرة على تقارير كبيرة.
 */

// ─── الخط ─────────────────────────────────────────────────────────────────

/** خط آمن للعربية (Tahoma) — يُستخدم في كل الخلايا. */
export const FONT_NAME = 'Tahoma';

export const FONT_SIZE = {
  title: 16,
  subtitle: 11,
  header: 11,
  body: 10,
  totals: 10,
  meta: 9,
} as const;

// ─── الألوان (ARGB) ─────────────────────────────────────────────────────────

export const COLORS = {
  HEADER_FILL: 'FF1D4E6F',   // كحلي — رأس الجدول (بدون تغيير)
  HEADER_TEXT: 'FFFFFFFF',
  TITLE_TEXT: 'FF1D4E6F',
  SUBTITLE_TEXT: 'FF64748B',
  TOTALS_FILL: 'FFF0F3F7',
  ZEBRA_FILL: 'FFF8FAFC',    // رمادي فاتح جدًا للصفوف الزوجية
  ROW_GROUP_FILL: 'FFE8F1FA', // أزرق فاتح جدًا — صفوف مجموعة واحدة (مثل شيك موزَّع على عدّة فواتير)
  BORDER_LIGHT: 'FFE2E8F0',
  META_TEXT: 'FF94A3B8',
} as const;

// ─── تنسيقات الأرقام/التواريخ ────────────────────────────────────────────────

/** تنسيق الدينار الكويتي — 3 خانات عشرية. لا تُغيَّر هذه القيمة أبدًا. */
export const KWD_FORMAT = '#,##0.000';
/**
 * تنسيق عرض التاريخ في Excel — `DD/MM/YYYY`، معيار العرض في كل التطبيق.
 *
 * هذا **تنسيق عرض** يُطبَّق على خلية تاريخ **حقيقية** (قيمة `Date`)، فتبقى الخلية
 * قابلة للفرز والحساب في Excel تمامًا كما كانت — المتغيّر الوحيد هو ما يراه
 * المستخدم. الصيغة القانونية `YYYY-MM-DD` تبقى كما هي في الـAPI والتخزين؛ هي
 * ليست صيغة عرض ولا يجوز أن تصل إلى خلية يقرأها المستخدم.
 */
export const DATE_FORMAT = 'dd/mm/yyyy';
export const INT_FORMAT = '#,##0';

// ─── كائنات الأنماط الجاهزة (مجمّدة) ───────────────────────────────────────
// تُستخدم بالإشارة (reference) في كل خلية بدل إعادة بنائها في كل تكرار حلقة.

export const TITLE_FONT: Font = Object.freeze({ name: FONT_NAME, size: FONT_SIZE.title, bold: true, color: { argb: COLORS.TITLE_TEXT } }) as Font;

export const SUBTITLE_FONT: Font = Object.freeze({ name: FONT_NAME, size: FONT_SIZE.subtitle, color: { argb: COLORS.SUBTITLE_TEXT } }) as Font;

export const HEADER_FONT: Font = Object.freeze({ name: FONT_NAME, size: FONT_SIZE.header, bold: true, color: { argb: COLORS.HEADER_TEXT } }) as Font;

export const BODY_FONT: Font = Object.freeze({ name: FONT_NAME, size: FONT_SIZE.body }) as Font;

export const TOTALS_FONT: Font = Object.freeze({ name: FONT_NAME, size: FONT_SIZE.totals, bold: true }) as Font;

export const META_FONT: Font = Object.freeze({ name: FONT_NAME, size: FONT_SIZE.meta, italic: true, color: { argb: COLORS.META_TEXT } }) as Font;

export const HEADER_FILL: Fill = Object.freeze({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: COLORS.HEADER_FILL },
}) as Fill;

export const TOTALS_FILL: Fill = Object.freeze({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: COLORS.TOTALS_FILL },
}) as Fill;

export const ZEBRA_FILL: Fill = Object.freeze({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: COLORS.ZEBRA_FILL },
}) as Fill;

export const ROW_GROUP_FILL: Fill = Object.freeze({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: COLORS.ROW_GROUP_FILL },
}) as Fill;

export const HEADER_BORDER: Partial<Borders> = Object.freeze({
  bottom: { style: 'thin', color: { argb: COLORS.BORDER_LIGHT } },
});

export const ROW_BORDER: Partial<Borders> = Object.freeze({
  bottom: { style: 'hair', color: { argb: COLORS.BORDER_LIGHT } },
});

export const CENTER_ALIGN: Partial<Alignment> = Object.freeze({ horizontal: 'center', vertical: 'middle' });
export const RIGHT_ALIGN: Partial<Alignment> = Object.freeze({ horizontal: 'right', vertical: 'middle' });
export const LEFT_ALIGN: Partial<Alignment> = Object.freeze({ horizontal: 'left', vertical: 'middle' });

/** يحسب المحاذاة الافتراضية حسب نوع/تنسيق العمود — نص = يمين (RTL)، رقم/عملة = يمين أيضًا (سلوك حالي محفوظ). */
export function alignFor(align?: 'left' | 'center' | 'right'): Partial<Alignment> {
  if (align === 'left') return LEFT_ALIGN;
  if (align === 'center') return CENTER_ALIGN;
  return RIGHT_ALIGN;
}
