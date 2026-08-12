// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * Saved PDF — تركيب موحَّد نهائي (المرحلة 5D).
 *
 * تاريخ القرار: عبر المراحل 5A–5C كان «حفظ PDF» يختار بين مسارَين — مركِّب موحَّد
 * (`composeStyledFromNode`، نفس مصدر المعاينة الدقيقة) أو بنّاء مستقل يعيد كتابة
 * CSS يدويًا (`buildFormPdfDocument`) — عبر علم اختياري `pdfUseComposedDocument`.
 * Audit المرحلة 5D أثبت أن **كل** مستهلكي `FormLayout` الاثني عشر يمرّرون العلم
 * (لا استثناء بروفايل، ولا استثناء نموذج) — فأُزيل العلم والفرع القديم معًا.
 * `FormLayout.doExportPdf` الآن مسار واحد بلا شرط. `BlankA4Print.tsx` (خارج
 * `FormLayout`، هندسة 210×297مم خاصة) هوجر بالتوازي لنفس المُركِّب. `buildFormPdfDocument`
 * نفسها حُذفت — صفر مستهلكين إنتاجيّين بعد الهجرتين.
 *
 * ما يحرسه هذا الملف تحديدًا (لا يتكرر في `pdfComposedDocumentPilotFidelity.test.ts`):
 *   • كل مستهلكي FormLayout الاثني عشر يستخدمون المسار الموحَّد، ولا نموذج نُسي.
 *   • BlankA4Print مهاجَر أيضًا، بمعزل عن FormLayout.
 *   • buildFormPdfDocument حُذفت فعليًا — حارس ضد إعادة إدخالها أو إدخال بنّاء موازٍ جديد.
 *   • Quotation في وضعيها (legacy وengine) على نفس المُركِّب؛ الفاتورة/الشيكات خارج النطاق.
 */

const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');

/** كل صفحة تستورد FormLayout فعليًا اليوم — بالاسم، لا تخمين. */
const ALL_FORM_LAYOUT_CONSUMERS = [
  // مستندا وحدة مستحقات الموظف الشهرية — انضمّا إلى نفس مسار التركيب والتصدير
  // (`composeStyledFromNode` → `exportPdfFromHtml`) بلا مسار طباعة موازٍ.
  'EmployeeCompensationStatement',
  'EmployeeCompensationDetailed',
  'SalaryCertificate',
  'EmployeeWarning',
  'LeaveRequest',
  'PerformanceEvaluation',
  'PurchaseRequest',
  'Resignation',
  'ReturnToWork',
  'SalaryAdvance',
  'ToWhomItMayConcern',
  'AdminPaymentVoucher',
  'PaymentVoucher',
  'Quotation',
] as const;

const sourceOf = (name: string) => readFileSync(`src/pages/${name}.tsx`, 'utf8');
const formLayout = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');

describe('لا أي أثر لعلم pdfUseComposedDocument المتقاعد', () => {
  it('FormLayoutProps لا يعرّفه، وdoExportPdf لا يفرّع عليه', () => {
    expect(formLayout).not.toContain('pdfUseComposedDocument');
  });

  it.each(ALL_FORM_LAYOUT_CONSUMERS)('%s: لا يمرّر pdfUseComposedDocument (لم يعد خيارًا)', (name) => {
    expect(code(sourceOf(name))).not.toContain('pdfUseComposedDocument');
  });
});

describe('شمولية الفحص — كل مستهلكي FormLayout محسوبون', () => {
  it('كل الصفحات المستوردة لـ FormLayout مُدرجة أعلاه — لا واحدة منسية', () => {
    const pagesDir = 'src/pages';
    const consumers = readdirSync(pagesDir)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => code(readFileSync(`${pagesDir}/${f}`, 'utf8')).includes("from '../forms/shared/FormLayout'"))
      .map((f) => f.replace(/\.tsx$/, ''));

    expect(consumers.sort()).toEqual([...ALL_FORM_LAYOUT_CONSUMERS].sort());
  });
});

