import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * ضمانة النسخة المحلية عند فشل السحابة (Cloud-Failure Local Backup Guarantee v1).
 *
 * ما تُثبته هذه الاختبارات هو **الضمانة نفسها**، لا تفاصيل التنفيذ: مهما كانت حالة
 * الخادم الخلفي أو نتيجة خدمته، لا تنتهي المحاولة بلا نسخة على القرص — إلا إذا لم
 * تكن هناك قاعدة أصلًا. وأي فشل داخلي يُعاد كقيمة، لا يُرمى، لأن المُستدعي في محرّك
 * المزامنة يكون في منتصف معالجة فشل سحابي أصلي لا يجوز أن يُخفيه فشل ثانوي هنا.
 */

const backendState = { running: false, secret: 'test-secret' };

vi.mock('../backendLauncher', () => ({
  isBackendRunning: () => backendState.running,
  getInternalSecret: () => backendState.secret,
}));

// لقطة SQLite حقيقية بديلها هنا نسخ بايتات — الاختبار يعني بوجود النسخة لا بمحرّك النسخ.
const snapshot = vi.fn(async (source: string, target: string) => {
  fs.copyFileSync(source, target);
});

vi.mock('../dbIntegrity', () => ({
  snapshotDatabase: (s: string, t: string) => snapshot(s, t),
  checkpointWal: async () => undefined,
}));

let dataDir: string;
let dbPath: string;
let backupDir: string;

async function loadService() {
  return import('../rescueBackupFallback.service');
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-fallback-'));
  backupDir = path.join(dataDir, 'backups');
  dbPath = path.join(dataDir, 'manar.db');
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(dbPath, 'SQLite format 3\0-payload');
  backendState.running = false;
  snapshot.mockClear();
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.useRealTimers();
});

function backupFiles(): string[] {
  return fs.readdirSync(backupDir).filter((f) => f.endsWith('.db'));
}

