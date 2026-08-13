import fs from 'fs';
import type { OAuth2Client } from 'google-auth-library';

/**
 * طبقة نداءات REST خام لـ Google Drive API v3 — محصورة بمجلد appDataFolder
 * (مجلد بيانات مخفي خاص بالتطبيق لكل مستخدم). لا تُستخدم مكتبة googleapis
 * الثقيلة؛ fetch المدمجة في Node كافية لهذا السطح الضيّق من العمليات.
 */

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SYNC_FILE_NAME = 'manar.db';

/**
 * Production Hardening Pack v1 — P0-5 · المهل الزمنية.
 *
 * قبل هذه الحزمة لم يكن على أي نداء Drive مهلة إطلاقًا. على شبكة تُسقط الاتصال دون
 * إغلاق نظيف (Wi-Fi ينقطع، بوابة مؤسسية تبتلع الحزم)، كان `fetch` يبقى معلّقًا بلا
 * نهاية: زرّ «رفع» مُعطَّل، لافتة «⏳» دائمة، ولا مخرج سوى إنهاء التطبيق.
 *
 * القيم مختلفة بحسب طبيعة العملية لا رقم واحد للجميع: الاستعلام عن البيانات الوصفية
 * ردّ صغير وسريع، بينما نقل ملف قاعدة بيانات كامل على وصلة بطيئة يحتاج وقتًا حقيقيًا.
 */
const METADATA_TIMEOUT_MS = 30_000;
const TRANSFER_TIMEOUT_MS = 180_000;

export interface RemoteSyncFile {
  id: string;
  sha256: string | null;
  modifiedTime: string;
  size: number;
  /** معرّف نسخة تصاعدي (revision) — يُقرأ من appProperties.version؛ null إن رُفع بنسخة أقدم من الأداة لا تكتبه. */
  version: number | null;
  deviceId: string | null;
  deviceName: string | null;
}

/**
 * خطأ نداء Drive API يحمل رمز الحالة وإشارة صريحة إلى كونه مؤقتًا (قابلًا لإعادة
 * المحاولة) — يستخدمه محرّك المزامنة لتمييز الأعطال العابرة (شبكة/5xx/429) عن
 * أعطال المصادقة (401/403) التي لا يجب إعادة محاولتها أبدًا.
 */
export class DriveApiError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  /** زمن الانتظار الذي طلبه الخادم صراحةً عبر `Retry-After` (P0-9)، إن وُجد. */
  readonly retryAfterMs?: number;

  constructor(message: string, opts: { status?: number; retryable: boolean; retryAfterMs?: number }) {
    super(message);
    this.name = 'DriveApiError';
    this.status = opts.status;
    this.retryable = opts.retryable;
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/**
 * P0-9 — أسباب حدّ المعدّل التي يعيدها Google **برمز 403 لا 429**.
 *
 * كان `isRetryableStatus` يصنّف كل 403 كخطأ نهائي، فأي تجاوز مؤقت لحدّ الطلبات
 * كان يُفشل المزامنة بلا إعادة محاولة واحدة. لاحظ الاستثناء الحاسم:
 * `storageQuotaExceeded` (مساحة Drive ممتلئة) يبقى **غير قابل لإعادة المحاولة** —
 * فهو ليس عابرًا، وإعادة المحاولة عليه إهدار محض.
 */
const RATE_LIMIT_REASONS = [
  'ratelimitexceeded',
  'userratelimitexceeded',
  'sharingratelimitexceeded',
  'dailylimitexceeded',
  'backenderror',
];

function isRateLimitBody(body: string): boolean {
  const lower = body.toLowerCase();
  if (lower.includes('storagequotaexceeded')) return false; // القرص ممتلئ — ليس حدّ معدّل
  return RATE_LIMIT_REASONS.some((reason) => lower.includes(reason));
}

function isRetryableStatus(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  if (status === 403) return isRateLimitBody(body);
  return false;
}

/** يقرأ `Retry-After` بصيغتيه المسموحتين: عدد ثوانٍ، أو تاريخ HTTP. */
function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;
  const seconds = Number(headerValue.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  const asDate = Date.parse(headerValue);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    if (delta > 0) return Math.min(delta, 60_000);
    return 0;
  }
  return undefined;
}

async function throwDriveApiError(res: Response, context: string): Promise<never> {
  const body = await res.text().catch(() => '');
  throw new DriveApiError(`${context}: ${res.status} ${body}`, {
    status: res.status,
    retryable: isRetryableStatus(res.status, body),
    retryAfterMs: parseRetryAfter(res.headers.get('Retry-After')),
  });
}

