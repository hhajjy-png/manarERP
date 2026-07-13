// @vitest-environment jsdom
/**
 * Additive True Chromium WYSIWYG Preview Rollout v1 — العقد الذي تحرسه هذه الاختبارات.
 *
 * الحزمة **إضافية فقط**. لذلك كل اختبار هنا يسأل أحد سؤالين لا ثالث لهما:
 *
 *   (أ) هل أُضيف الجديد صحيحًا؟  زر «معاينة دقيقة»، من **نفس** مصدر المستند، ويفوّض
 *       الطباعة إلى **نفس** الدالة القديمة، ويختفي كليًا حين يُطفأ العلم.
 *   (ب) هل بقي القديم كما هو؟  المعاينة القديمة، وزر الطباعة، ومسار الطباعة، وبيانات
 *       النموذج، وسلوك الفاتورة — لا شيء منها يتغيّر، حتى حين تفشل المعاينة الجديدة.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useRef, useState } from 'react';
import fs from 'fs';
import path from 'path';

import { useAccurateFormPreview } from '../printing/useAccurateFormPreview';
import {
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1,
  TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC,
  isFlagEnabled,
  setFlagOverride,
} from '../printing/flags';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

function installBridge(ok = true) {
  const generate = vi.fn(async (_html: string) =>
    ok
      ? { ok: true, pdf: PDF, pageCount: 2, readyMs: 10 }
      : { ok: false, error: 'فشل التوليد' },
  );
  (window as unknown as { manar?: object }).manar = {
    generateWysiwygPreviewPoc: generate,
    wysiwygViewerActivate: vi.fn(async () => 7),
    wysiwygViewerDeactivate: vi.fn(async () => true),
  };
  return generate;
}

/**
 * نموذج مصغّر يحاكي أي نموذج حقيقي: عقدة مطبوعة، بيانات، زر طباعة قديم، معاينة قديمة —
 * ثم المعاينة الدقيقة **مضافة فوقها**. ما نثبته هنا يسري على النماذج الأربعة عشر لأنها
 * جميعًا تستدعي نفس الخطّاف بنفس الطريقة.
 */
function FakeForm({
  enabled,
  compose,
  legacyPrint,
}: {
  enabled: boolean;
  compose?: () => string;
  legacyPrint: () => void;
}) {
  const printRootRef = useRef<HTMLDivElement>(null);
  const [amount, setAmount] = useState('100');
  const [legacyOpen, setLegacyOpen] = useState(false);

  const accurate = useAccurateFormPreview({
    enabled,
    getNode: () => printRootRef.current,
    compose,
    onPrint: legacyPrint, // نفس الدالة القديمة، بمرجعها
    title: 'نموذج',
    documentLabel: 'نموذج · 1',
  });

  return (
    <div>
      <button type="button" onClick={legacyPrint}>🖨️ طباعة</button>
      <button type="button" onClick={() => setLegacyOpen(true)}>🔍 معاينة قبل الطباعة</button>
      {accurate.button}
      {legacyOpen && <div data-testid="legacy-preview">المعاينة القديمة</div>}
      <input aria-label="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <div ref={printRootRef} className="printable">
        <p>المستند — {amount}</p>
      </div>
      {accurate.dialog}
    </div>
  );
}

const dialog = () => screen.getByRole('dialog');

// المُركِّب يرفض إنتاج مستند بأنماط ناقصة (حارس قائم). التطبيق الحقيقي يحمل صفحات
// أنماطه دائمًا؛ في jsdom نزرع واحدة كي نختبر السلوك لا غياب البيئة.
let styleEl: HTMLStyleElement;

beforeEach(() => {
  vi.clearAllMocks();
  styleEl = document.createElement('style');
  styleEl.textContent = '.printable { color: #111; }';
  document.head.appendChild(styleEl);
  URL.createObjectURL = vi.fn(() => 'blob:mock-pdf') as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  delete (window as unknown as { manar?: object }).manar;
});
afterEach(() => {
  cleanup();
  styleEl.remove();
  setFlagOverride(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1, null);
  setFlagOverride(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC, null);
});

describe('العلم — مستقل، ومُفعَّل افتراضيًا بعد المراجعة', () => {
  it('UNIVERSAL_… مُفعَّل افتراضيًا (التفعيل الرسمي بعد المراجعة البصرية)', () => {
    expect(isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1)).toBe(true);
  });

  it('التعطيل المحلي يبقى رافعة التراجع الفورية: override = off يُطفئه', () => {
    setFlagOverride(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1, false);
    expect(isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1)).toBe(false);
  });

  it('لا يمسّ علم الفاتورة: TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC ما زال مُفعَّلًا', () => {
    expect(isFlagEnabled(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC)).toBe(true);
  });

  it('العلمان مستقلان: إطفاء الجديد لا يطفئ الفاتورة، والعكس', () => {
    setFlagOverride(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1, true);
    setFlagOverride(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC, false);
    expect(isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1)).toBe(true);
    expect(isFlagEnabled(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC)).toBe(false);
  });

  it('يقبل تجاوز localStorage في الاتجاهين', () => {
    setFlagOverride(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1, true);
    expect(isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1)).toBe(true);
    setFlagOverride(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1, false);
    expect(isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1)).toBe(false);
  });
});

