import fs from 'fs';
import path from 'path';
import http from 'http';
import { snapshotDatabase, checkpointWal } from './dbIntegrity';
import { isBackendRunning, getInternalSecret } from './backendLauncher';

/**
 * نسخة الإنقاذ (Rescue Backup) — Cloud-Failure Local Backup Guarantee v1.
 *
 * القاعدة الوحيدة التي تفرضها هذه الوحدة: **فشل أي عملية سحابية لا يجوز أن يترك
 * المستخدم بلا نسخة احتياطية من لقطة قاعدة البيانات الحالية.** لا تعرف هذه الوحدة
 * شيئًا عن Google Drive ولا عن OAuth ولا عن خوارزمية المزامنة — تستقبل فقط مسار
 * قاعدة البيانات ومجلد النسخ، وتُنتج نسخة إنقاذ.
 *
 * ── نسخة إنقاذ، لا نسخة مجدولة ──────────────────────────────────────────────
 *
 * التصنيف `RESCUE` مستقلّ تمامًا عن `AUTO` (المجدولة) و`MANUAL` (اليدوية)، وهذا
 * الفصل بنيوي لا تجميلي:
 *
 *   • **الشرط**: النسخة المجدولة يحكمها إعداد `backup.auto.enabled`؛ نسخة الإنقاذ
 *     غير مشروطة. تعطيل الجدولة قرارٌ بشأن الروتين اليومي، لا تنازلٌ عن شبكة
 *     الأمان بعد فشل سحابي.
 *   • **الحالة**: نسخة الإنقاذ لا تُحدِّث `backup.auto.lastRunAt/lastStatus` — وإلا
 *     لبدت «آخر نسخة مجدولة» ناجحة بينما الجدولة لم تعمل إطلاقًا.
 *   • **الاحتفاظ**: لكلٍّ حدّه الخاص، فلا تُزاحم إحداهما الأخرى ولا تُحذف نسخة
 *     إنقاذ بسبب إعداد يخصّ الجدولة.
 *   • **الاسم**: بادئة `manar-rescue-` تجعل الأصل معروفًا من اسم الملف وحده على
 *     القرص، لا من سجلّ القاعدة فقط.
 *
 * ── لماذا مساران للإنتاج؟ ───────────────────────────────────────────────────
 *
 * المسار المُفضَّل هو خدمة النسخ الرسمية في الخادم الخلفي (`backupService.create`)
 * عبر `/api/internal/trigger-rescue-backup`: تُفرِّغ WAL، وتكتب في نفس مجلد النسخ،
 * **وتُسجّل صفًّا في جدول `Backup` بتصنيف RESCUE** فيظهر في سجلّ مركز النسخ.
 *
 * لكن أهمّ لحظة يفشل فيها الرفع هي **مزامنة الإغلاق**، وهي تعمل بعد إيقاف الخادم
 * الخلفي عمدًا (انظر `performShutdownSync`) — فلا وجود لخدمة HTTP حينها. الاعتماد
 * على المسار الرسمي وحده كان يعني: لا نسخة في اللحظة التي نحتاجها أكثر شيء.
 *
 * لذلك يوجد مسار ثانٍ: لقطة `VACUUM INTO` مباشرة إلى **نفس مجلد النسخ وبنفس صيغة
 * `.db`** التي تفهمها شاشة الاستعادة القائمة. ليس نظام نسخ جديد ولا صيغة جديدة ولا
 * موقع جديد — نفس المخزن ونفس التصنيف، بمُنتِج مختلف حين يتعذّر الأول.
 */

/** أي مسار أنتج نسخة الإنقاذ فعليًا — يُعرَض في السجلّ ليعرف المستخدم أين يجدها. */
export type RescueBackupVia = 'BACKEND_SERVICE' | 'DIRECT_SNAPSHOT';

export interface RescueBackupResult {
  ok: boolean;
  via: RescueBackupVia | null;
  fileName?: string;
  filePath?: string;
  sizeBytes?: number;
  error?: string;
}

