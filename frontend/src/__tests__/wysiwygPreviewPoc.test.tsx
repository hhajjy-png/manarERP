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

import WysiwygPreviewPocDialog, {
  DEFAULT_VIEWER_ZOOM,
  VIEWER_ZOOM_LEVELS,
  stepZoom,
  toViewerUrl,
} from '../printing/components/WysiwygPreviewPocDialog';
import { TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC, isFlagEnabled, setFlagOverride } from '../printing/flags';

// jsdom بلا Object URLs — نزرعهما لنراقب الإنشاء والإلغاء.
const createObjectURL = vi.fn(() => 'blob:mock-pdf-url');
const revokeObjectURL = vi.fn();

type GenerateResult = {
  ok: boolean; pdf?: Uint8Array; pageCount?: number | null; readyMs?: number; error?: string;
};

let activate: ReturnType<typeof vi.fn>;
let deactivate: ReturnType<typeof vi.fn>;

function installBridge(impl: () => Promise<GenerateResult>, tokenSeq: Array<number | null> = [7]) {
  const generate = vi.fn(impl);
  let i = 0;
  activate = vi.fn(async () => tokenSeq[Math.min(i++, tokenSeq.length - 1)]);
  deactivate = vi.fn(async () => true);
  (window as unknown as { manar?: object }).manar = {
    generateWysiwygPreviewPoc: generate,
    wysiwygViewerActivate: activate,
    wysiwygViewerDeactivate: deactivate,
  };
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
  it('TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC مُفعَّل افتراضيًا (التفعيل الرسمي)', () => {
    expect(isFlagEnabled(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC)).toBe(true);
  });

  it('تجاوز المحطة ما زال يعمل: off يُطفئه، وإزالة التجاوز تعيده إلى الافتراضي (ON)', () => {
    setFlagOverride(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC, false); // رافعة التراجع الفوري
    expect(isFlagEnabled(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC)).toBe(false);
    setFlagOverride(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC, true);
    expect(isFlagEnabled(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC)).toBe(true);
    setFlagOverride(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC, null);
    expect(isFlagEnabled(TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC)).toBe(true); // الافتراضي المشحون
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
    await waitFor(() => expect(screen.getByTitle('معاينة دقيقة')).toBeInTheDocument());

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith('<!DOCTYPE html><html><body>doc</body></html>');
    expect(props.compose).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle('معاينة دقيقة')).toHaveAttribute('src', 'blob:mock-pdf-url#toolbar=0&zoom=100');
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

describe('PDFium — إخفاء شريط العارض (#toolbar=0)', () => {
  it('الـ iframe يتلقّى عنوانًا منتهيًا بـ #toolbar=0', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }));
    renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(screen.getByTitle('معاينة دقيقة')).toBeInTheDocument());

    const src = screen.getByTitle('معاينة دقيقة').getAttribute('src') ?? '';
    expect(src).toContain('toolbar=0');
    expect(src).toBe('blob:mock-pdf-url#toolbar=0&zoom=100');
    // جزء واحد فقط — لا تكرار.
    expect(src.match(/#/g)).toHaveLength(1);
  });

  it('الجزء يبقى بعد توليد ناجح (لا يُفقد عند إعادة الرسم)', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 3 }));
    const { rerender, props } = renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(screen.getByTitle('معاينة دقيقة')).toBeInTheDocument());
    rerender(<WysiwygPreviewPocDialog {...props} documentLabel="فاتورة · INV-2" />);
    expect(screen.getByTitle('معاينة دقيقة')).toHaveAttribute('src', 'blob:mock-pdf-url#toolbar=0&zoom=100');
  });

  it('يُلغى الـ blob URL **الخام** — لا النسخة المذيّلة بالجزء (وإلا تسرّب المستند)', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }));
    const { rerender, props } = renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));

    rerender(<WysiwygPreviewPocDialog {...props} open={false} />);

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-pdf-url');
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:mock-pdf-url#toolbar=0');
    for (const [arg] of revokeObjectURL.mock.calls) {
      expect(String(arg)).not.toContain('#');
    }
  });
});

