import { safeStorage, shell } from 'electron';
import http from 'http';
import type { AddressInfo } from 'net';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { OAuth2Client, type Credentials } from 'google-auth-library';

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

export interface DriveClientCredentials {
  clientId: string;
  clientSecret: string;
}

export type StoredTokens = Credentials;

function tokenFilePath(dataDir: string): string {
  return path.join(dataDir, 'gdrive-token.dat');
}

function accountFilePath(dataDir: string): string {
  return path.join(dataDir, 'gdrive-account.json');
}

/**
 * يحمّل بيانات اعتماد تطبيق OAuth (Client ID/Secret) — من متغيرات البيئة أولًا،
 * ثم من ملف تهيئة محلي غير مُتتبَّع بـ git. لا قيم افتراضية مُضمَّنة في الكود أبدًا.
 */
export function loadClientCredentials(dataDir: string): DriveClientCredentials | null {
  const envId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const envSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret };

  const configPath = path.join(dataDir, 'gdrive-client.json');
  if (fs.existsSync(configPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<DriveClientCredentials>;
      if (typeof raw.clientId === 'string' && typeof raw.clientSecret === 'string') {
        return { clientId: raw.clientId, clientSecret: raw.clientSecret };
      }
    } catch {
      // ملف تهيئة تالف — يُعامل كغير مهيأ
    }
  }
  return null;
}

function persistTokens(dataDir: string, tokens: StoredTokens): void {
  const json = JSON.stringify(tokens);
  const canEncrypt = safeStorage.isEncryptionAvailable();
  const body = canEncrypt ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8');
  const flag = Buffer.from([canEncrypt ? 1 : 0]);
  fs.writeFileSync(tokenFilePath(dataDir), Buffer.concat([flag, body]), { mode: 0o600 });
}

function readStoredTokens(dataDir: string): StoredTokens | null {
  const file = tokenFilePath(dataDir);
  if (!fs.existsSync(file)) return null;
  try {
    const buf = fs.readFileSync(file);
    const flag = buf[0];
    const body = buf.subarray(1);
    const json = flag === 1 ? safeStorage.decryptString(body) : body.toString('utf8');
    return JSON.parse(json) as StoredTokens;
  } catch {
    return null;
  }
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

/** ينشئ عميل OAuth2 من التوكنات المخزّنة، مع تحديث تلقائي وحفظ فوري عند التجديد. */
export function createOAuthClient(dataDir: string, creds: DriveClientCredentials): OAuth2Client {
  const client = new OAuth2Client({ clientId: creds.clientId, clientSecret: creds.clientSecret });
  const stored = readStoredTokens(dataDir);
  if (stored) client.setCredentials(stored);

  client.on('tokens', (tokens: Credentials) => {
    const merged: StoredTokens = { ...stored, ...tokens };
    if (merged.refresh_token) persistTokens(dataDir, merged);
  });

  return client;
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
          finish(() => reject(new Error(`فشل تفويض Google Drive: ${errorParam ?? 'لم يُستلم رمز التفويض'}`)));
          return;
        }

        try {
          const port = (server.address() as AddressInfo).port;
          const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
          const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
          client.setCredentials(tokens);
          persistTokens(dataDir, tokens);

          const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (!userInfoRes.ok) throw new Error('فشل جلب بيانات الحساب من Google');
          const userInfo = (await userInfoRes.json()) as { email?: string };
          const email = userInfo.email ?? 'unknown';
          fs.writeFileSync(accountFilePath(dataDir), JSON.stringify({ email }), { mode: 0o600 });

          finish(() => resolve({ email }));
        } catch (err) {
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
