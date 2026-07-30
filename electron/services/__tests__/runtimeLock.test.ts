import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  acquireRuntimeLock,
  releaseRuntimeLock,
  runtimeLockPath,
  describeLockConflict,
} from '../runtimeLock';

/**
 * انحدار: Dev/Packaged Split-Brain Protection (R1).
 *
 * التقاطع الذي كشفه التدقيق: بيئة التطوير والنسخة المُعبَّأة لهما `userData` مختلف
 * ⇒ `app.requestSingleInstanceLock()` منفصل لكلٍّ منهما، و`dataDir` مختلف ⇒
 * قاعدتا بيانات محليتان مستقلتان تزامنان **ملف Google Drive نفسه**.
 */

let tmpRoot: string;
let lockPath: string;

const DEV_DATA = path.join('C:', 'repo', 'manarERP', 'backend', 'data');
const PKG_DATA = path.join('C:', 'Users', 'x', 'AppData', 'Roaming', 'manar-erp', 'data');

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-lock-'));
  lockPath = path.join(tmpRoot, '.manarERP', 'runtime.lock');
});
afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const alive = () => true;
const dead = () => false;

describe('runtimeLock — مسار القفل مشترك بين البيئتين', () => {
  it('المسار مشتق من المجلد الشخصي وحده — لا userData ولا dataDir ولا اسم التطبيق', () => {
    const home = path.join('C:', 'Users', 'x');
    expect(runtimeLockPath(home)).toBe(path.join(home, '.manarERP', 'runtime.lock'));
  });

  it('البيئتان تحسبان **نفس** المسار رغم اختلاف dataDir — شرط رؤية إحداهما قفل الأخرى', () => {
    // لو كان القفل مشتقًا من dataDir لاختلف المساران ولما تقاطعا أبدًا.
    const home = path.join('C:', 'Users', 'x');
    expect(runtimeLockPath(home)).toBe(runtimeLockPath(home));
    expect(runtimeLockPath(home)).not.toContain('backend');
    expect(runtimeLockPath(home)).not.toContain('AppData');
  });
});

describe('runtimeLock — منع التقاطع', () => {
  it('🔴 السيناريو المستهدف: packaged يُرفض بينما dev يعمل بقاعدة مختلفة', () => {
    const devOk = acquireRuntimeLock(DEV_DATA, { lockPath, pid: 1001, isProcessAlive: alive });
    expect(devOk.ok).toBe(true);

    const pkg = acquireRuntimeLock(PKG_DATA, { lockPath, pid: 2002, isProcessAlive: alive });

    expect(pkg.ok).toBe(false);
    if (pkg.ok) throw new Error('unreachable');
    expect(pkg.reason).toBe('HELD');
    if (pkg.reason !== 'HELD') throw new Error('unreachable');
    expect(pkg.holder.pid).toBe(1001);
    expect(pkg.holder.dataDir).toBe(DEV_DATA);
  });

  it('والعكس: dev يُرفض بينما packaged يعمل', () => {
    acquireRuntimeLock(PKG_DATA, { lockPath, pid: 2002, isProcessAlive: alive });
    const dev = acquireRuntimeLock(DEV_DATA, { lockPath, pid: 1001, isProcessAlive: alive });
    expect(dev.ok).toBe(false);
  });

  it('الرسالة تُسمّي البيئتين وتؤكّد أنه لم يُغيَّر أي ملف', () => {
    acquireRuntimeLock(DEV_DATA, { lockPath, pid: 1001, isProcessAlive: alive });
    const pkg = acquireRuntimeLock(PKG_DATA, { lockPath, pid: 2002, isProcessAlive: alive });
    if (pkg.ok || pkg.reason !== 'HELD') throw new Error('unreachable');

    const msg = describeLockConflict(pkg.holder, PKG_DATA);
    expect(msg).toContain(DEV_DATA);
    expect(msg).toContain(PKG_DATA);
    expect(msg).toContain('1001');
    expect(msg).toContain('Google Drive');       // يشرح سبب الخطر
    expect(msg).toContain('لم يُغيَّر أي ملف');    // لا حذف/دمج تلقائي
  });

  it('نسخة ثانية من نفس البيئة تُرفض أيضًا (backstop لقفل Electron)', () => {
    acquireRuntimeLock(DEV_DATA, { lockPath, pid: 1001, isProcessAlive: alive });
    const second = acquireRuntimeLock(DEV_DATA, { lockPath, pid: 3003, isProcessAlive: alive });
    expect(second.ok).toBe(false);
  });
});

