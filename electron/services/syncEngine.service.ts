import fs from 'fs';
import path from 'path';
import type { OAuth2Client } from 'google-auth-library';
import {
  loadClientCredentials,
  createOAuthClient,
  isAuthenticated,
  getStoredAccountEmail,
  runAuthFlow,
  revokeAuth,
  type DriveClientCredentials,
} from './googleDriveAuth.service';
import {
  findRemoteSyncFile,
  uploadDatabase,
  downloadDatabase,
  checkConnectivity,
  isRetryableSyncError,
} from './googleDriveApi.service';
import { checkSqliteIntegrity, checkpointWal, snapshotDatabase, sha256File } from './dbIntegrity';
import { isPristineSeed, markBootstrapComplete } from './dbBootstrapState';
import { withRetry } from './retry';
import { getOrCreateDeviceIdentity } from './deviceIdentity.service';
import { isBackendRunning, stopBackendForRestart, startBackend, getInternalSecret, getSeedTemplatePath } from './backendLauncher';
import { emitSyncProgress } from './syncProgressBus';

/**
 * محرّك المزامنة — يُنسّق بين المصادقة وطبقة Drive API وفحوصات السلامة.
 * معزول تمامًا عن منطق الأعمال: لا يعرف شيئًا عن Prisma أو الخادم الخلفي،
 * يتعامل فقط مع ملف قاعدة البيانات كملف ثنائي.
 *
 * ملاحظة تعارض: لا يوجد حل تلقائي للتعارضات (خارج نطاق هذه الحزمة عمدًا).
 * إن تغيّرت النسختان المحلية والسحابية معًا منذ آخر مزامنة، تتوقف المزامنة
 * التلقائية عن التصرّف وتُبلّغ عن التعارض؛ القرار النهائي يبقى للمستخدم عبر
 * حوار حلّ التعارض (Google Drive Conflict Resolution Pack v1).
 */

export type SyncStatus =
  | 'READY'
  | 'CHECKING'
  | 'DOWNLOADING'
  | 'UPLOADING'
  | 'COMPLETED'
  | 'FAILED'
  | 'OFFLINE'
  | 'CONFLICT';

interface SyncLogEntry {
  at: string;
  action: 'UPLOAD' | 'DOWNLOAD' | 'AUTH' | 'DISCONNECT' | 'CONFLICT';
  result: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'RETRY';
  message: string;
  /** الجهاز الذي نفّذ هذا الإدخال — الجهاز الحالي دائمًا (السجلّ محلي لكل جهاز). */
  deviceId?: string;
  deviceName?: string;
  /** موجودة فقط عند كون هذا الإدخال نتيجة حلّ تعارض. */
  conflictResolved?: boolean;
  resolutionSelected?: 'LOCAL' | 'REMOTE';
}

interface SyncMetadata {
  /** بصمة **البايتات المرفوعة/المنزَّلة** (هوية النسخة السحابية). */
  lastSyncedHash: string | null;
  /**
   * بصمة **الملف المحلي** لحظة آخر مزامنة ناجحة.
   *
   * كانت الاثنتان متطابقتين حين كان الرفع نسخًا مباشرًا للملف. بعد التحوّل إلى
   * لقطة `VACUUM INTO` (تُعيد كتابة الصفحات فتختلف البايتات عن الأصل) صارتا
   * هويتين مختلفتين: بصمة اللقطة تُعرِّف النسخة السحابية، وبصمة الملف المحلي
   * تُعرِّف «آخر حالة محلية معروفة أنها مُزامَنة».
   *
   * بدون هذا الفصل كان `localChanged` يبقى `true` أبدًا بعد أي رفع — فيُعاد
   * الرفع في كل إغلاق، والأخطر: يُنتج **تعارضًا كاذبًا** لو تغيّرت النسخة
   * السحابية من جهاز آخر.
   *
   * `null` في البيانات القديمة ⇒ نعود إلى `lastSyncedHash` (سلوك ما قبل التغيير).
   */
  lastSyncedLocalHash?: string | null;
  lastSyncedFileId: string | null;
  /** رقم النسخة (revision) التصاعدي الذي اتفق عليه آخر مزامنة ناجحة — مُعرِّف نسخة محلي/سحابي مبسّط. */
  lastSyncedVersion: number | null;
  lastSyncAt: string | null;
  lastUploadAt: string | null;
  lastDownloadAt: string | null;
  lastError: string | null;
  log: SyncLogEntry[];
}

const DEFAULT_METADATA: SyncMetadata = {
  lastSyncedHash: null,
  lastSyncedFileId: null,
  lastSyncedVersion: null,
  lastSyncAt: null,
  lastUploadAt: null,
  lastDownloadAt: null,
  lastError: null,
  log: [],
};