/**
 * P0-5 — يُنفّذ `fetch` تحت `AbortController` بمهلة صريحة.
 *
 * الإلغاء هنا **فعلي**: `AbortController.abort()` يقطع الاتصال ويحرّر المقبس فورًا،
 * فلا تبقى عملية معلّقة في الخلفية تستهلك الموارد بعد أن يئس المُستدعي منها.
 * `clearTimeout` في `finally` يمنع بقاء مؤقّت حيّ يُبقي حلقة الأحداث مشغولة بعد
 * انتهاء الطلب بنجاح — وهو ما كان سيُؤخّر إغلاق التطبيق أثناء مزامنة الإغلاق.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  context: string,
  /**
   * Data Safety Pack v2 — F-02 · إشارة إلغاء خارجية من محرّك المزامنة.
   *
   * تُدمَج مع مهلة هذا الطلب عبر `AbortSignal.any` (مدمجة في Node منذ 20.3 — لا
   * اعتمادية جديدة)، فأيّهما سبق يقطع الاتصال فعليًا ويُحرّر المقبس فورًا. بدون
   * هذا الدمج كان إلغاء المحرّك لا يصل إلى الطلب الجاري إطلاقًا، فيبقى النقل
   * مستمرًّا في الخلفية بعد أن يئس المُستدعي منه.
   */
  externalSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal;
  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // الإلغاء الخارجي **لا يُعاد تسميته**: إعادة تسميته `TimeoutError` كانت
      // ستُصنّفه `isRetryableSyncError` عطلًا عابرًا فتُعيد المحاولة — أي أن
      // الإلغاء كان سيُنتج محاولات جديدة بدل أن يوقف العمل. سببُ الإلغاء يُرمى
      // كما هو ليتعرّف عليه المحرّك.
      if (externalSignal?.aborted) {
        throw externalSignal.reason instanceof Error ? externalSignal.reason : err;
      }
      // `AbortError` هنا يعني «انتهت مهلتنا نحن» لا «ألغى المستخدم» — نُعيد تسميته
      // إلى `TimeoutError` ليصنّفه `isRetryableSyncError` كعطل عابر قابل للإعادة.
      const timeout = new Error(`${context}: انتهت المهلة الزمنية بعد ${Math.round(timeoutMs / 1000)} ثانية`);
      timeout.name = 'TimeoutError';
      throw timeout;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * يُصنّف أي خطأ (من fetch أو من DriveApiError) كمؤقت وقابل لإعادة المحاولة أم لا.
 * أخطاء المصادقة (401) والطلبات غير الصالحة (400/404) لا تُعاد محاولتها أبدًا؛
 * أخطاء الشبكة/المهلة/5xx/429/حدّ المعدّل (403) قابلة لإعادة المحاولة.
 */
export function isRetryableSyncError(err: unknown): boolean {
  if (err instanceof DriveApiError) return err.retryable;
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
    const cause = (err as { cause?: { code?: string } }).cause;
    const networkCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ENETUNREACH'];
    if (cause?.code && networkCodes.includes(cause.code)) return true;
    if (err.message.includes('fetch failed')) return true;
  }
  return false;
}

/** P0-9 — الزمن الذي طلبه Google صراحةً، أو التراجع الأُسّي المحسوب إن لم يطلب شيئًا. */
export function syncRetryDelay(err: unknown, defaultDelayMs: number): number {
  if (err instanceof DriveApiError && typeof err.retryAfterMs === 'number') {
    return Math.max(err.retryAfterMs, defaultDelayMs);
  }
  return defaultDelayMs;
}

async function authHeader(client: OAuth2Client): Promise<Record<string, string>> {
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('تعذّر الحصول على رمز وصول صالح من Google');
  return { Authorization: `Bearer ${token}` };
}

/** يبحث عن ملف قاعدة البيانات المُزامَن داخل appDataFolder — يُعيد null إن لم يوجد بعد. */
export async function findRemoteSyncFile(
  client: OAuth2Client,
  signal?: AbortSignal,
): Promise<RemoteSyncFile | null> {
  const headers = await authHeader(client);
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${SYNC_FILE_NAME}' and trashed=false`,
    fields: 'files(id,name,size,modifiedTime,appProperties)',
    pageSize: '1',
  });
  const res = await fetchWithTimeout(
    `${DRIVE_FILES}?${params.toString()}`,
    { headers },
    METADATA_TIMEOUT_MS,
    'الاستعلام عن ملف Drive',
    signal,
  );
  if (!res.ok) await throwDriveApiError(res, 'فشل الاستعلام عن ملف Drive');

  const body = (await res.json()) as {
    files: Array<{ id: string; size?: string; modifiedTime: string; appProperties?: Record<string, string> }>;
  };
  const file = body.files?.[0];
  if (!file) return null;

  const versionRaw = file.appProperties?.version;
  const version = versionRaw ? parseInt(versionRaw, 10) : null;

  return {
    id: file.id,
    sha256: file.appProperties?.sha256 ?? null,
    modifiedTime: file.modifiedTime,
    size: file.size ? parseInt(file.size, 10) : 0,
    version: Number.isFinite(version) ? version : null,
    deviceId: file.appProperties?.deviceId ?? null,
    deviceName: file.appProperties?.deviceName ?? null,
  };
}

interface UploadOptions {
  fileId: string | null;
  sha256: string;
  version: number;
  deviceId: string;
  deviceName: string;
}

