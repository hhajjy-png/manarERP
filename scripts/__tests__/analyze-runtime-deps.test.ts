import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  readPeImports,
  analyze,
  REDIST_DLL_MAP,
  REDISTRIBUTABLES,
  WINDOWS_BASELINE,
} = require('../analyze-runtime-deps.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Production Deployment Pack v1 — محلّل الاعتماديات وقت التشغيل.
 *
 * ── الخطر الذي تحرسه هذه الاختبارات ───────────────────────────────────────────
 *
 * فشل هذا المحلّل **صامت بطبيعته**: قارئ PE لا يفهم ملفًا يُعيد «لا استيرادات»،
 * فيبدو ذلك في التقرير كـ«لا متطلبات» — وهي بالضبط النتيجة التي نتمنّاها، فلا
 * ينتبه أحد. النتيجة: مثبّت يُعلن أنه مكتفٍ ذاتيًا ثم يفشل على أول جهاز نظيف
 * برسالة DLL مفقود. لذلك أول اختبار هنا يُثبت أن القارئ **يقرأ فعلًا**، لا أنه
 * يُعيد نتيجة خالية بسلام.
 */

/** ثنائيات حقيقية من شجرة المستودع — أفضل من ملفات اصطناعية: هي ما يُشحن فعلًا. */
const PRISMA_ENGINE_CANDIDATES = [
  'backend/node_modules/.prisma/client/query_engine-windows.dll.node',
  'node_modules/.prisma/client/query_engine-windows.dll.node',
];
const ELECTRON_EXE = 'node_modules/electron/dist/electron.exe';

const firstExisting = (candidates: string[]): string | null => {
  for (const c of candidates) {
    const abs = path.join(REPO_ROOT, c);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
};

describe('readPeImports — قراءة جدول استيراد PE', () => {
  it('يستخرج استيرادات حقيقية من محرّك Prisma الأصلي (لا نتيجة خالية)', () => {
    const engine = firstExisting(PRISMA_ENGINE_CANDIDATES);
    expect(engine, 'محرّك Prisma غير موجود — شغّل "npm run db:generate"').not.toBeNull();

    const result = readPeImports(engine!);

    expect(result).not.toBeNull();
    expect(result.arch).toBe('x64');
    // نتيجة خالية = فشل تحليل متنكّر في صورة نجاح. أي ثنائي وندوز حقيقي
    // يستورد kernel32 على الأقل.
    expect(result.imports.length).toBeGreaterThan(3);
    expect(result.imports).toContain('kernel32.dll');
  });

  it('يقرأ ملفًا تنفيذيًا كبيرًا بجداول استيراد عادية ومؤجَّلة (electron.exe)', () => {
    const exe = path.join(REPO_ROOT, ELECTRON_EXE);
    if (!fs.existsSync(exe)) return; // غير مثبَّت في هذه البيئة — لا يُفشل الاختبار

    const result = readPeImports(exe);

    expect(result).not.toBeNull();
    expect(result.arch).toBe('x64');
    expect(result.imports).toContain('kernel32.dll');
    expect(result.imports).toContain('user32.dll');
  });

  it('يُعيد null لملف ليس PE بدل أن يرمي خطأ', () => {
    expect(readPeImports(path.join(REPO_ROOT, 'package.json'))).toBeNull();
  });

  it('يُعيد null لملف غير موجود بدل أن يرمي خطأ', () => {
    expect(readPeImports(path.join(REPO_ROOT, 'لا-يوجد-هذا-الملف.dll'))).toBeNull();
  });
});

describe('analyze — تصنيف الاستيرادات إلى متطلبات', () => {
  it('لا يُصنّف مكتبات نظام وندوز كمتطلبات قابلة للتوزيع', () => {
    const result = analyze(['node_modules/electron/dist']);
    if (result.analyzed.length === 0) return; // Electron غير مثبَّت هنا

    // kernel32/user32 جزء من نظام التشغيل — تصنيفها متطلبًا يعني مثبّتًا
    // يحاول «تثبيت وندوز» على وندوز.
    expect([...result.unknown.keys()]).not.toContain('kernel32.dll');
    expect([...result.unknown.keys()]).not.toContain('user32.dll');
    expect(result.requirements.size).toBe(0);
  });

  it('لا يُصنّف DLL مشحونًا داخل الحزمة نفسها كمتطلب خارجي', () => {
    const result = analyze(['node_modules/electron/dist']);
    if (result.analyzed.length === 0) return;

    // electron.exe يستورد ffmpeg.dll — وهو مشحون بجواره. متطلب داخلي لا خارجي.
    expect(result.shippedBasenames.has('ffmpeg.dll')).toBe(true);
    expect([...result.unknown.keys()]).not.toContain('ffmpeg.dll');
  });

  it('لا يُصنّف عقود API Set (api-ms-win-*) كمتطلبات — أسماء وهمية يحلّها المحمّل', () => {
    const result = analyze(['node_modules/electron/dist']);
    if (result.analyzed.length === 0) return;

    for (const dll of result.unknown.keys()) {
      expect(dll.startsWith('api-ms-win-'), `عقد API Set صُنِّف متطلبًا: ${dll}`).toBe(false);
      expect(dll.startsWith('ext-ms-win-'), `عقد API Set صُنِّف متطلبًا: ${dll}`).toBe(false);
    }
  });

  it('لا يفشل على مسار غير موجود', () => {
    const result = analyze(['لا/يوجد/هذا/المسار']);
    expect(result.analyzed).toEqual([]);
    expect(result.requirements.size).toBe(0);
    expect(result.unknown.size).toBe(0);
  });
});

describe('جدول المتطلبات — سلامة العقد', () => {
  it('كل DLL في خريطة إعادة التوزيع يشير إلى متطلب مُعرَّف فعلًا', () => {
    for (const [dll, redistId] of Object.entries(REDIST_DLL_MAP)) {
      expect(REDISTRIBUTABLES[redistId as string], `متطلب مجهول لـ${dll}: ${redistId}`).toBeDefined();
    }
  });

  it('كل متطلب يحمل ما يكفي لفحصه وتثبيته صامتًا', () => {
    for (const redist of Object.values(REDISTRIBUTABLES) as any[]) {
      expect(redist.name).toBeTruthy();
      expect(redist.installerFile).toBeTruthy();
      expect(redist.silentArgs).toBeTruthy();
      // بلا فحص وجود، يُعاد تثبيت مكوّن قائم في كل مرة — نقض صريح للمتطلب.
      expect(redist.detection?.key).toBeTruthy();
      expect(redist.detection?.valueName).toBeTruthy();
    }
  });

  it('لا يتداخل خط أساس وندوز مع خريطة إعادة التوزيع', () => {
    // DLL مُصنَّف «موجود دائمًا» و«يحتاج تثبيتًا» في آنٍ واحد ⇒ الأول يفوز صامتًا
    // ولا يُثبَّت المتطلب أبدًا.
    for (const dll of Object.keys(REDIST_DLL_MAP)) {
      expect(WINDOWS_BASELINE.has(dll), `${dll} مُصنَّف في خط الأساس وفي المتطلبات معًا`).toBe(false);
    }
  });
});
