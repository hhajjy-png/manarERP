// @vitest-environment jsdom
/**
 * True Chromium WYSIWYG Preview — POC. العقد الذي تحرسه هذه الاختبارات:
 *
 *   1. العلم OFF افتراضيًا — المعاينة المتصلة الحالية تبقى الافتراضي للجميع.
 *   2. الحوار **لا يطبع أبدًا** من تلقاء نفسه: لا أثناء التوليد، ولا عند الفشل،
 *      ولا عند الإغلاق. زر «طباعة» يفوّض لمسار الصفحة القديم مرة واحدة.
 *   3. فشل التوليد يقود إلى مسار تراجع صريح نحو المعاينة الحالية.
 *   4. لا تسريب موارد: blob URL يُلغى عند الإغلاق، والنتيجة المتأخرة تُهمل.
 *   5. زر الفاتورة وحواره POC مقيّدان بالعلم في المصدر، والمُركِّب واحد.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import fs from 'fs';
import path from 'path';
import { flushAsyncUpdates } from './helpers/flush';

import WysiwygPreviewPocDialog from '../printing/components/WysiwygPreviewPocDialog';
import { TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC, isFlagEnabled, setFlagOverride } from '../printing/flags';

// jsdom بلا Object URLs — نزرعهما لنراقب الإنشاء والإلغاء.
const createObjectURL = vi.fn(() => 'blob:mock-pdf-url');
const revokeObjectURL = vi.fn();

type GenerateResult = {
  ok: boolean; pdf?: Uint8Array; pageCount?: number | null; readyMs?: number; error?: string;
};

function installBridge(impl: () => Promise<GenerateResult>) {
  const generate = vi.fn(impl);
  (window as unknown as { manar?: object }).manar = { generateWysiwygPreviewPoc: generate };
  return generate;
}

function renderDialog(overrides: Partial<Parameters<typeof WysiwygPreviewPocDialog>[0]> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    compose: vi.fn(() => '<!DOCTYPE html><html><body>doc</body></html>'),
    onPrint: vi.fn(),
    onFallback: vi.fn(),
    documentLabel: 'فاتورة · INV-1',
    ...overrides,
  };
  const utils = render(<WysiwygPreviewPocDialog {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
  delete (window as unknown as { manar?: object }).manar;
});
afterEach(() => {
  cleanup();
  setFlagOverride(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC, null);
});

describe('العلم — الافتراضي والعزل', () => {
  it('TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC مطفأ افتراضيًا', () => {
    expect(isFlagEnabled(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC)).toBe(false);
  });

  it('override يدوي يفعّله، وإزالته تعيده مطفأ', () => {
    setFlagOverride(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC, true);
    expect(isFlagEnabled(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC)).toBe(true);
    setFlagOverride(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC, null);
    expect(isFlagEnabled(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC)).toBe(false);
  });
});

describe('الحوار — التوليد والعرض', () => {
  it('يولّد عبر جسر Electron من المُركِّب ويعرض PDF بعدد صفحات حقيقي — ولا يطبع', async () => {
    const generate = installBridge(async () => ({ ok: true, pdf: new Uint8Array([37, 68]), pageCount: 3 }));
    const { props } = renderDialog();

    // أثناء التوليد: حالة انتظار، زر الطباعة معطّل، لا طباعة.
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ توليد الصفحات الحقيقية');
    expect(screen.getByRole('button', { name: 'طباعة' })).toBeDisabled();

    await flushAsyncUpdates();
    await waitFor(() => expect(screen.getByTitle('معاينة WYSIWYG')).toBeInTheDocument());

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith('<!DOCTYPE html><html><body>doc</body></html>');
    expect(props.compose).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle('معاينة WYSIWYG')).toHaveAttribute('src', 'blob:mock-pdf-url');
    expect(screen.getByText('3')).toBeInTheDocument(); // الصفحات الفعلية
    // جوهر العقد: التوليد لا يطبع.
    expect(props.onPrint).not.toHaveBeenCalled();
  });

  it('زر «طباعة» يغلق أولًا ثم يفوّض لمسار الصفحة مرة واحدة — والنقر المزدوج لا يكرّر', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }));
    const { props } = renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(screen.getByRole('button', { name: 'طباعة' })).toBeEnabled());

    const btn = screen.getByRole('button', { name: 'طباعة' });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await flushAsyncUpdates();

    expect(props.onClose).toHaveBeenCalled();
    expect(props.onPrint).toHaveBeenCalledTimes(1);
  });

  it('الفشل يعرض الخطأ وزر التراجع إلى المعاينة الحالية — ولا يطبع', async () => {
    installBridge(async () => ({ ok: false, error: 'انتهت مهلة توليد المعاينة' }));
    const { props } = renderDialog();
    await flushAsyncUpdates();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('انتهت مهلة توليد المعاينة');
    expect(screen.getByRole('button', { name: 'طباعة' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'فتح المعاينة الحالية بدلًا منها' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onFallback).toHaveBeenCalledTimes(1);
    expect(props.onPrint).not.toHaveBeenCalled();
  });

  it('بيئة بلا جسر Electron (متصفح) ⇒ حالة خطأ آمنة مع مسار التراجع', async () => {
    // لا window.manar إطلاقًا.
    const { props } = renderDialog();
    await flushAsyncUpdates();
    expect(await screen.findByRole('alert')).toHaveTextContent('تطبيق سطح المكتب');
    expect(props.onPrint).not.toHaveBeenCalled();
  });

  it('Escape يغلق بلا طباعة', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }));
    const { props } = renderDialog();
    await flushAsyncUpdates();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onPrint).not.toHaveBeenCalled();
  });
});

describe('عدّ الصفحات — لا «0» أبدًا', () => {
  it('عدد صفحات حقيقي يُعرض كما هو', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 4 }));
    renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(screen.getByTitle('معاينة WYSIWYG')).toBeInTheDocument());
    expect(screen.getByText(/الصفحات الفعلية/)).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it.each([
    ['null (تعذّر العدّ)', null],
    ['undefined (غائب)', undefined],
    ['0 (لا يجوز أن يُعرض)', 0],
    ['سالب', -3],
    ['كسري', 2.5],
  ])('عدّ غير موثوق (%s) ⇒ لا يُعرض رقم إطلاقًا، ولا «0»', async (_label, pageCount) => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: pageCount as number | null }));
    renderDialog();
    await flushAsyncUpdates();
    // المعاينة تظهر (الصفحات صفحات Chromium — المجهول هو الوصف فقط)
    await waitFor(() => expect(screen.getByTitle('معاينة WYSIWYG')).toBeInTheDocument());
    // …لكن لا تسمية عدد، ولا صفر.
    expect(screen.queryByText(/الصفحات الفعلية/)).not.toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    // والطباعة تبقى متاحة — العدّ المجهول ليس فشلًا.
    expect(screen.getByRole('button', { name: 'طباعة' })).toBeEnabled();
  });
});

describe('التركيز (a11y)', () => {
  it('يُعاد التركيز إلى الزر الذي فتح الحوار عند الإغلاق', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }));
    // زرّ يفتح الحوار — كما في شاشة الفاتورة.
    const trigger = document.createElement('button');
    trigger.textContent = 'فتح';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender, props } = renderDialog();
    await flushAsyncUpdates();
    // الحوار يأخذ التركيز عند الفتح.
    expect(document.activeElement).not.toBe(trigger);

    rerender(<WysiwygPreviewPocDialog {...props} open={false} />);
    // …ويعيده إلى الزرّ عند الإغلاق.
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

describe('الحوار — دورة الحياة والموارد', () => {
  it('الإغلاق يُلغي blob URL', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }));
    const { rerender, props } = renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));

    rerender(
      <WysiwygPreviewPocDialog {...props} open={false} />,
    );
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-pdf-url');
  });

  it('نتيجة تصل بعد الإغلاق تُهمل: لا blob يُنشأ ولا حالة تُلمس', async () => {
    let resolveLate!: (r: GenerateResult) => void;
    installBridge(() => new Promise<GenerateResult>((res) => { resolveLate = res; }));
    const { rerender, props } = renderDialog();

    // أغلق أثناء التوليد…
    rerender(<WysiwygPreviewPocDialog {...props} open={false} />);
    // …ثم تصل النتيجة متأخرة.
    resolveLate({ ok: true, pdf: new Uint8Array([1]), pageCount: 9 });
    await flushAsyncUpdates();

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(props.onPrint).not.toHaveBeenCalled();
  });

  it('تفكيك المكوّن نهائيًا يُلغي blob URL', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }));
    const { unmount } = renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-pdf-url');
  });
});

describe('عزل النطاق — مصدر الفاتورة والمعاينة الحالية', () => {
  const invoiceSrc = fs.readFileSync(
    path.resolve(__dirname, '../pages/InvoicePreview.tsx'),
    'utf-8',
  );

  it('زر POC وحواره مقيّدان بالعلم، والمعاينة الحالية غير مشروطة به', () => {
    expect(invoiceSrc).toContain('isFlagEnabled(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC)');
    // الزر والحوار كلاهما خلف useWysiwygPoc.
    expect(invoiceSrc.match(/\{useWysiwygPoc && \(/g)?.length).toBe(2);
    // المعاينة المتصلة الحالية باقية على علمها الأصلي، لا على علم POC.
    expect(invoiceSrc).toContain('usePrintCenterInvoice = isPhase2Enabled(PRINT_CENTER_PHASE2_INVOICE)');
  });

  it('POC يستهلك نفس المُركِّب composeInvoicePreview ويطبع عبر printCurrentView نفسه', () => {
    const pocBlock = invoiceSrc.slice(invoiceSrc.indexOf('WysiwygPreviewPocDialog'));
    expect(pocBlock).toContain('compose={composeInvoicePreview}');
    expect(pocBlock).toContain('onPrint={() => printCurrentView()}');
    // لا مُركِّب ثانٍ للفاتورة في الملف.
    expect(invoiceSrc.match(/composeStyledFromNode\(/g)?.length).toBe(1);
  });

  it('حوار POC لا يعرف أي IPC طباعة: لا printPage ولا print:submit ولا webContents', () => {
    const dialogSrc = fs.readFileSync(
      path.resolve(__dirname, '../printing/components/WysiwygPreviewPocDialog.tsx'),
      'utf-8',
    );
    expect(dialogSrc).not.toContain('printPage');
    expect(dialogSrc).not.toContain('print:submit');
    expect(dialogSrc).not.toContain('webContents');
    expect(dialogSrc).not.toContain('pdfjs');
  });
});
