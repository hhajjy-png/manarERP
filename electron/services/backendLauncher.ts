import { app, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { fork, ChildProcess } from 'child_process';
import { randomBytes, randomUUID } from 'crypto';
import { markSeeded, sha256FileSync } from './dbBootstrapState';
import { ensureDataLayout, seedCompanionFiles } from './dataDirBootstrap';
import {
  BackendStartupError as BackendStartupErrorImpl,
  appendStderrTail,
  readBackendErrorLogTail,
  waitForHealth as waitForHealthImpl,
} from './backendReadiness.pure';

let backendProcess: ChildProcess | null = null;
let appQuitting = false;
app.on('before-quit', () => { appQuitting = true; });

// يمنع إعادة تشغيل متعمَّدة للخادم (مثلًا: استبدال قاعدة البيانات أثناء المزامنة)
// من إثارة معالج "توقّف غير متوقع" أدناه — الإيقاف هنا مقصود ومؤقت، وليس عطلًا.
let restartingBackend = false;

/**
 * السرّ الداخلي المستخدم للتحقق من نداءات `/api/internal/*` (الجدولة التلقائية،
 * إعادة تشغيل الخادم أثناء المزامنة). يُنشأ مرّة واحدة لعمر العملية ويُعاد
 * استخدامه دائمًا — تغييره بين عمليات تشغيل الخادم الخلفي يُبطل مصادقة أي
 * مستدعٍ ما زال يحمل القيمة القديمة (مثل جدولة النسخ الاحتياطي).
 */
let cachedInternalSecret: string | null = null;
export function getInternalSecret(): string {
  if (!cachedInternalSecret) cachedInternalSecret = randomUUID();
  return cachedInternalSecret;
}

/** هل الخادم الخلفي يعمل حاليًا؟ — يُستخدم لتحديد ما إذا كانت قاعدة البيانات "قيد الاستخدام" فعليًا. */
export function isBackendRunning(): boolean {
  return !!backendProcess && !backendProcess.killed;
}

/**
 * تحديد مسارات البيانات حسب البيئة:
 * - التطوير: داخل backend/data (نفس قاعدة البيانات التي طُبّقت عليها الترحيلات والبيانات الأولية).
 * - الإنتاج: داخل مجلد بيانات المستخدم (userData)؛ وعند أول تشغيل تُنسخ قاعدة بيانات
 *   مبدئية مُهيّأة (template) المرفقة مع التطبيق إن لم تكن موجودة.
 */
// process.resourcesPath متاح في Electron لكنه غير معرّف في أنواع Node
const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? process.cwd();

export function getUserDataPaths() {
  const isDev = !app.isPackaged;
  const backendCwd = isDev
    ? path.join(__dirname, '..', '..', 'backend')
    : path.join(resourcesPath, 'backend');

  let dataDir: string;
  if (isDev) {
    dataDir = path.join(backendCwd, 'data');
  } else {
    dataDir = path.join(app.getPath('userData'), 'data');
  }

  const backupDir = path.join(dataDir, 'backups');
  const dbPath = path.join(dataDir, 'manar.db');
  const attachmentsDir = path.join(dataDir, 'attachments');

  // التهيئة **مرة واحدة لعمر العملية**. هذه الدالة تُستدعى من كل نداء IPC
  // (حالة المزامنة، النسخ الاحتياطي، المرفقات) — أي عشرات المرات في الدقيقة
  // أثناء فتح صفحة المزامنة. تكرار إنشاء المجلدات وفحص البذر مع كل نداء عملٌ
  // قرصي بلا أي أثر بعد المرة الأولى، ويحوّل تحذير نسخٍ فاشل إلى فيضان سجلّ.
  if (!bootstrapDone) {
    bootstrapDone = true;
    bootstrapDataDir(isDev, backendCwd, dataDir, dbPath);
  }

  return { isDev, backendCwd, dataDir, dbPath, backupDir, attachmentsDir };
}

/** صحيح بعد أول تهيئة ناجحة لمجلد البيانات — انظر التعليق في `getUserDataPaths`. */
let bootstrapDone = false;

/**
 * تهيئة مجلد البيانات عند أول تشغيل: المجلدات، ثم قاعدة البيانات المبدئية، ثم
 * ملفات الحالة المرافقة. كل خطوة **إضافية بحتة** — لا تستبدل شيئًا موجودًا.
 */
function bootstrapDataDir(isDev: boolean, backendCwd: string, dataDir: string, dbPath: string): void {
  // كل مجلدات البيانات دفعةً واحدة — إضافية بحتة، لا تمسّ موجودًا.
  ensureDataLayout(dataDir);

  // في الإنتاج: انسخ قاعدة البيانات المبدئية المُهيّأة عند أول تشغيل
  if (!isDev && !fs.existsSync(dbPath)) {
    const templateDb = path.join(backendCwd, 'data', 'manar.db');
    if (fs.existsSync(templateDb)) {
      try {
        fs.copyFileSync(templateDb, dbPath);
        // وسم البذرة **في نفس اللحظة** التي نُسخت فيها — هذه هي اللحظة الوحيدة
        // التي نعرف فيها يقينًا أن هذه قاعدة قالب لا قاعدة مستخدم. بدونها كانت
        // مزامنة البدء تعامل القالب كتغيير محلي وتُنتج CONFLICT يسمح برفعه فوق
        // نسخة Drive الحقيقية. انظر `dbBootstrapState.ts`.
        markSeeded(dataDir, sha256FileSync(dbPath), templateDb);
        // eslint-disable-next-line no-console
        console.log(`[DB] تم نسخ قاعدة البيانات المبدئية إلى: ${dbPath} (موسومة كبذرة تهيئة)`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[DB] فشل نسخ قاعدة البيانات المبدئية:`, err);
      }
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[DB] لم يُعثر على قاعدة البيانات المبدئية في: ${templateDb}`);
    }
  }

  // ملفات الحالة المرافقة (سجلّ المزامنة وربط ملف Drive) — الناقصة فقط، في
  // الإنتاج وحده. في التطوير `dataDir` هو مجلد عمل المطوّر ولا يُبذَر أبدًا.
  if (!isDev) {
    const seeded = seedCompanionFiles(dataDir, path.join(resourcesPath, 'seed-data'));
    if (seeded.copied.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[Bootstrap] نُسخت ملفات الحالة المبدئية: ${seeded.copied.join(', ')}`);
    }
    for (const f of seeded.failed) {
      // eslint-disable-next-line no-console
      console.warn(`[Bootstrap] تعذّر نسخ ${f.file}: ${f.error} — يُنشأ تلقائيًا عند الحاجة.`);
    }
  }
}

/**
 * مسار قاعدة القالب المشحونة مع المثبّت — أو `null` حين لا ينطبق مفهوم «القالب».
 *
 * تُستخدم كشبكة أمان لاكتشاف بذرة أول تشغيل حتى لو فُقد ملف حالة الـbootstrap
 * (انظر `isPristineSeed`). وترجع `null` في حالتين حاسمتين:
 *
 *   • **بيئة التطوير:** `dataDir` هناك هو `backendCwd/data` نفسه، فمسار «القالب»
 *     و`dbPath` **نفس الملف حرفيًا** — والمقارنة كانت ستُصنّف قاعدة المطوّر
 *     الحقيقية بذرةً وتقترح استبدالها من Drive. فحص `path.resolve` أدناه هو
 *     الحارس الفعلي، و`isDev` تأكيد إضافي.
 *   • **غياب القالب:** لا مرجع للمقارنة.
 */
export function getSeedTemplatePath(): string | null {
  const { isDev, backendCwd, dbPath } = getUserDataPaths();
  if (isDev) return null;
  const templateDb = path.join(backendCwd, 'data', 'manar.db');
  if (path.resolve(templateDb) === path.resolve(dbPath)) return null;
  return fs.existsSync(templateDb) ? templateDb : null;
}

/** تحويل المسار إلى صيغة URL مقبولة بـ SQLite (شرطات أمامية — مهم على Windows). */
function toFileUrl(absPath: string): string {
  return 'file:' + absPath.replace(/\\/g, '/');
}

/**
 * يُعيد سر JWT الخاص بهذه النسخة المثبّتة.
 *
 * الأولوية:
 *   1. process.env.JWT_SECRET — إذا عُيِّن صراحةً (تطوير مستقل، CI).
 *   2. dataDir/security.json   — إعادة استخدام السر المولَّد مسبقًا.
 *   3. توليد سر جديد وحفظه   — عند أول تشغيل أو إذا كان الملف تالفًا.
 *
 * السر لا يُسجَّل ولا يُكشف للواجهة الأمامية.
 * إذا كان الملف تالفًا، يُولَّد سر جديد وتصبح الجلسات الحالية غير صالحة.
 */
const isValidJwtSecret = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{128}$/i.test(value);

function getOrCreateJwtSecret(dataDir: string): string {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  const securityPath = path.join(dataDir, 'security.json');

  if (fs.existsSync(securityPath)) {
    try {
      const raw = fs.readFileSync(securityPath, 'utf8');
      const config = JSON.parse(raw) as { jwtSecret?: unknown };
      if (isValidJwtSecret(config.jwtSecret)) {
        return config.jwtSecret;
      }
    } catch {
      // الملف تالف — يُولَّد سر جديد؛ الجلسات الحالية تصبح غير صالحة.
    }
  }

  const jwtSecret = randomBytes(64).toString('hex');
  fs.mkdirSync(path.dirname(securityPath), { recursive: true });
  fs.writeFileSync(securityPath, JSON.stringify({ jwtSecret }, null, 2), {
    mode: 0o600,
    encoding: 'utf8',
  });
  return jwtSecret;
}

/**
 * تشغيل الخدمة الخلفية (Express) كعملية فرعية مع تمرير متغيرات البيئة.
 */
export function startBackend(
  internalSecret = '',
  /**
   * يُستدعى بالثواني المنقضية أثناء انتظار جاهزية الخدمة. اختياري تمامًا —
   * الإقلاع يعمل بدونه؛ وجوده يجعل الانتظار مرئيًا في نافذة بدء التشغيل بدل
   * أن يكون صمتًا.
   */
  onProgress?: (elapsedSeconds: number) => void,
): Promise<void> {
  const { isDev, backendCwd, dataDir, dbPath, backupDir, attachmentsDir } = getUserDataPaths();

  const databaseUrl = toFileUrl(dbPath);

  // تسجيل واضح لمسار قاعدة البيانات المستخدمة
  // eslint-disable-next-line no-console
  console.log(`[DB] بيئة التشغيل: ${isDev ? 'تطوير' : 'إنتاج'}`);
  // eslint-disable-next-line no-console
  console.log(`[DB] مسار قاعدة البيانات: ${dbPath}`);
  // eslint-disable-next-line no-console
  console.log(`[DB] DATABASE_URL: ${databaseUrl}`);

  const entry = isDev
    ? path.join(backendCwd, 'src', 'server.ts')
    : path.join(backendCwd, 'dist', 'server.js');

  const env = {
    ...process.env,
    // مهم جدًا: يجعل ثنائي Electron يعمل كـ Node عند تشغيل العملية الفرعية
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: isDev ? 'development' : 'production',
    DATABASE_URL: databaseUrl,
    BACKUP_DIR: backupDir,
    DATA_DIR: dataDir,
    /**
     * حاسم في الإنتاج: الخدمة الخلفية تحلّ `ATTACHMENTS_DIR` نسبةً إلى
     * `process.cwd()` — وهو مجلد التثبيت هناك. بلا هذا السطر كانت المرفقات
     * تُكتب **داخل مجلد التثبيت** (يُمحى مع إلغاء التثبيت أو الترقية، وقد يكون
     * غير قابل للكتابة أصلًا)، بينما تبحث عنها طبقة Electron في
     * `userData/data/attachments` — فلا يُفتح أي مرفق أبدًا. تمرير مسار مطلق
     * هنا يجعل الطرفين يشيران إلى المجلد نفسه تحت `%AppData%`.
     */
    ATTACHMENTS_DIR: attachmentsDir,
    PORT: '48211',
    HOST: '127.0.0.1',
    JWT_SECRET: getOrCreateJwtSecret(dataDir),
    INTERNAL_SECRET: internalSecret,
  };

  return new Promise((resolve, reject) => {
    const child = fork(entry, [], {
      cwd: backendCwd,
      env,
      execArgv: isDev ? ['--import', 'tsx', '--watch', '--watch-preserve-output'] : [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    backendProcess = child;

    // آخر أسطر الخطأ تُحتفظ للتشخيص: في التطبيق المُعبَّأ لا يصل stderr إلى أي
    // طرفية، فبلا هذا يضيع السبب الحقيقي لأي انهيار مبكر ولا يبقى إلا «تعذّر
    // التشغيل». تُعرض في حوار الفشل وتُكتب في السجلّ.
    const stderrTail: string[] = [];

    child.stdout?.on('data', (d) => process.stdout.write(`[backend] ${d}`));
    child.stderr?.on('data', (d) => {
      const text = String(d);
      appendStderrTail(stderrTail, text);
      process.stderr.write(`[backend] ${text}`);
    });

    /**
     * خروج مبكر = فشل **نهائي ومعروف السبب**. لا معنى لانتظار المهلة كاملة بعده:
     * العملية ماتت ولن تستجيب أبدًا. الانتظار كان يحوّل انهيارًا فوريًا واضحًا إلى
     * «مهلة» غامضة بعد عشرات الثواني، ويُخفي رمز الخروج ورسالة الخطأ الحقيقية.
     */
    let settled = false;
    const finishOnce = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    /**
     * السبب الحقيقي في الإنتاج يعيش في `error.log` لا في stderr (منقل طرفية
     * winston معطَّل في الإنتاج). يُقرأ **لحظة الفشل** لا قبله، فيلتقط ما كتبته
     * الخدمة قبل موتها مباشرة.
     */
    const logTailNow = () => readBackendErrorLogTail(dataDir, (p) => fs.readFileSync(p, 'utf8'));

    const onEarlyExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finishOnce(() =>
        reject(
          new BackendStartupErrorImpl('توقفت الخدمة الخلفية أثناء بدء التشغيل.', {
            exitCode: code,
            signal,
            stderrTail: [...stderrTail],
            logTail: logTailNow(),
            dataDir,
          }),
        ),
      );
    };

    child.on('error', (err) =>
      finishOnce(() =>
        reject(
          new BackendStartupErrorImpl('تعذّر تشغيل عملية الخدمة الخلفية.', {
            exitCode: null,
            signal: null,
            stderrTail: [...stderrTail, err.message],
            logTail: logTailNow(),
            dataDir,
          }),
        ),
      ),
    );
    child.once('exit', onEarlyExit);

    waitForHealthImpl({
      isChildAlive: () => !child.killed && child.exitCode === null,
      onProgress,
    })
      .then(() => {
        finishOnce(() => {
          // انتهت مرحلة البدء: يُنزع حارس الخروج المبكر ويحلّ محلّه معالج
          // «توقّف غير متوقع» الذي يخصّ ما بعد الإقلاع.
          child.off('exit', onEarlyExit);
          child.on('exit', (code, signal) => {
            if (appQuitting || restartingBackend) return;
            // eslint-disable-next-line no-console
            console.error(`[backend] توقفت الخدمة بشكل غير متوقع — code=${code} signal=${signal}`);
            dialog.showMessageBoxSync({
              type: 'error',
              title: 'خطأ في نظام المنار',
              message: 'توقفت الخدمة الخلفية بشكل غير متوقع.',
              detail: 'سيتم إغلاق التطبيق. يرجى إعادة تشغيله.',
              buttons: ['حسناً'],
            });
            app.quit();
          });
          resolve();
        });
      })
      .catch((err: unknown) =>
        finishOnce(() =>
          reject(
            err instanceof BackendStartupErrorImpl
              ? err
              : new BackendStartupErrorImpl('تعذّر تشغيل الخدمة الخلفية.', {
                  exitCode: null,
                  signal: null,
                  stderrTail: [...stderrTail],
                  logTail: logTailNow(),
                  dataDir,
                }),
          ),
        ),
      );
  });
}

// منطق الجاهزية نفسه يعيش في `backendReadiness.pure.ts` — يُعاد تصديره هنا
// ليبقى `backendLauncher` هو الواجهة الوحيدة التي يستوردها بقية التطبيق.
export {
  BackendStartupError,
  waitForHealth,
  type BackendStartupFailure,
  type WaitForHealthOptions,
} from './backendReadiness.pure';

/** إيقاف الخدمة الخلفية بأمان. */
export function stopBackend(): void {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    backendProcess = null;
  }
}

/**
 * إيقاف مضبوط للخادم الخلفي مع انتظار خروج العملية فعليًا (لا مجرّد إرسال
 * إشارة الإيقاف) — يُستخدم قبل استبدال ملف قاعدة البيانات (مزامنة Google Drive)
 * حيث يجب تحرير قفل الملف على مستوى نظام التشغيل قبل محاولة استبداله، لا مجرّد
 * افتراض تحرّره بعد تأخير ثابت. لا يُثير معالج "توقّف غير متوقع" في startBackend.
 */
export async function stopBackendForRestart(timeoutMs = 5000): Promise<void> {
  const proc = backendProcess;
  if (!proc || proc.killed) {
    backendProcess = null;
    return;
  }

  restartingBackend = true;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    proc.once('exit', () => {
      clearTimeout(timer);
      finish();
    });
    proc.kill();
  });
  backendProcess = null;
  restartingBackend = false;
}
