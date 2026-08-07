import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Production Startup Pack v1 — قرار تشغيل أداة الترحيل.
 *
 * ── الخطر الذي تحرسه هذه الاختبارات ───────────────────────────────────────────
 *
 * هذا القرار يقع على **المسار الحرج للإقلاع**، وخطؤه يظهر في اتجاهين متعاكسين
 * وكلاهما مكلف:
 *
 *   • تشغيل الأداة بلا داع  ⇒ عملية كاملة (عشرات الميغابايتات + محرّك أصلي) في كل
 *     إقلاع. هذا بالضبط ما كان يتجاوز مهلة الجاهزية فيُغلق التطبيق قبل ظهور نافذته.
 *   • تخطّي ترحيل مطلوب     ⇒ تشغيل على مخطط ناقص. أخطر بكثير: فساد بيانات صامت.
 *
 * لذلك تُغطّى حالة «لا نعرف» صراحةً: يجب أن تُرحِّل، لا أن تتخطّى.
 */

const { queryRawUnsafeMock } = vi.hoisted(() => ({ queryRawUnsafeMock: vi.fn() }));

vi.mock('../../../config/database', () => ({
  prisma: { $queryRawUnsafe: queryRawUnsafeMock, $disconnect: vi.fn() },
}));

// `config/env` يستدعي `process.exit(1)` عند غياب متغيّرات البيئة المطلوبة — وهو
// السلوك الصحيح في الإنتاج لكنه يُسقط عملية الاختبار. و`logger` ينشئ مجلدات على
// القرص عند التحميل. كلاهما خارج نطاق ما تختبره هذه الوحدة (قرار الترحيل وحده).
vi.mock('../../../config/env', () => ({
  env: { DATABASE_URL: 'file:./test.db' },
  isProd: true,
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let tmpDir: string;
let migrationsDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

/** ينشئ مجلد ترحيل حقيقي على القرص — نفس ما يقرأه الكود في الإنتاج. */
function makeMigration(name: string, withSql = true): void {
  const dir = path.join(migrationsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  if (withSql) fs.writeFileSync(path.join(dir, 'migration.sql'), '-- sql', 'utf8');
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-migrate-'));
  migrationsDir = path.join(tmpDir, 'prisma', 'migrations');
  fs.mkdirSync(migrationsDir, { recursive: true });
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  queryRawUnsafeMock.mockReset();
});

afterEach(() => {
  cwdSpy.mockRestore();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('listMigrationsOnDisk', () => {
  it('يعدّ المجلدات التي تحوي migration.sql فقط', async () => {
    const { listMigrationsOnDisk } = await import('../migrate');
    makeMigration('20260101_a');
    makeMigration('20260102_b');
    makeMigration('20260103_no_sql', false); // مخلّفات، ليس ترحيلًا
    fs.writeFileSync(path.join(migrationsDir, 'migration_lock.toml'), 'x', 'utf8');

    expect(listMigrationsOnDisk(migrationsDir)).toEqual(['20260101_a', '20260102_b']);
  });

  it('يُعيد قائمة فارغة حين لا يوجد مجلد ترحيلات بدل أن يرمي', async () => {
    const { listMigrationsOnDisk } = await import('../migrate');
    expect(listMigrationsOnDisk(path.join(tmpDir, 'لا-يوجد'))).toEqual([]);
  });
});

describe('checkMigrationState', () => {
  it('UP_TO_DATE حين يطابق المطبَّق ما على القرص ⇒ لا تُشغَّل الأداة', async () => {
    const { checkMigrationState } = await import('../migrate');
    makeMigration('20260101_a');
    makeMigration('20260102_b');
    queryRawUnsafeMock.mockResolvedValue([
      { migration_name: '20260101_a' },
      { migration_name: '20260102_b' },
    ]);

    expect(await checkMigrationState()).toEqual({ decision: 'UP_TO_DATE', onDisk: 2 });
  });

  it('PENDING حين يوجد ترحيل على القرص غير مسجَّل مطبَّقًا', async () => {
    const { checkMigrationState } = await import('../migrate');
    makeMigration('20260101_a');
    makeMigration('20260102_b');
    queryRawUnsafeMock.mockResolvedValue([{ migration_name: '20260101_a' }]);

    expect(await checkMigrationState()).toEqual({
      decision: 'PENDING',
      pending: ['20260102_b'],
      onDisk: 2,
    });
  });

  it('UNKNOWN حين يتعذّر قراءة جدول السجلّ (قاعدة جديدة) ⇒ تُشغَّل الأداة احتياطًا', async () => {
    const { checkMigrationState } = await import('../migrate');
    makeMigration('20260101_a');
    queryRawUnsafeMock.mockRejectedValue(new Error('no such table: _prisma_migrations'));

    const result = await checkMigrationState();
    expect(result.decision).toBe('UNKNOWN');
  });

  it('ترحيل تراجَع عنه Prisma لا يُعدّ مطبَّقًا — الاستعلام يستبعده صراحةً', async () => {
    // لو عُدّ مطبَّقًا لتُخُطّي إلى الأبد على مخطط ناقص. الحارس في نصّ SQL نفسه.
    const { checkMigrationState } = await import('../migrate');
    makeMigration('20260101_a');
    queryRawUnsafeMock.mockResolvedValue([]);

    await checkMigrationState();

    const sql = String(queryRawUnsafeMock.mock.calls[0][0]);
    expect(sql).toContain('finished_at IS NOT NULL');
    expect(sql).toContain('rolled_back_at IS NULL');
  });

  it('UNKNOWN حين لا ترحيلات مشحونة إطلاقًا — حزمة غير سليمة، لا «محدَّث»', async () => {
    const { checkMigrationState } = await import('../migrate');
    const result = await checkMigrationState();
    expect(result.decision).toBe('UNKNOWN');
  });

  it('صفوف غير متوقعة الشكل تُعامَل كـUNKNOWN لا كـ«لا شيء مطبَّق»', async () => {
    const { checkMigrationState } = await import('../migrate');
    makeMigration('20260101_a');
    queryRawUnsafeMock.mockResolvedValue(null);

    expect((await checkMigrationState()).decision).toBe('UNKNOWN');
  });
});
