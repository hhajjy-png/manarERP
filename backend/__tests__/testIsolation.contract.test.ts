import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  SANDBOX_ROOT,
  REAL_DEV_DB,
  REAL_DATA_DIR,
  assertSandboxed,
  databaseUrlToPath,
  isInside,
  workerSandbox,
  TestIsolationError,
} from '../vitest.sandbox';

/**
 * Test Isolation Pack v1 — عقد العزل.
 *
 * يعيش هذا الملف **خارج `src/`** عمدًا: `tsconfig.json` يضبط `rootDir: ./src`
 * و`include: ["src/**\/*.ts"]`، فوضعه هنا يُبقيه خارج مخرجات البناء تمامًا
 * ويسمح له باستيراد أدوات الصندوق من جذر `backend/` بلا كسر `npm run build:back`.
 *
 * كل حالة أدناه تحرس **ضررًا وقع فعلًا**: تشغيل `npm test` كان يغيّر بايتات
 * `backend/data/manar.db` عبر `backup.verify.test.ts`.
 */

describe('عزل الاختبارات — البيئة مُعاد توجيهها إلى الصندوق الرملي', () => {
  it('DATABASE_URL يشير داخل الصندوق الرملي لا إلى قاعدة التطوير', () => {
    const dbPath = databaseUrlToPath(process.env.DATABASE_URL);
    expect(dbPath).not.toBeNull();
    expect(isInside(SANDBOX_ROOT, dbPath!)).toBe(true);
    expect(path.resolve(dbPath!)).not.toBe(REAL_DEV_DB);
    expect(isInside(REAL_DATA_DIR, dbPath!)).toBe(false);
  });

  it('طبقة التطبيق نفسها ترى الصندوق — لا مجرّد process.env', async () => {
    // هذه هي الحالة الحاسمة: `config/env.ts` يستدعي `dotenv.config()` الذي يقرأ
    // `.env` المشير إلى قاعدة التطوير. إن سبق تحميلُه ضبطَ البيئة، أو لو استبدل
    // `dotenv` القيم الموجودة، لأشار `env.DATABASE_URL` إلى القاعدة الحقيقية.
    const { env } = await import('@config/env');
    const dbPath = databaseUrlToPath(env.DATABASE_URL);
    expect(dbPath).not.toBeNull();
    expect(isInside(SANDBOX_ROOT, dbPath!)).toBe(true);
    expect(isInside(REAL_DATA_DIR, dbPath!)).toBe(false);
  });

  it('مسارات الكتابة الأخرى معزولة أيضًا (نسخ · مرفقات · مجلد البيانات)', () => {
    // افتراضاتها في الشيفرة نسبية (`./data/backups`) فتُحلّ داخل مجلد بيانات
    // التطوير حين يكون `cwd` هو `backend/` — أي أن تركها بلا ضبط يكتب ملفات
    // قواعد بيانات حقيقية في مجلد نسخ المطوّر.
    for (const key of ['BACKUP_DIR', 'ATTACHMENTS_DIR', 'DATA_DIR'] as const) {
      const value = process.env[key];
      expect(value, `${key} غير مضبوط`).toBeTruthy();
      expect(isInside(SANDBOX_ROOT, value!), `${key} خارج الصندوق`).toBe(true);
      expect(isInside(REAL_DATA_DIR, value!), `${key} داخل مجلد التطوير`).toBe(false);
    }
  });

  it('الصندوق موجود فعلًا على القرص ومنفصل لكل عامل', () => {
    const sandbox = workerSandbox();
    expect(fs.existsSync(sandbox)).toBe(true);
    expect(isInside(SANDBOX_ROOT, sandbox)).toBe(true);
  });
});

describe('عزل الاختبارات — الحارس يرفض أي تسرّب', () => {
  /** يُشغّل الحارس على بيئة معدَّلة مؤقتًا ثم يُعيدها كما كانت مهما جرى. */
  function withEnv(overrides: Record<string, string>, fn: () => void): void {
    const saved: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(overrides)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    try {
      fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  it('يرفض توجيه DATABASE_URL إلى قاعدة التطوير الحقيقية', () => {
    withEnv({ DATABASE_URL: 'file:' + REAL_DEV_DB.split(path.sep).join('/') }, () => {
      expect(() => assertSandboxed()).toThrow(TestIsolationError);
      expect(() => assertSandboxed()).toThrow(/قاعدة بيانات التطوير الحقيقية/);
    });
  });

  it('يرفض أي مسار داخل مجلد بيانات التطوير حتى لو لم يكن القاعدة نفسها', () => {
    const sneaky = path.join(REAL_DATA_DIR, 'backups', 'شيء.db');
    withEnv({ DATABASE_URL: 'file:' + sneaky.split(path.sep).join('/') }, () => {
      expect(() => assertSandboxed()).toThrow(TestIsolationError);
    });
  });

  it('يرفض أي مسار خارج الصندوق ولو كان مؤقتًا', () => {
    withEnv({ DATABASE_URL: 'file:C:/tmp/عشوائي.db' }, () => {
      expect(() => assertSandboxed()).toThrow(/خارج الصندوق الرملي/);
    });
  });

  it('يرفض غياب DATABASE_URL بدل السقوط الصامت إلى قيمة .env', () => {
    withEnv({ DATABASE_URL: '' }, () => {
      expect(() => assertSandboxed()).toThrow(/غير مضبوط أو بصيغة غير متوقعة/);
    });
  });

  it('يرفض BACKUP_DIR الافتراضي الذي يشير إلى مجلد نسخ المطوّر', () => {
    withEnv({ BACKUP_DIR: path.join(REAL_DATA_DIR, 'backups') }, () => {
      expect(() => assertSandboxed()).toThrow(/BACKUP_DIR يشير خارج الصندوق/);
    });
  });

  it('يقبل البيئة المضبوطة فعليًا — الحارس ليس رافضًا للكل', () => {
    expect(() => assertSandboxed()).not.toThrow();
  });
});

describe('عزل الاختبارات — قاعدة التطوير غير مستخدَمة', () => {
  it('ملف قاعدة التطوير ليس هو الملف الذي تكتب فيه الاختبارات', () => {
    const inUse = databaseUrlToPath(process.env.DATABASE_URL);
    expect(path.resolve(inUse!)).not.toBe(REAL_DEV_DB);
  });

  it('نسخة الصندوق تحمل المخطّط (فالاختبارات التي تحتاج عميلًا حقيقيًا تعمل)', () => {
    const inUse = databaseUrlToPath(process.env.DATABASE_URL)!;
    // النسخ مشروط بوجود قاعدة التطوير على هذا الجهاز؛ غيابها حالة CI مشروعة.
    if (!fs.existsSync(REAL_DEV_DB)) return;
    expect(fs.existsSync(inUse)).toBe(true);
    expect(fs.statSync(inUse).size).toBeGreaterThan(4096);
  });
});
