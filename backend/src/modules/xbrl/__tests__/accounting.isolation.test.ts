import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * عزل الحزمة عن المحاسبة — فحص ثابت على شفرة الوحدة نفسها.
 *
 * ═══ لماذا فحص نصّي وليس اختبار سلوكي ═══
 * الادّعاء المطلوب إثباته سالب: «لا تكتب هذه الحزمة في أي جدول محاسبي **أبدًا**».
 * اختبار سلوكي يُثبت أن مسارًا بعينه لم يكتب؛ لا يُثبت أن **لا مسار** يكتب. الفحص
 * النصّي على كل ملفات الوحدة يغطّي المسارات التي لم تُكتب بعد أيضًا: أي استدعاء
 * كتابة جديد على جدول محاسبي يُسقط هذا الاختبار في اللحظة التي يُضاف فيها.
 */

const MODULE_ROOT = join(__dirname, '..');

/** نماذج Prisma المحاسبية والتشغيلية التي يجب ألّا تُكتب من هنا. */
const FORBIDDEN_WRITE_MODELS = [
  'account',
  'journalEntry',
  'journalEntryLine',
  'transaction',
  'invoice',
  'invoiceItem',
  'payment',
  'expense',
  'payroll',
  'payrollLine',
  'salaryPayment',
  'cheque',
  'employeeCompensationCalculation',
  'setting',
];

const WRITE_OPERATIONS = [
  'create', 'createMany', 'update', 'updateMany', 'upsert',
  'delete', 'deleteMany', 'executeRaw', 'executeRawUnsafe',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : sourceFiles(full);
    }
    return entry.endsWith('.ts') ? [full] : [];
  });
}

/**
 * يزيل التعليقات قبل الفحص.
 *
 * ضروري لأن ملفات هذه الوحدة **تشرح** ما لا تفعله: «لا تمسّ قفل الفترة»، «لا تدّعي
 * QAYD Ready». بلا هذا التجريد يُسقط الفحص الشفرة بسبب التوثيق الذي يصف التزامها —
 * وهو ما يدفع لاحقًا إلى حذف التوثيق لإرضاء الاختبار.
 *
 * `//` المسبوقة بنقطتين رأسيتين تُترك كما هي حتى لا تُبتر روابط `https://` داخل النصوص.
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const FILES = sourceFiles(MODULE_ROOT).map((path) => {
  const raw = readFileSync(path, 'utf8');
  return { path, raw, code: stripComments(raw) };
});

describe('عزل حزمة XBRL عن النظام المحاسبي', () => {
  it('تحتوي الوحدة على ملفات مصدر فعلية (حارس ضد فحص فارغ يمرّ دائمًا)', () => {
    expect(FILES.length).toBeGreaterThan(5);
  });

  it.each(FORBIDDEN_WRITE_MODELS)('لا تكتب الوحدة في نموذج «%s»', (model) => {
    const offenders: string[] = [];
    for (const { path, code } of FILES) {
      for (const op of WRITE_OPERATIONS) {
        const pattern = new RegExp(`\\b(prisma|tx)\\s*\\.\\s*${model}\\s*\\.\\s*${op}\\b`);
        if (pattern.test(code)) offenders.push(`${path} → ${model}.${op}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('لا تستدعي الوحدة أي خدمة ترحيل محاسبي (GL)', () => {
    const offenders = FILES.filter(({ code }) =>
      /from\s+['"].*gl\.service['"]/.test(code) ||
      /createJournalEntry|postJournalEntry|generateEntryNumber/.test(code),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('لا تمسّ الوحدة قفل الفترة المحاسبية', () => {
    const offenders = FILES.filter(({ code }) =>
      /periodLock|assertPeriodOpen|overrideLock/.test(code),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('تكتب الوحدة حصريًا في جداول xbrl_*', () => {
    const writtenModels = new Set<string>();
    for (const { code } of FILES) {
      for (const match of code.matchAll(/\b(?:prisma|tx)\s*\.\s*(\w+)\s*\.\s*(\w+)\s*\(/g)) {
        const [, model, operation] = match;
        if (WRITE_OPERATIONS.includes(operation)) writtenModels.add(model);
      }
    }
    const nonXbrl = [...writtenModels].filter((m) => !m.toLowerCase().startsWith('xbrl'));
    expect(nonXbrl).toEqual([]);
  });

  it('تقرأ الأرصدة من خدمة التقارير المالية القائمة بدل استعلام محاسبي جديد', () => {
    const readiness = FILES.find((f) => f.path.endsWith('readiness.service.ts'));
    expect(readiness).toBeDefined();
    expect(readiness!.code).toMatch(/financialService\.getTrialBalance/);
    // لا استعلام تجميع مباشر على أسطر القيود — هذا هو الباب الذي يتسرّب منه منطق محاسبي موازٍ.
    expect(readiness!.code).not.toMatch(/journalEntryLine\.(groupBy|aggregate|findMany)/);
  });
});

describe('عدم ادّعاء التوافق الرسمي', () => {
  it('لا تحتوي شفرة الوحدة على عبارة «QAYD Ready» ولا ما يعادلها', () => {
    const offenders = FILES.filter(({ code }) =>
      /QAYD[\s_-]*Ready|QAYD[\s_-]*Compliant|متوافق\s+مع\s+قيد/i.test(code),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('لا يوجد namespace رسمي مفترض مكتوبًا في الشفرة', () => {
    // يُفحص النص الخام هنا: رابط حكومي في تعليق مخالفة أيضًا، لأنه يوحي بمواصفة مؤكَّدة.
    const offenders = FILES.filter(({ raw }) =>
      /https?:\/\/[^\s'"]*(moci|qayd|gov\.kw)/i.test(raw),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it('لا يوجد مسار API يشير إلى خدمة حكومية خارجية', () => {
    const offenders = FILES.filter(({ code }) =>
      /axios|node-fetch|\bfetch\s*\(|https\.request/.test(code),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });
});
