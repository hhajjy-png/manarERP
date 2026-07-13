// @vitest-environment jsdom
/**
 * Cheque Calibration Test Sheet Preview Overlay v1.
 *
 * العقد الذي تحرسه هذه الاختبارات:
 *
 *   المعاينة **طبقة عرض**. الطباعة **لم تتغيّر**.
 *
 * أي تغيير يجعل المعاينة تطبع بنفسها — أو يجعلها تبني ورقة معايرة ثانية بهندسة خاصة —
 * يجب أن يُسقط اختبارًا هنا.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { flushAsyncUpdates } from './helpers/flush';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
vi.mock('../utils/print', () => ({ printCurrentView: vi.fn(() => Promise.resolve()) }));

import { api } from '../api/client';
import { printCurrentView } from '../utils/print';
import ChequeCalibrator from '../components/ChequeCalibrator';
import { cloneDefaultTemplate } from '../utils/chequeTemplate';
import { DEFAULT_GEOMETRY } from '../utils/chequeGeometry';
import { composeCalibrationTestDocument } from '../components/calibrator/calibrationTestDocument';
import { CHEQUE_CALIBRATION_TEST_PREVIEW_V1, setFlagOverride } from '../printing/flags';

function mockGetByRoute(geometry: unknown = { ...DEFAULT_GEOMETRY }) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/cheques/template-versions')) return { data: { data: [] } } as never;
    if (url === '/cheques/calibration-geometry') return { data: { data: geometry } } as never;
    throw new Error(`استدعاء GET غير متوقّع في الاختبار: ${url}`);
  });
}

function renderStudio() {
  return render(
    <ChequeCalibrator
      banks={['NBK']}
      initialBank="NBK"
      loadedTemplates={{ NBK: cloneDefaultTemplate() }}
      previewData={{ beneficiaryName: '', chequeDate: '', tafqeetText: '', numericText: '' }}
      onSaved={() => {}}
      onClose={() => {}}
      isSystemAdmin
    />,
  );
}

const testPrintButton = () => screen.getByRole('button', { name: /اختبار المعايرة/ });
/** أزرار النافذة تُستعلَم **داخلها** — «إغلاق» موجود في شريط الاستوديو أيضًا. */
const previewDialog = () => screen.getByRole('dialog', { name: 'معاينة اختبار المعايرة' });
const previewPrintButton = () => within(previewDialog()).getByRole('button', { name: 'طباعة' });
const previewCloseButton = () => within(previewDialog()).getByRole('button', { name: 'إغلاق' });

/** يفتح المعاينة وينتظر تركيب المستند داخل الـ iframe. */
async function openPreview() {
  fireEvent.click(testPrintButton());
  await flushAsyncUpdates();
}

async function mountAndOpen() {
  const utils = renderStudio();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/cheques/calibration-geometry'));
  await flushAsyncUpdates();
  await openPreview();
  return utils;
}

