// @vitest-environment jsdom
/**
 * عقد تسمية `INVOICE` بحسب سياق كشف الحساب — حارس انحدار.
 *
 * `INVOICE` نوع مرجع **مشترك**: `statement.service.ts` يُصدره لفاتورة العميل
 * (`buildCustomerStatement`) وفاتورة المورّد (`buildSupplierStatement`) بنفس القيمة
 * التقنية — وهي قيمة لا يجوز تغييرها (عقد API، ومُعامل فلترة `referenceType`).
 *
 * من ذلك وقعت مشكلة فعلية: حزمة Customer Transport Invoice Terminology Finalization v1
 * غيّرت `fc.ref.sales_invoice` من «فاتورة مبيعات» إلى «فاتورة نقليات»، وبما أن
 * `REFERENCE_TYPE_KEY` يربط `INVOICE` بذلك المفتاح، صار عمود «النوع» في **كشف حساب
 * المورّد** يعرض تسمية فاتورة العميل («فاتورة نقليات») بينما الحركة فاتورة مشتريات.
 *
 * الحل كان عرضًا بحتًا: مُعامل `scope` اختياري على `referenceTypeLabel` يستهلك سياق
 * الكيان الموجود أصلًا في `FinancialCenter` (`entityType`) ويُرجع تسمية المشتريات
 * القائمة (`fc.ref.purchase_invoice`) لكشف المورّد — بلا مفتاح i18n جديد، وبلا نوع
 * حركة تقني جديد، وبلا لمس `referenceType`.
 *
 * هذا الملف يُثبّت العقد بأكمله حتى لا يرجع الخلط:
 *   • الحالات الأربع (عميل/مورّد × عربي/إنجليزي).
 *   • **بلا `scope`**: السلوك القديم كما هو — وهو الصحيح لدفتر اليومية والأستاذ العام
 *     حيث `INVOICE` هو فعلًا فاتورة العميل (`JournalBookTable`, `FinancialCenter` GL).
 *   • بقيّة أنواع المراجع لا تتأثّر بتمرير `scope` إطلاقًا.
 *   • `INVOICE_REVERSAL` يورّث `scope` فيبني على تسمية الأساس الصحيحة.
 *
 * التسميات تُقرأ من **قاموس i18n الحقيقي** (`lib/i18n`) لا من قاموس مُوازٍ. والحالات
 * الأربع وحدها تُثبَّت بنصّها الحرفي — فهي المصطلحات المعتمدة للمشروع وتغييرها قرار
 * منتج لا تفصيل تنفيذي؛ وما عداها يُقارَن بمفتاحه فلا يتكرّر نصّ في مكانين.
 */
import { describe, it, expect } from 'vitest';
import { referenceTypeLabel } from '../components/financial/financialLabels';
import { t as translate } from '../lib/i18n';

/** مُترجِمان بلغة ثابتة — نفس شكل الدالة التي يُمرّرها `useT()` للمكوّنات. */
const ar = (key: string) => translate(key, 'ar');
const en = (key: string) => translate(key, 'en');

/** كل قيم `scope` الممكنة، بما فيها الغياب. */
const ALL_SCOPES = [undefined, 'customer', 'supplier'] as const;