describe('FormLayout.doExportPdf — مسار واحد بلا فرع، بلا تفرّع لكل نموذج', () => {
  it('composeStyledFromNode هو الاستدعاء الوحيد، وbuildFormPdfDocument غائب كليًا', () => {
    const start = formLayout.indexOf('async function doExportPdf');
    const end = formLayout.indexOf('async function doPrint', start) > -1
      ? formLayout.length // doPrint يسبق doExportPdf فعليًا؛ خذ حتى نهاية الملف كسقف آمن
      : formLayout.length;
    const body = formLayout.slice(start, Math.min(start + 1500, end));
    expect(body).toContain('composeStyledFromNode');
    expect(body).not.toContain('buildFormPdfDocument');
    // لا فرع شرطي بأي معيار — لا `if` على العلم القديم أو بروفايل أو هوية نموذج.
    expect(body).not.toMatch(/if\s*\(\s*pdfUseComposedDocument/);
  });

  it('لا تفرّع خاص بأي نموذج (formType/formNumber/title/profile) داخل doExportPdf', () => {
    const start = formLayout.indexOf('async function doExportPdf');
    const end = formLayout.indexOf('\n  }\n\n  /**', start); // نهاية الدالة قبل التوثيق التالي
    expect(start).toBeGreaterThan(-1);
    const body = formLayout.slice(start, end > start ? end : start + 1200);
    expect(body).not.toMatch(/formType\s*===|formNumber\s*===|title\s*===|profile\s*===|profile\s*!==/);
  });
});

describe('BlankA4Print — مهاجَر بمعزل عن FormLayout', () => {
  it('doExportPdf الخاص به يستخدم composeStyledFromNode، لا buildFormPdfDocument', () => {
    const src = readFileSync('src/pages/BlankA4Print.tsx', 'utf8');
    expect(src).toContain("await import('../printing')");
    expect(src).toContain('composeStyledFromNode');
    expect(src).not.toMatch(/buildFormPdfDocument\(/); // استدعاء فعلي، لا ذكر نصّي
  });
});

describe('buildFormPdfDocument — حُذفت فعليًا؛ حارس ضد إعادة إدخالها', () => {
  it('الملف نفسه لم يعد موجودًا في المستودع', () => {
    expect(() => readFileSync('src/forms/shared/formPdfDocument.ts', 'utf8')).toThrow();
  });

  it('لا استيراد أو استدعاء فعلي لـbuildFormPdfDocument في أي مصدر إنتاجي', () => {
    const pagesDir = 'src/pages';
    const offenders: string[] = [];
    for (const f of readdirSync(pagesDir)) {
      if (!f.endsWith('.tsx')) continue;
      const src = code(readFileSync(`${pagesDir}/${f}`, 'utf8'));
      if (/buildFormPdfDocument\(/.test(src)) offenders.push(f);
    }
    if (/buildFormPdfDocument\(/.test(code(formLayout))) offenders.push('forms/shared/FormLayout.tsx');
    expect(offenders).toEqual([]);
  });

  it('حارس معماري: لا نموذج إداري يبني CSS طباعة مستقلًا بمعزل عن composeStyledFromNode/composeFromNode', () => {
    // الهدف: منع نشوء بنّاء PDF موازٍ جديد يعيد كتابة CSS يدويًا (نفس عيب
    // buildFormPdfDocument المتقاعد) — لا حظر عام على أي سلسلة "PDF" في التعليقات.
    const pagesDir = 'src/pages';
    const offenders: string[] = [];
    for (const f of readdirSync(pagesDir)) {
      if (!f.endsWith('.tsx')) continue;
      const src = code(readFileSync(`${pagesDir}/${f}`, 'utf8'));
      const exportsPdf = /exportPdfFromHtml\(/.test(src);
      const usesUnifiedComposer = /composeStyledFromNode\(|composeFromNode\(|composeFromHtml\(/.test(src);
      const delegatesToFormLayout = src.includes("from '../forms/shared/FormLayout'");
      if (exportsPdf && !usesUnifiedComposer && !delegatesToFormLayout) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});

describe('Quotation — كلا الوضعين على المُركِّب الموحَّد', () => {
  const quotation = code(readFileSync('src/pages/Quotation.tsx', 'utf8'));

  it('وضع engine: handleExportPdf يستدعي composeStyledFromNode مباشرة (سابق لهذه الحزمة)', () => {
    expect(quotation).toContain('composeQuotationPreview()');
    expect(quotation).toContain('composeStyledFromNode');
  });

  it('وضع legacy: FormLayout بلا أي CSS/تصميم خاص — لا approvalBranding ولا هوامش خاصة', () => {
    expect(quotation).not.toContain('approvalBranding');
    expect(quotation).not.toContain('compactTopMargin');
    expect(quotation).not.toContain('useLogoHeader');
    expect(quotation).not.toContain('letterheadCompactFooter');
  });
});

describe('الفاتورة والشيكات — خارج هذا التوحيد كليًا', () => {
  it('Cheques.tsx لا يستورد FormLayout ولا composeStyledFromNode لهذا الغرض', () => {
    const cheques = code(readFileSync('src/pages/Cheques.tsx', 'utf8'));
    expect(cheques).not.toContain("from '../forms/shared/FormLayout'");
  });

  it('InvoicePreview.tsx خارج FormLayout — مساره القائم بلا مساس', () => {
    const inv = code(readFileSync('src/pages/InvoicePreview.tsx', 'utf8'));
    expect(inv).not.toContain("from '../forms/shared/FormLayout'");
  });
});
