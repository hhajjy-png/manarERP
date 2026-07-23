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

  constructor(message: string, opts: { status?: number; retryable: boolean }) {
    super(message);
    this.name = 'DriveApiError';
    this.status = opts.status;
    this.retryable = opts.retryable;
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

async function throwDriveApiError(res: Response, context: string): Promise<never> {
  const body = await res.text().catch(() => '');
  throw new DriveApiError(`${context}: ${res.status} ${body}`, { status: res.status, retryable: isRetryableStatus(res.status) });
}

/**
 * يُصنّف أي خطأ (من fetch أو من DriveApiError) كمؤقت وقابل لإعادة المحاولة أم لا.
 * أخطاء المصادقة (401/403) والطلبات غير الصالحة (400/404) لا تُعاد محاولتها أبدًا؛
 * أخطاء الشبكة/المهلة/5xx/429 قابلة لإعادة المحاولة.
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

async function authHeader(client: OAuth2Client): Promise<Record<string, string>> {
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('تعذّر الحصول على رمز وصول صالح من Google');
  return { Authorization: `Bearer ${token}` };
}

/** يبحث عن ملف قاعدة البيانات المُزامَن داخل appDataFolder — يُعيد null إن لم يوجد بعد. */
export async function findRemoteSyncFile(client: OAuth2Client): Promise<RemoteSyncFile | null> {
  const headers = await authHeader(client);
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${SYNC_FILE_NAME}' and trashed=false`,
    fields: 'files(id,name,size,modifiedTime,appProperties)',
    pageSize: '1',
  });
  const res = await fetch(`${DRIVE_FILES}?${params.toString()}`, { headers });
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

  const initRes = await fetch(initUrl, {
    method: initMethod,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/x-sqlite3',
      'X-Upload-Content-Length': String(stat.size),
    },
    body: JSON.stringify(metadata),
  });
  if (!initRes.ok) await throwDriveApiError(initRes, 'فشل بدء الرفع القابل للاستئناف');

  const sessionUrl = initRes.headers.get('Location');
  if (!sessionUrl) throw new Error('لم يُستلم رابط جلسة الرفع من Google Drive');

  const fileBuffer = await fs.promises.readFile(filePath);
  const putRes = await fetch(sessionUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/x-sqlite3', 'Content-Length': String(fileBuffer.byteLength) },
    body: fileBuffer,
  });
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
export async function downloadDatabase(client: OAuth2Client, fileId: string, destPath: string): Promise<void> {
  const headers = await authHeader(client);
  const res = await fetch(`${DRIVE_FILES}/${fileId}?alt=media`, { headers });
  if (!res.ok) await throwDriveApiError(res, 'فشل تنزيل قاعدة البيانات');
  const arrayBuffer = await res.arrayBuffer();
  await fs.promises.writeFile(destPath, Buffer.from(arrayBuffer));
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
