import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/* ════════════════════════════════════════════════════════════════════════════
   عقد الواجهة: شاشة «جاهزية XBRL» لا تدّعي توافقًا رسميًا.

   ═══ لماذا فحص نصّي على الملفات ═══
   الادّعاء المطلوب إثباته سالب: «لا نصّ في هذه الشاشة يقول إن النظام معتمد من
   وزارة التجارة». اختبار تصيير يُثبت أن حالةً بعينها لا تعرض العبارة؛ لا يُثبت أن
   **لا حالة** تعرضها. الفحص النصّي على مصادر الوحدة ومفاتيح الترجمة يغطّي الحالات
   التي لم تُكتب بعد أيضًا: أي نصّ جديد يخالف العقد يُسقط هذا الاختبار فور إضافته.

   هذا أرخص وأصدق من مراجعة بصرية تُعاد عند كل تعديل نصّي.
   ════════════════════════════════════════════════════════════════════════════ */

const ROOT = resolve(__dirname, '..', '..', '..');
const XBRL_DIRS = [join(ROOT, 'components', 'xbrl'), join(ROOT, 'pages')];

function filesUnder(dir: string, filter: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === '__tests__' ? [] : filesUnder(full, filter);
    return filter(entry) ? [full] : [];
  });
}

/**
 * يزيل التعليقات قبل الفحص.
 *
 * ضروري لأن ملفات الوحدة **تشرح** ما لا تفعله («لا حقل اسمه qaydReady»). بلا هذا
 * التجريد يُسقط الفحص الشفرة بسبب التوثيق الذي يصف التزامها — وهو ما يدفع لاحقًا إلى
 * حذف التوثيق لإرضاء الاختبار. `//` المسبوقة بنقطتين تُترك حتى لا تُبتر روابط https://.
 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const XBRL_SOURCES = XBRL_DIRS.flatMap((dir) =>
  filesUnder(dir, (name) => name.startsWith('Xbrl') || name.startsWith('xbrl')),
).map((path) => ({ path, code: stripComments(readFileSync(path, 'utf8')) }));

/** كتلة مفاتيح الترجمة الخاصة بالوحدة — عربيها وإنجليزيها معًا. */
const I18N_XBRL_LINES = readFileSync(join(ROOT, 'lib', 'i18n.ts'), 'utf8')
  .split('\n')
  .filter((line) => line.trimStart().startsWith("'xbrl."));

/** عبارات ممنوعة: كلها تعني «معتمد/متوافق رسميًا» بصيغة أو بأخرى. */
const FORBIDDEN = [
  /QAYD[\s_-]*Ready/i,
  /QAYD[\s_-]*Compliant/i,
  /XBRL[\s_-]*Compliant/i,
  /متوافق\s+(?:رسميًا|رسميا|مع\s+قيد)/,
  /معتمد\s+من\s+(?:وزارة|الوزارة)/,
  /Ministry[\s_-]*of[\s_-]*Commerce[\s_-]*(?:approved|certified)/i,
];

describe('شاشة جاهزية XBRL — لا ادّعاء توافق رسمي', () => {
  it('عُثر على مصادر الوحدة فعليًا (حارس ضد فحص فارغ يمرّ دائمًا)', () => {
    expect(XBRL_SOURCES.length).toBeGreaterThan(4);
    expect(I18N_XBRL_LINES.length).toBeGreaterThan(100);
  });

  it.each(FORBIDDEN)('لا يحتوي أي مصدر على العبارة %s', (pattern) => {
    const offenders = XBRL_SOURCES.filter(({ code }) => pattern.test(code)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it.each(FORBIDDEN)('لا يحتوي أي مفتاح ترجمة على العبارة %s', (pattern) => {
    expect(I18N_XBRL_LINES.filter((line) => pattern.test(line))).toEqual([]);
  });

  it('أقصى حالة جاهزية معروضة هي READY_PENDING_TAXONOMY — لا حالة QAYD', () => {
    const statuses = I18N_XBRL_LINES.filter((line) => line.includes("'xbrl.readiness."));
    // ثلاث حالات × لغتين.
    expect(statuses).toHaveLength(6);
    expect(statuses.some((line) => /QAYD/i.test(line))).toBe(false);
    expect(statuses.filter((line) => line.includes('READY_PENDING_TAXONOMY'))).toHaveLength(2);
  });

  it('التنويه الدائم بغياب التصنيف الرسمي موجود بلغتيه', () => {
    const notice = I18N_XBRL_LINES.filter((line) => line.includes("'xbrl.notice.no_official_body'"));
    expect(notice).toHaveLength(2);
    expect(notice.some((line) => line.includes('لم تُعتمد أي مواصفة رسمية بعد'))).toBe(true);
    expect(notice.some((line) => line.includes('No official specification has been adopted'))).toBe(true);
  });

  it('تنويه التحقق يقول صراحةً إن النجاح ليس قبولًا رسميًا', () => {
    const disclaimer = I18N_XBRL_LINES.filter((line) => line.includes("'xbrl.validation.disclaimer'"));
    expect(disclaimer).toHaveLength(2);
    expect(disclaimer.some((line) => line.includes('لا يعني قبولًا أو اعتمادًا من أي جهة رسمية'))).toBe(true);
  });

  it('لا رابط ولا استدعاء لأي خدمة حكومية في مصادر الوحدة', () => {
    const offenders = XBRL_SOURCES.filter(({ code }) =>
      /https?:\/\/[^\s'"]*(moci|qayd|gov\.kw)/i.test(code),
    ).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});

describe('شاشة جاهزية XBRL — لا كتابة محاسبية من الواجهة', () => {
  it('لا تستدعي الوحدة أي مسار كتابة محاسبي', () => {
    const offenders: string[] = [];
    for (const { path, code } of XBRL_SOURCES) {
      // مسارات الكتابة الوحيدة المسموح بها تبدأ بـ`/xbrl/`.
      for (const match of code.matchAll(/api\.(post|patch|put|delete)\(\s*[`'"]([^`'"$]*)/g)) {
        const [, method, url] = match;
        if (!url.startsWith('/xbrl/')) offenders.push(`${path} → ${method.toUpperCase()} ${url}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