describe('العلم مطفأ ⇒ النموذج كما كان حرفًا بحرف', () => {
  it('لا زر «معاينة دقيقة» ولا حوار — والقديم يعمل', () => {
    const legacyPrint = vi.fn();
    render(<FakeForm enabled={false} legacyPrint={legacyPrint} />);

    expect(screen.queryByText(/معاينة دقيقة/)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('🖨️ طباعة'));
    expect(legacyPrint).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('🔍 معاينة قبل الطباعة'));
    expect(screen.getByTestId('legacy-preview')).toBeInTheDocument();
  });
});

describe('العلم مُفعَّل ⇒ إضافة فقط', () => {
  it('الزر الجديد يظهر **بجوار** الأزرار القائمة، لا بدلًا منها', () => {
    render(<FakeForm enabled legacyPrint={vi.fn()} />);
    expect(screen.getByText('🖨️ طباعة')).toBeInTheDocument();
    expect(screen.getByText('🔍 معاينة قبل الطباعة')).toBeInTheDocument();
    expect(screen.getByText(/معاينة دقيقة/)).toBeInTheDocument();
  });

  it('المعاينة القديمة تبقى تعمل بعد إضافة الجديدة', () => {
    render(<FakeForm enabled legacyPrint={vi.fn()} />);
    fireEvent.click(screen.getByText('🔍 معاينة قبل الطباعة'));
    expect(screen.getByTestId('legacy-preview')).toBeInTheDocument();
  });

  it('زر الطباعة القديم يظل يستدعي مسار الطباعة القديم مباشرة', () => {
    const legacyPrint = vi.fn();
    render(<FakeForm enabled legacyPrint={legacyPrint} />);
    fireEvent.click(screen.getByText('🖨️ طباعة'));
    expect(legacyPrint).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // لم يُفتح حوار المعاينة
  });
});

describe('مصدر المستند — نفسه لا نسخة منه', () => {
  it('يُركّب من **العقدة المطبوعة ذاتها** بحالتها الحالية، ويرسلها كما هي', async () => {
    const generate = installBridge();
    render(<FakeForm enabled legacyPrint={vi.fn()} />);

    // تغيير بيانات النموذج قبل الفتح — المستند يجب أن يعكس القيمة الحالية.
    fireEvent.change(screen.getByLabelText('المبلغ'), { target: { value: '750' } });
    fireEvent.click(screen.getByText(/معاينة دقيقة/));

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const html = generate.mock.calls[0][0];
    expect(html).toContain('المستند — 750');
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('حين يملك النموذج مُركِّبه الخاص (سند قبض / عرض سعر) يُستخدم **هو**، لا مُركِّب بديل', async () => {
    const generate = installBridge();
    const own = vi.fn(() => '<!DOCTYPE html><html><body>مستند السند الأصلي</body></html>');
    render(<FakeForm enabled compose={own} legacyPrint={vi.fn()} />);

    fireEvent.click(screen.getByText(/معاينة دقيقة/));
    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));

    expect(own).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toContain('مستند السند الأصلي');
  });
});

