import cron, { ScheduledTask } from 'node-cron';
import fs from 'fs';
import path from 'path';
import { getUserDataPaths } from './backendLauncher';

let task: ScheduledTask | null = null;

/**
 * نسخ احتياطي مجدول لملف قاعدة البيانات.
 * يديره الـ Main Process مستقلًا عن الخدمة الخلفية لضمان عمله دائمًا.
 */
function runBackup() {
  try {
    const { dbPath, backupDir } = getUserDataPaths();
    if (!fs.existsSync(dbPath)) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(backupDir, `manar-auto-${stamp}.db`);
    fs.copyFileSync(dbPath, target);
    // الاحتفاظ بآخر 30 نسخة تلقائية فقط
    pruneOldBackups(backupDir, 30);
    // eslint-disable-next-line no-console
    console.log(`[backup] نسخة تلقائية: ${target}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[backup] فشل النسخ التلقائي', err);
  }
}

function pruneOldBackups(dir: string, keep: number) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('manar-auto-') && f.endsWith('.db'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  files.slice(keep).forEach((x) => fs.unlinkSync(path.join(dir, x.f)));
}

/** بدء الجدولة (افتراضيًا يوميًا 2:00 صباحًا). */
export function startBackupScheduler(cronExpr = '0 2 * * *') {
  if (task) task.stop();
  if (!cron.validate(cronExpr)) cronExpr = '0 2 * * *';
  task = cron.schedule(cronExpr, runBackup, { timezone: 'Asia/Kuwait' });
}

export function stopBackupScheduler() {
  task?.stop();
  task = null;
}
