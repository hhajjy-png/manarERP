import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Test Isolation Pack v1 — عقد صندوق الاختبارات الرملي.
 *
 * وحدة واحدة يشترك فيها `vitest.setup.ts` (لكل عامل) و`vitest.globalSetup.ts`
 * (لعمر التشغيل كله)، فلا يتفرّع تعريف «أين يعيش الصندوق» و«ما هي القاعدة
 * المحمية» بين ملفَّين ينحرفان مع الوقت.
 *
 * لا تستورد هذه الوحدة أي شيء من `src/` — فهي تعمل **قبل** تحميل أي وحدة تطبيق،
 * وأي استيراد منها هنا كان سيُحمّل `config/env.ts` (ومعه `dotenv`) قبل أن نضبط
 * البيئة، فيُهزم الغرض كله.
 */

/** جذر الصندوق الرملي — تحت مجلد المؤقتات الخاص بنظام التشغيل، خارج المستودع تمامًا. */
export const SANDBOX_ROOT = path.join(os.tmpdir(), 'manar-erp-test-sandbox');

/** قاعدة بيانات التطوير الحقيقية — الملف المحمي الذي لا يجوز لأي اختبار أن يمسّه. */
export const REAL_DEV_DB = path.resolve(__dirname, 'data', 'manar.db');

/** مجلد بيانات التطوير — لا يجوز لأي مسار اختبار أن يقع داخله. */
export const REAL_DATA_DIR = path.resolve(__dirname, 'data');

/** مجلد الصندوق الخاص بعامل vitest الحالي. عزل لكل عامل يمنع تضارب الكتابة المتوازية. */
export function workerSandbox(): string {
  const worker = process.env.VITEST_WORKER_ID ?? String(process.pid);
  return path.join(SANDBOX_ROOT, `w${worker}`);
}

/** هل يقع `target` داخل `parent`؟ مقارنة مسارات مُطبَّعة — لا مطابقة نصّية ساذجة. */
export function isInside(parent: string, target: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(target));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** يحوّل `file:C:/…` إلى مسار نظام ملفات. يُعيد `null` لأي صيغة غير متوقعة. */
export function databaseUrlToPath(url: string | undefined): string | null {
  if (!url || !url.startsWith('file:')) return null;
  return path.resolve(url.slice('file:'.length));
}

export class TestIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TestIsolationError';
  }
}

/**
 * الحارس. يفشل **فورًا وبصوت عالٍ** إن كان أي مسار من مسارات الكتابة يشير خارج
 * الصندوق الرملي — أو، أسوأ، داخل مجلد بيانات التطوير.
 *
 * يُستدعى مرّتين عمدًا: عند تهيئة كل ملف اختبار، ثم **قبل كل حالة اختبار**. الثانية
 * ليست تكرارًا: اختبار قد يعبث بـ`process.env.DATABASE_URL` في `beforeEach` خاص به
 * أو عبر `vi.stubEnv`، فيتسرّب من فحصٍ يجري مرّة واحدة عند التحميل.
 */
export function assertSandboxed(context = 'بيئة الاختبار'): void {
  const sandbox = workerSandbox();

  const dbPath = databaseUrlToPath(process.env.DATABASE_URL);
  if (dbPath === null) {
    throw new TestIsolationError(
      `[عزل الاختبارات] ${context}: DATABASE_URL غير مضبوط أو بصيغة غير متوقعة ` +
        `(${process.env.DATABASE_URL ?? 'غير معرّف'}). الاختبارات لا تعمل بلا قاعدة صندوق رملي.`,
    );
  }

  if (path.resolve(dbPath) === REAL_DEV_DB || isInside(REAL_DATA_DIR, dbPath)) {
    throw new TestIsolationError(
      `[عزل الاختبارات] ⛔ ${context}: محاولة استخدام قاعدة بيانات التطوير الحقيقية.\n` +
        `  المسار المطلوب : ${dbPath}\n` +
        `  المحظور        : ${REAL_DATA_DIR}\n` +
        `  الصندوق الرملي : ${sandbox}\n` +
        `الاختبارات ممنوعة من الكتابة في قاعدة التطوير. إن كان اختبارك يحتاج قاعدة حقيقية ` +
        `فأنشئ نسخة داخل الصندوق الرملي، ولا تُشر إلى backend/data إطلاقًا.`,
    );
  }

  if (!isInside(SANDBOX_ROOT, dbPath)) {
    throw new TestIsolationError(
      `[عزل الاختبارات] ⛔ ${context}: DATABASE_URL خارج الصندوق الرملي.\n` +
        `  المسار : ${dbPath}\n  المسموح: ${SANDBOX_ROOT}`,
    );
  }

  // مسارات الكتابة الأخرى — `BACKUP_DIR` و`ATTACHMENTS_DIR` افتراضهما في الشيفرة
  // نسبيّ (`./data/backups`) فيُحلّ إلى **داخل مجلد بيانات التطوير** حين يكون
  // `process.cwd()` هو `backend/`. تركهما بلا ضبط كان يعني أن أي اختبار يبلغ
  // `backupService.create()` يكتب ملف قاعدة حقيقيًا في مجلد نسخ المطوّر.
  for (const key of ['BACKUP_DIR', 'ATTACHMENTS_DIR', 'DATA_DIR'] as const) {
    const value = process.env[key];
    if (!value) {
      throw new TestIsolationError(`[عزل الاختبارات] ${context}: ${key} غير مضبوط.`);
    }
    const resolved = path.resolve(value);
    if (isInside(REAL_DATA_DIR, resolved) || !isInside(SANDBOX_ROOT, resolved)) {
      throw new TestIsolationError(
        `[عزل الاختبارات] ⛔ ${context}: ${key} يشير خارج الصندوق الرملي.\n` +
          `  المسار : ${resolved}\n  المسموح: ${SANDBOX_ROOT}`,
      );
    }
  }
}

/** بصمة الملف — تُستخدم لإثبات أن قاعدة التطوير لم تتغيّر عبر التشغيل كله. */
export function sha256OfFile(file: string): string | null {
  try {
    if (!fs.existsSync(file)) return null;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createHash } = require('crypto') as typeof import('crypto');
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
}
