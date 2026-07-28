// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Forms i18n Completeness & Regression Protection Pack v1
 *
 * جذر العلّة (راجع تقرير Regression & Release Integrity Audit السابق):
 * formsRegistryTranslationAudit.test.ts يتحقق من titleKey فقط — أي t() آخر
 * يستدعيه أي نموذج (عناوين الحقول، الأزرار، الـplaceholders، الخيارات...)
 * كان بلا أي حارس آلي. هذا بالضبط ما سمح لـcommit d226365 (٢٠٢٦-٠٧-٢١) بتحويل
 * عشرات النصوص الثابتة في ستة نماذج إلى t('...') دون إضافة المفاتيح المقابلة
 * في القاموس، فبقيت المفاتيح الحرفية تظهر للمستخدم لأشهر رغم إصلاحين سابقين
 * (كلاهما عالج titleKey فقط، لا بقية مفاتيح النموذج).
 *
 * هذا الاختبار عام ولا يقتصر على titleKey: يفحص كل استدعاء t('...') حرفي
 * (نص ثابت لا متغيّر) في كل ملفات النماذج — صفحات frontend/src/pages المسجَّلة
 * في formsRegistry بالإضافة إلى كل ملفات frontend/src/forms — ويتأكد أن كل
 * مفتاح مسجَّل فعليًا في DICT.ar وDICT.en كليهما. أي نموذج جديد أو مفتاح جديد
 * يُفحَص تلقائيًا بلا أي تعديل على هذا الملف.
 */

const I18N_PATH = 'src/lib/i18n.ts';

function extractDictKeys(): { ar: Set<string>; en: Set<string> } {
  const src = readFileSync(I18N_PATH, 'utf8');
  const arStart = src.indexOf('\n  ar: {');
  const enStart = src.indexOf('\n  en: {');
  const dictEnd = src.lastIndexOf('\n};');
  if (arStart === -1 || enStart === -1 || dictEnd === -1 || !(arStart < enStart && enStart < dictEnd)) {
    throw new Error('extractDictKeys: could not locate DICT.ar/DICT.en boundaries in i18n.ts — structure changed, update this test.');
  }
  const arBlock = src.slice(arStart, enStart);
  const enBlock = src.slice(enStart, dictEnd);
  const keyPattern = /^\s*'([^']+)'\s*:/gm;
  const ar = new Set<string>();
  const en = new Set<string>();
  for (const m of arBlock.matchAll(keyPattern)) ar.add(m[1]);
  for (const m of enBlock.matchAll(keyPattern)) en.add(m[1]);
  return { ar, en };
}

/** كل ملف .ts/.tsx تحت مجلد، تكراريًا (لا اختبارات — لا حاجة لفحص ملفات __tests__). */
function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full.split('\\').join('/'));
  }
  return out;
}

/** استدعاءات t('...') الحرفية فقط — نص ثابت، لا متغيّر ولا تركيب ديناميكي
 *  (t('prefix.' + x) أو t(`prefix.${x}`) لا يمكن فحصها آليًا بلا معرفة القيم
 *  الممكنة لـx، فهي مستثناة عمدًا — لا توجد حاليًا داخل نطاق النماذج المفحوص هنا). */
function extractLiteralTKeys(src: string): string[] {
  const keys: string[] = [];
  for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) keys.push(m[1]);
  return keys;
}

/**
 * مصفوفات مفاتيح ثابتة مُستخدَمة عبر تركيب غير حرفي — مثال حقيقي موجود في
 * PerformanceEvaluation.tsx: `CRITERIA_KEYS.map((key, i) => ... t(key) ...)`.
 * الفحص الحرفي أعلاه لا يرى هذا الاستخدام (المفتاح متغيّر لا نص)، فنلتقط أي
 * مصفوفة ثابتة باسم منتهٍ بـ_KEYS ونتحقق من كل عنصر فيها كأنه مفتاح ترجمة.
 */
function extractKeysArrayLiterals(src: string): string[] {
  const keys: string[] = [];
  for (const arr of src.matchAll(/const\s+[A-Z][A-Z0-9_]*_KEYS\s*(?::[^=]+)?=\s*\[([\s\S]*?)\]/g)) {
    for (const m of arr[1].matchAll(/'([^']+)'/g)) keys.push(m[1]);
  }
  return keys;
}

/** صفحات النماذج المسجَّلة في formsRegistry.FORM_CARDS — نفس القائمة التي
 *  يستخدمها formsRegistryTranslationAudit.test.ts لربط route بملف الشاشة. */
const FORM_PAGE_FILES = [
  'src/pages/SalaryCertificate.tsx',
  'src/pages/ToWhomItMayConcern.tsx',
  'src/pages/LeaveRequest.tsx',
  'src/pages/ReturnToWork.tsx',
  'src/pages/SalaryAdvance.tsx',
  'src/pages/Resignation.tsx',
  'src/pages/EmployeeWarning.tsx',
  'src/pages/PerformanceEvaluation.tsx',
  'src/pages/EmploymentContract.tsx',
  'src/pages/Quotation.tsx',
  'src/pages/PurchaseRequest.tsx',
  'src/pages/ReceiptVoucher.tsx',
  'src/pages/AdminPaymentVoucher.tsx',
];

const { ar: DICT_AR_KEYS, en: DICT_EN_KEYS } = extractDictKeys();

const SCANNED_FILES = Array.from(new Set([...FORM_PAGE_FILES, ...listSourceFiles('src/forms')]));

describe('Forms i18n Completeness — كل مفتاح t() مستخدم في أي نموذج يجب أن يكون مسجَّلًا في DICT.ar وDICT.en', () => {
  it('القائمة المفحوصة غير فارغة (حارس ضد فشل صامت في اكتشاف الملفات)', () => {
    expect(SCANNED_FILES.length).toBeGreaterThanOrEqual(FORM_PAGE_FILES.length);
  });

  for (const file of SCANNED_FILES) {
    const src = readFileSync(file, 'utf8');
    const usedKeys = Array.from(new Set([...extractLiteralTKeys(src), ...extractKeysArrayLiterals(src)]));

    if (usedKeys.length === 0) continue; // لا استدعاءات t() حرفية في هذا الملف — لا شيء لفحصه.

    describe(file, () => {
      it('كل مفتاح مستخدَم موجود في DICT.ar', () => {
        const missing = usedKeys.filter((k) => !DICT_AR_KEYS.has(k));
        expect(missing, `مفاتيح ناقصة من العربية في ${file}: ${missing.join(', ')}`).toEqual([]);
      });

      it('كل مفتاح مستخدَم موجود في DICT.en', () => {
        const missing = usedKeys.filter((k) => !DICT_EN_KEYS.has(k));
        expect(missing, `مفاتيح ناقصة من الإنجليزية في ${file}: ${missing.join(', ')}`).toEqual([]);
      });
    });
  }
});