const MAX_LOG_ENTRIES = 50;
const STARTUP_TIMEOUT_MS = 8000;
const SHUTDOWN_TIMEOUT_MS = 20000;

let currentStatus: SyncStatus = 'READY';
let currentMessage = '';

function setStatus(status: SyncStatus, message = ''): void {
  currentStatus = status;
  currentMessage = message;
  emitSyncProgress(status, message);
}

function metadataPath(dataDir: string): string {
  return path.join(dataDir, 'sync-metadata.json');
}

function loadMetadata(dataDir: string): SyncMetadata {
  const file = metadataPath(dataDir);
  if (!fs.existsSync(file)) return { ...DEFAULT_METADATA, log: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<SyncMetadata>;
    return { ...DEFAULT_METADATA, ...raw, log: raw.log ?? [] };
  } catch {
    return { ...DEFAULT_METADATA, log: [] };
  }
}

function saveMetadata(dataDir: string, metadata: SyncMetadata): void {
  fs.writeFileSync(metadataPath(dataDir), JSON.stringify(metadata, null, 2), { mode: 0o600 });
}

/** يُلحق إدخالًا بالسجلّ مع وسم الجهاز الحالي تلقائيًا — مصدر واحد لهوية الجهاز في كل السجلّ. */
function appendLog(
  dataDir: string,
  metadata: SyncMetadata,
  entry: Omit<SyncLogEntry, 'at' | 'deviceId' | 'deviceName'>,
): SyncMetadata {
  const device = getOrCreateDeviceIdentity(dataDir);
  const log = [
    { at: new Date().toISOString(), deviceId: device.deviceId, deviceName: device.deviceName, ...entry },
    ...metadata.log,
  ].slice(0, MAX_LOG_ENTRIES);
  return { ...metadata, log };
}

/**
 * خيارات إعادة المحاولة القياسية لنداءات Google Drive الشبكية — تُسجّل كل محاولة
 * في سجلّ المزامنة الدائم وفي رسالة الحالة الحيّة، وتُصنّف الأعطال المؤقتة عبر
 * `isRetryableSyncError` (شبكة/مهلة/5xx/429 فقط — أعطال المصادقة لا تُعاد أبدًا).
 */
function driveRetryOptions(dataDir: string, action: 'UPLOAD' | 'DOWNLOAD') {
  return {
    isRetryable: isRetryableSyncError,
    onRetry: (attempt: number, err: unknown, delayMs: number) => {
      const reason = err instanceof Error ? err.message : String(err);
      const message = `محاولة ${attempt} فشلت مؤقتًا — إعادة المحاولة خلال ${Math.round(delayMs / 1000)} ثانية: ${reason}`;
      setStatus(currentStatus, message);
      saveMetadata(dataDir, appendLog(dataDir, loadMetadata(dataDir), { action, result: 'RETRY', message }));
    },
  };
}

function isFileLockError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'EPERM' || code === 'EBUSY';
}

/**
 * خيارات إعادة محاولة استبدال ملف قاعدة البيانات محليًا — على ويندوز قد يستغرق
 * نظام التشغيل لحظة إضافية لتحرير قفل الملف بعد إنهاء العملية التي فتحته، حتى
 * بعد التأكّد من خروجها فعليًا. فقط أخطاء القفل (EPERM/EBUSY) قابلة لإعادة
 * المحاولة؛ أي خطأ آخر (تلف، مساحة تخزين، إلخ) يُفشل فورًا دون إعادة محاولة.
 */
function fileReplaceRetryOptions(dataDir: string) {
  return {
    maxAttempts: 6,
    baseDelayMs: 500,
    maxDelayMs: 4000,
    isRetryable: isFileLockError,
    onRetry: (attempt: number, err: unknown, delayMs: number) => {
      const reason = err instanceof Error ? err.message : String(err);
      const message = `الملف ما زال مقفلًا من نظام التشغيل — محاولة ${attempt} فشلت، إعادة المحاولة خلال ${Math.round(delayMs / 1000)} ثانية: ${reason}`;
      setStatus(currentStatus, message);
      saveMetadata(dataDir, appendLog(dataDir, loadMetadata(dataDir), { action: 'DOWNLOAD', result: 'RETRY', message }));
    },
  };
}

