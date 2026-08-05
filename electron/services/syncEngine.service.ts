import fs from 'fs';
import path from 'path';
import type { OAuth2Client } from 'google-auth-library';
import {
  loadClientCredentials,
  isAuthenticated,
  getStoredAccountEmail,
  clearStoredAuth,
  openDriveSession,
  runAuthFlow,
  revokeAuth,
  getTokenDiagnostics,
  isTokenEncryptionAvailable,
} from './googleDriveAuth.service';
import {
  findRemoteSyncFile,
  uploadDatabase,
  downloadDatabase,
  checkConnectivity,
  isRetryableSyncError,
  syncRetryDelay,
  fetchDriveStorage,
} from './googleDriveApi.service';
import { checkSqliteIntegrity, checkpointWal, snapshotDatabase, sha256File } from './dbIntegrity';
import { isPristineSeed, markBootstrapComplete } from './dbBootstrapState';
import { withRetry } from './retry';
import { getOrCreateDeviceIdentity } from './deviceIdentity.service';
import { isBackendRunning, stopBackendForRestart, startBackend, getInternalSecret, getSeedTemplatePath } from './backendLauncher';
import { emitSyncProgress } from './syncProgressBus';
import { createRescueBackup, type RescueBackupResult } from './rescueBackupFallback.service';
import { classifyGoogleAuthError, toUserFacingSyncError } from './googleAuthErrors.pure';
import { createSyncMutex, type MutexBusy, type SyncOperation } from './syncMutex.pure';
import {
  decideSyncAction,
  remoteChangedSince,
  startupSyncActsOn,
  shutdownSyncActsOn,
  type RemoteSnapshot,
  type SyncActionKind,
} from './syncDecision.pure';
import { writeFileAtomicSync } from './atomicFile';
import {
  appendHealthPoint,
  buildDiagnosticItems,
  buildDiagnosticReport,
  buildDiagnosticsHistory,
  buildSupportInfo,
  computeCloudHealth,
  suggestActionFor,
  summarizeHealthTrend,
  type DiagnosticsHistoryEntry,
  type HealthPoint,
  type HealthTrend,
  type SuggestedAction,
  type SyncEngineInfo,
  type CloudHealth,
  type DiagnosticItem,
  type DiagnosticsSnapshot,
  type ProbeState,
} from './cloudDiagnostics.pure';

/**
 * محرّك المزامنة — يُنسّق بين المصادقة وطبقة Drive API وفحوصات السلامة.
 * معزول تمامًا عن منطق الأعمال: لا يعرف شيئًا عن Prisma أو الخادم الخلفي،
 * يتعامل فقط مع ملف قاعدة البيانات كملف ثنائي.
 *
 * ملاحظة تعارض: لا يوجد حل تلقائي للتعارضات (خارج نطاق هذه الحزمة عمدًا).
 * إن تغيّرت النسختان المحلية والسحابية معًا منذ آخر مزامنة، تتوقف المزامنة
 * التلقائية عن التصرّف وتُبلّغ عن التعارض؛ القرار النهائي يبقى للمستخدم عبر
 * حوار حلّ التعارض (Google Drive Conflict Resolution Pack v1).
 *
 * ── Production Hardening Pack v1 ────────────────────────────────────────────
 * أُضيفت إلى هذا الملف أربع ضمانات إنتاجية، وكلها تمرّ من نقاط مركزية واحدة:
 *   • P0-1/P0-3 · موت المنحة يُكتشف ويُصنَّف ويُمسح التوكن ⇒ حالة `GRANT_DEAD`.
 *   • P0-4      · قفل واحد يمنع تراكب أي عمليتي مزامنة (`syncMutex`).
 *   • P0-6      · كل كتابة لملف الحالة ذرّية.
 *   • P0-7      · لا كتابة فوق نسخة سحابية تغيّرت ⇒ تعارض يقرّره المستخدم.
 */

export type SyncStatus =
  | 'READY'
  | 'CHECKING'
  | 'DOWNLOADING'
  | 'UPLOADING'
  | 'COMPLETED'
  | 'FAILED'
  | 'OFFLINE'
  | 'CONFLICT'
  /** المنحة ميتة: التوكن حُذف، ولا مزامنة ممكنة قبل إعادة ربط الحساب. */
  | 'GRANT_DEAD';

interface SyncLogEntry {
  at: string;
  /**
   * `LOCAL_BACKUP` ليس عملية سحابية — هو أثر ضمانة النسخة المحلية التي تُنفَّذ بعد
   * فشل عملية سحابية (Cloud-Failure Local Backup Guarantee v1). يُسجَّل كإدخال
   * مستقلّ حتى يميّز السجلّ بوضوح بين «فشل الرفع السحابي» و«نجحت النسخة المحلية».
   */
  action: 'UPLOAD' | 'DOWNLOAD' | 'AUTH' | 'DISCONNECT' | 'CONFLICT' | 'RESCUE_BACKUP';
  result: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'RETRY';
  message: string;
  /** الجهاز الذي نفّذ هذا الإدخال — الجهاز الحالي دائمًا (السجلّ محلي لكل جهاز). */
  deviceId?: string;
  deviceName?: string;
  /** موجودة فقط عند كون هذا الإدخال نتيجة حلّ تعارض. */
  conflictResolved?: boolean;
  resolutionSelected?: 'LOCAL' | 'REMOTE';
  /**
   * Production Polish Pack v1 — §1/§2 · زمن العملية.
   *
   * قياس بحت لا يشارك في أي قرار: يُلتقط وقت البدء عند دخول العملية، وتُحسب المدّة
   * عند كتابة الإدخال النهائي. غيابهما في الإدخالات القديمة مقصود ومُتوقَّع — الواجهة
   * تعرض المدّة فقط حين توجد، ولا تخترع صفرًا.
   */
  startedAt?: string;
  durationMs?: number;
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
  /**
   * P0-1 — حالة موت المنحة **دائمة عبر إعادة التشغيل**.
   *
   * بدونها كان مسح التوكن الميت يجعل الواجهة تعرض «غير مرتبط» فقط، فيفقد المستخدم
   * السبب تمامًا بعد أول إعادة تشغيل ويظنّ أنه لم يربط الحساب أصلًا. هذه الحقول
   * تُبقي «لماذا انقطع الربط» ظاهرًا حتى يُعاد الربط فعليًا.
   */
  grantDeadAt?: string | null;
  grantDeadCode?: string | null;
  grantDeadMessage?: string | null;
  /**
   * Production UX & Diagnostics Pack v1 — أثر تشخيصي بحت (لا يشارك في أي قرار).
   *
   * `lastRemote` لقطة لآخر ملف Drive **رُصد فعلًا**، تُسجَّل عند كل قراءة تمّت
   * لسبب آخر أصلًا — فلا تُضاف بها ولا استعلام واحد إلى Google. غرضها الوحيد أن
   * يعرض مركز التشخيص «إصدار قاعدة البيانات السحابية» بعد إعادة تشغيل التطبيق
   * بلا أن يضطر لسؤال Drive من جديد (§9: ممنوع الاستعلام المتكرر).
   */
  lastConflictCheckAt?: string | null;
  lastConnectionTestAt?: string | null;
  /** §5 — تاريخ مؤشر الصحة، أحدث أولًا. يُسجَّل عند تغيّر النتيجة فقط. */
  healthHistory?: HealthPoint[];
  lastRemote?: {
    version: number | null;
    sha256: string | null;
    modifiedTime: string;
    sizeBytes: number;
    deviceName: string | null;
    observedAt: string;
  } | null;
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
  grantDeadAt: null,
  grantDeadCode: null,
  grantDeadMessage: null,
  lastConflictCheckAt: null,
  lastConnectionTestAt: null,
  healthHistory: [],
  lastRemote: null,
  log: [],
};

