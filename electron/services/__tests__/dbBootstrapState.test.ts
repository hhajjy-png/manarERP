import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  markSeeded,
  markBootstrapComplete,
  isPristineSeed,
  readBootstrapState,
  BOOTSTRAP_STATE_FILE,
} from '../dbBootstrapState';

/**
 * انحدار: First-Run Packaged Database Bootstrap Safety.
 *
 * الخطر: القالب المُضمَّن يُنسخ عند أول تشغيل، فتراه مزامنة البدء «تغييرًا محليًا»
 * ⇒ CONFLICT ⇒ اختيار «المحلي» يرفع قالبًا قديمًا فوق بيانات Drive الحقيقية.
 *
 * أخطر ما في الإصلاح هو نقيضه: تصنيف قاعدة مستخدم **حقيقية** كبذرة. لذلك أكثر
 * الحالات هنا تُثبت **ما لا يُصنَّف بذرة**.
 */

let dataDir: string;
const SEED_HASH = 'a'.repeat(64);
const REAL_HASH = 'b'.repeat(64);

beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-boot-')); });
afterEach(() => { fs.rmSync(dataDir, { recursive: true, force: true }); });

describe('dbBootstrapState — التصنيف يتطلّب دليلين معًا', () => {
  it('وسم صريح + بصمة مطابقة ⇒ بذرة', () => {
    markSeeded(dataDir, SEED_HASH, 'C:/app/resources/backend/data/manar.db');
    expect(isPristineSeed(dataDir, SEED_HASH)).toBe(true);
  });

  it('🔴 وسم بذرة لكن البصمة تغيّرت (المستخدم أدخل بيانات) ⇒ قاعدة حقيقية', () => {
    markSeeded(dataDir, SEED_HASH, 'tpl');
    // أول كتابة حقيقية تُغيّر البصمة — الترقية تلقائية وإلى الأبد.
    expect(isPristineSeed(dataDir, REAL_HASH)).toBe(false);
  });

  it('🔴 غياب ملف الحالة وحده لا يجعل القاعدة بذرة', () => {
    // مستخدم حقيقي حذف sync-metadata أو ربط الحساب بعد شهور عمل.
    expect(isPristineSeed(dataDir, REAL_HASH)).toBe(false);
    expect(readBootstrapState(dataDir)).toBeNull();
  });

  it('ملف حالة تالف ⇒ يُعامَل كقاعدة حقيقية (fail-safe)', () => {
    fs.writeFileSync(path.join(dataDir, BOOTSTRAP_STATE_FILE), '{{{ not json');
    expect(isPristineSeed(dataDir, SEED_HASH)).toBe(false);
  });

  it('حالة بلا seedSha256 لا تكفي', () => {
    fs.writeFileSync(path.join(dataDir, BOOTSTRAP_STATE_FILE), JSON.stringify({ state: 'SEED' }));
    expect(isPristineSeed(dataDir, SEED_HASH)).toBe(false);
  });

  it('بصمة محلية غائبة (لا قاعدة) ⇒ ليست بذرة', () => {
    markSeeded(dataDir, SEED_HASH, 'tpl');
    expect(isPristineSeed(dataDir, null)).toBe(false);
  });

  it('لا يعتمد التصنيف على تاريخ الملف ولا على عدد السجلات', () => {
    markSeeded(dataDir, SEED_HASH, 'tpl');
    const saved = readBootstrapState(dataDir)!;
    expect(Object.keys(saved).sort()).toEqual(['seedSha256', 'seededAt', 'state', 'templateSource']);
    // `seededAt` تشخيصي فقط: تغييره لا يُغيّر التصنيف.
    fs.writeFileSync(
      path.join(dataDir, BOOTSTRAP_STATE_FILE),
      JSON.stringify({ ...saved, seededAt: '1990-01-01T00:00:00.000Z' }),
    );
    expect(isPristineSeed(dataDir, SEED_HASH)).toBe(true);
    expect(isPristineSeed(dataDir, REAL_HASH)).toBe(false);
  });
});

