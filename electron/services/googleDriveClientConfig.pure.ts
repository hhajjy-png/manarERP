/**
 * Google Drive OAuth Deployment Pack v1 — PURE policy layer only (no `electron`
 * import — runs under vitest.electron.config.ts without an Electron runtime).
 *
 * Decides WHICH source of OAuth Desktop-client credentials (Client ID/Secret) to
 * trust and validates their shape. Never touches the filesystem, `electron`, or
 * `process.resourcesPath` itself — the orchestration (fs reads, `app.isPackaged`)
 * lives in `googleDriveAuth.service.ts`, which injects file contents via
 * `readConfigFile`. This split exists so credential-resolution logic — including
 * the "developer forgot to bundle the packaged config" and "bundled config is
 * corrupt" failure paths — is unit-testable without a real Electron process.
 */

export interface DriveClientCredentials {
  clientId: string;
  clientSecret: string;
}

/** اسم ملف تهيئة عميل OAuth المُجمَّع مع التطبيق المُثبَّت — يوفّره المطوّر مرة واحدة قبل التغليف. */
export const PACKAGED_OAUTH_CLIENT_FILENAME = 'gdrive-oauth-client.json';

/** اسم ملف تهيئة عميل OAuth الخاص بالتطوير — يبقى كما كان، غير مُتتبَّع بـ git. */
export const DEV_OAUTH_CLIENT_FILENAME = 'gdrive-client.json';

/** يحلل نص JSON لملف تهيئة عميل OAuth إلى بيانات اعتماد صالحة، أو null إن كان تالفًا/ناقصًا. */
export function parseClientConfigJson(raw: string): DriveClientCredentials | null {
  try {
    const data = JSON.parse(raw) as Partial<Record<'clientId' | 'clientSecret', unknown>>;
    if (
      typeof data.clientId === 'string' && data.clientId.length > 0 &&
      typeof data.clientSecret === 'string' && data.clientSecret.length > 0
    ) {
      return { clientId: data.clientId, clientSecret: data.clientSecret };
    }
  } catch {
    // JSON غير صالح — يُعامل كتهيئة غير موجودة
  }
  return null;
}

export interface ResolveClientCredentialsParams {
  envClientId?: string;
  envClientSecret?: string;
  isPackaged: boolean;
  /** يُعيد محتوى ملف التهيئة كنص، أو null إن لم يوجد/تعذّرت قراءته — بلا وصول فعلي للقرص هنا. */
  readConfigFile(kind: 'packaged' | 'dev'): string | null;
}

export interface ResolvedClientCredentials {
  credentials: DriveClientCredentials | null;
  /** سبب عدم توفر بيانات الاعتماد — رسالة تشخيصية لسجلّ المطوّر فقط، لا تُعرض للمستخدم النهائي مباشرة. */
  diagnostic?: string;
}

/**
 * يحدد بيانات اعتماد عميل OAuth حسب أولوية ثابتة: متغيرات البيئة أولًا (تعمل في
 * التطوير والإنتاج على حدّ سواء)، ثم — في الإنتاج المُغلَّف فقط — ملف التهيئة
 * المُجمَّع مع التطبيق، أو — في التطوير فقط — ملف تهيئة المطوّر المحلي. لا يوجد
 * أي رجوع تلقائي في الإنتاج إلى مطالبة المستخدم النهائي بإنشاء ملف تهيئة يدويًا.
 */
export function resolveClientCredentials(params: ResolveClientCredentialsParams): ResolvedClientCredentials {
  if (params.envClientId && params.envClientSecret) {
    return { credentials: { clientId: params.envClientId, clientSecret: params.envClientSecret } };
  }

  if (params.isPackaged) {
    const raw = params.readConfigFile('packaged');
    if (raw === null) {
      return {
        credentials: null,
        diagnostic: `لم يُعثر على تهيئة عميل OAuth المُجمَّعة (${PACKAGED_OAUTH_CLIENT_FILENAME}) — هذا خطأ في تجهيز حزمة التثبيت، وليس شيئًا يحتاج المستخدم النهائي فعله. يجب على المطوّر إضافة الملف وإعادة بناء المثبّت.`,
      };
    }
    const credentials = parseClientConfigJson(raw);
    if (!credentials) {
      return {
        credentials: null,
        diagnostic: `تهيئة عميل OAuth المُجمَّعة (${PACKAGED_OAUTH_CLIENT_FILENAME}) تالفة أو ناقصة الحقول — يجب على المطوّر تصحيح الملف وإعادة بناء المثبّت.`,
      };
    }
    return { credentials };
  }

  const raw = params.readConfigFile('dev');
  if (raw === null) return { credentials: null };
  return { credentials: parseClientConfigJson(raw) };
}