/** يمسح وسم المنحة الميتة — يُستدعى عند كل نجاح فعلي يثبت أن الربط حيّ. */
const CLEARED_GRANT_STATE = { grantDeadAt: null, grantDeadCode: null, grantDeadMessage: null } as const;

const MAX_LOG_ENTRIES = 50;
/** بطاقة تعريف المحرّك (§6) — مصدر واحد يظهر في الشاشة والتقرير وملف Excel. */
const SYNC_ENGINE_VERSION = 'v1.3 — Production Polish Pack v1';
const SYNC_ENGINE_UPDATED_AT = '2026-08-05';
/** حدّ تاريخ مؤشر الصحة — يُسجَّل عند التغيّر فقط، فعشرون نقطة تغطي مدى طويلًا. */
const MAX_HEALTH_POINTS = 20;
const STARTUP_TIMEOUT_MS = 8000;
const SHUTDOWN_TIMEOUT_MS = 20000;

let currentStatus: SyncStatus = 'READY';
let currentMessage = '';

/**
 * P0-4 — القفل الوحيد لكل عمليات المزامنة في العملية الرئيسية.
 * يُؤخذ عند المداخل العامة فقط؛ التنفيذ الداخلي (`*Internal`) لا يأخذه أبدًا وإلا
 * لرفضت `performSyncNow` نفسها حين تستدعي الرفع/التنزيل داخليًا.
 */
const syncMutex = createSyncMutex();

/**
 * لقطة الملف السحابي التي بُني عليها آخر تعارض عُرض على المستخدم.
 *
 * حوار حلّ التعارض قد يبقى مفتوحًا دقائق. اختيار «الاحتفاظ بالمحلي» بعدها يرفع فوق
 * نسخة سحابية **قد تكون تغيّرت مرتين** منذ عرض الحوار — وهذا هو أوسع نافذة لفقدان
 * تحديث في النظام كله. حفظ اللقطة هنا يجعل الرفع اللاحق قادرًا على اكتشاف ذلك
 * ورفض الكتابة، بلا أي تغيير في بروتوكول IPC ولا في شكل البيانات المُرسَلة للواجهة.
 */
let lastConflictRemote: RemoteSnapshot | null = null;

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

/**
 * P0-6 — كتابة ذرّية. الكتابة المباشرة السابقة كانت تترك ملفًا مبتورًا عند انقطاع
 * الكهرباء، فيُقرأ لاحقًا كـ«لا بيانات مزامنة» ⇒ **تعارض كاذب** يُعرض على المستخدم.
 */
function saveMetadata(dataDir: string, metadata: SyncMetadata): void {
  writeFileAtomicSync(metadataPath(dataDir), JSON.stringify(metadata, null, 2), { mode: 0o600 });
}

/**
 * يحسب حقلَي التوقيت لإدخال السجلّ من لحظة بدء العملية.
 * يُستدعى عند كتابة الإدخال النهائي فقط — لا داخل إعادة المحاولات.
 */