function requireClient(dataDir: string): { client: OAuth2Client; creds: DriveClientCredentials } {
  const creds = loadClientCredentials(dataDir);
  if (!creds) throw new Error('لم تُعدّ بيانات اعتماد Google Drive بعد — راجع دليل الإعداد');
  if (!isAuthenticated(dataDir)) throw new Error('الحساب غير متصل — يرجى تسجيل الدخول أولًا');
  return { client: createOAuthClient(dataDir, creds), creds };
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

// ─── حالة وسجلّ ────────────────────────────────────────────────────────────

export async function getSyncStatus(dbPath: string, dataDir: string) {
  const creds = loadClientCredentials(dataDir);
  const configured = !!creds;
  const authenticated = configured && isAuthenticated(dataDir);
  const metadata = loadMetadata(dataDir);
  const dbExists = fs.existsSync(dbPath);
  const device = getOrCreateDeviceIdentity(dataDir);

  return {
    status: currentStatus,
    message: currentMessage,
    configured,
    authenticated,
    account: authenticated ? getStoredAccountEmail(dataDir) : null,
    lastSyncAt: metadata.lastSyncAt,
    lastUploadAt: metadata.lastUploadAt,
    lastDownloadAt: metadata.lastDownloadAt,
    lastSyncedVersion: metadata.lastSyncedVersion,
    lastError: metadata.lastError,
    localDb: { exists: dbExists, sizeBytes: dbExists ? fs.statSync(dbPath).size : 0 },
    device: { deviceId: device.deviceId, deviceName: device.deviceName },
  };
}

export function getSyncLog(dataDir: string): SyncLogEntry[] {
  return loadMetadata(dataDir).log;
}

// ─── مصادقة ──────────────────────────────────────────────────────────────

export async function authenticate(dataDir: string): Promise<{ ok: boolean; email?: string; error?: string }> {
  const creds = loadClientCredentials(dataDir);
  if (!creds) return { ok: false, error: 'لم تُعدّ بيانات اعتماد Google Drive — راجع دليل الإعداد' };

  try {
    setStatus('CHECKING', 'جارٍ تسجيل الدخول عبر المتصفح...');
    const { email } = await runAuthFlow(dataDir, creds);
    saveMetadata(dataDir, appendLog(dataDir, loadMetadata(dataDir), { action: 'AUTH', result: 'SUCCESS', message: `تم تسجيل الدخول: ${email}` }));
    setStatus('READY');
    return { ok: true, email };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    saveMetadata(dataDir, appendLog(dataDir, loadMetadata(dataDir), { action: 'AUTH', result: 'FAILED', message }));
    setStatus('FAILED', message);
    return { ok: false, error: message };
  }
}

export async function disconnect(dataDir: string): Promise<{ ok: boolean }> {
  const creds = loadClientCredentials(dataDir);
  await revokeAuth(dataDir, creds);
  saveMetadata(dataDir, appendLog(dataDir, loadMetadata(dataDir), { action: 'DISCONNECT', result: 'SUCCESS', message: 'تم فصل الحساب' }));
  setStatus('READY');
  return { ok: true };
}

// ─── قرار الاتجاه وكشف التعارض ────────────────────────────────────────────────

type SyncAction = 'UPLOAD' | 'DOWNLOAD' | 'NONE' | 'CONFLICT';

export interface DatabaseVersionInfo {
  sha256: string;
  sizeBytes: number;
  modifiedAt: string;
  deviceId: string | null;
  deviceName: string | null;
}

export interface SyncConflict {
  local: DatabaseVersionInfo;
  remote: DatabaseVersionInfo;
  /** أي نسخة أحدث حسب وقت التعديل — تلميح عرض فقط، لا يُقرِّر شيئًا تلقائيًا. */
  recommendation: 'LOCAL' | 'REMOTE' | 'UNKNOWN';
}

interface SyncDecision {
  action: SyncAction;
  reason: string;
  conflict?: SyncConflict;
}

function buildConflict(
  dataDir: string,
  dbPath: string,
  localHash: string,
  remote: { sha256: string | null; modifiedTime: string; size: number; deviceId: string | null; deviceName: string | null },
): SyncConflict {
  const stat = fs.statSync(dbPath);
  const device = getOrCreateDeviceIdentity(dataDir);

  const local: DatabaseVersionInfo = {
    sha256: localHash,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    deviceId: device.deviceId,
    deviceName: device.deviceName,
  };
  const remoteInfo: DatabaseVersionInfo = {
    sha256: remote.sha256 ?? '',
    sizeBytes: remote.size,
    modifiedAt: remote.modifiedTime,
    deviceId: remote.deviceId,
    deviceName: remote.deviceName,
  };

  const localTime = new Date(local.modifiedAt).getTime();
  const remoteTime = new Date(remoteInfo.modifiedAt).getTime();
  let recommendation: SyncConflict['recommendation'] = 'UNKNOWN';
  if (Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime !== remoteTime) {
    recommendation = localTime > remoteTime ? 'LOCAL' : 'REMOTE';
  }

  return { local, remote: remoteInfo, recommendation };
}

/** القرار الأساسي — قراءة فقط، بلا تسجيل. يُستدعى من كل تدفّقات المزامنة الفعلية ومن الفحص السلبي للواجهة. */
async function decide(client: OAuth2Client, dbPath: string, dataDir: string): Promise<SyncDecision> {
  const metadata = loadMetadata(dataDir);
  const dbExists = fs.existsSync(dbPath);
  const localHash = dbExists ? await sha256File(dbPath) : null;
  // إعادة محاولة خفيفة وبلا تسجيل دائم — مجرّد فحص أولي؛ الرفع/التنزيل الفعلي
  // أدناه له إعادة محاولة كاملة مع تسجيل عند تنفيذ الإجراء المُقرَّر.
  const remote = await withRetry(() => findRemoteSyncFile(client), { maxAttempts: 2, isRetryable: isRetryableSyncError });

  if (!remote) {
    // حالة أول تشغيل بلا نسخة سحابية: البذرة تُهيَّأ محليًا بالطريقة المعتادة
    // وتصير قاعدة المستخدم الحقيقية — ويمكن رفعها لاحقًا وفق السياسة القائمة.
    return localHash
      ? { action: 'UPLOAD', reason: 'لا توجد نسخة سحابية بعد' }
      : { action: 'NONE', reason: 'لا توجد بيانات محلية أو سحابية' };
  }

  if (remote.sha256 && remote.sha256 === localHash) {
    return { action: 'NONE', reason: 'محدّث بالفعل' };
  }

  /**
   * حارس بذرة أول تشغيل — يسبق كل مقارنات التغيير عمدًا.
   *
   * إن كانت القاعدة المحلية ما زالت **بذرة القالب المُضمَّنة كما نُسخت حرفيًا**
   * (وسم صريح + تطابق بصمة — انظر `dbBootstrapState.ts`) وتوجد نسخة سحابية، فهي
   * ليست «تغييرًا محليًا» بأي معنى: لا مستخدم كتب فيها شيئًا. تصنيفها كذلك كان
   * يُنتج CONFLICT ويعرض خيار «المحلي» الذي يرفع القالب القديم فوق بيانات Drive.
   *
   * القرار هنا **تنزيل حصرًا** — فلا يُعرض تعارض ولا يُتاح خيار الرفع أصلًا.
   * والتنزيل يمرّ بمسار `performDownload` الآمن نفسه: فحص سلامة + مطابقة بصمة +
   * نسخة أمان قبل الاستبدال + استبدال ذرّي.
   */
  if (isPristineSeed(dataDir, localHash, getSeedTemplatePath())) {
    return { action: 'DOWNLOAD', reason: 'أول تشغيل: تهيئة القاعدة من النسخة السحابية (القالب المحلي بذرة لا بيانات مستخدم)' };
  }

  const remoteChanged = remote.sha256 !== null && remote.sha256 !== metadata.lastSyncedHash;
  // الهوية المحلية تُقارَن ببصمة الملف المحلي وقت آخر مزامنة، لا ببصمة البايتات
  // المرفوعة — فهما مختلفتان منذ صارت اللقطة تمرّ بـ`VACUUM INTO`. العودة إلى
  // `lastSyncedHash` تحفظ سلوك البيانات القديمة التي لا تحمل الحقل الجديد.
  const localBaseline = metadata.lastSyncedLocalHash ?? metadata.lastSyncedHash;
  const localChanged = localHash !== null && localHash !== localBaseline;

  if (remoteChanged && localChanged) {
    const reason = 'تعارض: توجد تغييرات محلية وتغييرات على Google Drive منذ آخر مزامنة';
    return { action: 'CONFLICT', reason, conflict: buildConflict(dataDir, dbPath, localHash as string, remote) };
  }
  if (remoteChanged) return { action: 'DOWNLOAD', reason: 'توجد نسخة أحدث على Google Drive' };
  if (localChanged) return { action: 'UPLOAD', reason: 'توجد تغييرات محلية غير مرفوعة' };
  return { action: 'NONE', reason: 'محدّث بالفعل' };
}

/**
 * فحص سلبي للتعارض — بلا تسجيل، للاستخدام من الواجهة عند فتح صفحة المزامنة
 * (لعرض حوار الحل استباقيًا) دون انتظار ضغط المستخدم على "مزامنة الآن".
 * يُحدِّث حالة العرض الحيّة عند وجود تعارض حتى تعكسها شارة الحالة فورًا.
 */
export async function checkForConflict(dbPath: string, dataDir: string): Promise<SyncConflict | null> {
  const creds = loadClientCredentials(dataDir);
  if (!creds || !isAuthenticated(dataDir)) return null;

  try {
    const client = createOAuthClient(dataDir, creds);
    const decision = await decide(client, dbPath, dataDir);
    if (decision.action === 'CONFLICT' && decision.conflict) {
      setStatus('CONFLICT', decision.reason);
      return decision.conflict;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── رفع ────────────────────────────────────────────────────────────────────

interface ActionOptions {
  /** يُوسَم به إدخال السجلّ عند كون هذا الرفع/التنزيل ناتجًا عن حلّ تعارض صريح. */
  resolvesConflict?: boolean;
}

export async function performUpload(
  dbPath: string,
  dataDir: string,
  opts: ActionOptions = {},
): Promise<{ ok: boolean; error?: string }> {
  if (!fs.existsSync(dbPath)) return { ok: false, error: 'ملف قاعدة البيانات المحلي غير موجود' };

  // نسخة مؤقتة "آمنة للقراءة" — لا يُرفع مطلقًا الملف الحيّ نفسه، بل لقطة مجمّدة
  // منه بعد تفريغ WAL، بحيث لا تتزامن كتابة نشطة مع قراءة/رفع الملف أبدًا.
  const snapshotPath = path.join(dataDir, `sync-tmp-snapshot-${Date.now()}.db`);

  try {
    setStatus('UPLOADING', 'جارٍ تجهيز لقطة متسقة والتحقق من سلامة قاعدة البيانات...');
    // تفريغ WAL أولًا — بلا أثر في وضع الـjournal الافتراضي، ويبقى صحيحًا لو
    // فُعّل WAL مستقبلًا. أفضل جهد.
    await checkpointWal(dbPath);

    const liveIntegrity = await checkSqliteIntegrity(dbPath);
    if (!liveIntegrity.valid) throw new Error(`فشل فحص السلامة قبل الرفع: ${liveIntegrity.reason}`);

    // لقطة **متسقة معاملاتيًا** عبر `VACUUM INTO` بدل نسخ ملف حيّ بالبايت.
    // مسار الرفع اليدوي (`sync:upload`) يعمل والخادم الخلفي ما زال يكتب — بخلاف
    // مسار الإغلاق الذي يوقفه أولًا. والقاعدة ليست في وضع WAL، فالنسخ المباشر
    // كان قد يلتقط معاملة جارية نصفَ مكتوبة. انظر `snapshotDatabase`.
    await snapshotDatabase(dbPath, snapshotPath);

    // فحص ثانٍ على اللقطة المجمَّدة نفسها — تحصين إضافي ضد أي كتابة نادرة تسللت
    // بين التفريغ والنسخ؛ هذا هو الفحص الحاسم لأنه على البايتات المرفوعة فعليًا.
    const snapshotIntegrity = await checkSqliteIntegrity(snapshotPath);
    if (!snapshotIntegrity.valid) throw new Error(`فشل فحص سلامة اللقطة قبل الرفع: ${snapshotIntegrity.reason}`);

    const { client } = requireClient(dataDir);
    const hash = await sha256File(snapshotPath);
    // بصمة الملف المحلي نفسه — تختلف عن بصمة اللقطة (VACUUM INTO يُعيد الكتابة)،
    // وهي المرجع الذي يقارن به `decide()` لاحقًا ليعرف هل تغيّر المحلي فعلًا.
    const localHash = await sha256File(dbPath);
    const device = getOrCreateDeviceIdentity(dataDir);
    const retryOpts = driveRetryOptions(dataDir, 'UPLOAD');
    const remote = await withRetry(() => findRemoteSyncFile(client), retryOpts);

    /**
     * حارس أخير: لا تُرفع بذرة القالب فوق نسخة سحابية قائمة — أبدًا.
     *
     * `decide()` لا يُنتج تعارضًا في هذه الحالة أصلًا، فلا يصل مستخدم عادي إلى هنا.
     * لكن `sync:upload` (زر «رفع الآن») و`resolveConflict('LOCAL')` مسارا IPC
     * مباشران؛ هذا الحارس يجعل الحماية بنيوية لا معتمدة على إخفاء زرّ في الواجهة.
     */
    if (remote && isPristineSeed(dataDir, localHash, getSeedTemplatePath())) {
      throw new Error(
        'رُفض الرفع: قاعدة البيانات المحلية ما زالت قالب التهيئة الأوّلي ولم تُدخَل فيها أي بيانات، ' +
          'وتوجد نسخة حقيقية على Google Drive. رفعها كان سيستبدل بياناتك السحابية بقالب فارغ. ' +
          'أعد تشغيل التطبيق ليُنزّل النسخة السحابية أولًا.',
      );
    }

    const version = (remote?.version ?? 0) + 1;

    setStatus('UPLOADING', 'جارٍ رفع قاعدة البيانات إلى Google Drive...');
    const uploaded = await withRetry(
      () => uploadDatabase(client, snapshotPath, {
        fileId: remote?.id ?? null,
        sha256: hash,
        version,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
      }),
      retryOpts,
    );

    const now = new Date().toISOString();
    let metadata = loadMetadata(dataDir);
    metadata = {
      ...metadata,
      lastSyncedHash: hash,
      lastSyncedLocalHash: localHash,
      lastSyncedFileId: uploaded.id,
      lastSyncedVersion: uploaded.version,
      lastUploadAt: now,
      lastSyncAt: now,
      lastError: null,
    };
    metadata = appendLog(dataDir, metadata, {
      action: 'UPLOAD',
      result: 'SUCCESS',
      message: `تم الرفع (${hash.slice(0, 8)}…)`,
      ...(opts.resolvesConflict ? { conflictResolved: true, resolutionSelected: 'LOCAL' as const } : {}),
    });
    saveMetadata(dataDir, metadata);
    setStatus('COMPLETED');
    return { ok: true };
  } catch (err) {
    // فشل الرفع لا يمسّ dbPath إطلاقًا — القاعدة السابقة تبقى كما هي دون أي تغيير.
    const message = err instanceof Error ? err.message : String(err);
    let metadata = loadMetadata(dataDir);
    metadata = { ...metadata, lastError: message };
    metadata = appendLog(dataDir, metadata, {
      action: 'UPLOAD',
      result: 'FAILED',
      message,
      ...(opts.resolvesConflict ? { conflictResolved: true, resolutionSelected: 'LOCAL' as const } : {}),
    });
    saveMetadata(dataDir, metadata);
    setStatus('FAILED', message);
    return { ok: false, error: message };
  } finally {
    try { if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath); } catch { /* أفضل جهد فقط */ }
  }
}

// ─── تنزيل + استبدال آمن ─────────────────────────────────────────────────────

export async function performDownload(
  dbPath: string,
  dataDir: string,
  opts: ActionOptions = {},
): Promise<{ ok: boolean; error?: string; requiresRestart?: boolean; backendRestarted?: boolean }> {
  const tempPath = path.join(dataDir, `sync-tmp-download-${Date.now()}.db`);
  const preSyncDir = path.join(dataDir, 'backups', 'pre-sync');
  let preSyncBackupPath: string | null = null;
  // "قيد الاستخدام" فعليًا يعني الخادم الخلفي يعمل ويحمل قفل ملف SQLite (يحدث
  // هذا فقط على ويندوز؛ لا يوجد قفل حصري مكافئ على أنظمة POSIX). عند تشغيل
  // مزامنة بدء التشغيل، الخادم لم يبدأ بعد — لا حاجة لإيقاف/إعادة تشغيل شيء.
  let backendStopped = false;

  try {
    setStatus('DOWNLOADING', 'جارٍ تنزيل النسخة الاحتياطية من Google Drive...');
    const { client } = requireClient(dataDir);
    const retryOpts = driveRetryOptions(dataDir, 'DOWNLOAD');
    const remote = await withRetry(() => findRemoteSyncFile(client), retryOpts);
    if (!remote) throw new Error('لا توجد نسخة قاعدة بيانات على Google Drive بعد');

    await withRetry(() => downloadDatabase(client, remote.id, tempPath), retryOpts);

    setStatus('DOWNLOADING', 'جارٍ التحضير للاستعادة...');
    // فحص سلامة حقيقي عبر محرّك SQLite (PRAGMA integrity_check) فور التنزيل —
    // لا يُفعَّل ملف تالف أبدًا مهما بدت بصمته صحيحة.
    const integrity = await checkSqliteIntegrity(tempPath);
    if (!integrity.valid) throw new Error(`فشل فحص سلامة الملف المُنزَّل: ${integrity.reason}`);

    const downloadedHash = await sha256File(tempPath);
    if (remote.sha256 && remote.sha256 !== downloadedHash) {
      throw new Error('بصمة الملف المُنزَّل لا تطابق البصمة المسجّلة على Google Drive');
    }

    // نسخة أمان تلقائية قبل أي استبدال — تُتيح تراجعًا يدويًا لاحقًا عبر صفحة النسخ الاحتياطي
    if (fs.existsSync(dbPath)) {
      fs.mkdirSync(preSyncDir, { recursive: true });
      preSyncBackupPath = path.join(preSyncDir, `manar-auto-before-sync-${Date.now()}.db`);
      fs.copyFileSync(dbPath, preSyncBackupPath);
    }

    // الخادم الخلفي يفتح ملف SQLite بقفل حصري على ويندوز (Prisma/SQLite) — يجب
    // إيقافه فعليًا والتأكّد من خروج العملية قبل أي محاولة استبدال، لا افتراض
    // تحرّر القفل بعد تأخير ثابت.
    const backendWasRunning = isBackendRunning();
    if (backendWasRunning) {
      setStatus('DOWNLOADING', 'جارٍ إيقاف قاعدة البيانات...');
      await stopBackendForRestart();
      backendStopped = true;
    }

    setStatus('DOWNLOADING', 'جارٍ استبدال قاعدة البيانات...');
    // استبدال ذرّي (rename على نفس القرص/المجلد) مع إعادة محاولة قصيرة تمتصّ أي
    // تأخير أخير لتحرير القفل من نظام التشغيل (EPERM/EBUSY) بدل الفشل الفوري.
    await withRetry(async () => { fs.renameSync(tempPath, dbPath); }, fileReplaceRetryOptions(dataDir));

    if (backendWasRunning) {
      setStatus('DOWNLOADING', 'جارٍ إعادة تشغيل الخدمات...');
      await startBackend(getInternalSecret());
      backendStopped = false;
    }

    const now = new Date().toISOString();
    let metadata = loadMetadata(dataDir);
    // بعد التنزيل، الملف المحلي **هو** البايتات المنزَّلة — فالهويتان متطابقتان هنا.
    metadata = {
      ...metadata,
      lastSyncedHash: downloadedHash,
      lastSyncedLocalHash: downloadedHash,
      lastSyncedFileId: remote.id,
      lastSyncedVersion: remote.version,
      lastDownloadAt: now,
      lastSyncAt: now,
      lastError: null,
    };
    metadata = appendLog(dataDir, metadata, {
      action: 'DOWNLOAD',
      result: 'SUCCESS',
      message: `تمت الاستعادة بنجاح (${downloadedHash.slice(0, 8)}…)`,
      ...(opts.resolvesConflict ? { conflictResolved: true, resolutionSelected: 'REMOTE' as const } : {}),
    });
    saveMetadata(dataDir, metadata);
    // القاعدة المحلية لم تعد بذرة قالب: صارت النسخة السحابية الحقيقية. التشغيل
    // التالي يعاملها كقاعدة مستخدم كاملة الحقوق (رفع/تعارض/حلّ صريح كالمعتاد).
    // يُستدعى بعد نجاح الاستبدال والتحقق فقط — الفشل يُبقيها بذرة فتُعاد المحاولة.
    markBootstrapComplete(dataDir);
    setStatus('COMPLETED', 'اكتملت الاستعادة بنجاح');
    // requiresRestart: false — لم يعد إعادة تشغيل التطبيق كاملًا مطلوبة؛ الخادم
    // الخلفي أُعيد تشغيله تلقائيًا. backendRestarted تُخبر الواجهة أن تُعيد تحميل
    // نفسها (بلا إعادة تشغيل يدوية) حتى تعكس بيانات القاعدة الجديدة.
    return { ok: true, requiresRestart: false, backendRestarted: backendWasRunning };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* أفضل جهد فقط */ }
    // التراجع لا يُنفَّذ إلا إذا فُقد الملف المحلي فعليًا (الاستبدال الذرّي لا يترك حالة وسيطة عادةً)
    try {
      if (preSyncBackupPath && fs.existsSync(preSyncBackupPath) && !fs.existsSync(dbPath)) {
        fs.copyFileSync(preSyncBackupPath, dbPath);
      }
    } catch { /* أفضل جهد فقط */ }

    let metadata = loadMetadata(dataDir);
    metadata = { ...metadata, lastError: message };
    metadata = appendLog(dataDir, metadata, {
      action: 'DOWNLOAD',
      result: 'FAILED',
      message,
      ...(opts.resolvesConflict ? { conflictResolved: true, resolutionSelected: 'REMOTE' as const } : {}),
    });
    saveMetadata(dataDir, metadata);
    setStatus('FAILED', message);
    return { ok: false, error: message };
  } finally {
    // لا يُترك التطبيق أبدًا بلا خادم خلفي: إن كنّا قد أوقفناه، يجب إعادته بغضّ
    // النظر عن نجاح أو فشل عملية الاستبدال نفسها.
    if (backendStopped) {
      try {
        await startBackend(getInternalSecret());
      } catch {
        // أفضل جهد — لو استمرّ الفشل، سيحتاج المستخدم لإعادة تشغيل التطبيق يدويًا
      }
    }
  }
}

// ─── حلّ التعارض ────────────────────────────────────────────────────────────

/**
 * ينفّذ اختيار المستخدم الصريح في حوار حلّ التعارض. "الإلغاء" لا يستدعي هذه
 * الدالة أبدًا — يُغلق الحوار في الواجهة فقط، ولا يُغيَّر أي من النسختين.
 */
export async function resolveConflict(
  choice: 'LOCAL' | 'REMOTE',
  dbPath: string,
  dataDir: string,
): Promise<{ ok: boolean; error?: string; requiresRestart?: boolean; backendRestarted?: boolean }> {
  if (choice === 'LOCAL') return performUpload(dbPath, dataDir, { resolvesConflict: true });
  return performDownload(dbPath, dataDir, { resolvesConflict: true });
}

// ─── مزامنة يدوية كاملة ("مزامنة الآن") ──────────────────────────────────────

export async function performSyncNow(
  dbPath: string,
  dataDir: string,
): Promise<{
  ok: boolean;
  action: SyncAction;
  error?: string;
  requiresRestart?: boolean;
  backendRestarted?: boolean;
  conflict?: SyncConflict;
}> {
  try {
    const { client } = requireClient(dataDir);

    setStatus('CHECKING', 'جارٍ التحقق من حالة المزامنة...');
    const online = await checkConnectivity();
    if (!online) {
      setStatus('OFFLINE');
      return { ok: false, action: 'NONE', error: 'لا يوجد اتصال بالإنترنت' };
    }

    const decision = await decide(client, dbPath, dataDir);

    if (decision.action === 'CONFLICT') {
      setStatus('CONFLICT', decision.reason);
      saveMetadata(dataDir, appendLog(dataDir, loadMetadata(dataDir), { action: 'CONFLICT', result: 'SKIPPED', message: decision.reason }));
      return { ok: false, action: 'CONFLICT', error: decision.reason, conflict: decision.conflict };
    }
    if (decision.action === 'DOWNLOAD') {
      const result = await performDownload(dbPath, dataDir);
      return {
        ok: result.ok,
        action: 'DOWNLOAD',
        error: result.error,
        requiresRestart: result.requiresRestart,
        backendRestarted: result.backendRestarted,
      };
    }
    if (decision.action === 'UPLOAD') {
      const result = await performUpload(dbPath, dataDir);
      return { ok: result.ok, action: 'UPLOAD', error: result.error };
    }

    setStatus('READY');
    return { ok: true, action: 'NONE', error: decision.reason };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus('FAILED', message);
    return { ok: false, action: 'NONE', error: message };
  }
}

// ─── مزامنة تلقائية عند بدء التشغيل / الإغلاق ─────────────────────────────────

/** مزامنة بدء التشغيل — تُنزّل نسخة أحدث إن وُجدت فقط. لا تُعطّل بدء التطبيق أبدًا. عند تعارض: تُسجّله وتتوقف. */
export async function performStartupSync(dbPath: string, dataDir: string): Promise<void> {
  try {
    const creds = loadClientCredentials(dataDir);
    if (!creds || !isAuthenticated(dataDir)) return;

    const online = await withTimeout(checkConnectivity(3000), 3500, false);
    if (!online) {
      setStatus('OFFLINE');
      return;
    }

    const client = createOAuthClient(dataDir, creds);
    const decision = await withTimeout(decide(client, dbPath, dataDir), STARTUP_TIMEOUT_MS, {
      action: 'NONE' as SyncAction,
      reason: 'انتهت مهلة الفحص',
    });

    if (decision.action === 'CONFLICT') {
      setStatus('CONFLICT', decision.reason);
      saveMetadata(dataDir, appendLog(dataDir, loadMetadata(dataDir), { action: 'CONFLICT', result: 'SKIPPED', message: decision.reason }));
      return;
    }
    if (decision.action === 'DOWNLOAD') {
      await withTimeout(performDownload(dbPath, dataDir), STARTUP_TIMEOUT_MS, { ok: false, error: 'انتهت المهلة' });
    } else {
      setStatus('READY');
    }
  } catch (err) {
    // لا تعطّل بدء التطبيق أبدًا — استمر بقاعدة البيانات المحلية الحالية
    setStatus('FAILED', err instanceof Error ? err.message : String(err));
  }
}

/** مزامنة الإغلاق — ترفع فقط عند وجود تغييرات محلية. تُستدعى بعد إيقاف الخادم الخلفي. عند تعارض: تُسجّله وتتوقف. */
export async function performShutdownSync(dbPath: string, dataDir: string): Promise<void> {
  try {
    const creds = loadClientCredentials(dataDir);
    if (!creds || !isAuthenticated(dataDir)) return;
    if (!fs.existsSync(dbPath)) return;

    const online = await withTimeout(checkConnectivity(3000), 3500, false);
    if (!online) return;

    const client = createOAuthClient(dataDir, creds);
    const decision = await withTimeout(decide(client, dbPath, dataDir), SHUTDOWN_TIMEOUT_MS / 2, {
      action: 'NONE' as SyncAction,
      reason: 'انتهت مهلة الفحص',
    });

    if (decision.action === 'CONFLICT') {
      setStatus('CONFLICT', decision.reason);
      saveMetadata(dataDir, appendLog(dataDir, loadMetadata(dataDir), { action: 'CONFLICT', result: 'SKIPPED', message: decision.reason }));
      return;
    }
    if (decision.action === 'UPLOAD') {
      await withTimeout(performUpload(dbPath, dataDir), SHUTDOWN_TIMEOUT_MS, { ok: false, error: 'انتهت المهلة' });
    }
  } catch {
    // الإغلاق يجب ألا يتعطّل أبدًا بسبب فشل المزامنة
  }
}
