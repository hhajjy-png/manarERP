import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PACKAGED_OAUTH_CLIENT_FILENAME } from '../services/googleDriveClientConfig.pure';

/**
 * Google Drive Deployment Pack v1 — verifies the bundled OAuth client config is
 * actually declared in the real build/package configuration (electron-builder.yml),
 * not only resolved correctly in isolation by the credential-resolution unit tests.
 * A drive-by edit that removes this extraResources entry would otherwise silently
 * ship an installer whose packaged app can never resolve OAuth credentials.
 */
describe('electron-builder.yml — packaged Google Drive OAuth resource', () => {
  const configPath = path.join(__dirname, '..', '..', 'electron-builder.yml');
  const config = fs.readFileSync(configPath, 'utf8');

  it('declares an extraResources entry copying the developer-provisioned OAuth client config', () => {
    const entryPattern = new RegExp(
      `from:\\s*electron/resources/gdrive-oauth-client\\.json\\s*\\n\\s*to:\\s*${PACKAGED_OAUTH_CLIENT_FILENAME}`,
    );
    expect(config).toMatch(entryPattern);
  });

  it('the source path resolves under electron/resources (matches the runtime resolver\'s expected filename)', () => {
    expect(config).toContain(`electron/resources/gdrive-oauth-client.json`);
  });
});