const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 48211;
const BACKEND_TIMEOUT_MS = 15_000;

/**
 * Production Hardening Pack v1 — P0-8 · فصل نسخ المسار المباشر عن النسخ الرسمية.
 *
 * ── العطل الذي يغلقه ───────────────────────────────────────────────────────────
 *
 * كانت البادئة `manar-rescue-` **مشتركة** بين المسارين: مسار الخادم الخلفي (الذي
 * يُسجّل صفًّا في جدول `Backup` فتظهر النسخة في مركز النسخ الاحتياطي وتُستعاد من
 * داخل النظام) والمسار المباشر (ملف على القرص بلا سجلّ). ثم كان `pruneRescueSnapshots`
 * يحذف **كل** ما يبدأ بتلك البادئة بعد الأحدث 30 — أي أنه كان قادرًا على حذف ملفات
 * **مسجّلة في قاعدة البيانات**، فتبقى صفوفها تشير إلى ملفات غير موجودة: زرّ الاستعادة
 * يفشل، و«التحقق» يُرجع FAIL، والمستخدم يظنّ أن لديه نسخة وهي غير موجودة.
 *
 * القاعدة الآن مطلقة: **التقليم لا يمسّ أبدًا أي نسخة قابلة للاستعادة من داخل النظام.**
 * لكل مسار فضاء أسماء خاص به:
 *   • `manar-rescue-…`        ← الخادم الخلفي، مسجّلة في `Backup`، تُقلَّم من القاعدة
 *                                (`pruneAutoBackups(30,'RESCUE')`) التي تحذف الملف
 *                                والصفّ معًا، فلا يتيتّم أحدهما.
 *   • `manar-rescue-local-…`  ← المسار المباشر، بلا سجلّ، يُقلَّم هنا وحده.
 *
 * ملاحظة على النسخ القديمة: ملفات المسار المباشر التي أُنشئت قبل هذه الحزمة تحمل
 * البادئة القديمة، ولا يمكن تمييزها عن نسخ الخادم بالاسم وحده. لذلك لم تعد تُقلَّم
 * إطلاقًا — تُترك على القرص. ترك ملف زائد أهون بما لا يقاس من حذف نسخة يعتمد
 * عليها المستخدم، ومجموعتها مغلقة لا تنمو (كل نسخة جديدة تأخذ البادئة الجديدة).
 */
const RESCUE_PREFIX = 'manar-rescue-local-';
/** حدّ الاحتفاظ لنسخ المسار المباشر فقط (نسخ الخادم الخلفي محكومة بسياسة الاحتفاظ في القاعدة). */
const RESCUE_KEEP = 30;

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  );
}

interface TriggerResponse {
  status?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  backup?: { fileName?: string; filePath?: string; sizeBytes?: number } | null;
  error?: string | null;
}

/**
 * يستدعي خدمة النسخ الرسمية في الخادم الخلفي. يُرجع `null` إذا تعذّر الوصول إليها
 * أو لم تُنتج نسخة فعلية (متوقّفة، مهلة، أو الجدولة معطّلة) — فيتولّى المُستدعي
 * المسار المباشر. لا يرمي أبدًا: هذا مسار إنقاذ، لا يجوز أن يُفشِل نفسه.
 */
