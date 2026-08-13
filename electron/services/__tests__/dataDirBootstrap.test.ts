import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureDataLayout, DATA_SUBDIRECTORIES } from '../dataDirBootstrap';
import * as dataDirBootstrap from '../dataDirBootstrap';

/**
 * Production Deployment Pack v1 — تهيئة مجلد البيانات عند أول تشغيل.
 * Data Safety Pack v2 (F-04) — ولا شيء غير المجلدات.
 *
 * ── الخطر الذي تحرسه هذه الاختبارات ───────────────────────────────────────────
 *
 * التهيئة تجري **مرة واحدة** على جهاز جديد، ثم يعمل النظام سنوات فوق ما أنتجته.
 * وأخطر ما كان يفعله هذا الملف ليس إنشاء المجلدات — بل **بذر ملفات حالة من جهاز
 * البناء**: `sync-metadata.json` كان يمنح الجهاز الجديد تاريخ مزامنة لم يكسبه،
 * فيتحوّل أول قرار مزامنة من `CONFLICT` آمن إلى `UPLOAD` صامت فوق بيانات Drive.
 * حُذف ذلك المسار بالكامل، والاختبارات أدناه تُثبت **أنه لم يعد موجودًا** لا أنه
 * يعمل بشكل صحيح.
 */

let tmpRoot: string;
let dataDir: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-bootstrap-'));
  dataDir = path.join(tmpRoot, 'data');
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

describe('Data Safety Pack v2 — F-04: لا حالة من جهاز البناء', () => {
  it('لم تعد الوحدة تُصدّر أي واجهة لبذر ملفات الحالة', () => {
    // اختبار عقد لا اختبار تنفيذ: عودة أي دالة بذر — بأي اسم — تعني عودة المسار
    // الذي كان ينقل `sync-metadata.json` و`gdrive-account.json` من جهاز البناء.
    const exported = Object.keys(dataDirBootstrap);
    expect(exported).not.toContain('seedCompanionFiles');
    expect(exported).not.toContain('SEEDED_STATE_FILES');
    expect(exported.filter((name) => /seed/i.test(name))).toEqual([]);
  });

  it('التهيئة تُنشئ مجلدات فقط — ولا تكتب ملفًا واحدًا', () => {
    // الضمانة الجوهرية: مجلد بيانات جهاز جديد يبدأ **فارغًا من أي حالة**. أي ملف
    // يظهر هنا يعني أن شيئًا ما يُبذَر من جديد.
    ensureDataLayout(dataDir);

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else files.push(path.relative(dataDir, full));
      }
    };
    walk(dataDir);

    expect(files).toEqual([]);
  });
});
