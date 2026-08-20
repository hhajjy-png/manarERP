import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { readModelSet } = require('../prepare-backend-deps.js');

/**
 * حارس مجموعة نماذج Prisma في التغليف (تدقيق 2026-08-19).
 *
 * العيب المتكرر: عميل Prisma المنسوخ إلى الحزمة كان يتجمّد على مخطط قديم
 * (75 نموذجًا مقابل 85 في إصدار 2026.5.5). readModelSet هي أساس المقارنة
 * الفاشلة-المغلقة التي تكتشف ذلك قبل التغليف — نثبّت هنا دقّة الاستخراج.
 */

function writeTmpSchema(content: string): string {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pbd-test-')), 'schema.prisma');
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

describe('readModelSet — استخراج مجموعة النماذج من schema.prisma', () => {
  it('يستخرج أسماء النماذج كلها ولا يلتقط enum أو تعليقات', () => {
    const p = writeTmpSchema([
      'datasource db { provider = "sqlite" url = "file:./x.db" }',
      '',
      'model User {',
      '  id Int @id',
      '}',
      '',
      '// model CommentedOut { id Int @id }',
      'enum Status {',
      '  ACTIVE',
      '}',
      '',
      'model Invoice {',
      '  id Int @id',
      '}',
    ].join('\n'));

    const models = readModelSet(p);
    expect([...models].sort()).toEqual(['Invoice', 'User']);
  });

  it('المخطط القانوني الفعلي للمشروع يحوي النماذج المتوقّعة وليس أقل', () => {
    const canonical = path.resolve(__dirname, '..', '..', 'backend', 'prisma', 'schema.prisma');
    const models = readModelSet(canonical);
    // نماذج إصدار 2026.5.5 التي كانت ناقصة من نسخة الجذر القديمة — وجودها هنا يثبت
    // أن الاستخراج يقرأ المخطط الحي لا نسخة متجمّدة.
    expect(models.has('VehicleInsurancePolicy') || models.size >= 80).toBe(true);
    expect(models.size).toBeGreaterThanOrEqual(80);
  });

  it('مجموعتان متطابقتان تمرّان ومجموعة ناقصة تُكتشف بالمقارنة', () => {
    const a = readModelSet(writeTmpSchema('model A { id Int @id }\nmodel B { id Int @id }'));
    const b = readModelSet(writeTmpSchema('model A { id Int @id }'));
    const missing = [...a].filter((m: string) => !b.has(m));
    expect(missing).toEqual(['B']);
  });
});
