import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

/**
 * هوية جهاز دائمة — لا علاقة لها بالمصادقة أو الصلاحيات. تُستخدم فقط لعرض «أي
 * جهاز أنشأ هذه النسخة» أثناء حل تعارضات المزامنة، ولوسم كل إدخال في سجلّ
 * المزامنة بالجهاز الذي نفّذه. تُخزَّن محليًا فقط ولا تُرفع كملف مستقل أبدًا —
 * فقط قيمتاها (deviceId/deviceName) تُرفَق كخاصيتين ضمن appProperties لملف
 * قاعدة البيانات نفسه عند الرفع.
 */

export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
  createdAt: string;
}

function identityFilePath(dataDir: string): string {
  return path.join(dataDir, 'device-identity.json');
}

function readIdentity(dataDir: string): DeviceIdentity | null {
  const file = identityFilePath(dataDir);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<DeviceIdentity>;
    if (typeof raw.deviceId === 'string' && typeof raw.deviceName === 'string') {
      return { deviceId: raw.deviceId, deviceName: raw.deviceName, createdAt: raw.createdAt ?? new Date(0).toISOString() };
    }
  } catch {
    // ملف تالف — يُعاد إنشاؤه أدناه
  }
  return null;
}

/** يقرأ هوية الجهاز المخزّنة، أو ينشئ واحدة جديدة عند أول استدعاء على هذا الجهاز. */
export function getOrCreateDeviceIdentity(dataDir: string): DeviceIdentity {
  const existing = readIdentity(dataDir);
  if (existing) return existing;

  const identity: DeviceIdentity = {
    deviceId: crypto.randomUUID(),
    deviceName: os.hostname() || 'جهاز غير معروف',
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(identityFilePath(dataDir), JSON.stringify(identity, null, 2), { mode: 0o600 });
  return identity;
}