describe('الطباعة — لا تُمسّ', () => {
  it('«طباعة» داخل الحوار تفوّض إلى **نفس** الدالة القديمة مرة واحدة', async () => {
    installBridge();
    const legacyPrint = vi.fn();
    render(<FakeForm enabled legacyPrint={legacyPrint} />);

    fireEvent.click(screen.getByText(/معاينة دقيقة/));
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    await waitFor(() =>
      expect(within(dialog()).getByRole('button', { name: /طباعة/ })).toBeEnabled(),
    );

    fireEvent.click(within(dialog()).getByRole('button', { name: /طباعة/ }));
    await waitFor(() => expect(legacyPrint).toHaveBeenCalledTimes(1));
  });

  it('فتح المعاينة وحده لا يطبع شيئًا', async () => {
    installBridge();
    const legacyPrint = vi.fn();
    render(<FakeForm enabled legacyPrint={legacyPrint} />);

    fireEvent.click(screen.getByText(/معاينة دقيقة/));
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    expect(legacyPrint).not.toHaveBeenCalled();
  });

  it('الإغلاق لا يطبع، ولا يغيّر بيانات النموذج', async () => {
    installBridge();
    const legacyPrint = vi.fn();
    render(<FakeForm enabled legacyPrint={legacyPrint} />);

    fireEvent.change(screen.getByLabelText('المبلغ'), { target: { value: '999' } });
    fireEvent.click(screen.getByText(/معاينة دقيقة/));
    await waitFor(() => expect(dialog()).toBeInTheDocument());

    fireEvent.click(within(dialog()).getByRole('button', { name: /إغلاق/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(legacyPrint).not.toHaveBeenCalled();
    expect(screen.getByLabelText('المبلغ')).toHaveValue('999'); // البيانات كما هي
  });
});

describe('فشل المعاينة لا يمنع الطباعة', () => {
  it('فشل التوليد يعرض خطأ — والنموذج وزر طباعته سليمان', async () => {
    installBridge(false);
    const legacyPrint = vi.fn();
    render(<FakeForm enabled legacyPrint={legacyPrint} />);

    fireEvent.click(screen.getByText(/معاينة دقيقة/));
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toBeInTheDocument());

    fireEvent.click(within(dialog()).getByRole('button', { name: /إغلاق/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('🖨️ طباعة'));
    expect(legacyPrint).toHaveBeenCalledTimes(1);
  });

  it('غياب جسر Electron كليًا لا يكسر النموذج ولا يمنع الطباعة', async () => {
    const legacyPrint = vi.fn();
    render(<FakeForm enabled legacyPrint={legacyPrint} />); // لا window.manar

    fireEvent.click(screen.getByText(/معاينة دقيقة/));
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toBeInTheDocument());

    fireEvent.click(within(dialog()).getByRole('button', { name: /إغلاق/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('🖨️ طباعة'));
    expect(legacyPrint).toHaveBeenCalledTimes(1);
  });
});

// ── حراسة على مستوى المصدر: ما أُضيف، وما لم يُمسّ، وما استُثني ────────────────────
const SRC = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** النماذج التي شملها التعميم — كلٌّ منها يحمل الجديد **ولا يزال** يحمل القديم. */
const ROLLED_OUT = [
  'LeaveRequest', 'PurchaseRequest', 'PaymentVoucher', 'EmployeeWarning', 'Resignation',
  'ReturnToWork', 'SalaryAdvance', 'SalaryCertificate', 'ToWhomItMayConcern',
  'PerformanceEvaluation', 'PayrollPayslip', 'EmploymentContract', 'Quotation',
  'ReceiptVoucher',
];

/** المستثناة صراحةً: طباعة مرتبطة بإزاحات طابعة فعلية، أو Excel/جداول، أو أدوات معايرة. */
const EXCLUDED = ['Cheques', 'BankReconciliation', 'BankSalaryAnalytics'];

describe('التعميم على مستوى المصدر', () => {
  it.each(ROLLED_OUT)('%s: أضاف المعاينة الدقيقة خلف العلم', (name) => {
    const src = read(`pages/${name}.tsx`);
    expect(src).toContain('useAccurateFormPreview');
    expect(src).toContain('UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1');
    expect(src).toMatch(/accurate\w*\.button/);
    expect(src).toMatch(/accurate\w*\.dialog/);
  });

  it.each(ROLLED_OUT)('%s: احتفظ بمعاينته القديمة (لم يُستبدل شيء)', (name) => {
    const src = read(`pages/${name}.tsx`);
    expect(src).toMatch(/preview\.dialog|PrintPreviewDialog/);
  });

  it.each(EXCLUDED)('%s: مستثنى — لا معاينة دقيقة', (name) => {
    expect(read(`pages/${name}.tsx`)).not.toContain('useAccurateFormPreview');
  });

  it('استوديو الشيكات وورقة المعايرة مستثنيان (إزاحات طابعة فعلية)', () => {
    const files = fs
      .readdirSync(path.join(SRC, 'printing'), { recursive: true } as never)
      .filter((f) => String(f).toLowerCase().includes('calibration') && String(f).endsWith('.tsx'));
    for (const f of files) {
      expect(read(path.join('printing', String(f)))).not.toContain('useAccurateFormPreview');
    }
  });
});

describe('انحدار — الفاتورة ومسار الطباعة كما هما', () => {
  it('الفاتورة ما زالت على علمها الخاص، لا على العلم الجديد', () => {
    const src = read('pages/InvoicePreview.tsx');
    expect(src).toContain('TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC');
    expect(src).not.toContain('UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1');
  });

  it('FormLayout.doPrint لم يتغيّر: ما زال يستدعي المسار القديم كما هو', () => {
    const src = read('forms/shared/FormLayout.tsx');
    expect(src).toContain('function doPrint()');
    expect(src).toContain('printIntercept'); // اعتراض المعاينة القديمة باقٍ
    expect(src).toContain('onPrintApiReady'); // النشر الجديد إضافي فقط
  });

  it('لم يُضف محرّك طباعة ثانٍ: لا PDF.js في أي مما لمسناه', () => {
    const src = read('printing/useAccurateFormPreview.tsx');
    expect(src.toLowerCase()).not.toContain('pdfjs');
    expect(src).not.toContain('srcdoc');
  });
});
