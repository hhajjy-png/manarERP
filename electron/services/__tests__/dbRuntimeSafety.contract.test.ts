import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * حراسة عقد بنيوي — Database & Google Drive Runtime Safety Pack v1.
 *
 * هذه الملفات تستورد `electron` فعليًا (app/dialog/ipcMain)، فلا تعمل تحت
 * `vitest.electron.config.ts` (بيئة node بلا Electron runtime — انظر تعليق الإعداد).
 * لذلك تُغطّى هنا **ترتيب الاستدعاءات وهوية المسارات** على المصدر مباشرةً: وهي
 * تحديدًا الثوابت التي انكسرت في التدقيق (تأخير ثابت بدل انتظار حقيقي، نسخ ملف
 * حيّ بدل لقطة متسقة، تفرّع مصدر المسار).
 *
 * الطبقة السلوكية الحقيقية مغطّاة في `runtimeLock.test.ts` و`syncTempCleanup.test.ts`.
 */

const root = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const backupIpc = read('electron/ipc/backup.ipc.ts');
const syncEngine = read('electron/services/syncEngine.service.ts');
/**
 * Production Hardening Pack v1 — قواعد القرار صارت في وحدة نقية مستقلة (P0-10)،
 * وهي الآن مغطّاة سلوكيًا بالكامل في `syncDecision.pure.test.ts`. تُقرأ هنا لأن هذا
 * الملف يحرس **ترتيب القواعد** على المصدر، وهو ضمانة بنيوية لا تلتقطها اختبارات
 * السلوك وحدها (إعادة ترتيب فرعين قد تُبقي كل الاختبارات خضراء وتُنتج فقدان بيانات).
 */
const syncDecision = read('electron/services/syncDecision.pure.ts');
const launcher = read('electron/services/backendLauncher.ts');
const mainTs = read('electron/main.ts');
const backupService = read('backend/src/shared/services/backup.service.ts');

/** موضع أول ظهور — للتأكّد من الترتيب النسبي داخل نفس الدالة. */
const at = (src: string, needle: string) => src.indexOf(needle);

describe('Restore Reliability — الاستعادة المحلية توحّدت مع مسار Drive', () => {
  it('تنتظر خروج الخادم فعليًا: stopBackendForRestart بدل stopBackend + تأخير ثابت', () => {
    expect(backupIpc).toContain('await stopBackendForRestart()');
    // التأخير الثابت 800ms أُزيل من مسار الاستعادة.
    expect(backupIpc).not.toContain('setTimeout(r, 800)');
  });

  it('🔴 الترتيب: إيقاف الخادم يسبق استبدال الملف', () => {
    const stop = at(backupIpc, 'await stopBackendForRestart()');
    const replace = at(backupIpc, 'fs.copyFileSync(sourcePath, dbPath)');
    expect(stop).toBeGreaterThan(-1);
    expect(replace).toBeGreaterThan(-1);
    expect(stop).toBeLessThan(replace);
  });

  it('الاستبدال يُعيد المحاولة على أقفال ويندوز فقط (EPERM/EBUSY)', () => {
    expect(backupIpc).toContain('withRetry');
    expect(backupIpc).toContain('isRetryable: isFileLockError');
    expect(backupIpc).toMatch(/code === 'EPERM' \|\| code === 'EBUSY'/);
  });

  it('🔴 الفشل لا يترك الخادم متوقفًا: إعادة التشغيل في finally', () => {
    const restoreBlock = backupIpc.slice(at(backupIpc, 'await stopBackendForRestart()'));
    const finallyIdx = restoreBlock.indexOf('} finally {');
    expect(finallyIdx).toBeGreaterThan(-1);
    const finallyBlock = restoreBlock.slice(finallyIdx);
    expect(finallyBlock).toContain('startBackend(getInternalSecret())');
    // إعادة التشغيل بعد كتلة catch ⇒ تعمل على مسارَي النجاح والفشل معًا.
    expect(at(restoreBlock, '} catch (err) {')).toBeLessThan(finallyIdx);
  });

  it('حماية التراجع القائمة لم تُضعَف: نسخة أمان قبل الاستبدال + rollback عند الفشل', () => {
    expect(backupIpc).toContain('manar-auto-before-restore-');
    expect(backupIpc).toContain('fs.copyFileSync(autoBackupPath, dbPath)');
    expect(backupIpc).toContain('تم التراجع إلى قاعدة البيانات الأصلية');
  });
});

