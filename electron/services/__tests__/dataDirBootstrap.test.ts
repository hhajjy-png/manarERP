import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ensureDataLayout,
  seedCompanionFiles,
  DATA_SUBDIRECTORIES,
  SEEDED_STATE_FILES,
} from '../dataDirBootstrap';

/**
 * Production Deployment Pack v1 — تهيئة مجلد البيانات عند أول تشغيل.
 *
 * ── الخطر الذي تحرسه هذه الاختبارات ───────────────────────────────────────────
 *
 * البذر عملية تجري **مرة واحدة** على جهاز جديد، ثم يعمل النظام سنوات فوق ما
 * أنتجته. أخطر عطل ممكن ليس فشل البذر — بل بذرٌ يتكرر: تشغيل ثانٍ (أو ترقية فوق
 * تثبيت قائم) يستبدل ملف حالة يخصّ المستخدم بنسخة المصنع، فيُمحى سجلّ المزامنة
 * ويُعاد ربط قاعدة البيانات بملف Drive خاطئ. لذلك أكثر الحالات أدناه تُثبت
 * **ما لا يُكتب** لا ما يُكتب.
 */

let tmpRoot: string;
let dataDir: string;
let seedDir: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-bootstrap-'));
  dataDir = path.join(tmpRoot, 'data');
  seedDir = path.join(tmpRoot, 'seed-data');
  fs.mkdirSync(seedDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('ensureDataLayout', () => {
  it('ينشئ كل مجلدات البيانات التي يحتاجها النظام وقت التشغيل', () => {
    ensureDataLayout(dataDir);

    for (const sub of DATA_SUBDIRECTORIES) {
      const full = path.join(dataDir, sub);
      expect(fs.existsSync(full), `مجلد ناقص: ${sub}`).toBe(true);
      expect(fs.statSync(full).isDirectory()).toBe(true);
    }
  });

  it('ينشئ مجلد المرفقات تحديدًا — المسار الذي يشترك فيه الطرفان (الخدمة الخلفية وElectron)', () => {
    ensureDataLayout(dataDir);
    expect(fs.existsSync(path.join(dataDir, 'attachments'))).toBe(true);
  });

  it('لا يمسّ محتوى موجودًا عند إعادة التشغيل', () => {
    ensureDataLayout(dataDir);
    const marker = path.join(dataDir, 'backups', 'نسخة-المستخدم.db');
    fs.writeFileSync(marker, 'بيانات المستخدم', 'utf8');

    ensureDataLayout(dataDir); // تشغيل ثانٍ

    expect(fs.readFileSync(marker, 'utf8')).toBe('بيانات المستخدم');
  });

  it('ينجح حين يكون المجلد الأب غير موجود أصلًا (أول تشغيل على جهاز جديد)', () => {
    const deep = path.join(tmpRoot, 'لا', 'يوجد', 'بعد', 'data');
    expect(() => ensureDataLayout(deep)).not.toThrow();
    expect(fs.existsSync(path.join(deep, 'logs'))).toBe(true);
  });
});

describe('seedCompanionFiles', () => {
  const writeSeed = (name: string, content: string) =>
    fs.writeFileSync(path.join(seedDir, name), content, 'utf8');

  it('ينسخ ملفات الحالة المبدئية عند أول تشغيل', () => {
    ensureDataLayout(dataDir);
    writeSeed('sync-metadata.json', '{"lastSyncedFileId":"drive-file-1"}');
    writeSeed('gdrive-account.json', '{"email":"a@example.com"}');

    const result = seedCompanionFiles(dataDir, seedDir);

    expect(result.copied.sort()).toEqual(['gdrive-account.json', 'sync-metadata.json']);
    expect(result.failed).toEqual([]);
    expect(fs.readFileSync(path.join(dataDir, 'sync-metadata.json'), 'utf8')).toContain('drive-file-1');
  });

  it('لا يستبدل ملف حالة موجودًا — بيانات المستخدم تسبق نسخة المصنع دائمًا', () => {
    ensureDataLayout(dataDir);
    writeSeed('sync-metadata.json', '{"lastSyncedFileId":"نسخة-المصنع"}');
    const userFile = path.join(dataDir, 'sync-metadata.json');
    fs.writeFileSync(userFile, '{"lastSyncedFileId":"ملف-المستخدم-الحقيقي"}', 'utf8');

    const result = seedCompanionFiles(dataDir, seedDir);

    expect(result.copied).toEqual([]);
    expect(result.skipped).toContain('sync-metadata.json');
    expect(fs.readFileSync(userFile, 'utf8')).toContain('ملف-المستخدم-الحقيقي');
  });

  it('التشغيل الثاني لا يكتب شيئًا (idempotent)', () => {
    ensureDataLayout(dataDir);
    writeSeed('sync-metadata.json', '{"v":1}');

    const first = seedCompanionFiles(dataDir, seedDir);
    const second = seedCompanionFiles(dataDir, seedDir);

    expect(first.copied).toEqual(['sync-metadata.json']);
    expect(second.copied).toEqual([]);
    expect(second.skipped).toEqual(['sync-metadata.json']);
  });

  it('لا يعمل ولا يفشل حين لا يوجد مجلد بيانات مبدئية (بيئة التطوير)', () => {
    ensureDataLayout(dataDir);

    expect(seedCompanionFiles(dataDir, null)).toEqual({ copied: [], skipped: [], failed: [] });
    expect(seedCompanionFiles(dataDir, path.join(tmpRoot, 'غير-موجود'))).toEqual({
      copied: [],
      skipped: [],
      failed: [],
    });
  });

  it('يتخطّى بصمت ملفًا مبدئيًا غير موجود بدل أن يفشل', () => {
    ensureDataLayout(dataDir);
    writeSeed('sync-metadata.json', '{"v":1}'); // gdrive-account.json غائب عمدًا

    const result = seedCompanionFiles(dataDir, seedDir);

    expect(result.copied).toEqual(['sync-metadata.json']);
    expect(result.failed).toEqual([]);
  });

  it('لا ينقل أبدًا رمز Drive ولا هوية الجهاز ولا سرّ JWT — حتى لو وُجدت في مجلد البذر', () => {
    // هذه الثلاثة مربوطة بالجهاز/التثبيت: نقلها يُنتج ملفًا لا يُفكّ تعميته
    // (gdrive-token.dat)، أو جهازين بالهوية نفسها (device-identity.json)،
    // أو سرًّا مُعادًا استخدامه بلا فائدة (security.json).
    ensureDataLayout(dataDir);
    for (const forbidden of ['gdrive-token.dat', 'device-identity.json', 'security.json']) {
      writeSeed(forbidden, 'يجب ألّا يُنسخ');
    }

    const result = seedCompanionFiles(dataDir, seedDir);

    expect(result.copied).toEqual([]);
    for (const forbidden of ['gdrive-token.dat', 'device-identity.json', 'security.json']) {
      expect(fs.existsSync(path.join(dataDir, forbidden)), `نُسخ ملف ممنوع: ${forbidden}`).toBe(false);
    }
  });

  it('قائمة الملفات المبذورة لا تحتوي أي ملف سرّي — عقد صريح لا نية ضمنية', () => {
    expect([...SEEDED_STATE_FILES]).not.toContain('gdrive-token.dat');
    expect([...SEEDED_STATE_FILES]).not.toContain('device-identity.json');
    expect([...SEEDED_STATE_FILES]).not.toContain('security.json');
  });
});