describe('dbBootstrapState — الترقية بعد bootstrap ناجح', () => {
  it('🔴 بعد الترقية: التشغيل التالي يعامل القاعدة كحقيقية لا بذرة', () => {
    markSeeded(dataDir, SEED_HASH, 'tpl');
    expect(isPristineSeed(dataDir, SEED_HASH)).toBe(true);

    markBootstrapComplete(dataDir);

    expect(readBootstrapState(dataDir)?.state).toBe('REAL');
    // حتى لو عادت البصمة مطابقة للبذرة صدفةً، الحالة REAL تحسم.
    expect(isPristineSeed(dataDir, SEED_HASH)).toBe(false);
  });

  it('الترقية لا تُنشئ حالة لقاعدة لم تُبذَر أصلًا', () => {
    markBootstrapComplete(dataDir);
    expect(readBootstrapState(dataDir)).toBeNull();
  });

  it('الترقية تحتفظ بأثر التشخيص ولا تُعيد كتابة بذرة', () => {
    markSeeded(dataDir, SEED_HASH, 'C:/tpl.db');
    markBootstrapComplete(dataDir);
    const s = readBootstrapState(dataDir)!;
    expect(s.templateSource).toBe('C:/tpl.db');
    expect(s.promotedAt).toBeTruthy();
    expect(s.seedSha256).toBeUndefined();
  });

  it('فشل bootstrap (لا ترقية) يُبقيها بذرة فتُعاد المحاولة في التشغيل التالي', () => {
    markSeeded(dataDir, SEED_HASH, 'tpl');
    // لم تُستدعَ markBootstrapComplete — التنزيل فشل.
    expect(isPristineSeed(dataDir, SEED_HASH)).toBe(true);
    expect(readBootstrapState(dataDir)?.state).toBe('SEED');
  });

  it('الوسم لا يرمي على مجلد غير موجود', () => {
    const missing = path.join(dataDir, 'deep', 'nested');
    expect(() => markSeeded(missing, SEED_HASH, 'tpl')).not.toThrow();
    expect(isPristineSeed(missing, SEED_HASH)).toBe(true);
  });
});

/**
 * MEDIUM-1 — شبكة الأمان: الإثبات من بصمة القالب المشحون نفسه.
 *
 * تُغلق الفجوة الذرّية بين `copyFileSync` و`markSeeded`: تعطّل أو فشل كتابة ملف
 * الحالة لم يعد يترك بذرةً بلا حماية.
 */
describe('dbBootstrapState — الإثبات من القالب عند فقد الوسم', () => {
  let tplPath: string;
  const TPL_BYTES = 'SQLite-template-bytes';
  const tplHash = () => require('crypto').createHash('sha256').update(TPL_BYTES).digest('hex');

  beforeEach(() => {
    tplPath = path.join(dataDir, 'template-manar.db');
    fs.writeFileSync(tplPath, TPL_BYTES);
  });

  it('نُسخ القالب + الوسم سليم ⇒ بذرة (المسار السريع، بلا قراءة القالب)', () => {
    markSeeded(dataDir, tplHash(), tplPath);
    expect(isPristineSeed(dataDir, tplHash(), tplPath)).toBe(true);
  });

  it('🔴 نُسخ القالب + الوسم **مفقود** ⇒ ما زالت بذرة (بصمة القالب تُثبتها)', () => {
    expect(readBootstrapState(dataDir)).toBeNull();
    expect(isPristineSeed(dataDir, tplHash(), tplPath)).toBe(true);
  });

  it('🔴 نُسخ القالب + الوسم **تالف** ⇒ ما زالت بذرة', () => {
    fs.writeFileSync(path.join(dataDir, BOOTSTRAP_STATE_FILE), '{{{ broken');
    expect(isPristineSeed(dataDir, tplHash(), tplPath)).toBe(true);
  });

  it('🔴 فشل كتابة الوسم (حالة بلا seedSha256) ⇒ ما زالت بذرة', () => {
    fs.writeFileSync(path.join(dataDir, BOOTSTRAP_STATE_FILE), JSON.stringify({ state: 'SEED' }));
    expect(isPristineSeed(dataDir, tplHash(), tplPath)).toBe(true);
  });

  it('🔴 قاعدة عُدِّلت بعد النسخ ⇒ ليست بذرة حتى بلا وسم', () => {
    expect(isPristineSeed(dataDir, REAL_HASH, tplPath)).toBe(false);
  });

  it('🔴 قاعدة مستخدم حقيقية لا تطابق القالب ⇒ ليست بذرة أبدًا', () => {
    markSeeded(dataDir, SEED_HASH, tplPath);   // بذرة قديمة مختلفة عن القالب الحالي
    expect(isPristineSeed(dataDir, REAL_HASH, tplPath)).toBe(false);
  });

  it('🔴 الحالة REAL تحسم وتُغلق مسار القالب حتى عند تطابق البصمة', () => {
    markSeeded(dataDir, tplHash(), tplPath);
    markBootstrapComplete(dataDir);
    expect(isPristineSeed(dataDir, tplHash(), tplPath)).toBe(false);
  });

  it('🔴 templatePath = null (بيئة التطوير) ⇒ لا يُصنَّف شيء بذرةً بلا وسم', () => {
    // في dev يكون «القالب» هو ملف القاعدة نفسه — التمرير بـnull يمنع تصنيف
    // قاعدة المطوّر الحقيقية بذرةً. الحارس الفعلي في `getSeedTemplatePath()`.
    expect(isPristineSeed(dataDir, tplHash(), null)).toBe(false);
  });

  it('قالب غير قابل للقراءة ⇒ لا ادّعاء بذرة (fail-safe)', () => {
    expect(isPristineSeed(dataDir, tplHash(), path.join(dataDir, 'no-such-template.db'))).toBe(false);
  });
});