/** يرفع قاعدة البيانات إلى appDataFolder عبر تحميل قابل للاستئناف (resumable) — إنشاء أو تحديث. */
export async function uploadDatabase(
  client: OAuth2Client,
  filePath: string,
  opts: UploadOptions,
  signal?: AbortSignal,
): Promise<RemoteSyncFile> {
  const headers = await authHeader(client);
  const stat = fs.statSync(filePath);

  const metadata: Record<string, unknown> = {
    name: SYNC_FILE_NAME,
    appProperties: {
      sha256: opts.sha256,
      syncedAt: new Date().toISOString(),
      version: String(opts.version),
      deviceId: opts.deviceId,
      deviceName: opts.deviceName,
    },
  };
  if (!opts.fileId) metadata.parents = ['appDataFolder'];

  const initUrl = opts.fileId
    ? `${DRIVE_UPLOAD}/${opts.fileId}?uploadType=resumable`
    : `${DRIVE_UPLOAD}?uploadType=resumable`;
  const initMethod = opts.fileId ? 'PATCH' : 'POST';

  const initRes = await fetchWithTimeout(
    initUrl,
    {
      method: initMethod,
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'application/x-sqlite3',
        'X-Upload-Content-Length': String(stat.size),
      },
      body: JSON.stringify(metadata),
    },
    METADATA_TIMEOUT_MS,
    'بدء الرفع القابل للاستئناف',
    signal,
  );
  if (!initRes.ok) await throwDriveApiError(initRes, 'فشل بدء الرفع القابل للاستئناف');

  const sessionUrl = initRes.headers.get('Location');
  if (!sessionUrl) throw new Error('لم يُستلم رابط جلسة الرفع من Google Drive');

  const fileBuffer = await fs.promises.readFile(filePath);
  const putRes = await fetchWithTimeout(
    sessionUrl,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/x-sqlite3', 'Content-Length': String(fileBuffer.byteLength) },
      body: fileBuffer,
    },
    TRANSFER_TIMEOUT_MS,
    'رفع محتوى قاعدة البيانات',
    signal,
  );
  if (!putRes.ok) await throwDriveApiError(putRes, 'فشل رفع محتوى قاعدة البيانات');

  const uploaded = (await putRes.json()) as { id: string };
  return {
    id: uploaded.id,
    sha256: opts.sha256,
    modifiedTime: new Date().toISOString(),
    size: fileBuffer.byteLength,
    version: opts.version,
    deviceId: opts.deviceId,
    deviceName: opts.deviceName,
  };
}

/** يُنزّل قاعدة البيانات من Drive إلى مسار محلي مؤقت (لا يستبدل الملف الفعلي). */
export async function downloadDatabase(
  client: OAuth2Client,
  fileId: string,
  destPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const headers = await authHeader(client);
  const res = await fetchWithTimeout(
    `${DRIVE_FILES}/${fileId}?alt=media`,
    { headers },
    TRANSFER_TIMEOUT_MS,
    'تنزيل قاعدة البيانات',
    signal,
  );
  if (!res.ok) await throwDriveApiError(res, 'فشل تنزيل قاعدة البيانات');
  const arrayBuffer = await res.arrayBuffer();
  await fs.promises.writeFile(destPath, Buffer.from(arrayBuffer));
}

/**
 * Production UX & Diagnostics Pack v1 — مساحة Google Drive المستخدمة.
 *
 * نداء واحد خفيف (`about.get` بحقل واحد) يُستدعى **فقط** ضمن اختبار الاتصال الصريح
 * الذي يطلبه المستخدم — لا في أي مسار دوري ولا في قراءة الحالة السلبية (§9).
 *
 * **أفضل جهد بحت:** أي فشل (نطاق غير كافٍ، شبكة، تغيّر في الواجهة) يُعيد `null`
 * ولا يرمي أبدًا. المساحة معلومة مساعِدة في التشخيص — لا يجوز أن يُفشل غيابُها
 * اختبارَ اتصال نجحت بقيّة خطواته.
 */
export async function fetchDriveStorage(
  client: OAuth2Client,
): Promise<{ usedBytes: number; limitBytes: number | null } | null> {
  try {
    const headers = await authHeader(client);
    const res = await fetchWithTimeout(
      'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
      { headers },
      METADATA_TIMEOUT_MS,
      'قراءة مساحة Drive',
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { storageQuota?: { usage?: string; limit?: string } };
    const usage = Number(body.storageQuota?.usage);
    if (!Number.isFinite(usage)) return null;
    const limit = Number(body.storageQuota?.limit);
    return { usedBytes: usage, limitBytes: Number.isFinite(limit) ? limit : null };
  } catch {
    return null;
  }
}

/** فحص اتصال خفيف وبلا مصادقة — نفس النقطة التي يستخدمها Chromium لكشف Captive Portal. */
export async function checkConnectivity(timeoutMs = 4000): Promise<boolean> {
  try {
    const res = await fetch('https://www.gstatic.com/generate_204', { signal: AbortSignal.timeout(timeoutMs) });
    return res.status === 204 || res.ok;
  } catch {
    return false;
  }
}
