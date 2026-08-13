import fs from 'fs';
import path from 'path';
import { beforeEach } from 'vitest';
import {
  REAL_DEV_DB,
  assertSandboxed,
  workerSandbox,
} from './vitest.sandbox';

/**
 * Test Isolation Pack v1 — إعادة توجيه بيئة الاختبار إلى صندوق رملي.
 *
 * ── العطل الذي يغلقه ───────────────────────────────────────────────────────────
 *
 * `src/config/env.ts` يبني `DATABASE_URL` من `dotenv.config()` — أي من ملف `.env`
 * الذي يشير إلى **قاعدة التطوير الحقيقية**. وأي اختبار يستخدم عميل Prisma المفرد
 * بلا `vi.mock` كان يكتب فيها فعليًا: `backup.verify.test.ts` ينفّذ
 * `prisma.backup.create()` ثم `delete()`، فتبقى الأعداد كما هي بينما تتغيّر بايتات
 * الملف (بصمة SHA-256، `sqlite_sequence`، الصفحات الداخلية). رُصد هذا عمليًا في
 * تقرير Development Database Recovery.
 *
 * ── لماذا هذا الملف يفوز على `.env` بنيويًا ────────────────────────────────────
 *
 * `dotenv.config()` **لا يستبدل أبدًا** متغيّرًا موجودًا في `process.env` (سلوكه
 * الافتراضي `override: false`). و`setupFiles` في vitest تُنفَّذ **قبل** تحميل شجرة
 * وحدات ملف الاختبار — أي قبل أن يُستورد `config/env.ts` أصلًا. فحين نضبط المسارات
 * هنا، يصل `dotenv` لاحقًا ويجد القيم مضبوطة فيتركها.
 *
 * النتيجة: لا يوجد ترتيب تحميل يُمكِّن قيمة `.env` من الوصول إلى التطبيق أثناء
 * الاختبار. الحماية في **ترتيب التنفيذ** لا في انضباط المطوّر.
 *
 * ── لماذا صندوق لكل عامل ───────────────────────────────────────────────────────
 *
 * vitest يشغّل ملفات الاختبار متوازية عبر عدّة عمّال. صندوق مشترك كان يعني كتابتين
 * متزامنتين على ملف SQLite واحد ⇒ إخفاقات متقطّعة لا علاقة لها بالشيفرة.
 *
 * والنسخ يجري **مرّة واحدة لكل عامل** لا لكل ملف اختبار: `setupFiles` تُنفَّذ لكل
 * ملف، لكن حارس `existsSync` يجعل الكلفة الفعلية نسخة واحدة لكل عملية عامل.
 *
 * ── لماذا نسخة من قاعدة التطوير لا ملف فارغ ───────────────────────────────────
 *
 * الاختبارات التي تستخدم عميلًا حقيقيًا تحتاج **مخطّطًا**. الملف الفارغ بلا جداول
 * يُفشلها فورًا. وبناء المخطّط بتطبيق الترحيلات واحدًا واحدًا بطيء وهشّ. النسخ
 * يحفظ سلوك اليوم حرفيًا (الاختبارات كانت تعمل على تلك القاعدة أصلًا) بفارق واحد
 * حاسم: الكتابة تقع على **نسخة قابلة للرمي**.
 *
 * القراءة من قاعدة التطوير آمنة ومُثبَتة: `vitest.globalSetup.ts` يحسب بصمتها قبل
 * التشغيل وبعده ويُفشل التشغيل كله إن تغيّرت.
 */

const sandbox = workerSandbox();
const sandboxDb = path.join(sandbox, 'manar.db');
const sandboxBackups = path.join(sandbox, 'backups');
const sandboxAttachments = path.join(sandbox, 'attachments');

fs.mkdirSync(sandboxBackups, { recursive: true });
fs.mkdirSync(sandboxAttachments, { recursive: true });

// نسخة واحدة لكل عامل. غياب قاعدة التطوير ليس خطأً — يبقى الصندوق بلا مخطّط،
// وتفشل وحدها الاختبارات التي تحتاج عميلًا حقيقيًا، برسالة Prisma الواضحة.
if (!fs.existsSync(sandboxDb) && fs.existsSync(REAL_DEV_DB)) {
  fs.copyFileSync(REAL_DEV_DB, sandboxDb);
}

process.env.DATABASE_URL = 'file:' + sandboxDb.split(path.sep).join('/');
process.env.BACKUP_DIR = sandboxBackups;
process.env.ATTACHMENTS_DIR = sandboxAttachments;
process.env.DATA_DIR = sandbox;

/**
 * `env.ts` يُنهي العملية بـ`process.exit(1)` إن فشل تحقّق Zod. `JWT_SECRET` يأتي
 * اليوم من `.env`، لكن ربط الاختبارات بوجود ملف بيئة محلي هشّ — قيمة احتياطية
 * تجعلها تعمل على أي جهاز (بما فيه CI بلا `.env`). لا تُستبدل قيمة موجودة.
 */
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'test-only-secret-'.padEnd(64, '0');
}

// الفحص الأول: عند تهيئة كل ملف اختبار، قبل تحميل أي وحدة تطبيق.
assertSandboxed('تهيئة ملف الاختبار');

/**
 * الفحص الثاني: قبل **كل** حالة اختبار.
 *
 * ليس تكرارًا للأول: اختبار قد يعبث بالبيئة في `beforeEach` خاص به، أو عبر
 * `vi.stubEnv('DATABASE_URL', …)`، فيتسرّب من فحصٍ يجري مرّة واحدة عند التحميل.
 * هذا الحارس يجعل التسرّب مستحيلًا: أي حالة اختبار تبدأ ببيئة غير معزولة تفشل
 * فورًا برسالة تشرح ما حدث وأين المسار المسموح.
 */
beforeEach(() => {
  assertSandboxed('بداية حالة اختبار');
});
