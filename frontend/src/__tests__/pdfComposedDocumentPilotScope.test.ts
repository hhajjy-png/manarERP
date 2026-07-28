// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * Saved PDF — سلامة النطاق بعد التوحيد النهائي (المرحلة 5D).
 *
 * الملف السابق بهذا الاسم كان يحرس العلم الانتقالي `pdfUseComposedDocument` وبقاء
 * `buildFormPdfDocument` — كلاهما تقاعد (انظر `pdfComposedDocumentPilotMigration.test.ts`
 * للتفاصيل والحارس الشامل ضد إعادة الإدخال). هذا الملف يحرس ما تبقّى صالحًا: مسار
 * الطباعة الفعلية معزول عن منطق تصدير PDF، ولا أثر نصّي متبقٍّ للآليتين المتقاعدتين
 * في أي مصدر إنتاجي.
 */

const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');

const formLayout = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');

describe('مسار الطباعة الفعلية معزول عن منطق تصدير PDF', () => {
  it('doPrint لا يشير إلى composeStyledFromNode أو exportPdfFromHtml — تصيير مختلف تمامًا', () => {
    const doPrintIdx = formLayout.indexOf('async function doPrint');
    const doExportPdfIdx = formLayout.indexOf('async function doExportPdf');
    expect(doPrintIdx).toBeGreaterThan(-1);
    expect(doExportPdfIdx).toBeGreaterThan(doPrintIdx);
    // مُجرَّد من التعليقات: التوثيق أعلى doExportPdf (الواقع داخل هذا النطاق نصّيًا)
    // يذكر composeStyledFromNode شرحًا — الفحص على الكود الفعلي لا التوثيق.
    const doPrintBody = code(formLayout.slice(doPrintIdx, doExportPdfIdx));
    expect(doPrintBody).not.toContain('composeStyledFromNode');
    expect(doPrintBody).not.toContain('exportPdfFromHtml');
  });
});

describe('لا أثر نصّي متبقٍّ للآليتين المتقاعدتين في أي مصدر إنتاجي', () => {
  it('لا "pdfUseComposedDocument" ولا "buildFormPdfDocument" خارج مجلد __tests__', () => {
    const offenders: string[] = [];
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        const full = `${dir}/${entry.name}`;
        if (entry.isDirectory()) out.push(...walk(full));
        else if (/\.(tsx?|css)$/.test(entry.name)) out.push(full);
      }
      return out;
    };
    for (const file of walk('src')) {
      const src = readFileSync(file, 'utf8');
      if (src.includes('pdfUseComposedDocument') || src.includes('buildFormPdfDocument')) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('Cairo Bold Pilot — لا أثر متبقٍّ (تحقّق دائم، مرحلة سابقة متقاعدة)', () => {
  it('لا pdfRealBoldPilot ولا boldFontDataUri ولا buildEmbeddedBoldFontFaceCss في أي مكان', () => {
    for (const name of ['pdfRealBoldPilot', 'boldFontDataUri', 'buildEmbeddedBoldFontFaceCss']) {
      expect(code(formLayout)).not.toContain(name);
    }
  });
});
