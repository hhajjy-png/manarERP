/**
 * محلّل تواريخ آمن لمسارات الاستيراد.
 *
 * لماذا لا `new Date(text)`؟
 * مُنشئ Date في JS يفسّر `"05/03/2024"` بصيغة **MM/DD** الأمريكية، فيقرأها
 * «3 مايو» بدل «5 مارس» — ويخزّن تاريخًا خاطئًا **بصمت**. والأسوأ أن `"13/05/2024"`
 * تصبح `Invalid Date` فيُرفض الصف. السلوكان معًا غير مقبولين في نظام تواريخه محلية
 * بصيغة DD/MM/YYYY.
 *
 * هذه الدالة تجمع النمطين الصحيحين الموجودين أصلًا في المشروع
 * (`bankStatementImport/parser.ts` و`scripts/import-data.ts`) في مصدر واحد.
 *
 * الصيغ المدعومة:
 *   - كائن `Date` جاهز (خلية تاريخ حقيقية من ExcelJS).
 *   - رقم تسلسلي من Excel (نظام تأريخ 1900).
 *   - `YYYY-MM-DD` أو ISO كامل (لا لبس فيها).
 *   - `DD/MM/YYYY` و`DD-MM-YYYY` و`DD.MM.YYYY`.
 *   - `"29 May 2026"` (اسم شهر إنجليزي مختصر أو كامل).
 *
 * الالتباس (`05/03/2024`) يُحسم دائمًا لصالح **DD/MM** — عرف الكويت والخليج.
 * التواريخ الناتجة عند منتصف الليل **بالتوقيت المحلي**، مطابقةً لبقية النظام.
 */

/**
 * الاسم المختصر والكامل لكل شهر. المطابقة على الاسم كاملًا لا على أول ثلاثة أحرف:
 * `"Mayy".slice(0,3)` تساوي `"may"`، فالاقتطاع كان يقبل أخطاءً إملائية بصمت.
 */
const MONTH_NAMES: Record<string, number> = {
  jan: 1,  january: 1,
  feb: 2,  february: 2,
  mar: 3,  march: 3,
  apr: 4,  april: 4,
  may: 5,
  jun: 6,  june: 6,
  jul: 7,  july: 7,
  aug: 8,  august: 8,
  sep: 9,  sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/**
 * حدود الرقم التسلسلي المدعومة.
 *
 * الحد الأدنى 61 = 01/03/1900. ما دونه يقع في نطاق «خلل 1900» الموروث عن Lotus:
 * Excel يعدّ 29/02/1900 يومًا موجودًا (الرقم 60) وهو غير موجود، فتنزاح كل الأرقام
 * 1..59 بيوم واحد عن الحساب المعتاد. بدل معالجة استثناء لتواريخ يناير/فبراير 1900
 * — وهي بلا معنى في هذا النظام — نرفض المدى كلّه: رقم بهذا الصغر في عمود تاريخ
 * هو رقم شارد لا تاريخ.
 */
const MIN_EXCEL_SERIAL = 61;
/** أقصى رقم تسلسلي معقول في Excel (31/12/9999). */
const MAX_EXCEL_SERIAL = 2_958_465;

/**
 * يبني تاريخًا محليًا ويرفض التواريخ غير الموجودة في التقويم.
 * `new Date(2024, 1, 31)` يتدحرج بصمت إلى 2 مارس — نكشف ذلك بمقارنة المكوّنات.
 */
function buildLocalDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/**
 * الرقم التسلسلي في Excel = عدد الأيام منذ 30/12/1899 (نظام 1900).
 * يُحسب بـ UTC لتفادي انزلاق يوم عند الانتقال الصيفي، ثم يُعاد بناؤه محليًا.
 */
function fromExcelSerial(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < MIN_EXCEL_SERIAL || serial > MAX_EXCEL_SERIAL) return null;
  const utc = new Date(Date.UTC(1899, 11, 30));
  utc.setUTCDate(utc.getUTCDate() + Math.floor(serial));
  return buildLocalDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

/** يُعيد `Date` عند منتصف الليل محليًا، أو `null` إن تعذّر التفسير بثقة. */
export function parseImportDate(value: unknown): Date | null {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return buildLocalDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number') return fromExcelSerial(value);

  const s = String(value).trim();
  if (!s) return null;

  // رقم تسلسلي وصل كنص ("45641")
  if (/^\d+(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));

  // ISO — لا لبس فيها. نأخذ جزء التاريخ فقط لتفادي انزلاق المنطقة الزمنية.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (iso) return buildLocalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // DD/MM/YYYY — الفاصل / أو - أو .
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) return buildLocalDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  // "29 May 2026" / "29 September 2026"
  const verbose = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (verbose) {
    const month = MONTH_NAMES[verbose[2].toLowerCase()];
    if (month) return buildLocalDate(Number(verbose[3]), month, Number(verbose[1]));
  }

  // لا نخمّن. الرفض الصريح أأمن من تاريخ خاطئ صامت.
  return null;
}
