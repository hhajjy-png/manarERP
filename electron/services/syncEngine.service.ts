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
import { checkSqliteIntegrity, checkpointWal, sha256File } from './dbIntegrity';
import { withRetry } from './retry';

/**
 * محرّك المزامنة — يُنسّق بين المصادقة وطبقة Drive API وفحوصات السلامة.
 * معزول تمامًا عن منطق الأعمال: لا يعرف شيئًا عن Prisma أو الخادم الخلفي،
 * يتعامل فقط مع ملف قاعدة البيانات كملف ثنائي.
 *
 * ملاحظة تعارض: لا يوجد حل تلقائي للتعارضات (خارج نطاق هذه الحزمة عمدًا).
 * إن تغيّرت النسختان المحلية والسحابية معًا منذ آخر مزامنة، تتوقف المزامنة
 * التلقائية عن التصرّف وتترك القرار للمستخدم عبر أزرار الرفع/التنزيل اليدوية.
 */

export type SyncStatus =
  | 'READY'
  | 'CHECKING'
  | 'DOWNLOADING'
  | 'UPLOADING'
  | 'COMPLETED'
  | 'FAILED'
  | 'OFFLINE';

interface SyncLogEntry {
  at: string;
  action: 'UPLOAD' | 'DOWNLOAD' | 'AUTH' | 'DISCONNECT';
  result: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'RETRY';
  message: string;
}

interface SyncMetadata {
  lastSyncedHash: string | null;
  lastSyncedFileId: string | null;
  lastSyncAt: string | null;
  lastUploadAt: string | null;
  lastDownloadAt: string | null;
  lastError: string | null;
  log: SyncLogEntry[];
}

