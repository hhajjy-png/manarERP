import fs from 'fs';
import path from 'path';

/**
 * كنس ملفات المزامنة المؤقتة اليتيمة عند بدء التشغيل.
 *
 * `performUpload`/`performDownload` يُنشئان ملفًا مؤقتًا في `dataDir` ويحذفانه في
 * `finally`. إن قُتلت العملية بينهما (إغلاق قسري، انقطاع كهرباء، إنهاء المهمة)
 * لا يعمل `finally` فيبقى الملف. رصد التدقيق ثلاث لقطات كهذه بحجم ~2.1MB لكلٍّ.
 *
 * لا يقرأ أي كود هذه البقايا (الاسم يحمل `Date.now()` ويُولَّد جديدًا في كل عملية)،
 * فهي ضياع مساحة لا خطر بيانات — لكن تراكمها يُربك التشخيص ويستهلك القرص.
 *
 * ── حدود صارمة ─────────────────────────────────────────────────────────────────
 *
 * يُحذف **فقط** ما يطابق البادئتين أدناه حرفيًا وينتهي بـ`.db`، وعمره يتجاوز
 * العتبة. أي شيء آخر — `manar.db`، `backups/`، `pre-sync/`، `*.bak`،
 * `sync-metadata.json`، ملفات الهوية والأسرار — لا يُمسّ إطلاقًا. والبحث غير
 * تعاودي: المستوى الأول من `dataDir` فقط، فلا يصل إلى `backups/` أصلًا.
 */

/** البادئتان الوحيدتان المسموح بحذفهما — تطابقان مُولِّدَي الاسم في `syncEngine.service.ts`. */
const TEMP_PREFIXES = ['sync-tmp-snapshot-', 'sync-tmp-download-'] as const;

/**
 * عتبة العمر. ساعتان محافظتان جدًا: أطول رفع/تنزيل واقعي لقاعدة بحجم ميغابايتات
 * قليلة على وصلة بطيئة يبقى دقائق، فالعتبة تترك هامشًا كبيرًا. أي ملف أحدث من
 * ذلك يُفترض أنه **نشط الآن** ولا يُمسّ — الحذف تحت عملية رفع جارية أسوأ بكثير
 * من ترك ملف يتيم دورة تشغيل إضافية.
 */
export const ORPHAN_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export interface CleanupResult {
  deleted: string[];
  /** بقيت لأنها أحدث من العتبة (قد تكون نشطة الآن). */
  skippedRecent: string[];
  /** فشل حذفها (مقفلة/صلاحيات) — لا يُعطّل التشغيل. */
  failed: { file: string; reason: string }[];
}

export function isSyncTempName(name: string): boolean {
  return name.endsWith('.db') && TEMP_PREFIXES.some((p) => name.startsWith(p));
}

/**
 * ينظّف اللقطات اليتيمة. لا يرمي أبدًا — الفشل يُعاد في النتيجة ليُسجَّل فقط،
 * فبدء التطبيق لا يتوقف على نجاح الكنس.
 */
export function cleanupOrphanSyncTemps(
  dataDir: string,
  opts: { now?: number; maxAgeMs?: number } = {},
): CleanupResult {
  const now = opts.now ?? Date.now();
  const maxAgeMs = opts.maxAgeMs ?? ORPHAN_MAX_AGE_MS;
  const result: CleanupResult = { deleted: [], skippedRecent: [], failed: [] };

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dataDir, { withFileTypes: true });
  } catch {
    return result; // لا مجلد بيانات بعد — لا شيء لتنظيفه
  }

  for (const entry of entries) {
    // الملفات العادية فقط — لا مجلدات (يستبعد `backups/`) ولا روابط رمزية.
    if (!entry.isFile() || !isSyncTempName(entry.name)) continue;

    const full = path.join(dataDir, entry.name);
    try {
      if (now - fs.statSync(full).mtimeMs <= maxAgeMs) {
        result.skippedRecent.push(entry.name);
        continue;
      }
      fs.unlinkSync(full);
      result.deleted.push(entry.name);
    } catch (err) {
      result.failed.push({ file: entry.name, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