describe('معاينة اختبار المعايرة — الفتح', () => {
  beforeEach(() => { vi.clearAllMocks(); mockGetByRoute(); });
  afterEach(cleanup);

  it('النقر على «اختبار المعايرة» يفتح المعاينة ولا يطبع فورًا', async () => {
    await mountAndOpen();

    const dialog = screen.getByRole('dialog', { name: 'معاينة اختبار المعايرة' });
    expect(dialog).toBeInTheDocument();
    // هذا هو جوهر الميزة: لا طباعة عند النقر.
    expect(printCurrentView).not.toHaveBeenCalled();
  });

  it('تعرض المستند القانوني نفسه — ورقة الاختبار المُصيَّرة، لا نسخة مُعاد بناؤها', async () => {
    await mountAndOpen();

    const frame = document.querySelector('iframe.pc-frame') as HTMLIFrameElement;
    expect(frame).toBeInTheDocument();

    const doc = frame.getAttribute('srcdoc') ?? '';
    // نفس الورقة: الـ SVG بمقاس الهندسة الفعلية، والمسطرة، والصليب المركزي، وحافة الإدخال.
    expect(doc).toContain('chq-test-sheet');
    expect(doc).toContain(`viewBox="0 0 ${DEFAULT_GEOMETRY.pageWidthMm} ${DEFAULT_GEOMETRY.pageHeightMm}"`);
    expect(doc).toContain('chq-ruler-frame');
    expect(doc).toContain('chq-centre-cross');
    expect(doc).toContain('chq-test-feededge');
    expect(doc).toContain('chq-test-outline');
    // ولا إحداثية فاسدة واحدة تسرّبت إلى المعاينة.
    expect(doc).not.toMatch(/NaN/);
  });

  it('ورقة واحدة — لا صفحة ثانية وهمية ولا ملاحظة «عرض متصل»', async () => {
    await mountAndOpen();

    // الورقة صفحة واحدة، وتُعلَن كذلك. الملاحظة المضلّلة عن التقسيم لا تظهر إلا عند
    // تعدّد الصفحات — ولا مكان لها هنا.
    expect(within(previewDialog()).getAllByText(/الصفحات التقديرية/)[0].textContent).toContain('1');
    expect(screen.queryByText(/عرض متصل/)).not.toBeInTheDocument();

    // علامة القياس موجودة: عدد الصفحات يُقاس من الورقة نفسها لا من صندوق الـ iframe.
    expect(
      (document.querySelector('iframe.pc-frame') as HTMLIFrameElement).getAttribute('srcdoc'),
    ).toContain('data-print-root');
  });

  it('صندوق ورقة المعاينة يتبع الهندسة المحفوظة، لا A4 ثابتًا', async () => {
    // مسؤول النظام غيّر مقاس الورق: المعاينة يجب أن تتبعه كما يتبعه `@page`.
    mockGetByRoute({ ...DEFAULT_GEOMETRY, pageWidthMm: 320, pageHeightMm: 220 });
    await mountAndOpen();

    const frame = document.querySelector('iframe.pc-frame') as HTMLIFrameElement;
    const MM_TO_PX = 96 / 25.4;
    // عرض الـ iframe = عرض الورقة الفعلي بالبكسل (لا 297مم الافتراضي، ولا 210مم A4).
    expect(frame.style.width).toBe(`${Math.round(320 * MM_TO_PX)}px`);
    expect(frame.style.height).toBe(`${Math.round(220 * MM_TO_PX)}px`);
    expect(frame.getAttribute('srcdoc')).toContain('viewBox="0 0 320 220"');
  });
});