describe('referenceTypeLabel — عقد تسمية INVOICE حسب سياق الكشف', () => {
  describe('الحالات الأربع المعتمدة', () => {
    it('كشف عميل + عربي ⇒ «فاتورة نقليات»', () => {
      expect(referenceTypeLabel('INVOICE', ar, 'customer')).toBe('فاتورة نقليات');
    });

    it('كشف عميل + إنجليزي ⇒ «Customer Transport Invoice»', () => {
      expect(referenceTypeLabel('INVOICE', en, 'customer')).toBe('Customer Transport Invoice');
    });

    it('كشف مورّد + عربي ⇒ «فاتورة مشتريات» (لا تسمية فاتورة العميل)', () => {
      expect(referenceTypeLabel('INVOICE', ar, 'supplier')).toBe('فاتورة مشتريات');
    });

    it('كشف مورّد + إنجليزي ⇒ «Purchase Invoice»', () => {
      expect(referenceTypeLabel('INVOICE', en, 'supplier')).toBe('Purchase Invoice');
    });

    it('العميل والمورّد لا يتشابهان أبدًا في اللغتين — جوهر المشكلة التي وقعت', () => {
      expect(referenceTypeLabel('INVOICE', ar, 'customer'))
        .not.toBe(referenceTypeLabel('INVOICE', ar, 'supplier'));
      expect(referenceTypeLabel('INVOICE', en, 'customer'))
        .not.toBe(referenceTypeLabel('INVOICE', en, 'supplier'));
    });
  });

  describe('بلا scope — سلوك اليومية والأستاذ العام لم يتغيّر', () => {
    it('INVOICE بلا scope يبقى تسمية فاتورة العميل في اللغتين', () => {
      expect(referenceTypeLabel('INVOICE', ar)).toBe('فاتورة نقليات');
      expect(referenceTypeLabel('INVOICE', en)).toBe('Customer Transport Invoice');
    });

    it('بلا scope ≡ scope=customer — فلا سلوك ثالث خفيّ', () => {
      expect(referenceTypeLabel('INVOICE', ar)).toBe(referenceTypeLabel('INVOICE', ar, 'customer'));
      expect(referenceTypeLabel('INVOICE', en)).toBe(referenceTypeLabel('INVOICE', en, 'customer'));
    });
  });

  describe('أنواع المراجع الأخرى لا تتأثّر بالـscope', () => {
    // القيم المتوقّعة من نفس مفاتيح i18n التي يستخدمها `REFERENCE_TYPE_KEY` — لا نصّ مكرّر.
    const UNAFFECTED: [type: string, i18nKey: string][] = [
      ['PURCHASE_INVOICE', 'fc.ref.purchase_invoice'],
      ['PURCHASE',         'cat.purchases'],
      ['PAYMENT',          'modal.collect_payment'],
      ['PURCHASE_PAYMENT', 'fc.ref.supplier_payment'],
      ['EXPENSE',          'ops.pending.expense_unit'],
      ['PAYROLL',          'cat.salaries'],
      ['GOODS_RECEIPT',    'fc.ref.goods_receipt'],
      ['MATERIAL_ISSUE',   'fc.ref.material_issue'],
      ['MANUAL',           'fc.ref.manual_entry'],
    ];

    for (const [type, i18nKey] of UNAFFECTED) {
      it(`${type} ثابت عبر (بلا scope / customer / supplier) بالعربية والإنجليزية`, () => {
        for (const scope of ALL_SCOPES) {
          expect(referenceTypeLabel(type, ar, scope)).toBe(translate(i18nKey, 'ar'));
          expect(referenceTypeLabel(type, en, scope)).toBe(translate(i18nKey, 'en'));
        }
      });
    }

    it('نوع غير معروف يعود كما هو، ولا يتأثّر بالـscope', () => {
      for (const scope of ALL_SCOPES) {
        expect(referenceTypeLabel('SOMETHING_NEW', ar, scope)).toBe('SOMETHING_NEW');
      }
    });

    it('قيمة فارغة/غائبة تعود نصًّا فارغًا ولا ترمي', () => {
      for (const scope of ALL_SCOPES) {
        expect(referenceTypeLabel(null, ar, scope)).toBe('');
        expect(referenceTypeLabel(undefined, ar, scope)).toBe('');
        expect(referenceTypeLabel('', ar, scope)).toBe('');
      }
    });
  });

  describe('INVOICE_REVERSAL يحترم الـscope', () => {
    it('يبني على تسمية الأساس الصحيحة لكل سياق + لاحقة العكس', () => {
      const suffixAr = translate('fc.ref.reversal_suffix', 'ar');
      const suffixEn = translate('fc.ref.reversal_suffix', 'en');

      expect(referenceTypeLabel('INVOICE_REVERSAL', ar, 'customer')).toBe(`فاتورة نقليات ${suffixAr}`);
      expect(referenceTypeLabel('INVOICE_REVERSAL', ar, 'supplier')).toBe(`فاتورة مشتريات ${suffixAr}`);
      expect(referenceTypeLabel('INVOICE_REVERSAL', en, 'customer')).toBe(`Customer Transport Invoice ${suffixEn}`);
      expect(referenceTypeLabel('INVOICE_REVERSAL', en, 'supplier')).toBe(`Purchase Invoice ${suffixEn}`);
    });

    it('INVOICE_REVERSAL بلا scope يبقى على تسمية فاتورة العميل', () => {
      const suffixAr = translate('fc.ref.reversal_suffix', 'ar');
      expect(referenceTypeLabel('INVOICE_REVERSAL', ar)).toBe(`فاتورة نقليات ${suffixAr}`);
    });
  });
});
