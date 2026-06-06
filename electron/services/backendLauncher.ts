import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { fork, ChildProcess } from 'child_process';

let backendProcess: ChildProcess | null = null;

/**
 * تحديد مسارات البيانات حسب البيئة:
 * - التطوير: داخل backend/data (نفس قاعدة البيانات التي طُبّقت عليها الترحيلات والبيانات الأولية).
 * - الإنتاج: داخل مجلد بيانات المستخدم (userData)؛ وعند أول تشغيل تُنسخ قاعدة بيانات
 *   مبدئية مُهيّأة (template) المرفقة مع التطبيق إن لم تكن موجودة.
 */
// process.resourcesPath متاح في Electron لكنه غير معرّف في أنواع Node
const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? process.cwd();

export function getUserDataPaths() {
  const isDev = !app.isPackaged;
  const backendCwd = isDev
    ? path.join(__dirname, '..', '..', 'backend')
    : path.join(resourcesPath, 'backend');

  let dataDir: string;
  if (isDev) {
    dataDir = path.join(backendCwd, 'data');
  } else {
    dataDir = path.join(app.getPath('userData'), 'data');
  }

  const backupDir = path.join(dataDir, 'backups');
  const dbPath = path.join(dataDir, 'manar.db');
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });

  // في الإنتاج: انسخ قاعدة البيانات المبدئية المُهيّأة عند أول تشغيل
  if (!isDev && !fs.existsSync(dbPath)) {
    const templateDb = path.join(backendCwd, 'data', 'manar.db');
    if (fs.existsSync(templateDb)) fs.copyFileSync(templateDb, dbPath);
  }

  return { isDev, backendCwd, dataDir, dbPath, backupDir };
}

/**
 * تشغيل الخدمة الخلفية (Express) كعملية فرعية مع تمرير متغيرات البيئة.
 */
export function startBackend(): Promise<void> {
  const { isDev, backendCwd, dataDir, dbPath, backupDir } = getUserDataPaths();

  const entry = isDev
    ? path.join(backendCwd, 'src', 'server.ts')
    : path.join(backendCwd, 'dist', 'server.js');

  const env = {
    ...process.env,
    // مهم جدًا: يجعل ثنائي Electron يعمل كـ Node عند تشغيل العملية الفرعية
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: isDev ? 'development' : 'production',
    DATABASE_URL: `file:${dbPath}`,
    BACKUP_DIR: backupDir,
    DATA_DIR: dataDir,
    PORT: '48211',
    HOST: '127.0.0.1',
    JWT_SECRET: process.env.JWT_SECRET || 'manar-local-secret-change-me',
  };

  return new Promise((resolve, reject) => {
    backendProcess = fork(entry, [], {
      cwd: backendCwd,
      env,
      execArgv: isDev ? ['--import', 'tsx'] : [],
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    backendProcess.stdout?.on('data', (d) => process.stdout.write(`[backend] ${d}`));
    backendProcess.stderr?.on('data', (d) => process.stderr.write(`[backend] ${d}`));
    backendProcess.on('error', reject);

    waitForHealth().then(resolve).catch(reject);
  });
}

/** انتظار جاهزية الخدمة عبر فحص /api/health. */
async function waitForHealth(retries = 50): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch('http://127.0.0.1:48211/api/health');
      if (res.ok) return;
    } catch {
      // لم تجهز بعد
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('تعذّر تشغيل الخدمة الخلفية في الوقت المتوقع');
}

/** إيقاف الخدمة الخلفية بأمان. */
export function stopBackend(): void {
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
    backendProcess = null;
  }
}
