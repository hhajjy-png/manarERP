import fs from 'fs';
import path from 'path';

/**
 * Production Deployment Pack v1 — تهيئة مجلد بيانات المستخدم عند أول تشغيل.
 *
 * ── العقد ──────────────────────────────────────────────────────────────────────
 *
 * كل ما يكتبه النظام أثناء التشغيل يعيش تحت `%AppData%` (مجلد `userData` الخاص
 * بـElectron) — لا شيء يُكتب داخل مجلد التثبيت أبدًا. مجلد التثبيت للقراءة فقط
 * من منظور التطبيق: هذا شرط عمل صحيح على وندوز (Program Files محمي)، وشرط أن
 * تنجو البيانات من إلغاء التثبيت وإعادة التثبيت والترقية.
 *
 * ── مبدأ عدم التدمير ──────────────────────────────────────────────────────────
 *
 * كل دالة هنا **إضافية بحتة**: تُنشئ ما هو ناقص ولا تمسّ ما هو موجود. تشغيل ثانٍ
 * (أو ترقية فوق تثبيت قائم) لا يستبدل أي ملف مستخدم ولا يُعيد أي إعداد إلى قيمة
 * المصنع. الشرط في كل موضع هو `!existsSync` لا غير.
 */

/**
 * المجلدات التي يحتاجها النظام أثناء التشغيل، نسبةً إلى `dataDir`.
 *
 * تُنشأ كلها عند أول تشغيل بدل تركها لأول عملية تحتاجها: مجلد ناقص يظهر كخطأ
 * غامض وقت العمل (فشل رفع مرفق، فشل نسخة احتياطية) بدل أن يُحسم مرة واحدة هنا.
 */
export const DATA_SUBDIRECTORIES = [
  'backups',
  path.join('backups', 'pre-sync'),
  path.join('backups', 'pre-restore'),
  'logs',
  'attachments',
  'documents',
  'exports',
] as const;

/**
 * ملفات الحالة التي تُنقل مع النسخة الإنتاجية إن وُجدت في `seed-data` المُرفقة
 * بالمثبّت — ولا تُنشأ محليًا إلا إن كانت غائبة.
 *
 * ما **لا** يُنقل عمدًا:
 *   • `gdrive-token.dat` — مُعمّى بـDPAPI (safeStorage) ومربوط بحساب المستخدم
 *     والجهاز الذي أنشأه. نقله إلى جهاز آخر يُنتج ملفًا لا يُفكّ تعميته أبدًا؛
 *     المستخدم يربط الحساب بضغطة واحدة على الجهاز الجديد.
 *   • `device-identity.json` — هوية الجهاز يجب أن تكون **جديدة** على جهاز جديد،
 *     وإلا ظهر جهازان مختلفان بالهوية نفسها في سجلّ المزامنة وفي كشف التعارض.
 *   • `security.json` — سرّ JWT يُولَّد محليًا لكل تثبيت؛ نقله يعني إعادة استخدام
 *     سرّ عبر أجهزة بلا أي فائدة (الأثر الوحيد لتوليده من جديد: تسجيل دخول واحد).
 */
export const SEEDED_STATE_FILES = [
  // يحفظ `lastSyncedFileId` — الرابط بملف قاعدة البيانات في appDataFolder على
  // Drive، وسجلّ المزامنة وتاريخها. بدونه تبدأ النسخة الجديدة بلا تاريخ مزامنة.
  'sync-metadata.json',
  // بريد الحساب المرتبط سابقًا — عرضي بحت (الواجهة لا تُظهره إلا مع توكن صالح).
  'gdrive-account.json',
] as const;

/** ينشئ كل مجلدات البيانات الناقصة. آمن للتكرار — `recursive: true` لا يمسّ الموجود. */
export function ensureDataLayout(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const sub of DATA_SUBDIRECTORIES) {
    fs.mkdirSync(path.join(dataDir, sub), { recursive: true });
  }
}

export interface SeedCompanionResult {
  copied: string[];
  skipped: string[];
  failed: Array<{ file: string; error: string }>;
}

/**
 * ينسخ ملفات الحالة المُرفقة بالمثبّت إلى مجلد بيانات المستخدم — **الناقصة فقط**.
 *
 * `seedDir` غائب (تطوير، أو حزمة بلا بيانات مبدئية) ⇒ لا عمل ولا خطأ.
 * فشل نسخ ملف واحد لا يُوقف الباقي ولا يُفشل بدء التطبيق: هذه ملفات راحة لا
 * ملفات حرجة — النظام يعمل كاملًا بدونها وينشئها من جديد عند الحاجة.
 */
export function seedCompanionFiles(dataDir: string, seedDir: string | null): SeedCompanionResult {
  const result: SeedCompanionResult = { copied: [], skipped: [], failed: [] };
  if (!seedDir || !fs.existsSync(seedDir)) return result;

  for (const fileName of SEEDED_STATE_FILES) {
    const src = path.join(seedDir, fileName);
    const dest = path.join(dataDir, fileName);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dest)) {
      result.skipped.push(fileName);
      continue;
    }
    try {
      fs.copyFileSync(src, dest);
      result.copied.push(fileName);
    } catch (err) {
      result.failed.push({ file: fileName, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
