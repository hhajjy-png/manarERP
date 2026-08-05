import { app, safeStorage, shell } from 'electron';
import http from 'http';
import type { AddressInfo } from 'net';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { OAuth2Client, type Credentials } from 'google-auth-library';
import {
  resolveClientCredentials,
  PACKAGED_OAUTH_CLIENT_FILENAME,
  DEV_OAUTH_CLIENT_FILENAME,
  type DriveClientCredentials,
} from './googleDriveClientConfig.pure';
import { GrantDeadError } from './googleAuthErrors.pure';
import { writeFileAtomicSync } from './atomicFile';

/**
 * مصادقة Google Drive — تدفّق OAuth2 عبر متصفح النظام الافتراضي (Loopback flow).
 * لا يُستخدم أي WebView/BrowserWindow مضمّن أبدًا: Google يرفض تدفقات OAuth داخل
 * نوافذ مضمّنة (disallowed_useragent)، والحل الرسمي لتطبيقات سطح المكتب هو
 * فتح المتصفح الافتراضي مع إعادة توجيه إلى خادم محلي مؤقت على 127.0.0.1.
 */

const SCOPES = [
  // نطاق appDataFolder فقط — مجلد بيانات مخفي خاص بالتطبيق، غير مرئي في واجهة
  // Google Drive العادية وغير قابل للوصول من تطبيقات أخرى. أقل صلاحية ممكنة.
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/userinfo.email',
];

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

export type { DriveClientCredentials };

export type StoredTokens = Credentials;

/**
 * Production Hardening Pack v1 — P0-2 · ربط التوكن بعميل OAuth المُصدِر.
 *
 * ── لماذا ──────────────────────────────────────────────────────────────────────
 *
 * كان `gdrive-token.dat` يخزّن `Credentials` فقط — بلا أي أثر لهوية عميل OAuth
 * الذي أصدره. لكن مصدر بيانات الاعتماد **متغيّر** بثلاث أولويات (متغيرات البيئة ←
 * ملف الحزمة ← ملف التطوير). أي تبدّل — تدوير عميل OAuth، تحديث مثبّت بملف اعتماد
 * جديد، تعيين `GOOGLE_DRIVE_CLIENT_ID` في بيئة المستخدم — كان يجعل توكنًا سليمًا
 * يُقدَّم لعميل مختلف، فيردّ Google `invalid_grant` **إلى الأبد** بلا أن يعرف النظام
 * السبب ولا أن يمسح التوكن الميت.
 *
 * الآن يُخزَّن `issuedForClientId` مع التوكن، ويُتحقَّق منه **قبل** أي نداء شبكي:
 * عدم التطابق يُحسم محليًا وفورًا كمنحة ميتة، بلا رحلة ذهاب وإياب إلى Google أصلًا.
 */
const TOKEN_ENVELOPE_VERSION = 2;

interface TokenEnvelope {
  v: number;
  /** معرّف عميل OAuth الذي أصدر هذه التوكنات. */
  issuedForClientId: string;
  tokens: StoredTokens;
}

export interface StoredAuth {
  tokens: StoredTokens;
  /**
   * `null` للتوكنات المحفوظة بنسخة أقدم من هذه الحزمة (لا تحمل الربط).
   * تُعامَل كـ«غير معروف» لا كـ«غير مطابق» — انظر `checkClientBinding`.
   */
  issuedForClientId: string | null;
}

function tokenFilePath(dataDir: string): string {
  return path.join(dataDir, 'gdrive-token.dat');
}

function accountFilePath(dataDir: string): string {
  return path.join(dataDir, 'gdrive-account.json');
}