describe('R3 — الرفع اليدوي يرفع لقطة متسقة لا نسخة ملف حيّ', () => {
  it('🔴 اللقطة عبر VACUUM INTO لا fs.copyFileSync', () => {
    expect(syncEngine).toContain('await snapshotDatabase(dbPath, snapshotPath)');
    expect(syncEngine).not.toContain('fs.copyFileSync(dbPath, snapshotPath)');
  });

  it('VACUUM INTO يُنفَّذ عبر مسار execute (SQLite يرفض إعادة صفوف منه)', () => {
    const integrity = read('electron/services/dbIntegrity.ts');
    expect(integrity).toContain('export async function snapshotDatabase');
    expect(integrity).toContain('$executeRawUnsafe(`VACUUM INTO');
    expect(integrity).toContain("replace(/'/g, \"''\")"); // اقتباس المسار
  });

  it('فحصا السلامة قبل وبعد اللقطة ما زالا قائمَين', () => {
    expect(syncEngine).toContain('فشل فحص السلامة قبل الرفع');
    expect(syncEngine).toContain('فشل فحص سلامة اللقطة قبل الرفع');
  });

  it('اللقطة تُحذف دائمًا في finally', () => {
    expect(syncEngine).toMatch(/finally \{[\s\S]{0,200}unlinkSync\(snapshotPath\)/);
  });

  it('سياسة المزامنة لم تتغيّر: بدء=تنزيل · إغلاق=رفع · تعارض=حلّ صريح', () => {
    const startup = syncEngine.slice(at(syncEngine, 'export async function performStartupSync'));
    const startupBody = startup.slice(0, startup.indexOf('export async function performShutdownSync'));
    expect(startupBody).toContain('downloadInternal');
    expect(startupBody).not.toContain('uploadInternal');

    const shutdown = syncEngine.slice(at(syncEngine, 'export async function performShutdownSync'));
    expect(shutdown).toContain('uploadInternal');
    expect(shutdown).not.toContain('downloadInternal');

    // السياسة نفسها صارت مُعبَّرًا عنها بحارسين نقيّين مُختبَرين، لا بشرط مضمَّن.
    expect(syncDecision).toContain("return action === 'DOWNLOAD';");
    expect(syncDecision).toContain("return action === 'UPLOAD';");

    // لا حلّ تلقائي للتعارض في أيٍّ من المسارين.
    expect(startupBody).toContain("decision.action === 'CONFLICT'");
    expect(shutdown).toContain("decision.action === 'CONFLICT'");
    expect(syncEngine).not.toMatch(/last-?write-?wins|autoMerge|auto_merge/i);
  });
});

describe('R1 — حارس التقاطع يسبق أي مزامنة أو كتابة', () => {
  it('🔴 القفل يُطلب قبل مزامنة البدء وقبل تشغيل الخادم', () => {
    const guard = at(mainTs, 'guardAgainstSplitBrain(bootDataDir)');
    const startupSync = at(mainTs, 'performStartupSync(dbPath, dataDir)');
    const backend = at(mainTs, 'await startBackend(INTERNAL_SECRET)');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(startupSync);
    expect(guard).toBeLessThan(backend);
  });

  it('التقاطع يُنهي التطبيق ولا يحذف/يدمج/ينسخ أي قاعدة', () => {
    const guardFn = mainTs.slice(at(mainTs, 'function guardAgainstSplitBrain'), at(mainTs, 'async function bootstrap'));
    expect(guardFn).toContain('dialog.showMessageBoxSync');
    expect(guardFn).toContain('return false');
    expect(guardFn).not.toMatch(/unlink|rmSync|copyFileSync|renameSync/);
  });

  it('القفل يُحرَّر بعد مزامنة الإغلاق لا قبلها', () => {
    const shutdownSync = at(mainTs, 'performShutdownSync(dbPath, dataDir)');
    const release = at(mainTs, 'releaseRuntimeLock();');
    expect(release).toBeGreaterThan(shutdownSync);
  });

  it('الكنس يُستدعى عند البدء ولا يُعطّل التشغيل عند الفشل', () => {
    const call = at(mainTs, 'cleanupOrphanSyncTemps(bootDataDir)');
    expect(call).toBeGreaterThan(-1);
    // الاستدعاء ملفوف بـtry/catch يبتلع الخطأ ويُكمل البدء.
    const around = mainTs.slice(call, call + 900);
    expect(around).toContain('catch (err)');
    expect(around).toContain('فشل كنس الملفات المؤقتة');
    expect(mainTs.slice(0, call)).toMatch(/try \{\s*$/m);
  });
});

describe('HIGH-1 — البيئة المرفوضة لا تصل إلى مزامنة الإغلاق', () => {
  /** جسم `before-quit` كاملًا — نفحص حارسه وترتيب ما بداخله. */
  const beforeQuit = mainTs.slice(at(mainTs, "app.on('before-quit'"), at(mainTs, "app.on('will-quit'"));

  it('🔴 الحارس يشمل startupAborted لا quitConfirmed وحده', () => {
    expect(beforeQuit).toContain('if (quitConfirmed || startupAborted) return;');
    // الخروج المبكر **قبل** preventDefault ⇒ لا تسلسل إغلاق متدرّج أصلًا.
    expect(beforeQuit.indexOf('startupAborted) return;'))
      .toBeLessThan(beforeQuit.indexOf('event.preventDefault()'));
  });

  it('🔴 مسار الرفض يضبط startupAborted قبل app.quit()', () => {
    const rejectStart = at(mainTs, '!guardAgainstSplitBrain(bootDataDir)');
    const reject = mainTs.slice(rejectStart, mainTs.indexOf('cleanupOrphanSyncTemps(bootDataDir)', rejectStart));
    const flag = reject.indexOf('startupAborted = true;');
    const quit = reject.indexOf('app.quit();');
    expect(flag).toBeGreaterThan(-1);
    expect(flag).toBeLessThan(quit);
  });

  it('🔴 performShutdownSync محجوب خلف الحارس — لا يمكن بلوغه بعد الرفض', () => {
    const guard = beforeQuit.indexOf('startupAborted) return;');
    const sync = beforeQuit.indexOf('performShutdownSync');
    expect(sync).toBeGreaterThan(guard);   // بعد الخروج المبكر ⇒ غير قابل للوصول
  });

  it('🔴 لا تشغيل للخادم ولا مزامنة بدء ولا تسجيل IPC بعد الرفض', () => {
    const boot = mainTs.slice(at(mainTs, 'async function bootstrap'));
    const ret = boot.indexOf('      return;');           // خروج مسار الرفض
    // كل هذه تقع **بعد** نقطة الخروج ⇒ لا تُنفَّذ إطلاقًا.
    for (const call of ['registerSyncIpc()', 'registerBackupIpc()', 'performStartupSync', 'startBackend(INTERNAL_SECRET)', 'createMainWindow()']) {
      expect(boot.indexOf(call)).toBeGreaterThan(ret);
    }
  });

  it('تحرير القفل عند الرفض آمن — فحص الملكية يمنع حذف قفل البيئة العاملة', () => {
    const lock = read('electron/services/runtimeLock.ts');
    expect(lock).toContain('if (existing && existing.pid !== pid) return; // ليس قفلنا');
  });
});

describe('MEDIUM-2 — FAIL CLOSED عند تعذّر إنشاء قفل الأمان', () => {
  it('🔴 لم يعد هناك مسار «متابعة بلا قفل»', () => {
    const guardFn = mainTs.slice(at(mainTs, 'function guardAgainstSplitBrain'), at(mainTs, 'async function bootstrap'));
    // كان: catch → return true (تشغيل غير محمي). الآن: لا try/catch ولا return true إلا عند النجاح.
    expect(guardFn).not.toContain('المتابعة بدونه');
    expect(guardFn).toContain('FAIL CLOSED');
    // `return true` الوحيد في نهاية الدالة بعد نجاح الاستحواذ.
    expect(guardFn.match(/return true;/g) ?? []).toHaveLength(1);
    expect(guardFn.indexOf('return false;')).toBeLessThan(guardFn.indexOf('return true;'));
  });

  it('الرسالتان مفصولتان: HELD مقابل UNAVAILABLE', () => {
    const guardFn = mainTs.slice(at(mainTs, 'function guardAgainstSplitBrain'), at(mainTs, 'async function bootstrap'));
    expect(guardFn).toContain("lock.reason === 'HELD'");
    expect(guardFn).toContain('تعذّر إنشاء قفل الأمان');
    expect(guardFn).toContain('لم يبدأ التطبيق، ولم تُنفَّذ أي مزامنة، ولم يُغيَّر أي ملف');
  });

  it('acquireRuntimeLock لا يرمي — كل فشل مُصنَّف', () => {
    const lock = read('electron/services/runtimeLock.ts');
    expect(lock).toContain("reason: 'UNAVAILABLE'");
    expect(lock).toContain("reason: 'HELD'");
    expect(lock).not.toMatch(/^\s*throw err;/m);
  });
});

describe('MEDIUM-1 — إثبات البذرة من القالب عند فقد الوسم', () => {
  it('🔴 isPristineSeed يقبل مسار القالب كشبكة أمان', () => {
    const boot = read('electron/services/dbBootstrapState.ts');
    expect(boot).toContain('templatePath: string | null = null');
    expect(boot).toContain('sha256FileSync(templatePath) === currentSha256');
    // الحالة REAL تحسم قبل الوصول إلى مسار القالب.
    expect(boot.indexOf("s?.state === 'REAL'")).toBeLessThan(boot.indexOf('if (!templatePath) return false;'));
  });

  it('🔴 حارس بيئة التطوير: القالب = ملف القاعدة نفسه ⇒ null', () => {
    expect(launcher).toContain('export function getSeedTemplatePath()');
    expect(launcher).toContain('if (isDev) return null;');
    expect(launcher).toContain('if (path.resolve(templateDb) === path.resolve(dbPath)) return null;');
  });

  it('كلا مُستدعيَي البذرة يمرّران القالب', () => {
    const calls = syncEngine.match(/isPristineSeed\(dataDir, localHash, getSeedTemplatePath\(\)\)/g) ?? [];
    expect(calls).toHaveLength(2);   // decide() + performUpload()
    expect(syncEngine).not.toMatch(/isPristineSeed\(dataDir, localHash\)\s*\)/);
  });
});

describe('First-Run Bootstrap Safety — البذرة لا تنافس Drive', () => {
  it('🔴 البذرة توسَم لحظة نسخ القالب، لا استنتاجًا لاحقًا', () => {
    const copyIdx = at(launcher, 'fs.copyFileSync(templateDb, dbPath)');
    const markIdx = at(launcher, 'markSeeded(dataDir, sha256FileSync(dbPath), templateDb)');
    expect(copyIdx).toBeGreaterThan(-1);
    expect(markIdx).toBeGreaterThan(copyIdx);
    // الوسم داخل نفس الحارس `!isDev && !fs.existsSync(dbPath)` ⇒ أول تشغيل فقط.
    expect(launcher).toMatch(/!isDev && !fs\.existsSync\(dbPath\)[\s\S]{0,900}markSeeded\(/);
  });

  it('🔴 أول تشغيل + وجود remote ⇒ DOWNLOAD حصرًا، فلا CONFLICT ولا خيار LOCAL', () => {
    // `decide()` تجمع الحقيقة، و`decideSyncAction` تطبّق القاعدة — كلاهما مُلزَم.
    expect(syncEngine).toContain('isPristineSeed: isPristineSeed(dataDir, localHash, getSeedTemplatePath())');

    const rules = syncDecision.slice(at(syncDecision, 'export function decideSyncAction'));
    const guard = rules.indexOf('if (isPristineSeed) {');
    const conflict = rules.indexOf("action: 'CONFLICT'");
    expect(guard).toBeGreaterThan(-1);
    // الحارس يسبق فرع التعارض ⇒ لا يمكن أن يُنتَج تعارض على بذرة.
    expect(guard).toBeLessThan(conflict);
    expect(rules.slice(guard, guard + 300)).toContain("action: 'DOWNLOAD'");
  });

  it('أول تشغيل بلا remote ⇒ التهيئة المحلية المعتادة تبقى كما هي', () => {
    const rules = syncDecision.slice(at(syncDecision, 'export function decideSyncAction'));
    const noRemote = rules.indexOf('if (!remote) {');
    const guard = rules.indexOf('if (isPristineSeed) {');
    // فرع «لا نسخة سحابية» يسبق حارس البذرة ⇒ لا يتدخّل الحارس أصلًا.
    expect(noRemote).toBeGreaterThan(-1);
    expect(noRemote).toBeLessThan(guard);
    expect(rules.slice(noRemote, guard)).toContain("action: 'UPLOAD'");
  });

  it('🔴 حارس بنيوي: رفض رفع البذرة فوق نسخة سحابية قائمة (يغطّي «رفع الآن» وresolveConflict)', () => {
    const up = syncEngine.slice(at(syncEngine, 'async function uploadInternal('));
    const guard = up.indexOf('remote && isPristineSeed(dataDir, localHash, getSeedTemplatePath())');
    const upload = up.indexOf('uploadDatabase(client, snapshotPath');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(upload); // يمنع قبل الرفع الفعلي
    expect(up.slice(guard, guard + 500)).toContain('رُفض الرفع');
  });

  it('🔴 الترقية إلى REAL بعد نجاح التنزيل فقط — الفشل يُبقيها بذرة', () => {
    const dl = syncEngine.slice(at(syncEngine, 'async function downloadInternal('));
    const mark = dl.indexOf('markBootstrapComplete(dataDir)');
    const verified = dl.indexOf('لا تطابق البصمة المسجّلة');   // فشل مطابقة البصمة يرمي قبلها
    const rename = dl.indexOf('fs.renameSync(tempPath, dbPath)');
    expect(mark).toBeGreaterThan(-1);
    expect(mark).toBeGreaterThan(verified);
    expect(mark).toBeGreaterThan(rename);
    // ليست في catch ولا في finally ⇒ لا ترقية عند الفشل.
    expect(dl.slice(mark - 400, mark)).not.toContain('} catch');
  });

  it('قواعد التعارض الحقيقي لم تتغيّر: محلي حقيقي + سحابي متغيّران ⇒ CONFLICT صريح', () => {
    expect(syncDecision).toContain('if (remoteChanged && localChanged) {');
    expect(syncDecision).toContain("action: 'CONFLICT'");
    const resolve = syncEngine.slice(at(syncEngine, 'export async function resolveConflict'));
    expect(resolve).toContain("if (choice === 'LOCAL') {");
    expect(resolve).toContain('uploadInternal(dbPath, dataDir, { resolvesConflict: true');
    expect(resolve).toContain('downloadInternal(dbPath, dataDir, { resolvesConflict: true });');
  });

  it('انحدار الهوية: البصمة المحلية تُسجَّل منفصلة عن بصمة اللقطة المرفوعة', () => {
    // VACUUM INTO يُعيد كتابة البايتات ⇒ hash(snapshot) ≠ hash(dbPath). بدون الفصل
    // يبقى localChanged صحيحًا أبدًا بعد كل رفع ⇒ تعارض كاذب مع جهاز آخر.
    expect(syncEngine).toContain('const localHash = await sha256File(dbPath)');
    expect(syncEngine).toContain('lastSyncedLocalHash: localHash');
    expect(syncEngine).toContain('lastSyncedLocalHash: downloadedHash');
    expect(syncDecision).toContain('metadata.lastSyncedLocalHash ?? metadata.lastSyncedHash');
  });
});

describe('هوية المسارات — CURRENT_DB = sync source = download target = restore target', () => {
  it('مصدر واحد لكل المسارات: getUserDataPaths()', () => {
    // الخادم يُشغَّل بـ DATABASE_URL/DATA_DIR من نفس التفكيك.
    expect(launcher).toContain('const { isDev, backendCwd, dataDir, dbPath, backupDir } = getUserDataPaths()');
    expect(launcher).toContain('DATABASE_URL: databaseUrl');
    expect(launcher).toContain('DATA_DIR: dataDir');
    expect(launcher).toContain('const databaseUrl = toFileUrl(dbPath)');

    // الاستعادة المحلية ومزامنة البدء/الإغلاق تقرأ نفس الدالة.
    expect(backupIpc).toContain('getUserDataPaths()');
    expect(mainTs).toContain('getUserDataPaths()');
  });

  it('استعادة الخادم الخلفي تشتقّ مسارها من نفس DATABASE_URL', () => {
    expect(backupService).toContain("env.DATABASE_URL.replace(/^file:/, '')");
  });

  it('الرفع والتنزيل يعملان على dbPath نفسه (لقطة/مؤقت داخل dataDir ثم استبدال)', () => {
    expect(syncEngine).toContain('await snapshotDatabase(dbPath, snapshotPath)');
    expect(syncEngine).toContain('path.join(dataDir, `sync-tmp-snapshot-');
    expect(syncEngine).toContain('path.join(dataDir, `sync-tmp-download-');
    expect(syncEngine).toContain('fs.renameSync(tempPath, dbPath)');
  });

  it('لم تُنشأ قاعدة بديلة ولا مسار موازٍ في هذه الحزمة', () => {
    for (const src of [mainTs, backupIpc, syncEngine]) {
      expect(src).not.toMatch(/manar2\.db|manar-new\.db|\.db2\b/);
    }
  });
});