describe('معاينة اختبار المعايرة — الطباعة', () => {
  beforeEach(() => { vi.clearAllMocks(); mockGetByRoute(); });
  afterEach(cleanup);

  it('«طباعة» بداخل المعاينة تستدعي مسار الطباعة القديم نفسه — مرة واحدة، بلا كتابة', async () => {
    await mountAndOpen();
    fireEvent.click(previewPrintButton());
    await flushAsyncUpdates();

    expect(printCurrentView).toHaveBeenCalledTimes(1);
    // لا محرّك طباعة بديل: لا PDF، لا نافذة مخفيّة، لا IPC آخر.
    expect(window.manar).toBeUndefined();
    // ولا سجلّ، ولا حفظ، ولا وسم شيك.
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('تُغلق المعاينة قبل الطباعة — فلا تُطبع النافذة نفسها', async () => {
    await mountAndOpen();
    expect(screen.queryByRole('dialog')).toBeInTheDocument();

    fireEvent.click(previewPrintButton());
    await flushAsyncUpdates();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(printCurrentView).toHaveBeenCalledTimes(1);
  });

  it('التكبير لا يغيّر شيئًا في مسار الطباعة ولا في قيم المعايرة', async () => {
    await mountAndOpen();

    const svgBefore = (document.querySelector('.chq-calib-testprint svg') as SVGElement).outerHTML;

    fireEvent.click(screen.getByRole('button', { name: 'تكبير' }));
    fireEvent.click(screen.getByRole('button', { name: 'تكبير' }));
    await flushAsyncUpdates();

    // الورقة المطبوعة (الطبقة المخفيّة) لم تتغيّر بمقدار بكسل واحد بفعل التكبير.
    expect((document.querySelector('.chq-calib-testprint svg') as SVGElement).outerHTML).toBe(svgBefore);

    fireEvent.click(previewPrintButton());
    await flushAsyncUpdates();
    // والطباعة نفسها: نداء واحد بلا وسائط — التكبير شأن شاشة بحت.
    expect(printCurrentView).toHaveBeenCalledTimes(1);
    expect(vi.mocked(printCurrentView).mock.calls[0]).toEqual([]);
  });
});

describe('معاينة اختبار المعايرة — الإغلاق', () => {
  beforeEach(() => { vi.clearAllMocks(); mockGetByRoute(); });
  afterEach(cleanup);

  it('الإغلاق لا يطبع، ويُبقي حالة الصفحة كما هي', async () => {
    await mountAndOpen();
    fireEvent.click(previewCloseButton());
    await flushAsyncUpdates();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(printCurrentView).not.toHaveBeenCalled();
    // الاستوديو ما زال قائمًا وقابلًا لإعادة الفتح.
    expect(testPrintButton()).toBeInTheDocument();
  });

  it('Escape يُغلق المعاينة بلا طباعة', async () => {
    await mountAndOpen();
    fireEvent.keyDown(previewDialog(), { key: 'Escape' });
    await flushAsyncUpdates();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(printCurrentView).not.toHaveBeenCalled();
  });

  it('يُعاد التركيز إلى زرّ «اختبار المعايرة» بعد الإغلاق، ويمكن إعادة الفتح', async () => {
    await mountAndOpen();
    fireEvent.click(previewCloseButton());
    await flushAsyncUpdates();
    expect(document.activeElement).toBe(testPrintButton());

    await openPreview();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(printCurrentView).not.toHaveBeenCalled();
  });
});

describe('معاينة اختبار المعايرة — عزل النطاق والتراجع', () => {
  afterEach(() => { cleanup(); setFlagOverride(CHEQUE_CALIBRATION_TEST_PREVIEW_V1, null); });
  beforeEach(() => { vi.clearAllMocks(); mockGetByRoute(); });

  it('العلم مطفأ ⇒ الزرّ يطبع مباشرة كما كان، ولا حوار يُصيَّر إطلاقًا', async () => {
    setFlagOverride(CHEQUE_CALIBRATION_TEST_PREVIEW_V1, false);

    renderStudio();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/cheques/calibration-geometry'));
    await flushAsyncUpdates();

    fireEvent.click(testPrintButton());
    await flushAsyncUpdates();

    expect(printCurrentView).toHaveBeenCalledTimes(1); // السلوك القديم حرفًا بحرف
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('طبقة الطباعة المخفيّة وقواعد @page لم تتغيّر بوجود المعاينة', async () => {
    const { container } = await mountAndOpen();

    // الطبقة المخفيّة ما زالت هي مصدر الطباعة.
    const layer = container.querySelector('.chq-calib-testprint') as HTMLElement;
    expect(layer).toBeInTheDocument();
    expect(layer.style.display).toBe('none');

    const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('\n');
    // @page مشتقّ من الهندسة، بهامش صفر — كما كان تمامًا.
    expect(css).toContain(
      `@page { size: ${DEFAULT_GEOMETRY.pageWidthMm}mm ${DEFAULT_GEOMETRY.pageHeightMm}mm; margin: 0; }`,
    );
    // ولا قاعدة طباعة جديدة أُضيفت للمعاينة: عزلها يملكه PrintCenter.css.
    expect(css).not.toContain('.pc-scrim');
  });
});

describe('composeCalibrationTestDocument — مصدر واحد، وإخفاق صريح', () => {
  it('يُسلسل العقدة الحيّة دون أن يمسّها، وبلا أنماط تطبيق مُحقونة', () => {
    const node = document.createElement('div');
    node.className = 'chq-test-sheet';
    node.style.width = '297mm';
    node.style.height = '210mm';
    node.innerHTML = '<svg viewBox="0 0 297 210"><line x1="0" y1="0" x2="10" y2="0"/></svg>';

    const html = composeCalibrationTestDocument(node);

    expect(html).toContain('viewBox="0 0 297 210"');
    expect(html).toContain('297mm');
    expect(html).toContain('dir="rtl"');
    // مستند شاشة فقط: لا @page، ولا قواعد طباعة — الطباعة لا تمرّ من هنا.
    expect(html).not.toContain('@page');
    expect(html).not.toContain('@media print');
    // الـ DOM الحيّ (وهو المطبوع) لم يُمسّ.
    expect(node.querySelector('svg')).not.toBeNull();
    expect(node.style.width).toBe('297mm');
  });

  it('يرمي خطأً عربيًا — ولا يُرجع مستندًا ناقصًا — حين تغيب الورقة أو الـ SVG', () => {
    expect(() => composeCalibrationTestDocument(null)).toThrow(/تعذّر تجهيز ورقة اختبار المعايرة/);

    const empty = document.createElement('div');
    empty.className = 'chq-test-sheet'; // لا SVG بداخله
    expect(() => composeCalibrationTestDocument(empty)).toThrow(/تعذّر تجهيز ورقة اختبار المعايرة/);
  });
});
