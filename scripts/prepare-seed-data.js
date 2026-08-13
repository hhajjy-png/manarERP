#!/usr/bin/env node
/**
 * Production Deployment Pack v1 — تجهيز البيانات المبدئية المُرفقة بالمثبّت.
 *
 * يُشغَّل ضمن `npm run dist` فقط. يُنتج:
 *
 *   build/seed-data/            → يُنسخ إلى `resources/seed-data` في التطبيق المُثبَّت،
 *                                 ويُقرأ عند أول تشغيل عبر `dataDirBootstrap.ts`.
 *   electron/resources/gdrive-oauth-client.json
 *                               → بيانات عميل OAuth المُجمَّعة (Google Drive Deployment
 *                                 Pack v1)، تُشتق من تهيئة التطوير إن لم تكن موجودة.
 *
 * ويتحقق من صلاحية قاعدة البيانات المبدئية قبل السماح بالتغليف.
 *
 * ── ما لا يُنقل عمدًا ──────────────────────────────────────────────────────────
 * `gdrive-token.dat` (مُعمّى بـDPAPI لهذا الجهاز/المستخدم — لا يُفكّ على جهاز آخر)،
 * `device-identity.json` (يجب أن تكون هوية الجهاز الجديد جديدة)، `security.json`
 * (سرّ JWT يُولَّد لكل تثبيت). التفصيل الكامل في `electron/services/dataDirBootstrap.ts`.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE_DATA_DIR = path.join(REPO_ROOT, 'backend', 'data');
const SEED_OUT_DIR = path.join(REPO_ROOT, 'build', 'seed-data');
const TEMPLATE_DB = path.join(SOURCE_DATA_DIR, 'manar.db');

const DEV_OAUTH_CLIENT = path.join(SOURCE_DATA_DIR, 'gdrive-client.json');
const PACKAGED_OAUTH_CLIENT = path.join(REPO_ROOT, 'electron', 'resources', 'gdrive-oauth-client.json');

/**
 * Data Safety Pack v2 — F-03 · اسم بيان القالب الذهبي.
 * يجب أن يطابق `GOLDEN_MANIFEST_FILENAME` في electron/services/goldenManifest.ts.
 */
const GOLDEN_MANIFEST_FILENAME = 'golden-manifest.json';

/** لواحق ملفات SQLite الجانبية — وجودها يعني معاملة مفتوحة أو قاعدة قيد الاستخدام. */
const HOT_JOURNAL_SUFFIXES = ['-wal', '-shm', '-journal'];