describe('electron/resources/ — developer setup scaffolding', () => {
  const resourcesDir = path.join(__dirname, '..', 'resources');

  it('ships a committed .example.json template (not the real credentials file)', () => {
    expect(fs.existsSync(path.join(resourcesDir, 'gdrive-oauth-client.example.json'))).toBe(true);
  });

  it('the example template has the expected clientId/clientSecret shape', () => {
    const raw = fs.readFileSync(path.join(resourcesDir, 'gdrive-oauth-client.example.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    expect(typeof parsed.clientId).toBe('string');
    expect(typeof parsed.clientSecret).toBe('string');
  });

  it('documents the one-time developer/release setup step', () => {
    expect(fs.existsSync(path.join(resourcesDir, 'README.md'))).toBe(true);
  });
});

describe('.gitignore — the real credential file is never committed', () => {
  it('ignores electron/resources/gdrive-oauth-client.json', () => {
    const gitignore = fs.readFileSync(path.join(__dirname, '..', '..', '.gitignore'), 'utf8');
    expect(gitignore).toContain('electron/resources/gdrive-oauth-client.json');
  });
});

/**
 * Production Deployment Pack v1 — عقد حزمة الإنتاج.
 *
 * كل تأكيد أدناه يحرس عطلًا **لا يظهر إلا على جهاز المستخدم النهائي**: البناء ينجح،
 * والمثبّت يُنتَج، والاختبارات تمرّ — ثم يفشل شيء بعد التثبيت على جهاز نظيف. هذا
 * أسوأ ما يمكن أن يمرّ من مراجعة، ولا شيء غير عقد صريح على ملف التهيئة يمنعه.
 */
describe('electron-builder.yml — عقد حزمة الإنتاج', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  const config = fs.readFileSync(path.join(repoRoot, 'electron-builder.yml'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    version: string;
    productName?: string;
    scripts: Record<string, string>;
  };

  it('لا يحذف بيانات المستخدم عند إلغاء التثبيت', () => {
    // أخطر سطر في الملف كله. `deleteAppDataOnUninstall: true` يمحو
    // %AppData%\...\data — أي قاعدة البيانات وكل النسخ الاحتياطية المحلية —
    // بلا سؤال ولا تراجع. الافتراضي في electron-builder هو false، لكن الاعتماد
    // على افتراضي في قرار بهذا الحجم ليس عقدًا.
    expect(config).toMatch(/deleteAppDataOnUninstall:\s*false/);
  });

  it('يشحن قاعدة البيانات المبدئية (بيانات النظام الحالية)', () => {
    expect(config).toMatch(/from:\s*backend\/data\/manar\.db\s*\n\s*to:\s*backend\/data\/manar\.db/);
  });

  it('يشحن مجلد seed-data (يقرأ منه backendLauncher بيان القالب الذهبي)', () => {
    // المسار الهدف `seed-data` مقروء حرفيًا في backendLauncher عبر
    // path.join(resourcesPath, 'seed-data') — تغييره هنا يكسر قراءة البيان بصمت.
    expect(config).toMatch(/from:\s*build\/seed-data\s*\n\s*to:\s*seed-data/);
    const launcher = fs.readFileSync(
      path.join(repoRoot, 'electron', 'services', 'backendLauncher.ts'),
      'utf8',
    );
    expect(launcher).toContain("path.join(resourcesPath, 'seed-data'");
  });

  it('Data Safety Pack v2 (F-04) — لا يُجهَّز أي ملف حالة من جهاز البناء', () => {
    // `sync-metadata.json` كان يمنح الجهاز الجديد تاريخ مزامنة جهاز البناء فيحوّل
    // أول قرار من CONFLICT آمن إلى UPLOAD صامت فوق بيانات Drive، و`gdrive-account.json`
    // كان يسرّب بريد المطوّر. عودة أيٍّ منهما إلى سكربت التجهيز تُعيد العطل نفسه.
    const script = fs.readFileSync(path.join(repoRoot, 'scripts', 'prepare-seed-data.js'), 'utf8');
    const staging = script.slice(script.indexOf('function stageSeedFiles'));
    expect(staging).not.toContain('sync-metadata.json');
    expect(staging).not.toContain('gdrive-account.json');
    expect(staging).toContain('GOLDEN_MANIFEST_FILENAME');
  });

  it('Data Safety Pack v2 (F-03) — اسم بيان القالب متطابق بين السكربت والوحدة القارئة', () => {
    // ملفّان في لغتين مختلفتين يتفقان على اسم واحد بلا مُصدِّر مشترك؛ اختلافهما
    // يُسقط الحماية بصمت (البيان يُكتب باسم لا يقرؤه أحد ⇒ سلوك ما قبل الحزمة).
    const script = fs.readFileSync(path.join(repoRoot, 'scripts', 'prepare-seed-data.js'), 'utf8');
    const module_ = fs.readFileSync(
      path.join(repoRoot, 'electron', 'services', 'goldenManifest.ts'),
      'utf8',
    );
    expect(script).toContain("GOLDEN_MANIFEST_FILENAME = 'golden-manifest.json'");
    expect(module_).toContain("GOLDEN_MANIFEST_FILENAME = 'golden-manifest.json'");
  });

  it('يشحن مخطط Prisma والترحيلات — بلاها يفشل migrate deploy عند بدء الخدمة', () => {
    expect(config).toMatch(/from:\s*backend\/prisma\s*\n\s*to:\s*backend\/prisma/);
    expect(config).toMatch(/from:\s*backend\/package\.json/);
  });

  it('لا يشحن من backend/prisma إلا المخطط والترحيلات — قائمة حصرية لا استبعادية', () => {
    // `backend/prisma/data/manar.db` قاعدة **ثانية قديمة** (ومعها ملف `-journal`
    // أي أنها مُتّسخة) خلّفها تشغيل Prisma بمسار نسبي. شحنها داخل المثبّت بجوار
    // قاعدة القالب الحقيقية التباس خطر لا مجرّد حجم زائد. مُرشِّح حصري يمنع هذا
    // النوع من التسرّب مستقبلًا: ما لم يُذكر صراحةً لا يُشحن.
    const prismaEntry = config.slice(
      config.indexOf('from: backend/prisma'),
      config.indexOf('from: backend/package.json'),
    );
    expect(prismaEntry).toContain('filter:');
    expect(prismaEntry).toMatch(/-\s*schema\.prisma/);
    expect(prismaEntry).toMatch(/-\s*migrations\/\*\*\/\*/);
    expect(prismaEntry).not.toMatch(/-\s*['"]?\*\*\/\*/); // لا شمول عام
  });

  it('يشحن أصول الخدمة الخلفية (الخط العربي وقالب NBK)', () => {
    expect(config).toMatch(/from:\s*backend\/assets\s*\n\s*to:\s*backend\/assets/);
  });

  it('يستبعد بقايا محرّك Prisma المؤقتة من الحزمة', () => {
    // ثلاثون نسخة × 19 ميغابايت كانت تُشحن في كل مثبّت. حاجز ثانٍ بعد مُرشِّح
    // prepare-backend-deps — تكرار مقصود: كلاهما رخيص، وفقدان أحدهما صامت.
    expect(config).toContain("'!**/*.tmp[0-9]*'");
  });

  it('يدمج سكربت المتطلبات المسبقة المولَّد في المثبّت', () => {
    expect(config).toMatch(/include:\s*build\/installer-prereqs\.nsh/);
  });

  it('يبني هدف NSIS لـx64 فقط مع أيقونة التطبيق', () => {
    expect(config).toMatch(/target:\s*nsis/);
    expect(config).toMatch(/-\s*x64/);
    expect(config).toMatch(/icon:\s*build\/icon\.ico/);
    expect(fs.existsSync(path.join(repoRoot, 'build', 'icon.ico'))).toBe(true);
  });

  it('التثبيت لكل مستخدم ولا يتطلب صلاحيات مسؤول', () => {
    expect(config).toMatch(/perMachine:\s*false/);
  });

  it('اسم المنتج والترقيم التقويمي متسقان بين package.json و electron-builder.yml', () => {
    expect(pkg.productName).toBe('Al Manar ERP');
    expect(config).toMatch(/productName:\s*Al Manar ERP/);
    // ترقيم تقويمي `2026.<إصدار>.<تصحيح>`. كان التأكيد مثبّتًا على `2026.2.` حرفيًا
    // فصار يفشل منذ 2026.3.0 — أي أن العقد المقصود (الالتزام بالترقيم التقويمي)
    // لم يعد محروسًا، وبقي الإخفاق قائمًا عبر إصدارين. الشكل هو المحروس الآن لا
    // رقم إصدار بعينه، فيبقى صحيحًا مع كل ترقية لاحقة.
    expect(pkg.version).toMatch(/^2026\.\d+\.\d+$/);
  });

  it('خط أنابيب dist يُشغّل كل خطوات التجهيز بالترتيب الصحيح', () => {
    const dist = pkg.scripts.dist;
    const order = [
      'package:backend-deps',   // يملأ backend/node_modules
      'package:seed-data',      // يتحقق من القاعدة ويجهّز seed-data
      'package:analyze-deps',   // يفحص الثنائيات — يحتاج node_modules ممتلئًا
      'package:nsis-prereqs',   // يولّد .nsh — يحتاج بيان التحليل
      'package:repair-cache',   // يُصلح ذاكرة أدوات electron-builder على وندوز
      'electron-builder',
    ];
    let cursor = -1;
    for (const step of order) {
      const at = dist.indexOf(step);
      expect(at, `خطوة مفقودة من dist: ${step}`).toBeGreaterThan(-1);
      expect(at, `خطوة خارج الترتيب في dist: ${step}`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });
});
