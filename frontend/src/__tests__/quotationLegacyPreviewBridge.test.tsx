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
 * لون خياري التوقيع/الختم في شريط قالب الطباعة، والتي لا علاقة لها بإزالة المعاينة.
 */

const quotationSrc = readFileSync('src/pages/Quotation.tsx', 'utf8');
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');

const qCode = code(quotationSrc);

// ── تباين خيارات التوقيع/الختم في شاشة قالب الطباعة ─────────────────────────────
describe('شاشة قالب الطباعة — «التوقيع» و«الختم» مقروءان', () => {
  /** كتلة خياري التوقيع/الختم وحدها — لا الحاويات المجاورة (خيار Template Studio مثلًا). */
  const start = qCode.indexOf('printOptionsInitialized && (');
  const optionsBlock = () => qCode.slice(start, qCode.indexOf('marginRight:', start));
  /** سطر الحاوية الذي كان يفرض خلفية فاتحة بلا لون نص. */
  const containerLine = () =>
    optionsBlock()
      .split(/\r?\n/)
      .find((l) => l.includes('borderRadius: 8') && l.includes('display:')) ?? '';

  it('لون النص مُعيَّن صراحةً بتوكن الثيم — لا يُترك موروثًا', () => {
    const block = optionsBlock();
    // كان `color: undefined` للحالة المفعّلة: يرث لون الثيم (أبيض في الداكن) فوق خلفية
    // مثبَّتة فاتحة ⇒ أبيض على أبيض.
    expect(block).toContain("color: branding.signatureUrl ? 'var(--text)' : 'var(--text-muted)'");
    expect(block).toContain("color: branding.stampUrl ? 'var(--text)' : 'var(--text-muted)'");
    expect(block).not.toContain('#94a3b8'); // لا لون نص مثبّت
    expect(block).not.toContain('color: undefined');
  });

  it('الخلفية توكن أيضًا — تتحرّك مع الثيم مثل النص، فلا يتجمّد التباين', () => {
    const line = containerLine();
    expect(line).toContain("background: 'var(--surface-2)'");
    expect(line).toContain("color: 'var(--text)'");
    expect(line).not.toContain('#f8fafc'); // لا خلفية مثبّتة على الحاوية
  });

  it('السلوك لم يتغيّر: نفس الـ checkbox ونفس منطق الإظهار', () => {
    const block = optionsBlock();
    expect(block).toContain('checked={printShowSignature}');
    expect(block).toContain('checked={printShowStamp}');
    expect(block).toContain('disabled={!branding.signatureUrl}');
    expect(block).toContain('disabled={!branding.stampUrl}');
    expect(block).toContain('onChange={(e) => setPrintShowSignature(e.target.checked)}');
    expect(block).toContain('onChange={(e) => setPrintShowStamp(e.target.checked)}');
  });
});
