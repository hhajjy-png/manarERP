import cron, { ScheduledTask } from 'node-cron';
import http from 'http';

const BACKEND_HOST = '127.0.0.1';
const BACKEND_PORT = 48211;

let task: ScheduledTask | null = null;
let storedSecret = '';

interface BackupSettings {
  enabled: boolean;
  time: string;
  retention: number;
  cronExpr: string;
}

function getFromInternal<T>(urlPath: string): Promise<T | null> {
  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: urlPath,
      method: 'GET',
      headers: { 'x-internal-secret': storedSecret },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve((json.data as T) ?? null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

/** نتيجة نداء داخلي: نجاح صريح، أو سبب فشل قابل للتسجيل. */
type InternalPostResult = { ok: true } | { ok: false; reason: string };

/**
 * كان هذا النداء يُحلّ الوعد من داخل `http.request(options, () => resolve())` — أي عند
 * وصول أي استجابة مهما كانت حالتها — ويُحلّه أيضًا على خطأ الشبكة. فلم يكن يرفض أبدًا،
 * ومن ثمّ كان `catch` في `runAutoBackup` شيفرةً ميتة: نسخة احتياطية فشلت بـ500، أو
 * رُفضت بـ401 لسرّ خاطئ، أو لم يكن الخادم يستمع أصلًا — كلها كانت تُسجَّل «تم تنفيذ
 * النسخ التلقائي». الآن نفحص رمز الحالة ونُعيد نتيجة صريحة، ونقرأ جسم الاستجابة لأن
 * المسار الداخلي يُعيد 200 مع `data.status === 'FAILED'` عند فشل النسخ نفسه.
 */
function postToInternal(urlPath: string, body: object): Promise<InternalPostResult> {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const options: http.RequestOptions = {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-internal-secret': storedSecret,
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          resolve({ ok: false, reason: `HTTP ${status}` });
          return;
        }
        try {
          const json = JSON.parse(data);
          if (json?.data?.status === 'FAILED') {
            resolve({ ok: false, reason: String(json.data.error ?? 'فشل غير محدّد') });
            return;
          }
        } catch {
          // جسم غير قابل للتحليل مع حالة 2xx: نعتبره نجاحًا كما كان، لا نُفشل الجدولة.
        }
        resolve({ ok: true });
      });
    });
    req.on('error', (err) => { resolve({ ok: false, reason: err.message }); });
    req.write(payload);
    req.end();
  });
}

async function getBackupSettings(): Promise<BackupSettings> {
  const defaults: BackupSettings = { enabled: true, time: '02:00', retention: 30, cronExpr: '0 2 * * *' };
  const result = await getFromInternal<BackupSettings>('/api/internal/backup-settings');
  return result ?? defaults;
}

// The backend performs the actual copy with PRAGMA wal_checkpoint(FULL) via backupService.create().
async function runAutoBackup(): Promise<void> {
  try {
    const result = await postToInternal('/api/internal/trigger-auto-backup', {});
    if (result.ok) {
      // eslint-disable-next-line no-console
      console.log('[backup] تم تنفيذ النسخ التلقائي عبر الخادم الخلفي');
    } else {
      // eslint-disable-next-line no-console
      console.error(`[backup] فشل النسخ التلقائي: ${result.reason}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[backup] فشل النسخ التلقائي:', err);
  }
}

/** بدء الجدولة بعد قراءة الإعدادات من الخادم الخلفي. */
export async function startBackupScheduler(secret: string): Promise<void> {
  storedSecret = secret;

  if (task) {
    task.stop();
    task = null;
  }

  const settings = await getBackupSettings();

  if (!settings.enabled) {
    // eslint-disable-next-line no-console
    console.log('[backup] النسخ التلقائي معطّل في الإعدادات');
    return;
  }

  const cronExpr = cron.validate(settings.cronExpr) ? settings.cronExpr : '0 2 * * *';
  task = cron.schedule(cronExpr, runAutoBackup, { timezone: 'Asia/Kuwait' });
  // eslint-disable-next-line no-console
  console.log(`[backup] جدولة النسخ التلقائي: ${cronExpr} (الاحتفاظ بـ ${settings.retention} نسخة)`);
}

/**
 * فحص ما إذا كانت نسخة احتياطية قد فاتت منذ آخر تشغيل للتطبيق.
 * يستعلم من قاعدة البيانات عبر الواجهة الداخلية بدلًا من مسح القرص،
 * لأن الأسماء والأنواع محفوظة في DB فقط بعد أن أصبح الخادم الخلفي يتولى النسخ.
 */
export async function runCatchupIfNeeded(secret: string): Promise<void> {
  storedSecret = secret;
  try {
    const settings = await getBackupSettings();
    if (!settings.enabled) return;

    const result = await getFromInternal<{ createdAt: string | null }>('/api/internal/last-auto-time');
    const lastBackupTime = result?.createdAt ? new Date(result.createdAt) : null;

    const now = new Date();
    const [hourStr, minuteStr] = settings.time.split(':');
    const hour = parseInt(hourStr, 10) || 2;
    const minute = parseInt(minuteStr, 10) || 0;

    // أقرب وقت مجدوَل سابق للحظة الراهنة (اليوم أو أمس)
    const todayScheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
    const lastScheduled = todayScheduled <= now
      ? todayScheduled
      : new Date(todayScheduled.getTime() - 86_400_000);

    if (!lastBackupTime || lastBackupTime < lastScheduled) {
      // eslint-disable-next-line no-console
      console.log('[backup] نسخة احتياطية مفقودة — تشغيل نسخة تعويضية عند بدء التطبيق');
      await runAutoBackup();
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[backup] فشل فحص النسخة التعويضية:', err);
  }
}

/** إعادة قراءة الإعدادات وإعادة تشغيل الجدولة (تُستدعى بعد تغيير الإعدادات). */
export async function reconfigureBackupScheduler(): Promise<void> {
  await startBackupScheduler(storedSecret);
}

export function stopBackupScheduler(): void {
  task?.stop();
  task = null;
}
