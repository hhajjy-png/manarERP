// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { t } from '../lib/i18n';
import { FORM_CARDS } from '../forms/shared/formsRegistry';

/**
 * Forms Registry Translation Audit v1
 *
 * جذر العلّة (شهادة الراتب وأربعة نماذج أخرى): صفحات النماذج تستدعي t('page.xxx.title')
 * لكن المفتاح لم يكن مسجَّلًا إطلاقًا في القاموس — t() يعود للمفتاح الحرفي حين يغيب
 * عن كِلا اللغتين، وهذا بالضبط ما ظهر على الشاشة. الأمر لم يكن خاصًا بشهادة الراتب:
 * التدقيق الكامل هنا يفحص **كل** نموذج مسجَّل في formsRegistry، لا نموذجًا بعينه —
 * وأي نموذج يُضاف مستقبلًا يُفحَص تلقائيًا بلا أي تعديل على هذا الملف.
 *
 * المعمارية بعد الإصلاح: FORM_CARDS يحمل **titleKey واحدًا فقط** لكل نموذج (لا
 * titleAr/titleEn نصيّين). كل مستهلك — بطاقات مركز النماذج، قائمة «نماذج
 * الموظف»، وشاشة النموذج نفسها — يُحلّ العنوان عبر t(titleKey) حصرًا. القاموس
 * (i18n.ts) هو مصدر الحقيقة الوحيد للنص المترجَم؛ السجل هو مصدر الحقيقة الوحيد
 * لأي *مفتاح* يمثّل عنوان أي نموذج.
 */

// كل بطاقة في FORM_CARDS يجب أن يكون لها ملف شاشة مقابل — يُستخدَم للتحقّق من أن
// مفتاح العنوان في السجل هو **نفسه** المفتاح الذي تستدعيه الشاشة الفعلية، لا نسخة
// منفصلة قد تنحرف عنه مستقبلًا. عقد العمل بلا FormLayout (بنية مختلفة تمامًا —
// مُدقَّقة بملفها الخاص employmentContractNewEmployee.test.tsx)، فيُستثنى من هذا
// الفحص الحرفي وحده، مع بقاء فحص وجود الترجمة نفسه ساريًا عليه.
const PAGE_FILE_BY_ROUTE: Record<string, string> = {
  'salary-certificate': 'SalaryCertificate.tsx',
  'to-whom-it-may-concern': 'ToWhomItMayConcern.tsx',
  'leave-request': 'LeaveRequest.tsx',
  'return-to-work': 'ReturnToWork.tsx',
  'salary-advance': 'SalaryAdvance.tsx',
  resignation: 'Resignation.tsx',
  'employee-warning': 'EmployeeWarning.tsx',
  'performance-evaluation': 'PerformanceEvaluation.tsx',
  'employment-contract': 'EmploymentContract.tsx',
  quotation: 'Quotation.tsx',
  'purchase-request': 'PurchaseRequest.tsx',
  'receipt-voucher': 'ReceiptVoucher.tsx',
  'payment-voucher': 'AdminPaymentVoucher.tsx',
  'blank-a4-print': 'BlankA4Print.tsx',
  // محرك الخطابات — مساحة العمل (لا FormLayout: قائمة لا نموذج طباعة)، لكنها تحلّ
  // عنوانها من نفس titleKey المسجَّل، فيسري عليها الفحص الحرفي كما يسري على غيرها.
  'official-letter': 'LetterWorkspace.tsx',
};

const RAW_KEY_PATTERN = /\b(?:page|voucher)\.[a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_.]*\b/;

describe('تدقيق ترجمة سجل النماذج — كل نموذج مسجَّل في FORM_CARDS', () => {
  it('كل بطاقة في FORM_CARDS لها ملف شاشة معروف بالفحص — لا نموذج يمرّ بلا تغطية', () => {
    for (const card of FORM_CARDS) {
      expect(PAGE_FILE_BY_ROUTE, `لا يوجد فحص ملف مسجَّل لـ ${card.key} — أضِف مساره إلى PAGE_FILE_BY_ROUTE`).toHaveProperty(card.route);
    }
  });

  for (const card of FORM_CARDS) {
    describe(`${card.key} (titleKey: ${card.titleKey})`, () => {
      it('العربية موجودة وتُحلّ فعليًا — لا رجوع إلى المفتاح الحرفي', () => {
        const resolved = t(card.titleKey, 'ar');
        expect(resolved).not.toBe(card.titleKey);
        expect(resolved.trim().length).toBeGreaterThan(0);
        expect(resolved).not.toMatch(RAW_KEY_PATTERN);
      });

      it('الإنجليزية موجودة وتُحلّ فعليًا — لا رجوع إلى المفتاح الحرفي', () => {
        const resolved = t(card.titleKey, 'en');
        expect(resolved).not.toBe(card.titleKey);
        expect(resolved.trim().length).toBeGreaterThan(0);
        expect(resolved).not.toMatch(RAW_KEY_PATTERN);
      });

      const pageFile = PAGE_FILE_BY_ROUTE[card.route];
      if (pageFile) {
        it(`شاشة ${pageFile} تستدعي نفس titleKey المسجَّل — لا انحراف بين السجل والشاشة`, () => {
          const src = readFileSync(`src/pages/${pageFile}`, 'utf8');
          // الشاشات تحلّ العنوان إما عبر t('KEY') أو translate('KEY', lang) —
          // كلاهما يقرأ نفس القاموس؛ المطلوب هو استدعاء المفتاح المسجَّل حرفيًا.
          const resolvesKey =
            src.includes(`t('${card.titleKey}')`) || src.includes(`translate('${card.titleKey}'`);
          expect(resolvesKey, `الشاشة لا تستدعي '${card.titleKey}' عبر t() أو translate()`).toBe(true);
        });
      }
    });
  }
});

describe('مصدر واحد فقط لعنوان النموذج — لا حقول titleAr/titleEn نصية متبقّية', () => {
  it('formsRegistry.ts لا يحمل أي نص عنوان حرفي، titleKey فقط', () => {
    const registrySrc = readFileSync('src/forms/shared/formsRegistry.ts', 'utf8');
    expect(registrySrc).not.toContain('titleAr:');
    expect(registrySrc).not.toContain('titleEn:');
    // كل بطاقة تحمل titleKey (+1 لتعريف الحقل نفسه في واجهة FormCard).
    expect((registrySrc.match(/titleKey:/g) ?? []).length).toBe(FORM_CARDS.length + 1);
  });

  it('Forms.tsx و EmployeeFormsMenu.tsx يحلّان العنوان عبر t(titleKey) فقط', () => {
    const formsSrc = readFileSync('src/pages/Forms.tsx', 'utf8');
    const menuSrc = readFileSync('src/components/employee/EmployeeFormsMenu.tsx', 'utf8');
    expect(formsSrc).not.toContain('.titleAr');
    expect(formsSrc).not.toContain('.titleEn');
    expect(formsSrc).toContain("translate(card.titleKey, 'ar')");
    expect(formsSrc).toContain("translate(card.titleKey, 'en')");
    expect(menuSrc).not.toContain('.titleAr');
    expect(menuSrc).not.toContain('.titleEn');
    expect(menuSrc).toContain('t(card.titleKey)');
  });
});
