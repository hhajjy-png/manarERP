import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';

/**
 * تصدير PDF — من المستند، لا من النافذة الحيّة.
 *
 * `window.manar.exportPdf` يلتقط **نافذة التطبيق كما هي**، وElectron **يتجاهل
 * `@media print`** في ذلك الالتقاط: فتُرسم قشرة التطبيق الداكنة داخل الـ PDF — وهو
 * «الإطار الأسود» الذي طارَدَنا. `exportPdfFromHtml` يرسم مستندًا قائمًا بذاته في نافذة
 * خفية تحترم قواعد الطباعة.
 *
 * ثلاث شاشات بقيت على المسار القديم بعد ترحيل البقية؛ هذه الحزمة أنهتها. الحارس هنا يمنع
 * عودتها: أي شاشة **تبدأ** تصديرها بالتقاط النافذة الحيّة تُسقِط الاختبار.
 */

const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');

/** كل ملفات .tsx/.ts تحت src (عدا الاختبارات). */
function sourceFiles(dir = 'src'): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__') out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const MIGRATED = [
  'src/pages/Quotation.tsx',
  'src/pages/ReportPrint.tsx',
  'src/pages/ExecutiveDecisionCenter.tsx',
  'src/pages/InvoicePreview.tsx',
] as const;

describe('الشاشات المُرحَّلة', () => {
  it.each(MIGRATED)('%s يصدّر من المستند عبر exportPdfFromHtml', (file) => {
    const src = code(readFileSync(file, 'utf8'));
    expect(src).toContain('exportPdfFromHtml');
  });

  it.each(MIGRATED)('%s يبني المستند من عقدة الطباعة نفسها — لا إعادة رسم', (file) => {
    const src = code(readFileSync(file, 'utf8'));
    expect(src).toMatch(/composeStyledFromNode|composeFromNode|composeQuotationPreview|composeInvoicePreview/);
    expect(src).toContain('printRootRef');
  });

  it('الالتقاط القديم لم يُحذف — يبقى خطة بديلة لبيئة بلا الجسر، لا مسارًا افتراضيًا', () => {
    for (const file of MIGRATED) {
      const src = code(readFileSync(file, 'utf8'));
      if (!src.includes('exportPdf(')) continue;
      // حيثما بقي، يجب أن يكون **بعد** فحص الجسر — لا نداءً مباشرًا أول السطر.
      expect(src).toMatch(/exportPdfFromHtml[\s\S]{0,600}?exportPdf\(/);
    }
  });
});

describe('حارس الانحدار — لا عودة إلى النافذة الحيّة', () => {
  it('لا شاشة إنتاج تستدعي exportPdf بلا مسار المستند بجانبه', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const src = code(readFileSync(file, 'utf8'));
      if (!/manar\??\.?exportPdf\(|manar\?\.exportPdf\(/.test(src)) continue;
      if (!src.includes('exportPdfFromHtml')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('مركز القرار يحوّل رموزه الداكنة إلى ورق أبيض داخل @media print وحدها', () => {
    const src = readFileSync('src/pages/ExecutiveDecisionCenter.tsx', 'utf8');
    // اللوحة شجرة داكنة (--db-card: #1f2937) — بلا هذا التحويل تخرج البطاقات سوداء.
    expect(src).toMatch(/@media print[\s\S]*--db-card:\s*#ffffff/);
    expect(src).toMatch(/@media print[\s\S]*--db-text:\s*#111827/);
    // والتحويل داخل الطباعة فقط ⇒ الشاشة لم تتغيّر، وdashboard.css لم تُمسّ.
    const css = readFileSync('src/components/dashboard/dashboard.css', 'utf8');
    expect(css).toContain('--db-card: #1f2937'); // الرموز الداكنة كما هي للشاشة
  });
});
