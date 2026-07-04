// Google Drive OAuth token store (Electron main).
//
// Stores the refresh token encrypted at rest via Electron `safeStorage`
// (OS keychain / DPAPI-backed) — NOT in plaintext, NOT in the DB, NOT in git.
// Phase 1 provides the storage primitive; Phase 2's OAuth flow writes the token
// here. The token value is never logged.

import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

function tokenFilePath(): string {
  return path.join(app.getPath('userData'), 'google-drive-token.enc');
}

/** True when the OS provides an encryption backend for safeStorage. */
export function isSecureStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** Encrypt and persist a token blob. Refuses to write if secure storage is unavailable. */
export function saveToken(tokenJson: string): { ok: boolean; error?: string } {
  if (!isSecureStorageAvailable()) {
    return { ok: false, error: 'التخزين الآمن (safeStorage) غير متاح على هذا الجهاز — لن يُحفظ الرمز' };
  }
  try {
    const encrypted = safeStorage.encryptString(tokenJson);
    fs.writeFileSync(tokenFilePath(), encrypted, { mode: 0o600 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'فشل حفظ الرمز' };
  }
}

/** Decrypt and return the stored token blob, or null if none / unavailable. */
export function loadToken(): string | null {
  try {
    const p = tokenFilePath();
    if (!fs.existsSync(p) || !isSecureStorageAvailable()) return null;
    return safeStorage.decryptString(fs.readFileSync(p));
  } catch {
    return null;
  }
}

export function hasToken(): boolean {
  try {
    return fs.existsSync(tokenFilePath());
  } catch {
    return false;
  }
}

/** Delete the stored token (disconnect / revoke locally). */
export function clearToken(): { ok: boolean } {
  try {
    const p = tokenFilePath();
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