describe('createRescueBackup — الضمانة غير المشروطة', () => {
  it('يُنشئ لقطة مباشرة في مجلد النسخ القائم حين يكون الخادم الخلفي متوقفًا', async () => {
    const { createRescueBackup } = await loadService();
    const result = await createRescueBackup(dbPath, backupDir);

    expect(result.ok).toBe(true);
    expect(result.via).toBe('DIRECT_SNAPSHOT');
    expect(backupFiles()).toHaveLength(1);
    expect(fs.existsSync(result.filePath as string)).toBe(true);
    expect((result.sizeBytes as number) > 0).toBe(true);
  });

  it('يكتب بصيغة .db داخل مجلد النسخ نفسه — لا موقع ولا صيغة جديدة', async () => {
    const { createRescueBackup } = await loadService();
    const result = await createRescueBackup(dbPath, backupDir);

    expect(path.dirname(result.filePath as string)).toBe(backupDir);
    expect(result.fileName?.endsWith('.db')).toBe(true);
  });

  it('لا يلمس قاعدة البيانات المصدر إطلاقًا — قراءة فقط', async () => {
    const before = fs.readFileSync(dbPath);
    const { createRescueBackup } = await loadService();
    await createRescueBackup(dbPath, backupDir);

    expect(fs.readFileSync(dbPath).equals(before)).toBe(true);
  });

  it('يُنشئ مجلد النسخ إن كان غائبًا بدل أن يفشل', async () => {
    fs.rmSync(backupDir, { recursive: true, force: true });
    const { createRescueBackup } = await loadService();
    const result = await createRescueBackup(dbPath, backupDir);

    expect(result.ok).toBe(true);
    expect(fs.existsSync(backupDir)).toBe(true);
  });

  it('يُرجع فشلًا محكومًا — لا يرمي — حين لا توجد قاعدة بيانات محلية', async () => {
    fs.unlinkSync(dbPath);
    const { createRescueBackup } = await loadService();
    const result = await createRescueBackup(dbPath, backupDir);

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(backupFiles()).toHaveLength(0);
  });

  it('لا يرمي أبدًا حتى لو انفجر محرّك اللقطة — يُعيد ok:false مع السبب', async () => {
    snapshot.mockRejectedValueOnce(new Error('VACUUM فشل'));
    const { createRescueBackup } = await loadService();

    const result = await createRescueBackup(dbPath, backupDir);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('VACUUM');
    // لا يُترك ملف نصف مكتوب خلفه
    expect(backupFiles()).toHaveLength(0);
  });

  it('يحذف اللقطة الفارغة ويُبلّغ بالفشل بدل تسليم نسخة عديمة القيمة', async () => {
    snapshot.mockImplementationOnce(async (_s: string, target: string) => {
      fs.writeFileSync(target, '');
    });
    const { createRescueBackup } = await loadService();

    const result = await createRescueBackup(dbPath, backupDir);
    expect(result.ok).toBe(false);
    expect(backupFiles()).toHaveLength(0);
  });

  it('يسقط إلى اللقطة المباشرة حين يعمل الخادم الخلفي لكن خدمته لا تُنتج نسخة', async () => {
    // لا خادم HTTP حقيقي على المنفذ ⇒ الطلب يفشل ⇒ يجب ألا تُلغى الضمانة.
    backendState.running = true;
    const { createRescueBackup } = await loadService();

    const result = await createRescueBackup(dbPath, backupDir);
    expect(result.ok).toBe(true);
    expect(result.via).toBe('DIRECT_SNAPSHOT');
    expect(backupFiles()).toHaveLength(1);
  });

  it('يبقي حدّ الاحتفاظ على نسخ المسار المباشر ولا يمسّ أي ملف آخر في المجلد', async () => {
    // ملفات لا تخصّ هذا المسار — يجب أن تبقى مهما بلغ عدد نسخ المسار المباشر.
    const manual = path.join(backupDir, 'manar-backup-2026-01-01-00-00-00.db');
    const preRestore = path.join(backupDir, 'manar-auto-before-restore-2026-01-01.db');
    fs.writeFileSync(manual, 'x');
    fs.writeFileSync(preRestore, 'x');

    // 32 نسخة من المسار المباشر بأختام زمنية متباعدة — أقدم من الحدّ (30).
    for (let i = 0; i < 32; i++) {
      const p = path.join(backupDir, `manar-rescue-local-old-${i}.db`);
      fs.writeFileSync(p, 'x');
      const at = new Date(Date.UTC(2026, 0, 1) + i * 60_000);
      fs.utimesSync(p, at, at);
    }

    const { createRescueBackup } = await loadService();
    const result = await createRescueBackup(dbPath, backupDir);

    expect(result.ok).toBe(true);
    expect(fs.existsSync(manual)).toBe(true);
    expect(fs.existsSync(preRestore)).toBe(true);
    const direct = fs.readdirSync(backupDir).filter((f) => f.startsWith('manar-rescue-local-'));
    expect(direct.length).toBe(30);
  });

  // ── Production Hardening Pack v1 — P0-8 ────────────────────────────────────
  //
  // نسخ الخادم الخلفي مسجّلة في جدول `Backup` وقابلة للاستعادة من داخل النظام.
  // تقليم المسار المباشر كان يحذفها لتطابق البادئة، فتبقى صفوفها تشير إلى ملفات
  // غير موجودة. الفصل بفضاء أسماء مستقلّ يجعل ذلك مستحيلًا بنيويًا لا بالانضباط.
  it('لا يحذف أبدًا نسخة إنقاذ من إنتاج الخادم الخلفي (مسجّلة في قاعدة البيانات)', async () => {
    // 40 نسخة بالبادئة الرسمية — أكثر من حدّ الاحتفاظ للمسار المباشر بكثير.
    const backendOwned: string[] = [];
    for (let i = 0; i < 40; i++) {
      const p = path.join(backupDir, `manar-rescue-2026-01-01-00-00-${String(i).padStart(2, '0')}.db`);
      fs.writeFileSync(p, 'x');
      const at = new Date(Date.UTC(2026, 0, 1) + i * 60_000);
      fs.utimesSync(p, at, at);
      backendOwned.push(p);
    }

    const { createRescueBackup } = await loadService();
    const result = await createRescueBackup(dbPath, backupDir);

    expect(result.ok).toBe(true);
    for (const p of backendOwned) {
      expect(fs.existsSync(p)).toBe(true);
    }
  });

  it('يستخدم فضاء أسماء مستقلًّا للمسار المباشر يميّزه عن نسخ الخادم الخلفي', async () => {
    const { createRescueBackup } = await loadService();
    const result = await createRescueBackup(dbPath, backupDir);

    expect(result.via).toBe('DIRECT_SNAPSHOT');
    expect(result.fileName?.startsWith('manar-rescue-local-')).toBe(true);
  });
});