const DEFAULT_METADATA: SyncMetadata = {
  lastSyncedHash: null,
  lastSyncedFileId: null,
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

function appendLog(metadata: SyncMetadata, entry: Omit<SyncLogEntry, 'at'>): SyncMetadata {
  const log = [{ at: new Date().toISOString(), ...entry }, ...metadata.log].slice(0, MAX_LOG_ENTRIES);
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
      saveMetadata(dataDir, appendLog(loadMetadata(dataDir), { action, result: 'RETRY', message }));
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

  return {
    status: currentStatus,
    message: currentMessage,
    configured,
    authenticated,
    account: authenticated ? getStoredAccountEmail(dataDir) : null,
    lastSyncAt: metadata.lastSyncAt,
    lastUploadAt: metadata.lastUploadAt,
    lastDownloadAt: metadata.lastDownloadAt,
    lastError: metadata.lastError,
    localDb: { exists: dbExists, sizeBytes: dbExists ? fs.statSync(dbPath).size : 0 },
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
    saveMetadata(dataDir, appendLog(loadMetadata(dataDir), { action: 'AUTH', result: 'SUCCESS', message: `تم تسجيل الدخول: ${email}` }));
    setStatus('READY');
    return { ok: true, email };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    saveMetadata(dataDir, appendLog(loadMetadata(dataDir), { action: 'AUTH', result: 'FAILED', message }));
    setStatus('FAILED', message);
    return { ok: false, error: message };
  }
}

export async function disconnect(dataDir: string): Promise<{ ok: boolean }> {
  const creds = loadClientCredentials(dataDir);
  await revokeAuth(dataDir, creds);
  saveMetadata(dataDir, appendLog(loadMetadata(dataDir), { action: 'DISCONNECT', result: 'SUCCESS', message: 'تم فصل الحساب' }));
  setStatus('READY');
  return { ok: true };
}

// ─── قرار الاتجاه ───────────────────────────────────────────────────────────

type SyncAction = 'UPLOAD' | 'DOWNLOAD' | 'NONE';

interface SyncDecision {
  action: SyncAction;
  reason: string;
}

async function decide(client: OAuth2Client, dbPath: string, dataDir: string): Promise<SyncDecision> {
  const metadata = loadMetadata(dataDir);
  const dbExists = fs.existsSync(dbPath);
  const localHash = dbExists ? await sha256File(dbPath) : null;
  // إعادة محاولة خفيفة وبلا تسجيل دائم — مجرّد فحص أولي؛ الرفع/التنزيل الفعلي
  // أدناه له إعادة محاولة كاملة مع تسجيل عند تنفيذ الإجراء المُقرَّر.
  const remote = await withRetry(() => findRemoteSyncFile(client), { maxAttempts: 2, isRetryable: isRetryableSyncError });

  if (!remote) {
    return localHash
      ? { action: 'UPLOAD', reason: 'لا توجد نسخة سحابية بعد' }
      : { action: 'NONE', reason: 'لا توجد بيانات محلية أو سحابية' };
  }

  if (remote.sha256 && remote.sha256 === localHash) {
    return { action: 'NONE', reason: 'محدّث بالفعل' };
  }

  const remoteChanged = remote.sha256 !== null && remote.sha256 !== metadata.lastSyncedHash;
  const localChanged = localHash !== null && localHash !== metadata.lastSyncedHash;

  if (remoteChanged && localChanged) {
    return { action: 'NONE', reason: 'تعارض: تغييرات محلية وسحابية معًا — استخدم الرفع أو التنزيل اليدوي لاختيار النسخة' };
  }
  if (remoteChanged) return { action: 'DOWNLOAD', reason: 'توجد نسخة أحدث على Google Drive' };
  if (localChanged) return { action: 'UPLOAD', reason: 'توجد تغييرات محلية غير مرفوعة' };
  return { action: 'NONE', reason: 'محدّث بالفعل' };
}

// ─── رفع ────────────────────────────────────────────────────────────────────

export async function performUpload(dbPath: string, dataDir: string): Promise<{ ok: boolean; error?: string }> {
  if (!fs.existsSync(dbPath)) return { ok: false, error: 'ملف قاعدة البيانات المحلي غير موجود' };

  // نسخة مؤقتة "آمنة للقراءة" — لا يُرفع مطلقًا الملف الحيّ نفسه، بل لقطة مجمّدة
  // منه بعد تفريغ WAL، بحيث لا تتزامن كتابة نشطة مع قراءة/رفع الملف أبدًا.
  const snapshotPath = path.join(dataDir, `sync-tmp-snapshot-${Date.now()}.db`);

  try {
    setStatus('UPLOADING', 'جارٍ تفريغ سجلّ WAL والتحقق من سلامة قاعدة البيانات...');
    // تفريغ WAL في الملف الرئيسي أولًا: يضمن أن النسخة القادمة تعكس كل معاملة
    // مُلتزَمة (committed) بالكامل — لا كتابة جزئية أبدًا. عملية قصيرة لا تُعطّل
    // عمل الخادم الخلفي (Offline-First محفوظ، لا توقّف مطلوب).
    await checkpointWal(dbPath);

    const liveIntegrity = await checkSqliteIntegrity(dbPath);
    if (!liveIntegrity.valid) throw new Error(`فشل فحص السلامة قبل الرفع: ${liveIntegrity.reason}`);

    fs.copyFileSync(dbPath, snapshotPath);

    // فحص ثانٍ على اللقطة المجمَّدة نفسها — تحصين إضافي ضد أي كتابة نادرة تسللت
    // بين التفريغ والنسخ؛ هذا هو الفحص الحاسم لأنه على البايتات المرفوعة فعليًا.
    const snapshotIntegrity = await checkSqliteIntegrity(snapshotPath);
    if (!snapshotIntegrity.valid) throw new Error(`فشل فحص سلامة اللقطة قبل الرفع: ${snapshotIntegrity.reason}`);

    const { client } = requireClient(dataDir);
    const hash = await sha256File(snapshotPath);
    const retryOpts = driveRetryOptions(dataDir, 'UPLOAD');
    const remote = await withRetry(() => findRemoteSyncFile(client), retryOpts);

    setStatus('UPLOADING', 'جارٍ رفع قاعدة البيانات إلى Google Drive...');
    const uploaded = await withRetry(
      () => uploadDatabase(client, snapshotPath, { fileId: remote?.id ?? null, sha256: hash }),
      retryOpts,
    );

    const now = new Date().toISOString();
    let metadata = loadMetadata(dataDir);
    metadata = { ...metadata, lastSyncedHash: hash, lastSyncedFileId: uploaded.id, lastUploadAt: now, lastSyncAt: now, lastError: null };
    metadata = appendLog(metadata, { action: 'UPLOAD', result: 'SUCCESS', message: `تم الرفع (${hash.slice(0, 8)}…)` });
    saveMetadata(dataDir, metadata);
    setStatus('COMPLETED');
    return { ok: true };
  } catch (err) {
    // فشل الرفع لا يمسّ dbPath إطلاقًا — القاعدة السابقة تبقى كما هي دون أي تغيير.
    const message = err instanceof Error ? err.message : String(err);
    let metadata = loadMetadata(dataDir);
    metadata = { ...metadata, lastError: message };
    metadata = appendLog(metadata, { action: 'UPLOAD', result: 'FAILED', message });
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
): Promise<{ ok: boolean; error?: string; requiresRestart?: boolean }> {
  const tempPath = path.join(dataDir, `sync-tmp-download-${Date.now()}.db`);
  const preSyncDir = path.join(dataDir, 'backups', 'pre-sync');
  let preSyncBackupPath: string | null = null;

  try {
    setStatus('DOWNLOADING', 'جارٍ التحقق من النسخة السحابية...');
    const { client } = requireClient(dataDir);
    const retryOpts = driveRetryOptions(dataDir, 'DOWNLOAD');
    const remote = await withRetry(() => findRemoteSyncFile(client), retryOpts);
    if (!remote) throw new Error('لا توجد نسخة قاعدة بيانات على Google Drive بعد');

    setStatus('DOWNLOADING', 'جارٍ تنزيل قاعدة البيانات...');
    await withRetry(() => downloadDatabase(client, remote.id, tempPath), retryOpts);

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

    // استبدال ذرّي: rename على نفس القرص/المجلد أعلى ضمانًا من نسخ+حذف
    fs.renameSync(tempPath, dbPath);

    const now = new Date().toISOString();
    let metadata = loadMetadata(dataDir);
    metadata = { ...metadata, lastSyncedHash: downloadedHash, lastSyncedFileId: remote.id, lastDownloadAt: now, lastSyncAt: now, lastError: null };
    metadata = appendLog(metadata, { action: 'DOWNLOAD', result: 'SUCCESS', message: `تم التنزيل والاستبدال (${downloadedHash.slice(0, 8)}…)` });
    saveMetadata(dataDir, metadata);
    setStatus('COMPLETED');
    return { ok: true, requiresRestart: true };
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
    metadata = appendLog(metadata, { action: 'DOWNLOAD', result: 'FAILED', message });
    saveMetadata(dataDir, metadata);
    setStatus('FAILED', message);
    return { ok: false, error: message };
  }
}

// ─── مزامنة يدوية كاملة ("مزامنة الآن") ──────────────────────────────────────

export async function performSyncNow(
  dbPath: string,
  dataDir: string,
): Promise<{ ok: boolean; action: SyncAction; error?: string; requiresRestart?: boolean }> {
  try {
    const { client } = requireClient(dataDir);

    setStatus('CHECKING', 'جارٍ التحقق من حالة المزامنة...');
    const online = await checkConnectivity();
    if (!online) {
      setStatus('OFFLINE');
      return { ok: false, action: 'NONE', error: 'لا يوجد اتصال بالإنترنت' };
    }

    const decision = await decide(client, dbPath, dataDir);
    if (decision.action === 'DOWNLOAD') {
      const result = await performDownload(dbPath, dataDir);
      return { ok: result.ok, action: 'DOWNLOAD', error: result.error, requiresRestart: result.requiresRestart };
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

/** مزامنة بدء التشغيل — تُنزّل نسخة أحدث إن وُجدت فقط. لا تُعطّل بدء التطبيق أبدًا. */
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

/** مزامنة الإغلاق — ترفع فقط عند وجود تغييرات محلية. تُستدعى بعد إيقاف الخادم الخلفي. */
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

    if (decision.action === 'UPLOAD') {
      await withTimeout(performUpload(dbPath, dataDir), SHUTDOWN_TIMEOUT_MS, { ok: false, error: 'انتهت المهلة' });
    }
  } catch {
    // الإغلاق يجب ألا يتعطّل أبدًا بسبب فشل المزامنة
  }
}