function readConfigFileContents(kind: 'packaged' | 'dev', dataDir: string): string | null {
  const configPath =
    kind === 'packaged'
      ? path.join(process.resourcesPath, PACKAGED_OAUTH_CLIENT_FILENAME)
      : path.join(dataDir, DEV_OAUTH_CLIENT_FILENAME);
  if (!fs.existsSync(configPath)) return null;
  try {
    return fs.readFileSync(configPath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * يحمّل بيانات اعتماد تطبيق OAuth (Client ID/Secret) — من متغيرات البيئة أولًا (تعمل في
 * التطوير والإنتاج على حدّ سواء)، ثم — في التطبيق المُغلَّف (المُثبَّت) — من ملف التهيئة
 * المُجمَّع مع حزمة التثبيت (`process.resourcesPath/gdrive-oauth-client.json`، يوفّره
 * المطوّر مرة واحدة قبل بناء المثبّت — Google Drive Deployment Pack v1)، أو — في
 * التطوير فقط — من ملف تهيئة محلي غير مُتتبَّع بـ git كما كان سابقًا. لا قيم افتراضية
 * مُضمَّنة في الكود أبدًا، ولا رجوع في الإنتاج المُغلَّف إلى مطالبة المستخدم النهائي
 * بإنشاء أي ملف تهيئة يدويًا — نقص أو تلف الملف المُجمَّع يُعامل كخطأ في تجهيز حزمة
 * التثبيت (يُسجَّل في سجلّ العملية الرئيسية للمطوّر فقط) لا كخطوة إعداد يقوم بها المستخدم.
 */
export function loadClientCredentials(dataDir: string): DriveClientCredentials | null {
  const resolved = resolveClientCredentials({
    envClientId: process.env.GOOGLE_DRIVE_CLIENT_ID,
    envClientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    isPackaged: app.isPackaged,
    readConfigFile: (kind) => readConfigFileContents(kind, dataDir),
  });

  if (resolved.diagnostic) {
    // eslint-disable-next-line no-console
    console.error(`[GoogleDrive] ${resolved.diagnostic}`);
  }

  return resolved.credentials;
}

/**
 * يحفظ التوكنات مع هوية العميل المُصدِر، **ذرّيًا** (P0-6).
 *
 * الكتابة المباشرة السابقة كانت تترك ملفًا مبتورًا لو انقطعت الكهرباء أثناءها ⇒
 * فقدان الاتصال بحساب Google بلا سبب مفهوم. الآن: ملف مؤقت في نفس المجلد ثم
 * `rename` ذرّي — القارئ يرى النسخة القديمة كاملة أو الجديدة كاملة، ولا شيء بينهما.
 */
function persistTokens(dataDir: string, tokens: StoredTokens, issuedForClientId: string): void {
  const envelope: TokenEnvelope = { v: TOKEN_ENVELOPE_VERSION, issuedForClientId, tokens };
  const json = JSON.stringify(envelope);
  const canEncrypt = safeStorage.isEncryptionAvailable();
  if (!canEncrypt) {
    // لم يعد سقوطًا صامتًا: يُسجَّل صراحةً في سجلّ العملية الرئيسية حتى يظهر في
    // تشخيص أي جهاز لا يوفّر تشفير نظام التشغيل (DPAPI معطّل/ملف تعريف تالف).
    // eslint-disable-next-line no-console
    console.warn('[GoogleDrive] تشفير نظام التشغيل غير متاح — سيُخزَّن رمز التحديث بلا تشفير على هذا الجهاز.');
  }
  const body = canEncrypt ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8');
  const flag = Buffer.from([canEncrypt ? 1 : 0]);
  writeFileAtomicSync(tokenFilePath(dataDir), Buffer.concat([flag, body]), { mode: 0o600 });
}

/**
 * يقرأ الغلاف المخزَّن. يفهم الصيغتين:
 *   • v2 (هذه الحزمة): `{ v, issuedForClientId, tokens }`
 *   • القديمة        : كائن `Credentials` مباشرة ⇒ `issuedForClientId = null`
 * التوافق الرجعي مقصود: مستخدم مرتبط بالفعل لا يجوز أن تُفصل جلسته لمجرد الترقية.
 */
function readStoredAuth(dataDir: string): StoredAuth | null {
  const file = tokenFilePath(dataDir);
  if (!fs.existsSync(file)) return null;
  try {
    const buf = fs.readFileSync(file);
    const flag = buf[0];
    const body = buf.subarray(1);
    const json = flag === 1 ? safeStorage.decryptString(body) : body.toString('utf8');
    const parsed = JSON.parse(json) as TokenEnvelope | StoredTokens;

    const envelope = parsed as TokenEnvelope;
    if (envelope && typeof envelope === 'object' && envelope.v === TOKEN_ENVELOPE_VERSION && envelope.tokens) {
      return {
        tokens: envelope.tokens,
        issuedForClientId: typeof envelope.issuedForClientId === 'string' ? envelope.issuedForClientId : null,
      };
    }
    return { tokens: parsed as StoredTokens, issuedForClientId: null };
  } catch {
    return null;
  }
}

function readStoredTokens(dataDir: string): StoredTokens | null {
  return readStoredAuth(dataDir)?.tokens ?? null;
}

export function isAuthenticated(dataDir: string): boolean {
  return !!readStoredTokens(dataDir)?.refresh_token;
}

export function clearStoredAuth(dataDir: string): void {
  const file = tokenFilePath(dataDir);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const acct = accountFilePath(dataDir);
  if (fs.existsSync(acct)) fs.unlinkSync(acct);
}

export function getStoredAccountEmail(dataDir: string): string | null {
  const file = accountFilePath(dataDir);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { email?: string };
    return raw.email ?? null;
  } catch {
    return null;
  }
}

export type ClientBinding = 'MATCH' | 'MISMATCH' | 'UNKNOWN';

/**
 * P0-2 — هل التوكن المخزَّن يخصّ عميل OAuth المستخدَم حاليًا؟
 *
 * `UNKNOWN` (توكن محفوظ قبل هذه الحزمة) **لا يُعامَل كعدم تطابق**: ذلك كان سيفصل
 * كل مستخدم مرتبط لحظة الترقية بلا سبب حقيقي. يُسمح له بالمرور، ويُثبَّت الربط
 * تلقائيًا عند أول تجديد ناجح للتوكن بعدها.
 */
export function checkClientBinding(dataDir: string, currentClientId: string): ClientBinding {
  const stored = readStoredAuth(dataDir);
  if (!stored) return 'UNKNOWN';
  if (stored.issuedForClientId === null) return 'UNKNOWN';
  return stored.issuedForClientId === currentClientId ? 'MATCH' : 'MISMATCH';
}

/**
 * Production UX & Diagnostics Pack v1 — معلومات التوكن **بلا أي سرّ**.
 *
 * تُعيد ما يحتاجه مركز التشخيص فقط: هل يوجد رمز تحديث، ومتى ينتهي رمز الوصول،
 * وحالة ربط العميل. **لا تُعيد قيمة أي رمز إطلاقًا** — لا access ولا refresh ولا
 * client secret. لا يمكن لطبقة التشخيص أن تُسرّب ما لا تستطيع رؤيته أصلًا.
 */
export function getTokenDiagnostics(dataDir: string, currentClientId: string | null): {
  refreshTokenPresent: boolean;
  accessTokenExpiresAt: string | null;
  clientBinding: ClientBinding;
} {
  const stored = readStoredAuth(dataDir);
  const expiry = stored?.tokens.expiry_date;
  return {
    refreshTokenPresent: !!stored?.tokens.refresh_token,
    accessTokenExpiresAt: typeof expiry === 'number' && Number.isFinite(expiry) ? new Date(expiry).toISOString() : null,
    clientBinding: currentClientId ? checkClientBinding(dataDir, currentClientId) : 'UNKNOWN',
  };
}

/** هل تشفير نظام التشغيل متاح لتخزين الرموز على هذا الجهاز؟ (§6 — حالة التشفير). */
export function isTokenEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** ينشئ خطأ المنحة الميتة الخاص بعدم تطابق العميل — رسالة عربية تشرح السبب الحقيقي. */
export function clientMismatchError(): GrantDeadError {
  return new GrantDeadError(
    'unauthorized_client',
    'ربط حساب Google الحالي أُنشئ بإعدادات تطبيق مختلفة عن الإعدادات المستخدمة الآن، ' +
      'فلم يعد صالحًا للاستخدام. بياناتك المحلية سليمة ولم تتأثر — يرجى إعادة ربط الحساب.',
  );
}

/** ينشئ عميل OAuth2 من التوكنات المخزّنة، مع تحديث تلقائي وحفظ فوري عند التجديد. */
export function createOAuthClient(dataDir: string, creds: DriveClientCredentials): OAuth2Client {
  const client = new OAuth2Client({ clientId: creds.clientId, clientSecret: creds.clientSecret });
  const stored = readStoredAuth(dataDir);
  if (stored) client.setCredentials(stored.tokens);

  client.on('tokens', (tokens: Credentials) => {
    const merged: StoredTokens = { ...stored?.tokens, ...tokens };
    // الحفظ مشروط بوجود `refresh_token` كما كان: ردّ التجديد العادي لا يحمله،
    // والدمج أعلاه يُبقيه من النسخة المخزّنة فلا يُمحى أبدًا. ويُثبَّت هنا أيضًا
    // ربط العميل — فيُرقّى أي توكن قديم بلا ربط إلى الصيغة الجديدة تلقائيًا.
    if (merged.refresh_token) persistTokens(dataDir, merged, creds.clientId);
  });

  return client;
}

// ── جلسة Drive موحّدة ─────────────────────────────────────────────────────────

export type DriveSession =
  | { ok: true; client: OAuth2Client; creds: DriveClientCredentials }
  | { ok: false; reason: 'NOT_CONFIGURED' | 'NOT_AUTHENTICATED'; message: string }
  | { ok: false; reason: 'GRANT_DEAD'; message: string; error: GrantDeadError };

/**
 * المدخل **الوحيد** لفتح جلسة Drive في كل النظام.
 *
 * قبل هذه الحزمة كانت أربعة مسارات مختلفة تنشئ العميل بنفسها (`requireClient`،
 * الفحص السلبي للتعارض، مزامنة البدء، مزامنة الإغلاق) — فكان أي فحص جديد يجب أن
 * يُضاف أربع مرات، وكان فحص ربط العميل سينسى في واحد منها حتمًا. الآن كل تحقق
 * (تهيئة ← اتصال ← ربط العميل) يعيش في مكان واحد ويسري على الجميع بالضرورة.
 */
export function openDriveSession(dataDir: string): DriveSession {
  const creds = loadClientCredentials(dataDir);
  if (!creds) {
    return {
      ok: false,
      reason: 'NOT_CONFIGURED',
      message: 'لم تُعدّ المزامنة السحابية في هذه النسخة من البرنامج — يرجى التواصل مع الدعم الفني.',
    };
  }
  if (!isAuthenticated(dataDir)) {
    return {
      ok: false,
      reason: 'NOT_AUTHENTICATED',
      message: 'حساب Google غير مرتبط — يرجى ربط الحساب أولًا.',
    };
  }
  if (checkClientBinding(dataDir, creds.clientId) === 'MISMATCH') {
    const error = clientMismatchError();
    return { ok: false, reason: 'GRANT_DEAD', message: error.arabicMessage, error };
  }
  return { ok: true, client: createOAuthClient(dataDir, creds), creds };
}

/** يُشغّل تدفّق OAuth عبر متصفح النظام؛ يفتح خادمًا محليًا مؤقتًا لاستقبال إعادة التوجيه. */
export async function runAuthFlow(dataDir: string, creds: DriveClientCredentials): Promise<{ email: string }> {
  const client = new OAuth2Client({ clientId: creds.clientId, clientSecret: creds.clientSecret });

  return new Promise((resolve, reject) => {
    const server = http.createServer();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close();
      fn();
    };

    const timeout = setTimeout(() => {
      finish(() => reject(new Error('انتهت مهلة تسجيل الدخول — لم يكتمل التفويض خلال 5 دقائق')));
    }, AUTH_TIMEOUT_MS);

    server.on('request', (req, res) => {
      (async () => {
        if (!req.url) return;
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname !== '/oauth2callback') {
          res.writeHead(404);
          res.end();
          return;
        }

        const code = url.searchParams.get('code');
        const errorParam = url.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<html dir="rtl"><body style="font-family:sans-serif;text-align:center;padding-top:60px">' +
            '<h2>يمكنك إغلاق هذه النافذة والعودة إلى نظام المنار</h2></body></html>',
        );

        if (settled) return;

        if (errorParam || !code) {
          // رمز الخطأ القادم من Google (`access_denied` غالبًا) يُمرَّر كما هو داخل
          // الرسالة ليتولّى `classifyGoogleAuthError` ترجمته إلى عربية للمستخدم.
          finish(() => reject(new Error(`فشل تفويض Google Drive: ${errorParam ?? 'لم يُستلم رمز التفويض'}`)));
          return;
        }

        try {
          const port = (server.address() as AddressInfo).port;
          const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
          const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
          client.setCredentials(tokens);
          persistTokens(dataDir, tokens, creds.clientId);

          const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
            signal: AbortSignal.timeout(20_000),
          });
          if (!userInfoRes.ok) throw new Error('فشل جلب بيانات الحساب من Google');
          const userInfo = (await userInfoRes.json()) as { email?: string };
          const email = userInfo.email ?? 'unknown';
          writeFileAtomicSync(accountFilePath(dataDir), JSON.stringify({ email }), { mode: 0o600 });

          finish(() => resolve({ email }));
        } catch (err) {
          // التوكن قد يكون حُفظ للتوّ بينما فشلت خطوة لاحقة — لا نترك ربطًا نصف
          // مكتمل يجعل الواجهة تعرض «متصل» بحساب مجهول. المسح يُعيدنا إلى حالة
          // نظيفة معروفة، والمستخدم يعيد المحاولة من زرّ واحد.
          try { clearStoredAuth(dataDir); } catch { /* أفضل جهد */ }
          finish(() => reject(err instanceof Error ? err : new Error(String(err))));
        }
      })();
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
        redirect_uri: redirectUri,
      });
      shell.openExternal(authUrl).catch((err) => {
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      });
    });

    server.on('error', (err) => {
      finish(() => reject(err));
    });
  });
}

/** يُلغي التوكن لدى Google (إن أمكن) ويمسح كل ما هو مخزَّن محليًا. */
export async function revokeAuth(dataDir: string, creds: DriveClientCredentials | null): Promise<void> {
  if (creds) {
    const stored = readStoredTokens(dataDir);
    if (stored?.refresh_token) {
      const client = new OAuth2Client({ clientId: creds.clientId, clientSecret: creds.clientSecret });
      try {
        await client.revokeToken(stored.refresh_token);
      } catch {
        // أفضل جهد فقط — المسح المحلي أدناه يحدث دائمًا
      }
    }
  }
  clearStoredAuth(dataDir);
}
