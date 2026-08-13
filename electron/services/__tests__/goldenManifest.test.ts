import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  parseGoldenManifest,
  readGoldenManifest,
  isGoldenNewerThanRemote,
  GOLDEN_MANIFEST_FILENAME,
  type GoldenManifest,
} from '../goldenManifest';

/**
 * Data Safety Pack v2 — F-03 · بيان القالب الذهبي.
 *
 * كل حالة هنا مكتوبة من زاوية **الضرر الذي تمنعه**. والضرران المتقابلان:
 *   • ادّعاء أحدثية كاذب  ⇒ يمنع تنزيلًا مشروعًا ويترك الجهاز على قالب قديم.
 *   • غياب الأحدثية الحقيقية ⇒ يستبدل قالبًا أحدث بنسخة سحابية أقدم.
 * ولأن الثاني هو العطل الأصلي، فالسقوط الآمن دائمًا نحو **السلوك السابق** (تنزيل).
 */

const SHA_GOLDEN = 'a'.repeat(64);
const SHA_OTHER = 'b'.repeat(64);

function manifest(overrides: Partial<GoldenManifest> = {}): GoldenManifest {
  return {
    sha256: SHA_GOLDEN,
    sizeBytes: 3_284_992,
    dataModifiedAt: '2026-08-12T19:59:00.000Z',
    packagedAt: '2026-08-13T00:52:11.000Z',
    ...overrides,
  };
}

describe('parseGoldenManifest', () => {
  it('يقبل بيانًا كامل الحقول', () => {
    const parsed = parseGoldenManifest(JSON.stringify(manifest()));
    expect(parsed?.sha256).toBe(SHA_GOLDEN);
    expect(parsed?.dataModifiedAt).toBe('2026-08-12T19:59:00.000Z');
  });

  it('يقبل بيانًا بلا packagedAt — حقل تشخيصي لا يشارك في أي قرار', () => {
    const { packagedAt: _ignored, ...withoutPackagedAt } = manifest();
    expect(parseGoldenManifest(JSON.stringify(withoutPackagedAt))).not.toBeNull();
  });

  it('يرفض JSON تالفًا بدل أن يرمي', () => {
    expect(parseGoldenManifest('{ليس JSON')).toBeNull();
  });

  it('يرفض بيانًا بلا بصمة — بلا بصمة لا يمكن ربطه بأي قاعدة', () => {
    const { sha256: _ignored, ...withoutHash } = manifest();
    expect(parseGoldenManifest(JSON.stringify(withoutHash))).toBeNull();
  });

  it('يرفض بيانًا بتاريخ غير صالح — تاريخ لا يُفهم لا يجوز أن يُقارَن', () => {
    expect(parseGoldenManifest(JSON.stringify(manifest({ dataModifiedAt: 'أمس' })))).toBeNull();
  });

  it('يرفض بيانًا بحجم غير رقمي', () => {
    expect(parseGoldenManifest(JSON.stringify({ ...manifest(), sizeBytes: 'كبير' }))).toBeNull();
  });

  it('يرفض null و`[]` و القيم غير الكائنية', () => {
    expect(parseGoldenManifest('null')).toBeNull();
    expect(parseGoldenManifest('[]')).toBeNull();
    expect(parseGoldenManifest('"نص"')).toBeNull();
  });
});

describe('readGoldenManifest', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-golden-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('يقرأ بيانًا موجودًا', () => {
    const file = path.join(tmpRoot, GOLDEN_MANIFEST_FILENAME);
    fs.writeFileSync(file, JSON.stringify(manifest()), 'utf8');
    expect(readGoldenManifest(file)?.sha256).toBe(SHA_GOLDEN);
  });

  it('يُعيد null حين يكون المسار null (بيئة التطوير)', () => {
    expect(readGoldenManifest(null)).toBeNull();
  });

  it('يُعيد null حين لا يوجد الملف (مثبّت أقدم من هذه الحزمة) بلا رمي', () => {
    expect(readGoldenManifest(path.join(tmpRoot, 'غير-موجود.json'))).toBeNull();
  });
});

describe('isGoldenNewerThanRemote — القاعدة الحاسمة', () => {
  const REMOTE_TIME = '2026-08-12T18:00:00.000Z';

  it('يُثبت الأحدثية حين يكون تاريخ بيانات القالب بعد وقت تعديل ملف Drive', () => {
    expect(isGoldenNewerThanRemote(manifest(), SHA_GOLDEN, REMOTE_TIME)).toBe(true);
  });

  it('ينفيها حين تكون النسخة السحابية أحدث — الحالة الطبيعية لجهاز جديد', () => {
    expect(isGoldenNewerThanRemote(manifest(), SHA_GOLDEN, '2026-08-13T06:00:00.000Z')).toBe(false);
  });

  it('ينفيها عند التساوي التامّ — لا أحدثية بلا فارق موجب', () => {
    expect(isGoldenNewerThanRemote(manifest(), SHA_GOLDEN, '2026-08-12T19:59:00.000Z')).toBe(false);
  });

  it('ينفيها حين لا تطابق بصمة البيان القاعدة المحلية — بيان لا يشهد لقاعدة لا يصفها', () => {
    // أخطر حالة: بيان قديم بقي في `resources` بعد تحديث ناقص. لولا شرط البصمة
    // لمنح قاعدة مختلفة تمامًا ادّعاء أحدثية لا تملكه.
    expect(isGoldenNewerThanRemote(manifest(), SHA_OTHER, REMOTE_TIME)).toBe(false);
  });

  it('ينفيها حين يغيب البيان — السقوط الآمن إلى السلوك السابق', () => {
    expect(isGoldenNewerThanRemote(null, SHA_GOLDEN, REMOTE_TIME)).toBe(false);
  });

  it('ينفيها حين تغيب البصمة المحلية (لا قاعدة محلية أصلًا)', () => {
    expect(isGoldenNewerThanRemote(manifest(), null, REMOTE_TIME)).toBe(false);
  });

  it('ينفيها حين يغيب وقت تعديل النسخة السحابية', () => {
    expect(isGoldenNewerThanRemote(manifest(), SHA_GOLDEN, null)).toBe(false);
  });

  it('ينفيها حين يكون وقت Drive غير قابل للتحليل بدل أن تُقارَن قيمة NaN', () => {
    expect(isGoldenNewerThanRemote(manifest(), SHA_GOLDEN, 'ليس تاريخًا')).toBe(false);
  });
});
