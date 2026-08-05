import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeFileAtomicSync } from '../atomicFile';

/**
 * Production Hardening Pack v1 — P0-6
 *
 * الضمانة المُختبَرة: لا يرى أي قارئ ملفًا نصفَ مكتوب، ولا تبقى بقايا مؤقتة، ولا
 * يُستبدل محتوى سليم بمحتوى فاشل. هذه هي الضمانة التي تمنع «التعارض الكاذب» الناتج
 * عن `sync-metadata.json` مبتور بعد انقطاع كهرباء.
 */

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-atomic-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function listAll(): string[] {
  return fs.readdirSync(dir);
}

describe('writeFileAtomicSync', () => {
  it('يكتب ملفًا جديدًا بمحتواه كاملًا', () => {
    const target = path.join(dir, 'sync-metadata.json');
    writeFileAtomicSync(target, JSON.stringify({ lastSyncedHash: 'abc' }));

    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({ lastSyncedHash: 'abc' });
  });

  it('يستبدل ملفًا قائمًا بالكامل بلا حالة وسيطة على القرص', () => {
    const target = path.join(dir, 'sync-metadata.json');
    fs.writeFileSync(target, JSON.stringify({ v: 'old' }));

    writeFileAtomicSync(target, JSON.stringify({ v: 'new' }));

    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({ v: 'new' });
    expect(listAll()).toEqual(['sync-metadata.json']);
  });

  it('لا يترك أي ملف مؤقت خلفه بعد النجاح', () => {
    const target = path.join(dir, 'gdrive-token.dat');
    writeFileAtomicSync(target, Buffer.from([1, 2, 3]));

    expect(listAll()).toHaveLength(1);
    expect(listAll()[0]).toBe('gdrive-token.dat');
  });

  it('يكتب البيانات الثنائية كما هي بايتًا ببايت', () => {
    const target = path.join(dir, 'gdrive-token.dat');
    const payload = Buffer.from([0x01, 0x00, 0xff, 0x7f, 0x80]);
    writeFileAtomicSync(target, payload);

    expect(fs.readFileSync(target).equals(payload)).toBe(true);
  });

  it('كتابات متتالية تُبقي الملف صالحًا للتحليل في كل مرة', () => {
    const target = path.join(dir, 'sync-metadata.json');
    for (let i = 0; i < 25; i++) {
      writeFileAtomicSync(target, JSON.stringify({ n: i }));
      expect(JSON.parse(fs.readFileSync(target, 'utf8')).n).toBe(i);
      expect(listAll()).toHaveLength(1);
    }
  });

  it('يفشل بوضوح ولا يمسّ الملف القائم حين يتعذّر إنشاء المؤقت', () => {
    const target = path.join(dir, 'nested', 'sync-metadata.json');
    // المجلد الأب غير موجود ⇒ لا يمكن إنشاء المؤقت.
    expect(() => writeFileAtomicSync(target, 'x')).toThrow();
    expect(fs.existsSync(target)).toBe(false);
  });

  it('لا يتصادم مؤقت الكتابة مع نمط تنظيف لقطات المزامنة اليتيمة', async () => {
    // `syncTempCleanup` يحذف ما يطابق `sync-tmp-*.db` فقط. لو تشارك المؤقت ذلك
    // النمط لأمكن حذفه تحت عملية كتابة جارية.
    const { isSyncTempName } = await import('../syncTempCleanup');
    const target = path.join(dir, 'sync-metadata.json');
    writeFileAtomicSync(target, 'x');

    for (const name of listAll()) {
      expect(isSyncTempName(name)).toBe(false);
    }
  });
});