function requestBackendRescueBackup(): Promise<TriggerResponse | null> {
  return new Promise((resolve) => {
    const secret = getInternalSecret();
    if (!secret) return resolve(null);

    const payload = JSON.stringify({});
    const req = http.request(
      {
        hostname: BACKEND_HOST,
        port: BACKEND_PORT,
        path: '/api/internal/trigger-rescue-backup',
        method: 'POST',
        timeout: BACKEND_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-internal-secret': secret,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve((JSON.parse(data).data as TriggerResponse) ?? null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

/**
 * يُبقي أحدث `RESCUE_KEEP` نسخة من نسخ **المسار المباشر وحده** — تلك التي لا سجلّ
 * لها في قاعدة البيانات ولا تظهر في مركز النسخ. أي ملف لا يطابق `RESCUE_PREFIX`
 * حرفيًا لا يُمسّ إطلاقًا. أفضل جهد — لا يُفشل إنشاء النسخة.
 */
function pruneRescueSnapshots(backupDir: string): void {
  try {
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith(RESCUE_PREFIX) && f.endsWith('.db'))
      .map((f) => ({ f, at: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.at - a.at);
    for (const { f } of files.slice(RESCUE_KEEP)) {
      try { fs.unlinkSync(path.join(backupDir, f)); } catch { /* أفضل جهد */ }
    }
  } catch {
    /* أفضل جهد — تنظيف الاحتفاظ لا يجوز أن يُفشل إنشاء النسخة */
  }
}

/** لقطة متسقة مباشرة إلى مجلد النسخ القائم — مسار الإنقاذ حين لا يعمل الخادم الخلفي. */
async function createRescueSnapshot(dbPath: string, backupDir: string): Promise<RescueBackupResult> {
  const fileName = `${RESCUE_PREFIX}${timestamp()}.db`;
  const filePath = path.join(backupDir, fileName);

  try {
    fs.mkdirSync(backupDir, { recursive: true });
    // تفريغ WAL أولًا كما تفعل خدمة الخادم الخلفي — نفس ضمانة الاتساق.
    await checkpointWal(dbPath);
    // `VACUUM INTO` لا `copyFileSync`: لقطة متسقة معاملاتيًا حتى لو كانت هناك
    // كتابة جارية، وهي نفس الآلية التي يستخدمها مسار الرفع لتجهيز اللقطة.
    await snapshotDatabase(dbPath, filePath);

    const { size } = fs.statSync(filePath);
    if (size === 0) {
      try { fs.unlinkSync(filePath); } catch { /* أفضل جهد */ }
      return { ok: false, via: 'DIRECT_SNAPSHOT', error: 'اللقطة الناتجة فارغة' };
    }

    pruneRescueSnapshots(backupDir);
    return { ok: true, via: 'DIRECT_SNAPSHOT', fileName, filePath, sizeBytes: size };
  } catch (err) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* أفضل جهد */ }
    return { ok: false, via: 'DIRECT_SNAPSHOT', error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * ينشئ نسخة محلية بعد فشل عملية سحابية.
 *
 * يجرّب خدمة النسخ الرسمية أولًا (حين يعمل الخادم الخلفي)، وإلا — أو إن لم تُنتج
 * نسخة فعلية لأي سبب بما فيه كون النسخ التلقائي معطّلًا في الإعدادات — يسقط إلى
 * اللقطة المباشرة. إعداد «تعطيل النسخ التلقائي» يحكم الجدولة الدورية، لا نسخة
 * الإنقاذ بعد فشل سحابي: الضمانة هنا غير مشروطة عمدًا.
 *
 * لا يرمي أبدًا تحت أي ظرف — يُرجع `ok: false` مع السبب. المُستدعي (محرّك المزامنة)
 * يجب أن يبقى قادرًا على إكمال معالجة الفشل الأصلي مهما حدث هنا.
 */
export async function createRescueBackup(
  dbPath: string,
  backupDir: string,
): Promise<RescueBackupResult> {
  try {
    if (!fs.existsSync(dbPath)) {
      return { ok: false, via: null, error: 'ملف قاعدة البيانات المحلي غير موجود' };
    }

    if (isBackendRunning()) {
      const response = await requestBackendRescueBackup();
      if (response?.status === 'SUCCESS' && response.backup?.fileName) {
        return {
          ok: true,
          via: 'BACKEND_SERVICE',
          fileName: response.backup.fileName,
          filePath: response.backup.filePath,
          sizeBytes: response.backup.sizeBytes,
        };
      }
      // FAILED / SKIPPED / تعذّر الوصول ⇒ لا نتوقف: الضمانة غير مشروطة.
    }

    return await createRescueSnapshot(dbPath, backupDir);
  } catch (err) {
    return { ok: false, via: null, error: err instanceof Error ? err.message : String(err) };
  }
}