describe('runtimeLock — التشغيل الطبيعي لا يتعطّل', () => {
  it('نسخة واحدة على جهاز نظيف تعمل طبيعيًا', () => {
    const r = acquireRuntimeLock(DEV_DATA, { lockPath, pid: 1001, isProcessAlive: alive });
    expect(r).toEqual({ ok: true, tookOverStaleLock: false });
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  it('قفل يتيم من إغلاق قسري (pid ميت) يُستحوَذ عليه بصمت — لا إقعاد للتطبيق', () => {
    acquireRuntimeLock(DEV_DATA, { lockPath, pid: 1001, isProcessAlive: alive });
    const next = acquireRuntimeLock(DEV_DATA, { lockPath, pid: 4004, isProcessAlive: dead });
    expect(next).toEqual({ ok: true, tookOverStaleLock: true });
  });

  it('ملف قفل تالف لا يُقعِد التطبيق — يُعامَل كيتيم', () => {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, '{{{ not json');
    const r = acquireRuntimeLock(DEV_DATA, { lockPath, pid: 1001, isProcessAlive: alive });
    expect(r.ok).toBe(true);
  });

  it('إغلاق ثم إعادة تشغيل نظيفة تعمل (التحرير يزيل القفل)', () => {
    acquireRuntimeLock(DEV_DATA, { lockPath, pid: 1001, isProcessAlive: alive });
    releaseRuntimeLock({ lockPath, pid: 1001 });
    expect(fs.existsSync(lockPath)).toBe(false);

    const again = acquireRuntimeLock(PKG_DATA, { lockPath, pid: 2002, isProcessAlive: alive });
    expect(again.ok).toBe(true);
  });

  it('التحرير لا يمسّ قفل بيئة أخرى استحوذت عليه', () => {
    acquireRuntimeLock(PKG_DATA, { lockPath, pid: 2002, isProcessAlive: alive });
    releaseRuntimeLock({ lockPath, pid: 1001 }); // خروج متأخر لعملية قديمة
    expect(fs.existsSync(lockPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid).toBe(2002);
  });

  it('تحرير بلا قفل قائم لا يرمي', () => {
    expect(() => releaseRuntimeLock({ lockPath, pid: 1001 })).not.toThrow();
  });
});

describe('runtimeLock — FAIL CLOSED عند تعذّر إنشاء القفل (MEDIUM-2)', () => {
  it('🔴 تعذّر إنشاء مجلد القفل ⇒ UNAVAILABLE لا متابعة صامتة', () => {
    // ملف عادي مكان المجلد ⇒ mkdirSync يفشل بـENOTDIR/EEXIST.
    const blocked = path.join(tmpRoot, 'blocked');
    fs.writeFileSync(blocked, 'not a directory');
    const r = acquireRuntimeLock(DEV_DATA, {
      lockPath: path.join(blocked, 'runtime.lock'),
      pid: 1001,
      isProcessAlive: alive,
    });
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== 'UNAVAILABLE') throw new Error('expected UNAVAILABLE');
    expect(r.error).toContain('تعذّر');
  });

  it('🔴 تعذّر كتابة ملف القفل ⇒ UNAVAILABLE', () => {
    // مسار القفل نفسه مجلد ⇒ writeFileSync يفشل بـEISDIR (وليس EEXIST).
    fs.mkdirSync(lockPath, { recursive: true });
    const r = acquireRuntimeLock(DEV_DATA, { lockPath, pid: 1001, isProcessAlive: alive });
    expect(r.ok).toBe(false);
    if (r.ok || r.reason !== 'UNAVAILABLE') throw new Error('expected UNAVAILABLE');
  });

  it('لا يرمي أبدًا — كل فشل مُصنَّف في النتيجة', () => {
    fs.mkdirSync(lockPath, { recursive: true });
    expect(() => acquireRuntimeLock(DEV_DATA, { lockPath, pid: 1, isProcessAlive: alive })).not.toThrow();
  });

  it('التمييز صحيح: القفل التالف يُسترَدّ، وتعذّر البنية يُرفض', () => {
    // (أ) محتوى تالف ⇒ استرداد آمن
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, 'corrupt');
    const recovered = acquireRuntimeLock(DEV_DATA, { lockPath, pid: 1001, isProcessAlive: alive });
    expect(recovered).toEqual({ ok: true, tookOverStaleLock: true });

    // (ب) عجز عن الكتابة ⇒ رفض
    const dirLock = path.join(tmpRoot, 'as-dir.lock');
    fs.mkdirSync(dirLock);
    const refused = acquireRuntimeLock(DEV_DATA, { lockPath: dirLock, pid: 1001, isProcessAlive: alive });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error('unreachable');
    expect(refused.reason).toBe('UNAVAILABLE');
  });
});