function timing(startedAt: string): { startedAt: string; durationMs: number } {
  return { startedAt, durationMs: Math.max(0, Date.now() - Date.parse(startedAt)) };
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
 * `isRetryableSyncError` (شبكة/مهلة/5xx/429/حدّ معدّل — أعطال المصادقة لا تُعاد أبدًا).
 * `syncRetryDelay` يحترم `Retry-After` حين يُرسله Google (P0-9).
 */
function driveRetryOptions(dataDir: string, action: 'UPLOAD' | 'DOWNLOAD') {
  return {
    isRetryable: isRetryableSyncError,
    getRetryDelayMs: syncRetryDelay,
    onRetry: (attempt: number, err: unknown, delayMs: number) => {
      const reason = toUserFacingSyncError(err);
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

// ─── نسخة الإنقاذ عند فشل السحابة (Rescue Backup) ───────────────────────────

/** نتيجة نسخة الإنقاذ المصاحبة لفشل سحابي — تُعاد للواجهة لتعرض الحالتين معًا. */
export type RescueBackupOutcome = RescueBackupResult;

/**
 * تُستدعى من **كل** مسار فشل سحابي: رفع، تنزيل، أو مزامنة كاملة (بما فيها انقطاع
 * الشبكة وفشل المصادقة قبل الوصول إلى Drive أصلًا). تُنشئ نسخة محلية عبر مسار
 * النسخ المحلي القائم وتُسجّل النتيجة كإدخال `LOCAL_BACKUP` مستقلّ في السجلّ.
 *
 * ثلاث ضمانات ملزِمة:
 *   1. **لا ترمي أبدًا** — الوحدة المستدعاة لا ترمي، وهنا حارس ثانٍ. معالجة الفشل
 *      السحابي الأصلي (تسجيل، حالة، قيمة الإرجاع) يجب أن تكتمل مهما جرى هنا.
 *   2. **تُستدعى مرة واحدة لكل فشل** — بعد استنفاد إعادة المحاولات، لا داخلها،
 *      فلا تتولّد نسخة لكل محاولة فاشلة.
 *   3. **لا تلمس `dbPath`** — قراءة فقط؛ فشل الرفع لا يمسّ القاعدة أصلًا.
 */
async function guaranteeRescueBackup(
  dbPath: string,
  dataDir: string,
  context: string,
): Promise<RescueBackupOutcome> {
  const startedAt = new Date().toISOString();
  try {
    const result = await createRescueBackup(dbPath, path.join(dataDir, 'backups'));
    const message = result.ok
      ? `تعذّرت العملية السحابية (${context}) — أُنشئت نسخة إنقاذ محلية بنجاح: ${result.fileName}`
      : `تعذّرت العملية السحابية (${context}) وفشل إنشاء نسخة الإنقاذ المحلية: ${result.error ?? 'سبب غير معروف'}`;
    saveMetadata(
      dataDir,
      appendLog(dataDir, loadMetadata(dataDir), {
        action: 'RESCUE_BACKUP',
        result: result.ok ? 'SUCCESS' : 'FAILED',
        message,
        ...timing(startedAt),
      }),
    );
    return result;
  } catch (err) {
    // حارس أخير: حتى فشل التسجيل نفسه لا يجوز أن يُخفي الفشل السحابي الأصلي.
    return { ok: false, via: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── P0-1 · اكتشاف موت المنحة والتعافي منه ────────────────────────────────────

/**
 * النقطة **الوحيدة** التي يُعالَج فيها موت المنحة في النظام كله.
 *
 * تُستدعى من كل مسار فشل. إن كان الخطأ واحدًا من `invalid_grant` /
 * `unauthorized_client` / `access_denied` فهذا ليس عطلًا عابرًا يُعاد معه المحاولة:
 * التوكن المخزَّن **لا يمكن أن ينجح مرة أخرى أبدًا**. فتفعل ثلاثة أشياء بالترتيب:
 *
 *   1. **تحذف التوكن الميت** — فلا تُبنى أي محاولة لاحقة عليه (شرط الحزمة الصريح:
 *      «ولا يسمح باستمرار المحاولات باستخدام التوكن الميت»). بعد الحذف تفشل
 *      `openDriveSession` عند بوابة `NOT_AUTHENTICATED` قبل أي نداء شبكي.
 *   2. **تُثبّت السبب في ملف الحالة** — فيبقى مفهومًا بعد إعادة تشغيل التطبيق،
 *      بدل أن يظهر الحساب «غير مرتبط» بلا تفسير.
 *   3. **تنقل الحالة إلى `GRANT_DEAD`** — وهي حالة مستقلة لا مجرّد رسالة خطأ،
 *      فتعرضها الواجهة كلافتة إجراء واضحة مع زرّ إعادة الربط.
 *
 * تُعيد `true` إن كانت المنحة ميتة، ليتجنّب المُستدعي الكتابة فوق الحالة برسالة
 * `FAILED` عامة تُخفي السبب الحقيقي.
 */
function handleGrantDeath(dataDir: string, err: unknown): boolean {
  const classified = classifyGoogleAuthError(err);
  if (!classified?.grantDead) return false;

  try {
    clearStoredAuth(dataDir);
  } catch {
    // فشل الحذف لا يجوز أن يمنع تسجيل الحالة — الحارس أدناه (`GRANT_DEAD` +
    // فشل فتح الجلسة) يبقى فعّالًا، والمحاولة التالية ستعيد الحذف.
  }

  let metadata = loadMetadata(dataDir);
  metadata = {
    ...metadata,
    grantDeadAt: new Date().toISOString(),
    grantDeadCode: classified.code,
    grantDeadMessage: classified.message,
    lastError: classified.message,
  };
  metadata = appendLog(dataDir, metadata, {
    action: 'AUTH',
    result: 'FAILED',
    message: `انتهت صلاحية ربط حساب Google (${classified.code}) — حُذف الرمز غير الصالح، وتوقّفت المزامنة حتى إعادة ربط الحساب`,
  });
  saveMetadata(dataDir, metadata);

  setStatus('GRANT_DEAD', classified.message);
  return true;
}

/** خطأ فتح الجلسة — يحمل رسالة عربية جاهزة ولا يمرّ عبر أي ترجمة إضافية. */
class SyncSessionError extends Error {
  readonly reason: 'NOT_CONFIGURED' | 'NOT_AUTHENTICATED' | 'GRANT_DEAD';
  constructor(reason: SyncSessionError['reason'], message: string) {
    super(message);
    this.name = 'SyncSessionError';
    this.reason = reason;
  }
}

/**
 * P0-7 — رُفض الرفع لأن النسخة السحابية تغيّرت منذ القراءة التي بُني عليها القرار.
 * ليس فشلًا: هو تعارض يُعرض على المستخدم ليقرّر، تمامًا كتعارض المزامنة العادي.
 */
class RemoteChangedError extends Error {
  readonly conflict: SyncConflict;
  constructor(conflict: SyncConflict) {
    super(
      'تغيّرت النسخة الموجودة على Google Drive من جهاز آخر أثناء تنفيذ العملية. ' +
        'أُوقف الرفع حتى لا تُستبدل تلك التغييرات دون علمك — يرجى اختيار النسخة التي تريد الاحتفاظ بها.',
    );
    this.name = 'RemoteChangedError';
    this.conflict = conflict;
  }
}

function requireSession(dataDir: string): { client: OAuth2Client } {
  const session = openDriveSession(dataDir);
  if (!session.ok) throw new SyncSessionError(session.reason, session.message);
  return { client: session.client };
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

// ─── أثر تشخيصي (Production UX & Diagnostics Pack v1) ────────────────────────

/**
 * نتيجة آخر فحص **فعلي** للاتصال وDrive في هذه الجلسة.
 *
 * تُملأ حصريًا من عمليات جرت لسبب آخر أصلًا (مزامنة، اختبار اتصال صريح). لا
 * مؤقّت، ولا استطلاع دوري، ولا نداء واحد يُطلق لمجرد تحديث بطاقة تشخيص — وهذا
 * نصّ الشرط §9. قبل أول فحص تبقى `unknown`، ومركز التشخيص يعرضها «لم يُفحص بعد»
 * بدل أن يدّعي عطلًا لم يُثبت.
 */
const probeCache: { internet: ProbeState; drive: ProbeState; storage: { usedBytes: number; limitBytes: number | null } | null } = {
  internet: 'unknown',
  drive: 'unknown',
  storage: null,
};

/** يسجّل لقطة الملف السحابي كما رُصد للتوّ — أثر عرض فقط، لا يشارك في أي قرار. */
function recordRemoteObservation(dataDir: string, remote: RemoteSnapshot | null): void {
  try {
    const metadata = loadMetadata(dataDir);
    saveMetadata(dataDir, {
      ...metadata,
      lastRemote: remote
        ? {
            version: remote.version,
            sha256: remote.sha256,
            modifiedTime: remote.modifiedTime,
            sizeBytes: remote.size,
            deviceName: remote.deviceName,
            observedAt: new Date().toISOString(),
          }
        : null,
    });
    probeCache.drive = 'ok';
    probeCache.internet = 'ok';
  } catch {
    // أثر تشخيصي بحت — فشل تسجيله لا يجوز أن يؤثر على أي عملية مزامنة.
  }
}

/** يسجّل أن فحص تعارض تمّ الآن — يُميّز «لا تعارض» عن «لم يُفحص بعد» في التشخيص. */
function recordConflictCheck(dataDir: string): void {
  try {
    saveMetadata(dataDir, { ...loadMetadata(dataDir), lastConflictCheckAt: new Date().toISOString() });
  } catch {
    /* أثر تشخيصي بحت */
  }
}

// ─── حالة وسجلّ ────────────────────────────────────────────────────────────

export async function getSyncStatus(dbPath: string, dataDir: string) {
  const creds = loadClientCredentials(dataDir);
  const configured = !!creds;
  const authenticated = configured && isAuthenticated(dataDir);
  const metadata = loadMetadata(dataDir);
  const dbExists = fs.existsSync(dbPath);
  const device = getOrCreateDeviceIdentity(dataDir);

  // إعادة الربط مطلوبة حين مات الربط ولم يُعَد إنشاؤه بعد. الشرط المزدوج مقصود:
  // ربطٌ ناجح لاحقًا يمسح الوسم، فلا تبقى اللافتة معلّقة بعد حلّ المشكلة.
  const needsReauth = !!metadata.grantDeadAt && !authenticated;

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
    /** P0-1/P0-11 — تحتاج الواجهة إظهار زرّ «إعادة ربط حساب Google». */
    needsReauth,
    /** سبب انقطاع الربط بالعربية — يبقى ظاهرًا بعد إعادة تشغيل التطبيق. */
    grantDeadMessage: needsReauth ? metadata.grantDeadMessage ?? null : null,
    localDb: { exists: dbExists, sizeBytes: dbExists ? fs.statSync(dbPath).size : 0 },
    device: { deviceId: device.deviceId, deviceName: device.deviceName },
  };
}

/**
 * سجلّ المزامنة **مُثرًى بالإجراء المقترح** لكل إدخال (§2).
 *
 * الاستنتاج يبقى في الوحدة النقية `suggestActionFor` ويُحسب هنا مرة واحدة، فلا
 * تُكرَّر القاعدة في الواجهة ولا تنحرف عنها. الإثراء إضافي بحت: الحقول الأصلية
 * كما هي، فأي مستهلك قديم لا يتأثر.
 */
export function getSyncLog(dataDir: string): Array<SyncLogEntry & { suggestedAction: SuggestedAction }> {
  return loadMetadata(dataDir).log.map((entry) => ({ ...entry, suggestedAction: suggestActionFor(entry) }));
}

// ─── مصادقة ──────────────────────────────────────────────────────────────

export async function authenticate(dataDir: string): Promise<{ ok: boolean; email?: string; error?: string }> {
  const creds = loadClientCredentials(dataDir);
  if (!creds) {
    return { ok: false, error: 'لم تُعدّ المزامنة السحابية في هذه النسخة من البرنامج — يرجى التواصل مع الدعم الفني.' };
  }

  const startedAt = new Date().toISOString();
  try {
    setStatus('CHECKING', 'جارٍ تسجيل الدخول عبر المتصفح...');
    const { email } = await runAuthFlow(dataDir, creds);
    let metadata = loadMetadata(dataDir);
    // الربط الناجح يُبطل وسم المنحة الميتة نهائيًا — وإلا بقيت لافتة «أعد الربط»
    // معروضة بعد أن أعاد المستخدم الربط فعلًا.
    metadata = { ...metadata, ...CLEARED_GRANT_STATE, lastError: null };
    metadata = appendLog(dataDir, metadata, {
      action: 'AUTH',
      result: 'SUCCESS',
      message: `تم تسجيل الدخول: ${email}`,
      ...timing(startedAt),
    });
    saveMetadata(dataDir, metadata);
    setStatus('READY');
    return { ok: true, email };
  } catch (err) {
    const message = toUserFacingSyncError(err);
    saveMetadata(
      dataDir,
      appendLog(dataDir, loadMetadata(dataDir), { action: 'AUTH', result: 'FAILED', message, ...timing(startedAt) }),
    );
    setStatus('FAILED', message);
    return { ok: false, error: message };
  }
}

export async function disconnect(dataDir: string): Promise<{ ok: boolean }> {
  const creds = loadClientCredentials(dataDir);
  await revokeAuth(dataDir, creds);
  let metadata = loadMetadata(dataDir);
  // الفصل المتعمَّد يُنهي أي وسم «منحة ميتة»: الحساب غير مرتبط الآن بقرار المستخدم،
  // لا بسبب عطل يحتاج تنبيهًا.
  metadata = { ...metadata, ...CLEARED_GRANT_STATE };
  metadata = appendLog(dataDir, metadata, { action: 'DISCONNECT', result: 'SUCCESS', message: 'تم فصل الحساب' });
  saveMetadata(dataDir, metadata);
  lastConflictRemote = null;
  setStatus('READY');
  return { ok: true };
}

// ─── قرار الاتجاه وكشف التعارض ────────────────────────────────────────────────

type SyncAction = SyncActionKind;

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
  /** لقطة الملف السحابي التي بُني عليها هذا القرار — أساس حماية فقدان التحديث. */
  remote: RemoteSnapshot | null;
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

/**
 * القرار الأساسي — قراءة فقط، بلا تسجيل. يُستدعى من كل تدفّقات المزامنة الفعلية ومن
 * الفحص السلبي للواجهة. جمع الحقائق هنا؛ **القواعد** نفسها في `syncDecision.pure.ts`
 * حيث هي مُغطّاة بالاختبارات بالكامل (P0-10).
 */
async function decide(client: OAuth2Client, dbPath: string, dataDir: string): Promise<SyncDecision> {
  const metadata = loadMetadata(dataDir);
  const dbExists = fs.existsSync(dbPath);
  const localHash = dbExists ? await sha256File(dbPath) : null;
  // إعادة محاولة خفيفة وبلا تسجيل دائم — مجرّد فحص أولي؛ الرفع/التنزيل الفعلي
  // أدناه له إعادة محاولة كاملة مع تسجيل عند تنفيذ الإجراء المُقرَّر.
  const remote = await withRetry(() => findRemoteSyncFile(client), {
    maxAttempts: 2,
    isRetryable: isRetryableSyncError,
    getRetryDelayMs: syncRetryDelay,
  });

  const decision = decideSyncAction({
    localHash,
    remote,
    metadata: { lastSyncedHash: metadata.lastSyncedHash, lastSyncedLocalHash: metadata.lastSyncedLocalHash },
    isPristineSeed: isPristineSeed(dataDir, localHash, getSeedTemplatePath()),
  });

  if (decision.action === 'CONFLICT' && remote && localHash) {
    return { ...decision, remote, conflict: buildConflict(dataDir, dbPath, localHash, remote) };
  }
  return { ...decision, remote };
}

/**
 * فحص سلبي للتعارض — بلا تسجيل، للاستخدام من الواجهة عند فتح صفحة المزامنة
 * (لعرض حوار الحل استباقيًا) دون انتظار ضغط المستخدم على "مزامنة الآن".
 * يُحدِّث حالة العرض الحيّة عند وجود تعارض حتى تعكسها شارة الحالة فورًا.
 */
export async function checkForConflict(dbPath: string, dataDir: string): Promise<SyncConflict | null> {
  // فحص سلبي: إن كانت هناك عملية جارية فلا معنى لفحص متزامن معها — تجاهل صامت.
  const outcome = await syncMutex.run('CONFLICT_CHECK', async () => {
    const session = openDriveSession(dataDir);
    if (!session.ok) {
      // موت منحة مُكتشَف محليًا (عدم تطابق العميل) يُعالَج كاملًا حتى في هذا
      // المسار الصامت — وإلا بقيت الواجهة تعرض «متصل» حتى أول عملية صريحة.
      if (session.reason === 'GRANT_DEAD') handleGrantDeath(dataDir, session.error);
      return null;
    }
    try {
      const decision = await decide(session.client, dbPath, dataDir);
      recordRemoteObservation(dataDir, decision.remote);
      recordConflictCheck(dataDir);
      if (decision.action === 'CONFLICT' && decision.conflict) {
        lastConflictRemote = decision.remote;
        setStatus('CONFLICT', decision.reason);
        return decision.conflict;
      }
      return null;
    } catch (err) {
      // الفحص السلبي لا يُبلّغ عن أخطاء عابرة، لكنه **لا يبتلع موت المنحة**:
      // ذاك حالة دائمة يجب أن تظهر للمستخدم فورًا لا أن تنتظر عملية صريحة.
      handleGrantDeath(dataDir, err);
      return null;
    }
  });

  return outcome.ok ? outcome.value : null;
}

// ─── رفع ────────────────────────────────────────────────────────────────────

interface ActionOptions {
  /** يُوسَم به إدخال السجلّ عند كون هذا الرفع/التنزيل ناتجًا عن حلّ تعارض صريح. */
  resolvesConflict?: boolean;
  /**
   * P0-7 — لقطة الملف السحابي التي بُني عليها قرار الرفع. إن تغيّر الملف البعيد
   * عنها وقت التنفيذ، يُرفض الرفع ويُحوَّل إلى تعارض بدل الكتابة الصامتة فوقه.
   */
  expectedRemote?: RemoteSnapshot | null;
}

export interface UploadResult {
  ok: boolean;
  error?: string;
  rescueBackup?: RescueBackupOutcome;
  /** موجودة عند رفض الرفع لتغيّر النسخة السحابية (P0-7). */
  conflict?: SyncConflict;
  /** المنحة ميتة — الإجراء المطلوب هو إعادة ربط الحساب لا إعادة المحاولة. */
  needsReauth?: boolean;
  /** رُفضت العملية لوجود مزامنة أخرى جارية (P0-4). */
  busy?: boolean;
}

async function uploadInternal(
  dbPath: string,
  dataDir: string,
  opts: ActionOptions = {},
): Promise<UploadResult> {
  if (!fs.existsSync(dbPath)) return { ok: false, error: 'ملف قاعدة البيانات المحلي غير موجود' };

  // نسخة مؤقتة "آمنة للقراءة" — لا يُرفع مطلقًا الملف الحيّ نفسه، بل لقطة مجمّدة
  // منه بعد تفريغ WAL، بحيث لا تتزامن كتابة نشطة مع قراءة/رفع الملف أبدًا.
  const snapshotPath = path.join(dataDir, `sync-tmp-snapshot-${Date.now()}.db`);
  const startedAt = new Date().toISOString();

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

    const { client } = requireSession(dataDir);
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

    /**
     * P0-7 · الطبقة الأولى — مقارنة بما بُني عليه **القرار** (قد يكون قبل دقائق:
     * حوار حلّ التعارض يبقى مفتوحًا بانتظار المستخدم). هذه هي النافذة الواسعة.
     */
    if (opts.expectedRemote !== undefined && remoteChangedSince(opts.expectedRemote, remote)) {
      throw new RemoteChangedError(
        remote
          ? buildConflict(dataDir, dbPath, localHash, remote)
          : buildConflict(dataDir, dbPath, localHash, {
              sha256: null, modifiedTime: new Date().toISOString(), size: 0, deviceId: null, deviceName: null,
            }),
      );
    }

    const version = (remote?.version ?? 0) + 1;

    /**
     * P0-7 · الطبقة الثانية — إعادة قراءة **مباشرة قبل الكتابة**. تُضيّق النافذة
     * المتبقّية إلى أجزاء من الثانية بدل مدّة تجهيز اللقطة وحساب البصمات كاملة.
     */
    setStatus('UPLOADING', 'جارٍ التحقق من عدم تغيّر النسخة على Google Drive...');
    const freshRemote = await withRetry(() => findRemoteSyncFile(client), retryOpts);
    if (remoteChangedSince(remote, freshRemote)) {
      throw new RemoteChangedError(
        freshRemote
          ? buildConflict(dataDir, dbPath, localHash, freshRemote)
          : buildConflict(dataDir, dbPath, localHash, {
              sha256: null, modifiedTime: new Date().toISOString(), size: 0, deviceId: null, deviceName: null,
            }),
      );
    }

    setStatus('UPLOADING', 'جارٍ رفع قاعدة البيانات إلى Google Drive...');
    const uploaded = await withRetry(
      () => uploadDatabase(client, snapshotPath, {
        fileId: freshRemote?.id ?? null,
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
      ...CLEARED_GRANT_STATE,
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
      ...timing(startedAt),
      ...(opts.resolvesConflict ? { conflictResolved: true, resolutionSelected: 'LOCAL' as const } : {}),
    });
    saveMetadata(dataDir, metadata);
    recordRemoteObservation(dataDir, uploaded);
    lastConflictRemote = null;
    setStatus('COMPLETED');
    return { ok: true };
  } catch (err) {
    // فشل الرفع لا يمسّ dbPath إطلاقًا — القاعدة السابقة تبقى كما هي دون أي تغيير.

    // P0-7 — تغيّر النسخة السحابية ليس فشلًا يستحق نسخة إنقاذ: لم تُنفَّذ أي كتابة،
    // والقاعدة المحلية سليمة، والمطلوب قرار من المستخدم لا إعادة محاولة.
    if (err instanceof RemoteChangedError) {
      let metadata = loadMetadata(dataDir);
      metadata = { ...metadata, lastError: err.message };
      metadata = appendLog(dataDir, metadata, {
        action: 'CONFLICT',
        result: 'SKIPPED',
        message: err.message,
        ...timing(startedAt),
      });
      saveMetadata(dataDir, metadata);
      lastConflictRemote = null;
      setStatus('CONFLICT', err.message);
      return { ok: false, error: err.message, conflict: err.conflict };
    }

    const message = toUserFacingSyncError(err);
    const needsReauth = handleGrantDeath(dataDir, err);

    let metadata = loadMetadata(dataDir);
    metadata = { ...metadata, lastError: message };
    metadata = appendLog(dataDir, metadata, {
      action: 'UPLOAD',
      result: 'FAILED',
      message,
      ...timing(startedAt),
      ...(opts.resolvesConflict ? { conflictResolved: true, resolutionSelected: 'LOCAL' as const } : {}),
    });
    saveMetadata(dataDir, metadata);
    // حالة `GRANT_DEAD` أدقّ من `FAILED` ولا يجوز أن تُطمس برسالة عامة.
    if (!needsReauth) setStatus('FAILED', message);
    // ضمانة النسخة المحلية: فشل الرفع لأي سبب (invalid_grant، شبكة، مهلة، حصّة،
    // مصادقة…) لا يجوز أن يترك لقطة القاعدة الحالية بلا نسخة على القرص.
    const rescueBackup = await guaranteeRescueBackup(dbPath, dataDir, 'رفع إلى Google Drive');
    return { ok: false, error: message, rescueBackup, needsReauth: needsReauth || undefined };
  } finally {
    try { if (fs.existsSync(snapshotPath)) fs.unlinkSync(snapshotPath); } catch { /* أفضل جهد فقط */ }
  }
}

function busyResult(busy: MutexBusy): { ok: false; busy: true; error: string } {
  return { ok: false, busy: true, error: busy.message };
}

export async function performUpload(
  dbPath: string,
  dataDir: string,
  opts: ActionOptions = {},
): Promise<UploadResult> {
  const outcome = await syncMutex.run('UPLOAD', () => uploadInternal(dbPath, dataDir, opts));
  return outcome.ok ? outcome.value : busyResult(outcome);
}

// ─── تنزيل + استبدال آمن ─────────────────────────────────────────────────────

export interface DownloadResult {
  ok: boolean;
  error?: string;
  requiresRestart?: boolean;
  backendRestarted?: boolean;
  rescueBackup?: RescueBackupOutcome;
  needsReauth?: boolean;
  busy?: boolean;
}

async function downloadInternal(
  dbPath: string,
  dataDir: string,
  opts: ActionOptions = {},
): Promise<DownloadResult> {
  const tempPath = path.join(dataDir, `sync-tmp-download-${Date.now()}.db`);
  const startedAt = new Date().toISOString();
  const preSyncDir = path.join(dataDir, 'backups', 'pre-sync');
  let preSyncBackupPath: string | null = null;
  // "قيد الاستخدام" فعليًا يعني الخادم الخلفي يعمل ويحمل قفل ملف SQLite (يحدث
  // هذا فقط على ويندوز؛ لا يوجد قفل حصري مكافئ على أنظمة POSIX). عند تشغيل
  // مزامنة بدء التشغيل، الخادم لم يبدأ بعد — لا حاجة لإيقاف/إعادة تشغيل شيء.
  let backendStopped = false;

  try {
    setStatus('DOWNLOADING', 'جارٍ تنزيل النسخة الاحتياطية من Google Drive...');
    const { client } = requireSession(dataDir);
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
      ...CLEARED_GRANT_STATE,
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
      ...timing(startedAt),
      ...(opts.resolvesConflict ? { conflictResolved: true, resolutionSelected: 'REMOTE' as const } : {}),
    });
    saveMetadata(dataDir, metadata);
    recordRemoteObservation(dataDir, remote);
    lastConflictRemote = null;
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
    const message = toUserFacingSyncError(err);
    const needsReauth = handleGrantDeath(dataDir, err);

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
      ...timing(startedAt),
      ...(opts.resolvesConflict ? { conflictResolved: true, resolutionSelected: 'REMOTE' as const } : {}),
    });
    saveMetadata(dataDir, metadata);
    if (!needsReauth) setStatus('FAILED', message);
    // يُستدعى بعد التراجع أعلاه، فاللقطة المنسوخة هي القاعدة المحلية السليمة —
    // لا نسخة عن حالة وسيطة. الخادم الخلفي قد يكون متوقفًا هنا (نُعيده في `finally`)،
    // وهي أأمن لحظة للقطة: لا كاتب مفتوح على الملف.
    const rescueBackup = await guaranteeRescueBackup(dbPath, dataDir, 'تنزيل من Google Drive');
    return { ok: false, error: message, rescueBackup, needsReauth: needsReauth || undefined };
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

export async function performDownload(
  dbPath: string,
  dataDir: string,
  opts: ActionOptions = {},
): Promise<DownloadResult> {
  const outcome = await syncMutex.run('DOWNLOAD', () => downloadInternal(dbPath, dataDir, opts));
  return outcome.ok ? outcome.value : busyResult(outcome);
}

// ─── حلّ التعارض ────────────────────────────────────────────────────────────

/**
 * ينفّذ اختيار المستخدم الصريح في حوار حلّ التعارض. "الإلغاء" لا يستدعي هذه
 * الدالة أبدًا — يُغلق الحوار في الواجهة فقط، ولا يُغيَّر أي من النسختين.
 *
 * P0-7: اختيار «المحلي» يُمرَّر معه اللقطة السحابية التي عُرض الحوار بناءً عليها.
 * فإن كان جهاز آخر قد رفع بينما الحوار مفتوح، يُرفض الرفع ويُعاد عرض تعارض
 * **جديد** مبني على الوضع الحالي — بدل دهس تغييرات لم يرها المستخدم أصلًا.
 */
export async function resolveConflict(
  choice: 'LOCAL' | 'REMOTE',
  dbPath: string,
  dataDir: string,
): Promise<UploadResult & DownloadResult> {
  const expectedRemote = lastConflictRemote;
  const outcome = await syncMutex.run('RESOLVE_CONFLICT', async () => {
    if (choice === 'LOCAL') {
      return uploadInternal(dbPath, dataDir, { resolvesConflict: true, expectedRemote });
    }
    return downloadInternal(dbPath, dataDir, { resolvesConflict: true });
  });
  return outcome.ok ? outcome.value : busyResult(outcome);
}

// ─── مزامنة يدوية كاملة ("مزامنة الآن") ──────────────────────────────────────

export interface SyncNowResult {
  ok: boolean;
  action: SyncAction;
  error?: string;
  requiresRestart?: boolean;
  backendRestarted?: boolean;
  conflict?: SyncConflict;
  rescueBackup?: RescueBackupOutcome;
  needsReauth?: boolean;
  busy?: boolean;
}

async function syncNowInternal(dbPath: string, dataDir: string): Promise<SyncNowResult> {
  try {
    const { client } = requireSession(dataDir);

    setStatus('CHECKING', 'جارٍ التحقق من حالة المزامنة...');
    const online = await checkConnectivity();
    probeCache.internet = online ? 'ok' : 'fail';
    if (!online) {
      probeCache.drive = 'unknown';
      setStatus('OFFLINE');
      // انقطاع الشبكة فشل سحابي كأي فشل آخر — الضمانة تسري عليه بنصّ المواصفة.
      const rescueBackup = await guaranteeRescueBackup(dbPath, dataDir, 'لا يوجد اتصال بالإنترنت');
      return {
        ok: false,
        action: 'NONE',
        error: 'لا يوجد اتصال بالإنترنت. تحقّق من الاتصال ثم أعد المحاولة.',
        rescueBackup,
      };
    }

    const decision = await decide(client, dbPath, dataDir);
    recordRemoteObservation(dataDir, decision.remote);
    recordConflictCheck(dataDir);

    if (decision.action === 'CONFLICT') {
      lastConflictRemote = decision.remote;
      setStatus('CONFLICT', decision.reason);
      saveMetadata(dataDir, appendLog(dataDir, loadMetadata(dataDir), { action: 'CONFLICT', result: 'SKIPPED', message: decision.reason }));
      return { ok: false, action: 'CONFLICT', error: decision.reason, conflict: decision.conflict };
    }
    if (decision.action === 'DOWNLOAD') {
      const result = await downloadInternal(dbPath, dataDir);
      return {
        ok: result.ok,
        action: 'DOWNLOAD',
        error: result.error,
        requiresRestart: result.requiresRestart,
        backendRestarted: result.backendRestarted,
        // النسخة المحلية أُنشئت داخل `downloadInternal` — تُمرَّر كما هي، بلا نسخة ثانية.
        rescueBackup: result.rescueBackup,
        needsReauth: result.needsReauth,
      };
    }
    if (decision.action === 'UPLOAD') {
      // P0-7 — الرفع يعرف على أي حالة سحابية بُني هذا القرار.
      const result = await uploadInternal(dbPath, dataDir, { expectedRemote: decision.remote });
      // رُفض الرفع لتغيّر النسخة السحابية ⇒ تعارض يُعرض للمستخدم، لا فشل صامت.
      if (result.conflict) {
        return { ok: false, action: 'CONFLICT', error: result.error, conflict: result.conflict };
      }
      return {
        ok: result.ok,
        action: 'UPLOAD',
        error: result.error,
        rescueBackup: result.rescueBackup,
        needsReauth: result.needsReauth,
      };
    }

    setStatus('READY');
    return { ok: true, action: 'NONE', error: decision.reason };
  } catch (err) {
    // فشل قبل بلوغ الرفع/التنزيل أصلًا (مصادقة، بيانات اعتماد ناقصة، تعذّر الفحص) —
    // الضمانة تسري هنا أيضًا، وهذا هو المسار الذي يلتقط `invalid_grant` تحديدًا.
    const message = toUserFacingSyncError(err);
    const needsReauth = handleGrantDeath(dataDir, err);
    if (!needsReauth) setStatus('FAILED', message);
    const rescueBackup = await guaranteeRescueBackup(dbPath, dataDir, 'مزامنة Google Drive');
    return { ok: false, action: 'NONE', error: message, rescueBackup, needsReauth: needsReauth || undefined };
  }
}

export async function performSyncNow(dbPath: string, dataDir: string): Promise<SyncNowResult> {
  const outcome = await syncMutex.run('SYNC_NOW', () => syncNowInternal(dbPath, dataDir));
  return outcome.ok ? outcome.value : { ...busyResult(outcome), action: 'NONE' };
}

// ─── مزامنة تلقائية عند بدء التشغيل / الإغلاق ─────────────────────────────────

/** مزامنة بدء التشغيل — تُنزّل نسخة أحدث إن وُجدت فقط. لا تُعطّل بدء التطبيق أبدًا. عند تعارض: تُسجّله وتتوقف. */
export async function performStartupSync(dbPath: string, dataDir: string): Promise<void> {
  await syncMutex.run('STARTUP_SYNC', async () => {
    try {
      const session = openDriveSession(dataDir);
      if (!session.ok) {
        // منحة ميتة مُكتشَفة محليًا: تُسجَّل وتُعرض، ولا تُعطّل بدء التطبيق.
        if (session.reason === 'GRANT_DEAD') handleGrantDeath(dataDir, session.error);
        return;
      }

      const online = await withTimeout(checkConnectivity(3000), 3500, false);
      probeCache.internet = online ? 'ok' : 'fail';
      if (!online) {
        setStatus('OFFLINE');
        return;
      }

      const decision = await withTimeout(decide(session.client, dbPath, dataDir), STARTUP_TIMEOUT_MS, {
        action: 'NONE' as SyncAction,
        reason: 'انتهت مهلة الفحص',
        remote: null,
      });
      recordConflictCheck(dataDir);

      if (decision.action === 'CONFLICT') {
        lastConflictRemote = decision.remote;
        setStatus('CONFLICT', decision.reason);
        saveMetadata(dataDir, appendLog(dataDir, loadMetadata(dataDir), { action: 'CONFLICT', result: 'SKIPPED', message: decision.reason }));
        return;
      }
      if (startupSyncActsOn(decision.action)) {
        const result = await withTimeout(downloadInternal(dbPath, dataDir), STARTUP_TIMEOUT_MS, {
          ok: false,
          error: 'انتهت المهلة',
        } as DownloadResult);
        // انتهاء المهلة يعني أن `downloadInternal` لم تصل إلى مسار الفشل الداخلي بعد،
        // فلم تُنشئ نسخة. الضمانة تُستكمل هنا — وشرط `!rescueBackup` يمنع التكرار.
        if (!result.ok && !result.rescueBackup) {
          await guaranteeRescueBackup(dbPath, dataDir, 'مزامنة بدء التشغيل');
        }
      } else {
        setStatus('READY');
      }
    } catch (err) {
      // لا تعطّل بدء التطبيق أبدًا — استمر بقاعدة البيانات المحلية الحالية
      const message = toUserFacingSyncError(err);
      if (!handleGrantDeath(dataDir, err)) setStatus('FAILED', message);
      await guaranteeRescueBackup(dbPath, dataDir, 'مزامنة بدء التشغيل');
    }
  });
}

/** مزامنة الإغلاق — ترفع فقط عند وجود تغييرات محلية. تُستدعى بعد إيقاف الخادم الخلفي. عند تعارض: تُسجّله وتتوقف. */
export async function performShutdownSync(dbPath: string, dataDir: string): Promise<void> {
  await syncMutex.run('SHUTDOWN_SYNC', async () => {
    try {
      const session = openDriveSession(dataDir);
      if (!session.ok) {
        if (session.reason === 'GRANT_DEAD') handleGrantDeath(dataDir, session.error);
        return;
      }
      if (!fs.existsSync(dbPath)) return;

      const online = await withTimeout(checkConnectivity(3000), 3500, false);
      probeCache.internet = online ? 'ok' : 'fail';
      if (!online) return;

      const decision = await withTimeout(decide(session.client, dbPath, dataDir), SHUTDOWN_TIMEOUT_MS / 2, {
        action: 'NONE' as SyncAction,
        reason: 'انتهت مهلة الفحص',
        remote: null,
      });

      if (decision.action === 'CONFLICT') {
        lastConflictRemote = decision.remote;
        setStatus('CONFLICT', decision.reason);
        saveMetadata(dataDir, appendLog(dataDir, loadMetadata(dataDir), { action: 'CONFLICT', result: 'SKIPPED', message: decision.reason }));
        return;
      }
      if (shutdownSyncActsOn(decision.action)) {
        const result = await withTimeout(
          uploadInternal(dbPath, dataDir, { expectedRemote: decision.remote }),
          SHUTDOWN_TIMEOUT_MS,
          { ok: false, error: 'انتهت المهلة' } as UploadResult,
        );
        // أهمّ مسار في هذه الحزمة: رفع الإغلاق يفشل غالبًا بـ`invalid_grant`، والخادم
        // الخلفي متوقّف هنا عمدًا — فتتولّى اللقطة المباشرة إنشاء النسخة. شرط
        // `!rescueBackup` يمنع نسخة ثانية حين تكون `uploadInternal` قد أنشأتها فعلًا،
        // وشرط `!conflict` يمنع نسخة عن رفض تعارض ليس فشلًا أصلًا.
        if (!result.ok && !result.rescueBackup && !result.conflict) {
          await guaranteeRescueBackup(dbPath, dataDir, 'مزامنة الإغلاق');
        }
      }
    } catch (err) {
      // الإغلاق يجب ألا يتعطّل أبدًا بسبب فشل المزامنة
      try {
        handleGrantDeath(dataDir, err);
        await guaranteeRescueBackup(dbPath, dataDir, 'مزامنة الإغلاق');
      } catch { /* أفضل جهد — الإغلاق لا يتعطّل */ }
    }
  });
}

// ─── §4 · الإصلاح الذاتي بضغطة واحدة ─────────────────────────────────────────

export interface RepairResult {
  ok: boolean;
  email?: string;
  /** رسالة عربية جاهزة تصف النتيجة النهائية. */
  message: string;
  /** نتيجة اختبار الاتصال الذي تلا إعادة الربط — يُثبت أن الإصلاح نجح فعلًا. */
  verified?: boolean;
}

/**
 * §4 — «إصلاح الاتصال» بضغطة واحدة، حين تكون المنحة ميتة.
 *
 * ── لماذا زرّ واحد ────────────────────────────────────────────────────────────
 *
 * التعافي اليدوي كان أربع خطوات يجب أن يعرفها المستخدم بترتيبها: افصل الحساب ←
 * أعد الربط ← اختبر ← حدّث. أي خطوة منسية تترك النظام في حالة نصف مُصلَحة تبدو
 * سليمة وليست كذلك. هذه الدالة تُنفّذها كوحدة واحدة، وتُبلّغ بنتيجة واحدة.
 *
 * ── ولماذا لا منطق OAuth جديد ────────────────────────────────────────────────
 *
 * لا سطر مصادقة واحد هنا: تُركّب ثلاث عمليات **قائمة ومُختبَرة** كما هي —
 * `clearStoredAuth` ثم `authenticate` (نفس تدفّق المتصفح) ثم `testCloudConnection`
 * (نفس سلسلة التحقق). فما يُصلحه الزرّ هو **تسلسل الخطوات**، لا آلية المصادقة.
 *
 * الخطوة الثالثة هي الفارق الحقيقي: بلا تحقق فعلي، «تم الإصلاح» ادّعاء. معها،
 * النجاح يعني أن استعلام Drive نجح بمنحة جديدة — إثبات لا وعد.
 */
export async function repairCloudConnection(dataDir: string): Promise<RepairResult> {
  const creds = loadClientCredentials(dataDir);
  if (!creds) {
    return {
      ok: false,
      message: 'لم تُعدّ المزامنة السحابية في هذه النسخة من البرنامج — يرجى التواصل مع الدعم الفني.',
    };
  }

  // (1) إزالة المنحة الميتة ومعها وسمها — البداية من حالة نظيفة معروفة.
  try {
    await revokeAuth(dataDir, creds);
  } catch {
    // `revokeAuth` تمسح محليًا دائمًا حتى لو تعذّر إبلاغ Google. نُكمل.
  }
  try {
    saveMetadata(dataDir, { ...loadMetadata(dataDir), ...CLEARED_GRANT_STATE, lastError: null });
  } catch {
    /* أفضل جهد */
  }

  // (2) منحة جديدة عبر التدفّق القائم نفسه.
  const auth = await authenticate(dataDir);
  if (!auth.ok) {
    return { ok: false, message: auth.error ?? 'تعذّر إعادة ربط حساب Google.' };
  }

  // (3) إثبات عملي أن المنحة الجديدة تعمل فعلًا مع Drive.
  const test = await testCloudConnection(dataDir);
  if (!test.ok) {
    return {
      ok: false,
      email: auth.email,
      verified: false,
      message: `تم ربط الحساب (${auth.email ?? ''}) لكن تعذّر التحقق من الاتصال: ${test.message}`,
    };
  }

  return {
    ok: true,
    email: auth.email,
    verified: true,
    message: `تم إصلاح الاتصال بنجاح وربط الحساب ${auth.email ?? ''} — وتم التحقق من الوصول إلى Google Drive.`,
  };
}

/** يُستخدم في الاختبارات والتشخيص فقط — هل هناك عملية مزامنة جارية الآن؟ */
export function getActiveSyncOperation(): SyncOperation | null {
  return syncMutex.current();
}

// ─── مركز التشخيص (Production UX & Diagnostics Pack v1) ──────────────────────

export interface CloudDiagnostics {
  snapshot: DiagnosticsSnapshot;
  items: DiagnosticItem[];
  health: CloudHealth;
  /** §5 — «متى تغيّرت الصحة، ومتى انخفضت آخر مرة». */
  trend: HealthTrend;
  /** §3 — آخر مرة حدث فيها كلٌّ من: اختبار اتصال · إعادة ربط · تعارض · إعادة محاولة · استعادة · نسخة. */
  history: DiagnosticsHistoryEntry[];
  /** تقرير نصّي جاهز للنسخ — يُبنى في العملية الرئيسية فيصل للواجهة جاهزًا. */
  report: string;
  /** كتلة دعم فني مختصرة — نفس الضمانة: بلا أي سرّ. */
  supportInfo: string;
}

/**
 * قراءة تشخيصية **سلبية بالكامل**: صفر نداءات شبكة، وصفر استعلامات Google.
 *
 * كل قيمة هنا إمّا محفوظة على القرص (ملف الحالة، ملف التوكن) أو محسوبة محليًا
 * (حجم القاعدة، حالة القفل) أو مأخوذة من `probeCache` الذي يُملأ من عمليات جرت
 * لسبب آخر أصلًا. هذا هو ما يجعل فتح البطاقة أو تحديثها بلا أي كلفة على Google —
 * وهو شرط §9 حرفيًا: «تعتمد البطاقات على الحالة الموجودة بالنظام».
 */
export async function getCloudDiagnostics(
  dbPath: string,
  dataDir: string,
  app: { version: string; platform: string },
): Promise<CloudDiagnostics> {
  const creds = loadClientCredentials(dataDir);
  const configured = !!creds;
  const authenticated = configured && isAuthenticated(dataDir);
  const metadata = loadMetadata(dataDir);
  const device = getOrCreateDeviceIdentity(dataDir);
  const tokens = getTokenDiagnostics(dataDir, creds?.clientId ?? null);

  const dbExists = fs.existsSync(dbPath);
  const stat = dbExists ? fs.statSync(dbPath) : null;

  const engine: SyncEngineInfo = {
    engineVersion: SYNC_ENGINE_VERSION,
    engineUpdatedAt: SYNC_ENGINE_UPDATED_AT,
    oauthModel: 'OAuth 2.0 — Desktop / Installed App (loopback redirect, system browser)',
    driveApi: 'Google Drive API v3 — appDataFolder scope only',
    localStorage: 'SQLite (manar.db) + JSON state files under userData/data',
    tokenStorage: 'Electron safeStorage (OS keychain / DPAPI), 0600, atomic write',
    encryptionAvailable: isTokenEncryptionAvailable(),
  };

  const snapshot: DiagnosticsSnapshot = {
    appVersion: app.version,
    platform: app.platform,
    deviceName: device.deviceName,
    engine,
    healthHistory: metadata.healthHistory ?? [],

    configured,
    authenticated,
    accountEmail: authenticated ? getStoredAccountEmail(dataDir) : null,

    grantDead: !!metadata.grantDeadAt && !authenticated,
    grantDeadCode: metadata.grantDeadCode ?? null,
    clientBinding: tokens.clientBinding,

    refreshTokenPresent: tokens.refreshTokenPresent,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,

    internet: probeCache.internet,
    drive: probeCache.drive,
    driveStorage: probeCache.storage,

    lastSyncAt: metadata.lastSyncAt,
    lastUploadAt: metadata.lastUploadAt,
    lastDownloadAt: metadata.lastDownloadAt,
    lastConflictCheckAt: metadata.lastConflictCheckAt ?? null,
    lastConnectionTestAt: metadata.lastConnectionTestAt ?? null,

    localDb: {
      exists: dbExists,
      sizeBytes: stat?.size ?? 0,
      modifiedAt: stat ? stat.mtime.toISOString() : null,
    },
    localVersion: metadata.lastSyncedVersion,
    cloudVersion: metadata.lastRemote?.version ?? null,
    cloudObservedAt: metadata.lastRemote?.observedAt ?? null,

    conflictPending: currentStatus === 'CONFLICT',
    lastError: metadata.lastError,
    status: currentStatus,
    activeOperation: syncMutex.current(),

    nowIso: new Date().toISOString(),
  };

  const health = computeCloudHealth(snapshot);

  /**
   * §5 — تسجيل نقطة في تاريخ الصحة **عند التغيّر فقط**.
   *
   * كتابة في مسار قراءة، وهي مقصودة ومحدودة: `appendHealthPoint` تُعيد نفس المصفوفة
   * حين لا تتغيّر النتيجة، فلا يُكتب الملف أصلًا في الحالة الغالبة. البديل (وظيفة
   * دورية تلتقط الصحة) كان سينتهك §9 من الحزمة السابقة — استطلاع بلا حدث.
   */
  const history = appendHealthPoint(
    snapshot.healthHistory,
    { at: snapshot.nowIso, score: health.score, grade: health.grade },
    MAX_HEALTH_POINTS,
  );
  if (history !== snapshot.healthHistory) {
    try {
      saveMetadata(dataDir, { ...loadMetadata(dataDir), healthHistory: history });
      snapshot.healthHistory = history;
    } catch {
      // أثر تشخيصي بحت — فشل تسجيله لا يجوز أن يمنع عرض التشخيص.
    }
  }

  return {
    snapshot,
    items: buildDiagnosticItems(snapshot),
    health,
    trend: summarizeHealthTrend(snapshot.healthHistory),
    history: buildDiagnosticsHistory(metadata.log, { lastConnectionTestAt: metadata.lastConnectionTestAt ?? null }),
    report: buildDiagnosticReport(snapshot),
    supportInfo: buildSupportInfo(snapshot),
  };
}

export interface ConnectionTestResult {
  ok: boolean;
  internet: ProbeState;
  drive: ProbeState;
  /** رسالة عربية جاهزة تشرح النتيجة — لا نصّ خام من Google أبدًا. */
  message: string;
  needsReauth?: boolean;
  busy?: boolean;
}

/**
 * اختبار اتصال **صريح بطلب المستخدم فقط** — الاستدعاء الوحيد في هذه الحزمة الذي
 * يلمس الشبكة.
 *
 * يمشي في سلسلة الثقة كاملةً بالترتيب الذي يستبعد الأسباب واحدًا واحدًا:
 *   1. **الإنترنت** — نقطة خفيفة بلا مصادقة. الفشل هنا يُنهي الاختبار فورًا:
 *      لا معنى لاتهام Google أو التوكن بينما لا يوجد اتصال أصلًا.
 *   2. **الوصول إلى Drive** — `findRemoteSyncFile` يجبر المكتبة على تجديد رمز
 *      الوصول من رمز التحديث، فينجح الاستعلام ⇒ **المنحة حيّة مُثبَتة عمليًا**،
 *      لا مُستنتَجة من وجود ملف على القرص. وهذا بالضبط ما يفرّق «متصل» الحقيقية
 *      عن «متصل» الكاذبة التي كانت المشكلة الأصلية قبل حزمة التحصين.
 *   3. **المساحة** — أفضل جهد، لا يُفشل الاختبار.
 *
 * يمرّ بالقفل نفسه (P0-4) فلا يتداخل مع مزامنة جارية، ويمرّ بمعالج موت المنحة
 * نفسه (P0-1) فيُنتج نفس التعافي لو كشف منحة ميتة.
 */
export async function testCloudConnection(dataDir: string): Promise<ConnectionTestResult> {
  const outcome = await syncMutex.run('CONFLICT_CHECK', async (): Promise<ConnectionTestResult> => {
    const startedAt = new Date().toISOString();
    setStatus('CHECKING', 'جارٍ اختبار الاتصال بـ Google Drive...');

    const online = await checkConnectivity();
    probeCache.internet = online ? 'ok' : 'fail';
    if (!online) {
      probeCache.drive = 'unknown';
      setStatus('OFFLINE');
      return {
        ok: false,
        internet: 'fail',
        drive: 'unknown',
        message: 'لا يوجد اتصال بالإنترنت. تحقّق من الشبكة ثم أعد الاختبار.',
      };
    }

    const session = openDriveSession(dataDir);
    if (!session.ok) {
      if (session.reason === 'GRANT_DEAD') {
        handleGrantDeath(dataDir, session.error);
        return { ok: false, internet: 'ok', drive: 'unknown', message: session.message, needsReauth: true };
      }
      probeCache.drive = 'unknown';
      setStatus('READY');
      return { ok: false, internet: 'ok', drive: 'unknown', message: session.message };
    }

    try {
      const remote = await findRemoteSyncFile(session.client);
      probeCache.drive = 'ok';
      probeCache.storage = await fetchDriveStorage(session.client);

      recordRemoteObservation(dataDir, remote);
      saveMetadata(
        dataDir,
        appendLog(
          dataDir,
          { ...loadMetadata(dataDir), lastConnectionTestAt: new Date().toISOString() },
          {
            action: 'AUTH',
            result: 'SUCCESS',
            message: 'نجح اختبار الاتصال بـ Google Drive',
            ...timing(startedAt),
          },
        ),
      );

      setStatus('READY');
      return {
        ok: true,
        internet: 'ok',
        drive: 'ok',
        message: remote
          ? 'الاتصال بـ Google Drive سليم، وتمّ العثور على النسخة السحابية.'
          : 'الاتصال بـ Google Drive سليم، ولا توجد نسخة سحابية بعد — ستُنشأ عند أول رفع.',
      };
    } catch (err) {
      probeCache.drive = 'fail';
      const message = toUserFacingSyncError(err);
      const needsReauth = handleGrantDeath(dataDir, err);
      if (!needsReauth) setStatus('FAILED', message);
      return { ok: false, internet: 'ok', drive: 'fail', message, needsReauth: needsReauth || undefined };
    }
  });

  if (outcome.ok) return outcome.value;
  return { ok: false, internet: probeCache.internet, drive: probeCache.drive, message: outcome.message, busy: true };
}