describe('حارس اختصارات PDFium — جسر نشاط العارض', () => {
  it('الفتح يُسلّح الحارس، والإغلاق يُحرّره بالرمز الذي يملكه', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }), [7]);
    const { rerender, props } = renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(screen.getByTitle('معاينة دقيقة')).toBeInTheDocument());

    expect(activate).toHaveBeenCalledTimes(1);
    expect(deactivate).not.toHaveBeenCalled(); // ما زال مفتوحًا ⇒ الحارس مسلّح

    rerender(<WysiwygPreviewPocDialog {...props} open={false} />);
    await flushAsyncUpdates();
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(deactivate).toHaveBeenCalledWith(7); // رمز هذا الحوار بعينه
  });

  it('التفكيك النهائي يُحرّر الحارس أيضًا (لا جلسة معلّقة)', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }), [11]);
    const { unmount } = renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(activate).toHaveBeenCalledTimes(1));
    unmount();
    await flushAsyncUpdates();
    expect(deactivate).toHaveBeenCalledWith(11);
  });

  /** الإغلاق أثناء **التسليح** نفسه: الرمز مُنح ولم يُخزَّن — يجب ألا يبقى الحارس مسلّحًا. */
  it('الإغلاق أثناء التسليح يُحرّر الرمز الممنوح — لا حارس يتيم', async () => {
    const generate = installBridge(
      async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }),
      [21],
    );
    const { rerender, props } = renderDialog();
    // أُغلق قبل أي flush — أي بينما لم يُحسم وعد wysiwygViewerActivate بعد.
    rerender(<WysiwygPreviewPocDialog {...props} open={false} />);
    await flushAsyncUpdates();

    expect(activate).toHaveBeenCalledTimes(1);
    // الرمز مُنح ولم يُخزَّن قط — ومع ذلك حُرّر. بدون هذا التحرير يبقى الحارس مسلّحًا
    // بلا حوار مفتوح، فيُكبت Ctrl+P/Ctrl+S في كل التطبيق إلى الأبد.
    expect(deactivate).toHaveBeenCalledWith(21);
    // وقد أُجهض الطلب قبل التوليد أصلًا: لا مستند يُركَّب، ولا blob يُنشأ.
    expect(generate).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('بيئة بلا جسر حارس (preload قديم) لا تُسقط المعاينة', async () => {
    const generate = vi.fn(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }));
    // preload قديم: قناة التوليد موجودة، وقنوات الحارس غائبة.
    (window as unknown as { manar?: object }).manar = { generateWysiwygPreviewPoc: generate };
    renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(screen.getByTitle('معاينة دقيقة')).toBeInTheDocument());
    expect(screen.getByTitle('معاينة دقيقة')).toHaveAttribute('src', 'blob:mock-pdf-url#toolbar=0&zoom=100');
  });

  it('الحارس لا يمنع زر الطباعة الرسمي — التفويض يبقى مرة واحدة', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }));
    const { props } = renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(screen.getByRole('button', { name: 'طباعة' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'طباعة' }));
    await flushAsyncUpdates();
    expect(props.onPrint).toHaveBeenCalledTimes(1);
  });

  /** الكبت يحدث في العملية الرئيسية (before-input-event) — الحوار لا يطبع ولا يحفظ ردًّا على المفاتيح. */
  it.each([
    ['Ctrl+P', { key: 'p', ctrlKey: true }],
    ['Ctrl+S', { key: 's', ctrlKey: true }],
    ['Meta+P', { key: 'p', metaKey: true }],
    ['Meta+S', { key: 's', metaKey: true }],
  ])('%s داخل الحوار لا يستدعي الطباعة ولا أي إجراء حفظ', async (_label, key) => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }));
    const { props } = renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(screen.getByTitle('معاينة دقيقة')).toBeInTheDocument());

    fireEvent.keyDown(screen.getByRole('dialog'), key);
    await flushAsyncUpdates();

    expect(props.onPrint).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled(); // الكبت صامت: لا إغلاق، ولا خطأ، ولا بديل
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('التكبير — جزء العنوان فقط، بلا إعادة توليد', () => {
  const src = () => screen.getByTitle('معاينة دقيقة').getAttribute('src') ?? '';
  const zoomIn  = () => fireEvent.click(screen.getByRole('button', { name: 'تكبير' }));
  const zoomOut = () => fireEvent.click(screen.getByRole('button', { name: 'تصغير' }));
  const fit     = () => fireEvent.click(screen.getByRole('button', { name: /ملاءمة/ }));
  const reset   = () => fireEvent.click(screen.getByRole('button', { name: 'إعادة ضبط' }));

  async function ready() {
    const g = installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 2 }));
    const utils = renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(screen.getByTitle('معاينة دقيقة')).toBeInTheDocument());
    return { generate: g, ...utils };
  }

  it('toViewerUrl يبني الجزء من الـ blob الخام — لا تكرار ولا قيم مخترعة', () => {
    expect(toViewerUrl('blob:x', 100)).toBe('blob:x#toolbar=0&zoom=100');
    expect(toViewerUrl('blob:x', 50)).toBe('blob:x#toolbar=0&zoom=50');
    expect(toViewerUrl('blob:x', 200)).toBe('blob:x#toolbar=0&zoom=200');
    expect(toViewerUrl('blob:x', 'fit')).toBe('blob:x#toolbar=0&view=FitH');
    for (const z of VIEWER_ZOOM_LEVELS) {
      expect(toViewerUrl('blob:x', z).match(/#/g)).toHaveLength(1);
      expect(toViewerUrl('blob:x', z)).toContain('toolbar=0');
    }
  });

  it('stepZoom يتحرّك ضمن النسب المدعومة فقط، ويتوقّف عند الطرفين', () => {
    expect(stepZoom(100, 1)).toBe(125);
    expect(stepZoom(100, -1)).toBe(75);
    expect(stepZoom(200, 1)).toBe(200);
    expect(stepZoom(50, -1)).toBe(50);
    expect(stepZoom('fit', 1)).toBe(125);
    expect(stepZoom('fit', -1)).toBe(75);
  });

  it('الافتراضي 100% ويظهر في الشريط وفي الجزء', async () => {
    await ready();
    expect(src()).toBe('blob:mock-pdf-url#toolbar=0&zoom=100');
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(DEFAULT_VIEWER_ZOOM).toBe(100);
  });

  it('تكبير/تصغير يعبر كل النسب المدعومة', async () => {
    await ready();
    zoomIn();  expect(src()).toContain('zoom=125');
    zoomIn();  expect(src()).toContain('zoom=150');
    zoomIn();  expect(src()).toContain('zoom=175');
    zoomIn();  expect(src()).toContain('zoom=200');
    zoomIn();  expect(src()).toContain('zoom=200');
    zoomOut(); expect(src()).toContain('zoom=175');
    for (let i = 0; i < 6; i++) zoomOut();
    expect(src()).toContain('zoom=50');
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('«ملاءمة» تستخدم وضع Chromium المدعوم view=FitH', async () => {
    await ready();
    fit();
    expect(src()).toBe('blob:mock-pdf-url#toolbar=0&view=FitH');
    expect(screen.getByRole('button', { name: /ملاءمة/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('«إعادة ضبط» تعود إلى 100% (من التكبير ومن الملاءمة)', async () => {
    await ready();
    zoomIn(); zoomIn();
    expect(src()).toContain('zoom=150');
    reset();
    expect(src()).toBe('blob:mock-pdf-url#toolbar=0&zoom=100');
    fit();
    expect(src()).toContain('view=FitH');
    reset();
    expect(src()).toBe('blob:mock-pdf-url#toolbar=0&zoom=100');
    expect(screen.getByRole('button', { name: 'إعادة ضبط' })).toBeDisabled();
  });

  it('التكبير لا يُعيد التوليد ولا يُنشئ Blob جديدًا ولا يستدعي IPC', async () => {
    const { generate } = await ready();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledTimes(1);

    zoomIn(); zoomIn(); zoomOut(); fit(); reset();
    await flushAsyncUpdates();

    expect(generate).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(activate).toHaveBeenCalledTimes(1);
    expect(deactivate).not.toHaveBeenCalled();
  });

  /**
   * العيب الذي عولج (وقد فات الاختبارات السابقة).
   *
   * PDFium يقرأ الجزء (`#…zoom=`) **عند تحميل سياق التصفّح فقط**. تغيير `src` على إطار
   * حيّ تتجاهله الإضافة تمامًا — قِيس في التطبيق الحقيقي: عرض الصفحة المرسومة بقي 713px
   * عند 100% و125% و175%. لذلك لا يكفي التحقّق من نصّ العنوان (`toContain('zoom=125')`):
   * كان يمرّ بينما لا شيء يتغيّر على الشاشة.
   *
   * العلاج: `key` مرتبط بعنوان العارض ⇒ React يفكّك الإطار القديم ويركّب إطارًا جديدًا.
   * هذه الاختبارات تتحقّق من **استبدال العقدة فعلًا**، لا من تغيّر السلسلة.
   */
  it('التكبير يستبدل عقدة الـ iframe فعلًا (سياق تصفّح جديد يقرأ الجزء)', async () => {
    await ready();
    const before = screen.getByTitle('معاينة دقيقة');
    expect(before.getAttribute('src')).toContain('zoom=100');

    zoomIn();
    const after = screen.getByTitle('معاينة دقيقة');

    // العقدة نفسها استُبدلت — لا مجرّد تغيّر خاصية src على إطار حيّ.
    expect(after).not.toBe(before);
    expect(before.isConnected).toBe(false); // الإطار القديم أُزيل من الـ DOM
    expect(after.isConnected).toBe(true);
    expect(after.getAttribute('src')).toContain('zoom=125');
  });

  it('كل خطوة تكبير/ملاءمة/إعادة ضبط تُنتج إطارًا جديدًا بالجزء المقصود', async () => {
    await ready();
    const seen = new Set<Element>();
    const record = () => {
      const el = screen.getByTitle('معاينة دقيقة');
      seen.add(el);
      return el.getAttribute('src') ?? '';
    };
    expect(record()).toContain('zoom=100');

    zoomIn();          expect(record()).toContain('zoom=125');
    zoomIn();          expect(record()).toContain('zoom=150');
    zoomOut();         expect(record()).toContain('zoom=125');
    fit();             expect(record()).toContain('view=FitH');
    reset();           expect(record()).toContain('zoom=100');

    // ستّ حالات ⇒ ستّ عقد مختلفة (لا إعادة استخدام لإطار حيّ).
    expect(seen.size).toBe(6);
  });

  it('إعادة التركيب لا تمسّ دورة حياة الـ Blob ولا الجلسة', async () => {
    const { rerender, props } = await ready();
    const blobBefore = screen.getByTitle('معاينة دقيقة').getAttribute('src')?.split('#')[0];

    zoomIn(); fit(); reset();
    await flushAsyncUpdates();

    const blobAfter = screen.getByTitle('معاينة دقيقة').getAttribute('src')?.split('#')[0];
    expect(blobAfter).toBe(blobBefore);              // نفس الـ Blob الخام
    expect(createObjectURL).toHaveBeenCalledTimes(1); // لا Blob إضافي
    expect(revokeObjectURL).not.toHaveBeenCalled();   // لا إلغاء أثناء إعادة التركيب
    expect(deactivate).not.toHaveBeenCalled();        // الجلسة والحارس باقيان

    // …والإغلاق النهائي يُلغي الـ Blob **مرة واحدة** بالعنوان الخام.
    rerender(<WysiwygPreviewPocDialog {...props} open={false} />);
    await flushAsyncUpdates();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-pdf-url');
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  it('التكبير لا يمسّ الطباعة: الزر الرسمي يفوّض مرة واحدة بلا وسائط', async () => {
    const { props } = await ready();
    zoomIn(); fit();
    fireEvent.click(screen.getByRole('button', { name: 'طباعة' }));
    await flushAsyncUpdates();
    expect(props.onPrint).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onPrint).mock.calls[0]).toEqual([]);
  });

  it('كل فتحة تبدأ من 100% (لا يتسرّب تكبير من فتحة سابقة)', async () => {
    const { rerender, props } = await ready();
    zoomIn(); zoomIn();
    expect(src()).toContain('zoom=150');
    rerender(<WysiwygPreviewPocDialog {...props} open={false} />);
    await flushAsyncUpdates();
    rerender(<WysiwygPreviewPocDialog {...props} open />);
    await flushAsyncUpdates();
    await waitFor(() => expect(screen.getByTitle('معاينة دقيقة')).toBeInTheDocument());
    expect(src()).toBe('blob:mock-pdf-url#toolbar=0&zoom=100');
  });

  it('أزرار التكبير معطّلة قبل جاهزية المستند', () => {
    installBridge(() => new Promise<GenerateResult>(() => {}));
    renderDialog();
    expect(screen.getByRole('button', { name: 'تكبير' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'تصغير' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /ملاءمة/ })).toBeDisabled();
  });

  it('الشريط يملكه manarERP: أصناف ExplorerKit نفسها، ولا شريط PDFium', async () => {
    const { container } = await ready();
    expect(container.querySelectorAll('.pc-icon-btn').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.pc-toolbar-group--zoom')).toBeInTheDocument();
    expect(container.querySelector('.pc-btn--primary')).toBeInTheDocument();
    expect(container.querySelector('.pc-btn--close')).toBeInTheDocument();
    expect(src()).toContain('toolbar=0');
  });

  it('الاتجاه: الشريط يرث dir من الحوار (RTL عربي / LTR إنجليزي)', async () => {
    await ready();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('dir', 'rtl');
    const toolbar = dialog.querySelector('.pc-toolbar');
    expect(toolbar).toBeInTheDocument();
    expect(toolbar?.closest('[dir="rtl"]')).toBe(dialog);
  });
});

describe('جاهزية الإنتاج — التسمية وسطح الشريط', () => {
  const invoiceSrc = fs.readFileSync(path.resolve(__dirname, '../pages/InvoicePreview.tsx'), 'utf-8');
  const dialogSrc = fs.readFileSync(
    path.resolve(__dirname, '../printing/components/WysiwygPreviewPocDialog.tsx'),
    'utf-8',
  );
  const css = fs.readFileSync(
    path.resolve(__dirname, '../printing/components/PrintCenter.css'),
    'utf-8',
  );

  /** الميزة صارت مُفعَّلة افتراضيًا — أي أثر «تجريبي» في الواجهة صار كذبًا على المستخدم. */
  it('لا رمز تجارب ولا كلمة «تجريبي» ولا اختصار WYSIWYG في أي نص يراه المستخدم', () => {
    // زرّ الفاتورة
    expect(invoiceSrc).toContain('📄 معاينة دقيقة');
    expect(invoiceSrc).not.toContain('🧪');
    expect(invoiceSrc).not.toContain('معاينة WYSIWYG');

    // نصوص الحوار المرئية (خارج التعليقات)
    const visible = dialogSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\/.*$/gm, '');
    expect(visible).not.toContain('تجريبي');
    expect(visible).not.toMatch(/aria-label="[^"]*WYSIWYG/);
    expect(visible).toContain('aria-label="معاينة دقيقة"');
  });

  it('الحوار يحمل الاسم الإنتاجي المتاح لقارئ الشاشة', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 1 }));
    renderDialog();
    await flushAsyncUpdates();
    expect(screen.getByRole('dialog', { name: 'معاينة دقيقة' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTitle('معاينة دقيقة')).toBeInTheDocument());
  });

  /**
   * العيب الذي عولج: رموز `--xpl-*` تُعرَّف داخل `.xpl-scope` فقط، وشاشة الفاتورة لا
   * تفتح ذلك النطاق — فكان `background: var(--xpl-surface)` ينهار إلى `transparent`
   * وتظهر الفاتورة من خلف شريط الأدوات. الحلّ: إعادة ربط الرموز على جذر الحوار من
   * رموز السمة العامة، فتعمل السطوح في الوضعين الفاتح والداكن.
   */
  it('جذر الحوار يُعرّف رموز ExplorerKit من رموز السمة العامة (سطح غير شفاف)', () => {
    const scrim = /\.pc-scrim\s*\{([\s\S]*?)\}/.exec(css);
    expect(scrim).not.toBeNull();
    const body = scrim![1];
    expect(body).toMatch(/--xpl-surface:\s*var\(--surface\)/);
    expect(body).toMatch(/--xpl-bg:\s*var\(--bg\)/);
    expect(body).toMatch(/--xpl-text:\s*var\(--text\)/);
    expect(body).toMatch(/--xpl-border:\s*var\(--border\)/);
    expect(body).toMatch(/--xpl-red:\s*var\(--red\)/);
  });

  it('السطوح تستهلك الرموز — لا لون مكتوب يدويًا في خلفية الحوار/الشريط', () => {
    expect(css).toMatch(/\.pc-dialog\s*\{[^}]*background:\s*var\(--xpl-surface\)/);
    expect(css).toMatch(/\.pc-toolbar\s*\{[^}]*background:\s*var\(--xpl-bg\)/);
    // زر الطباعة يبقى على رمز المنتج الأساسي (إنديغو)، وزر الإغلاق يتحوّل للخطر عند التحويم.
    expect(css).toMatch(/\.pc-btn--primary\s*\{[^}]*var\(--xpl-primary\)/);
    expect(css).toMatch(/\.pc-btn--close:hover[^{]*\{[^}]*var\(--xpl-red\)/);
  });

  it('مكوّن الحوار نفسه بلا ألوان مكتوبة يدويًا (رموز فقط)', () => {
    const visible = dialogSrc.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(visible).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(visible).not.toMatch(/rgba?\(/);
  });
});

describe('عدّ الصفحات — لا «0» أبدًا', () => {
  it('عدد صفحات حقيقي يُعرض كما هو', async () => {
    installBridge(async () => ({ ok: true, pdf: new Uint8Array([1]), pageCount: 4 }));
    renderDialog();
    await flushAsyncUpdates();
    await waitFor(() => expect(screen.getByTitle('معاينة دقيقة')).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByTitle('معاينة دقيقة')).toBeInTheDocument());
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

    // انتظر حتى يصير التوليد **قيد التنفيذ فعلًا** (التسليح يسبقه بدورة microtask)…
    await flushAsyncUpdates();
    // …ثم أغلق أثناء التوليد.
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
