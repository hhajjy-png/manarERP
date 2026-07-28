// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * شاشة قالب الطباعة في عرض السعر — تباين خياري «التوقيع» و«الختم».
 *
 * ملاحظة: الجسر القديم بين المعاينة العادية (legacy) وزر الطباعة في عرض السعر
 * (PRINT_CENTER_PHASE2 / PRINT_CENTER_PHASE2_QUOTATION) أُزيل مع حذف «المعاينة
 * العادية» من كل الشاشات — المعاينة الدقيقة (`useAccurateFormPreview`) هي مسار
 * المعاينة الوحيد المتبقي. هذا الملف يحتفظ فقط بتغطيته المستقلة عن ذلك: توكنات
 * لون خياري التوقيع/الختم، والتي لا علاقة لها بإزالة المعاينة.
 *
 * بعد Multi-Signature & Stamp Management v1 انتقلت الكتلة نفسها من `Quotation.tsx`
 * إلى `BrandingAssetPicker` المشترك — فالفحص يتبعها إلى هناك: **نفس المطلب** (توكنات
 * ثيم لا ألوان مثبَّتة)، ونفس منطق الإظهار (checkbox معطَّل بلا أصل مختار).
 */
const pickerSrc = readFileSync('src/print-templates/components/BrandingAssetPicker.tsx', 'utf8');
const quotationSrc = readFileSync('src/pages/Quotation.tsx', 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');

const pickerCode = code(pickerSrc);
const qCode = code(quotationSrc);

// ── تباين خيارات التوقيع/الختم في شاشة قالب الطباعة ─────────────────────────────
describe('اختيار التوقيع والختم — مقروء في الثيمين', () => {
  it('لون النص مُعيَّن صراحةً بتوكن الثيم — لا يُترك موروثًا', () => {
    // كان `color: undefined` للحالة المفعّلة: يرث لون الثيم (أبيض في الداكن) فوق خلفية
    // مثبَّتة فاتحة ⇒ أبيض على أبيض.
    expect(pickerCode).toContain("color: 'var(--text)'");
    expect(pickerCode).not.toContain('#94a3b8'); // لا لون نص مثبّت
    expect(pickerCode).not.toContain('color: undefined');
  });

  it('الخلفية توكن أيضًا — تتحرّك مع الثيم مثل النص، فلا يتجمّد التباين', () => {
    expect(pickerCode).toContain("background: 'var(--surface-2)'");
    expect(pickerCode).not.toContain('#f8fafc'); // لا خلفية مثبّتة على الحاوية
  });

  it('السلوك لم يتغيّر: نفس الـ checkbox ونفس منطق الإظهار', () => {
    expect(pickerCode).toContain('checked={selection.showSignature}');
    expect(pickerCode).toContain('checked={selection.showStamp}');
    expect(pickerCode).toContain('disabled={!selection.signatureUrl}');
    expect(pickerCode).toContain('disabled={!selection.stampUrl}');
    expect(pickerCode).toContain('onChange={(e) => selection.setShowSignature(e.target.checked)}');
    expect(pickerCode).toContain('onChange={(e) => selection.setShowStamp(e.target.checked)}');
  });

  it('عرض السعر يستهلك العنصر المشترك ولا يُعيد بناء الكتلة محليًا', () => {
    expect(qCode).toContain('<BrandingAssetPicker selection={brandingSelection} />');
    expect(qCode).not.toContain('checked={printShowSignature}');
    expect(qCode).not.toContain('checked={printShowStamp}');
  });
});