function log(msg) {
  console.log(`[seed-data] ${msg}`);
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * يتأكد أن قاعدة القالب صالحة للشحن.
 *
 * الخطر الحقيقي: نسخ ملف SQLite بينما التطبيق يعمل يُنتج قاعدة مبتورة تُثبَّت على
 * الجهاز الجديد فتفشل عند أول استعلام. وجود أي ملف journal جانبي دليل مباشر على
 * ذلك — نفشل عند البناء لا عند المستخدم.
 */
function verifyTemplateDatabase() {
  if (!fs.existsSync(TEMPLATE_DB)) {
    throw new Error(`قاعدة البيانات المبدئية غير موجودة: ${TEMPLATE_DB}`);
  }

  const hot = HOT_JOURNAL_SUFFIXES
    .map((s) => TEMPLATE_DB + s)
    .filter((p) => fs.existsSync(p));
  if (hot.length > 0) {
    throw new Error(
      'قاعدة البيانات المبدئية قيد الاستخدام (ملفات journal جانبية موجودة):\n' +
        hot.map((p) => '  • ' + path.relative(REPO_ROOT, p)).join('\n') +
        '\nأغلق نظام المنار (تطوير أو مُثبَّت) ثم أعد البناء.',
    );
  }

  const buf = fs.readFileSync(TEMPLATE_DB, { encoding: null });
  // ترويسة ملف SQLite 3 القياسية — 16 بايت تشمل الصفر الخاتم.
  const header = buf.subarray(0, 16).toString('latin1');
  if (header !== 'SQLite format 3\0') {
    throw new Error('قاعدة البيانات المبدئية ليست ملف SQLite صالحًا (ترويسة غير مطابقة).');
  }
  if (buf.length < 4096) {
    throw new Error('قاعدة البيانات المبدئية صغيرة بشكل غير معقول — يُرجّح أنها تالفة.');
  }

  // `mtime` يُقرأ **هنا وحده**، على جهاز البناء حيث الملف مرجعي وطازج، ثم يُجمَّد
  // داخل البيان. لا يُقرأ وقت التشغيل أبدًا: `mtime` الملف المشحون قد يتغيّر بفكّ
  // ضغط المثبّت أو النسخ أو الأرشفة، فيُنتج ادّعاء أحدثية كاذبًا في الاتجاهين.
  return {
    sizeBytes: buf.length,
    sha256: sha256(TEMPLATE_DB),
    dataModifiedAt: fs.statSync(TEMPLATE_DB).mtime.toISOString(),
  };
}

/**
 * يضمن وجود تهيئة عميل OAuth المُجمَّعة مع الحزمة.
 *
 * إن لم توجد، تُشتق من تهيئة التطوير (`backend/data/gdrive-client.json`) — وهو
 * نفس عميل Desktop المسجّل في Google Cloud لهذا التطبيق. سرّ عميل Desktop ليس
 * سرًا خادميًا في نموذج Google للتطبيقات المثبَّتة: يُعرّف التطبيق لا المستخدم،
 * ولا يمنح وحده وصولًا إلى أي حساب. انظر electron/resources/README.md.
 */
function ensurePackagedOAuthClient() {
  if (fs.existsSync(PACKAGED_OAUTH_CLIENT)) {
    return { action: 'exists' };
  }
  if (!fs.existsSync(DEV_OAUTH_CLIENT)) {
    throw new Error(
      'تهيئة عميل OAuth مفقودة تمامًا:\n' +
        `  • المُجمَّعة: ${path.relative(REPO_ROOT, PACKAGED_OAUTH_CLIENT)}\n` +
        `  • التطوير  : ${path.relative(REPO_ROOT, DEV_OAUTH_CLIENT)}\n` +
        'بلا أحدهما تُبنى نسخة إنتاجية بلا مزامنة سحابية. راجع electron/resources/README.md.',
    );
  }

  const raw = JSON.parse(fs.readFileSync(DEV_OAUTH_CLIENT, 'utf8'));
  if (typeof raw.clientId !== 'string' || !raw.clientId || typeof raw.clientSecret !== 'string' || !raw.clientSecret) {
    throw new Error(`تهيئة عميل OAuth للتطوير ناقصة الحقول: ${path.relative(REPO_ROOT, DEV_OAUTH_CLIENT)}`);
  }

  fs.mkdirSync(path.dirname(PACKAGED_OAUTH_CLIENT), { recursive: true });
  fs.writeFileSync(
    PACKAGED_OAUTH_CLIENT,
    JSON.stringify({ clientId: raw.clientId, clientSecret: raw.clientSecret }, null, 2) + '\n',
    'utf8',
  );
  return { action: 'derived' };
}

/**
 * Data Safety Pack v2 — F-03/F-04 · يُنتج مجلد `seed-data` المشحون.
 *
 * ── ما تغيّر ───────────────────────────────────────────────────────────────────
 *
 * كان هذا المجلد يحمل `sync-metadata.json` و`gdrive-account.json` **من جهاز البناء**،
 * فيُنسخان إلى مجلد بيانات المستخدم عند أول تشغيل. الأثر:
 *   • `sync-metadata.json` يمنح الجهاز الجديد `lastSyncedHash` لم يكسبه ⇒ القرار
 *     التالي يصير `UPLOAD` صامتًا بدل `CONFLICT` آمن.
 *   • `gdrive-account.json` يسرّب بريد حساب Google للمطوّر بلا أي فائدة وظيفية.
 * كلاهما حُذف نهائيًا (F-04).
 *
 * المجلد الآن يحمل **بيان القالب فقط**: وصفٌ للقاعدة المشحونة نفسها — لا لجهاز
 * البناء ولا لحساب أحد — يُقرأ من `resources` مباشرة ولا يُنسخ إلى مجلد المستخدم.
 */
function stageSeedFiles(dbInfo) {
  fs.rmSync(SEED_OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SEED_OUT_DIR, { recursive: true });

  const manifest = {
    sha256: dbInfo.sha256,
    sizeBytes: dbInfo.sizeBytes,
    dataModifiedAt: dbInfo.dataModifiedAt,
    packagedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(SEED_OUT_DIR, GOLDEN_MANIFEST_FILENAME),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8',
  );

  // ملف وصف — تشخيصي بحت، يُقرأ يدويًا عند تدقيق نسخة إنتاجية.
  fs.writeFileSync(
    path.join(SEED_OUT_DIR, 'README.txt'),
    [
      'Al Manar ERP — بيان القالب الذهبي المُرفق بالمثبّت.',
      '',
      'يصف هذا المجلد قاعدة البيانات المبدئية المشحونة (بصمتها وحجمها وتاريخ آخر',
      'تعديل لبياناتها). يُقرأ من مكانه ولا يُنسخ إلى مجلد بيانات المستخدم.',
      '',
      'لا يحتوي على أي بيانات جهاز أو حساب أو رمز وصول أو سرّ.',
      '',
      'الملفات: ' + GOLDEN_MANIFEST_FILENAME,
    ].join('\r\n'),
    'utf8',
  );

  return manifest;
}

function main() {
  const db = verifyTemplateDatabase();
  log(`قاعدة البيانات المبدئية صالحة — ${(db.sizeBytes / 1024 / 1024).toFixed(2)} MB · sha256 ${db.sha256.slice(0, 16)}…`);

  const oauth = ensurePackagedOAuthClient();
  log(
    oauth.action === 'derived'
      ? 'اشتُقّت تهيئة عميل OAuth المُجمَّعة من تهيئة التطوير.'
      : 'تهيئة عميل OAuth المُجمَّعة موجودة مسبقًا — لم تُمسّ.',
  );

  const manifest = stageSeedFiles(db);
  log(
    `جُهِّز build/seed-data — بيان القالب الذهبي: ` +
      `sha256 ${manifest.sha256.slice(0, 16)}… · آخر تعديل للبيانات ${manifest.dataModifiedAt}`,
  );
  log('لم تُشحن أي بيانات حالة من جهاز البناء (Data Safety Pack v2 — F-04).');
}

if (require.main === module) main();

module.exports = {
  verifyTemplateDatabase,
  ensurePackagedOAuthClient,
  stageSeedFiles,
  GOLDEN_MANIFEST_FILENAME,
};
