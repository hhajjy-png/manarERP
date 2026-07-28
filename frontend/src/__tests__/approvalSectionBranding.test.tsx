// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import ApprovalSection from '../forms/shared/ApprovalSection';

/**
 * Multi-Signature & Stamp Management v1 — تعميم النظام على النماذج الإدارية.
 *
 * `ApprovalSection` هو خانة اعتماد **الشركة** الوحيدة المشتركة بين النماذج، وهي نقطة
 * الربط بالنظام المركزي. ما يهمّ هنا شيئان: أن السلوك القديم (سطر فارغ + «الختم
 * الرسمي») لم يتغيّر بلا اختيار، وأن الصورة تُرسم في مكانها الحالي **بلا إزاحة تخطيط**.
 */

const SIG = 'data:image/png;base64,SIG';
const STAMP = 'data:image/png;base64,STAMP';

afterEach(cleanup);

describe('ApprovalSection — بلا اختيار: السلوك القديم حرفيًا', () => {
  it('يرسم سطر التوقيع الفارغ ولا صورة', () => {
    const { container } = render(<ApprovalSection />);
    expect(screen.getByText('التوقيع:')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('يرسم نص «الختم الرسمي» حين لا ختم مختارًا', () => {
    render(<ApprovalSection />);
    expect(screen.getByText('الختم الرسمي')).toBeInTheDocument();
  });

  it('يحفظ نص العنوان والتاريخ الافتراضيين', () => {
    render(<ApprovalSection />);
    expect(screen.getByText('اعتماد المدير المباشر')).toBeInTheDocument();
    expect(screen.getByText('____ / ____ / ______')).toBeInTheDocument();
  });

  it('الإنجليزية بلا تغيير', () => {
    render(<ApprovalSection lang="en" title="Employer Signature" />);
    expect(screen.getByText('Employer Signature')).toBeInTheDocument();
    expect(screen.getByText('Official Stamp')).toBeInTheDocument();
  });
});

describe('ApprovalSection — التوقيع المختار', () => {
  it('يرسم الصورة المختارة', () => {
    const { container } = render(<ApprovalSection signatureUrl={SIG} />);
    const img = container.querySelector('img[data-bd-type="signature"]') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe(SIG);
  });

  it('**سطر التوقيع يبقى**: الصورة تجلس عليه ولا تحلّ محلّه — التصميم كما هو', () => {
    const { container } = render(<ApprovalSection signatureUrl={SIG} />);
    const img = container.querySelector('img[data-bd-type="signature"]')!;
    const ruling = img.parentElement!;
    expect(ruling.style.borderBottom).toContain('1px solid');
    expect(ruling.style.width).toBe('200px');
  });

  it('**بلا إزاحة تخطيط**: الصورة خارج التدفّق ومثبَّتة على السطر', () => {
    const { container } = render(<ApprovalSection signatureUrl={SIG} />);
    const img = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    expect(img.style.position).toBe('absolute');
    expect(img.style.bottom).toBe('2px');
    expect(img.style.objectFit).toBe('contain');
  });

  it('ما زال يعرض عنوان «التوقيع:» بجانب السطر', () => {
    render(<ApprovalSection signatureUrl={SIG} />);
    expect(screen.getByText('التوقيع:')).toBeInTheDocument();
  });
});

describe('ApprovalSection — الختم المختار', () => {
  it('الصورة تحلّ محلّ نص «الختم الرسمي» — الصورة هي الختم', () => {
    const { container } = render(<ApprovalSection stampUrl={STAMP} />);
    const img = container.querySelector('img[data-bd-type="stamp"]') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(STAMP);
    expect(screen.queryByText('الختم الرسمي')).toBeNull();
  });

  it('يجلس في مرساة العنوان نفسها في وضع stampInline (خارج التدفّق أصلًا)', () => {
    const { container } = render(<ApprovalSection stampUrl={STAMP} stampInline />);
    const wrapper = container.querySelector('img[data-bd-type="stamp"]')!.parentElement as HTMLElement;
    expect(wrapper.style.position).toBe('absolute');
    // نفس المرساة التي كان يجلس عليها النص: منتصف السطر مطروحًا منه 2cm (jsdom يحوّلها
    // إلى px)، مع نفس الـ transform — أي الموضع الحالي بلا تغيير.
    expect(wrapper.style.left).toMatch(/^calc\(50% - 75\.\d+px\)$/);
    expect(wrapper.style.transform).toBe('translateX(-50%)');
  });

  it('التوقيع والختم يظهران معًا بلا تعارض', () => {
    const { container } = render(<ApprovalSection signatureUrl={SIG} stampUrl={STAMP} stampInline />);
    expect(container.querySelector('img[data-bd-type="signature"]')).not.toBeNull();
    expect(container.querySelector('img[data-bd-type="stamp"]')).not.toBeNull();
  });

  it('«بدون» لأحدهما لا يُلغي الآخر', () => {
    const { container } = render(<ApprovalSection signatureUrl={SIG} />);
    expect(container.querySelector('img[data-bd-type="signature"]')).not.toBeNull();
    expect(container.querySelector('img[data-bd-type="stamp"]')).toBeNull();
    expect(screen.getByText('الختم الرسمي')).toBeInTheDocument();
  });
});

// ── ربط النماذج: الحصر صريح ومقصود ─────────────────────────────────────────────
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\/.*$/gm, '');

const page = (name: string) => code(readFileSync(`src/pages/${name}.tsx`, 'utf8'));
const layoutCode = code(readFileSync('src/forms/shared/FormLayout.tsx', 'utf8'));

/** النماذج التي تحمل خانة اعتماد الشركة وتم ربطها عبر FormLayout. */
const BOUND_VIA_FORM_LAYOUT = [
  'SalaryCertificate',
  'ToWhomItMayConcern',
  'LeaveRequest',
  'ReturnToWork',
  'SalaryAdvance',
  'Resignation',
  'EmployeeWarning',
  'PerformanceEvaluation',
  'PurchaseRequest',
];

/**
 * المستثناة، ولكلٍّ سبب معماري:
 *   Quotation        — توقيع عرض السعر يملكه مسار قوالب الطباعة (QuotationBase).
 *   PaymentVoucher   — `hideApprovalSection`: لا خانة اعتماد شركة فيه أصلًا.
 *   AdminPaymentVoucher — نفس السبب.
 */
const NOT_BOUND = ['Quotation', 'PaymentVoucher', 'AdminPaymentVoucher'];

describe('ربط النماذج بالنظام المركزي', () => {
  it.each(BOUND_VIA_FORM_LAYOUT)('%s مربوط عبر approvalBranding', (name) => {
    expect(page(name)).toContain('approvalBranding');
  });

  it.each(NOT_BOUND)('%s غير مربوط — استثناء مقصود ومُعلَّل', (name) => {
    expect(page(name)).not.toContain('approvalBranding');
  });

  it('FormLayout هو الموضع الوحيد الذي يحوّل الاختيار إلى صور — لا نموذج يكرّره', () => {
    expect(layoutCode).toContain('signatureUrl={approvalBranding && brandingSelection.showSignature');
    expect(layoutCode).toContain('stampUrl={approvalBranding && brandingSelection.showStamp');
    // ولا نموذج من التسعة يمرّر صورة بنفسه.
    for (const name of BOUND_VIA_FORM_LAYOUT) {
      expect(page(name)).not.toContain('signatureUrl');
      expect(page(name)).not.toContain('stampUrl');
    }
  });

  it('الربط مُطفأ افتراضيًا — نموذج لم يُفحص لا يتغيّر بمجرّد وجوده', () => {
    expect(layoutCode).toContain('approvalBranding = false');
  });

  it('مُنتقي الأصول في شريط الأدوات (لا يُطبع) لا داخل الجذر المطبوع', () => {
    const printableRoot = layoutCode.indexOf('className="form-page"');
    const picker = layoutCode.indexOf('<BrandingAssetPicker');
    expect(picker).toBeGreaterThan(-1);
    expect(picker).toBeLessThan(printableRoot);
  });

  it('سند القبض يبني جذره بنفسه — فيستدعي نفس الخطّافين المشتركين', () => {
    const rcv = page('ReceiptVoucher');
    expect(rcv).toContain('useBrandingSelection(branding)');
    expect(rcv).toContain('<BrandingAssetPicker selection={brandingSelection} />');
    expect(rcv).toContain('signatureUrl={brandingSelection.showSignature ? brandingSelection.signatureUrl : undefined}');
  });
});
