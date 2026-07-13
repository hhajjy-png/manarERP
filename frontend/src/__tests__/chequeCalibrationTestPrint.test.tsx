// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { flushAsyncUpdates } from './helpers/flush';

// The calibrator talks to the api client and the print helper — mock both so we
// can assert the test-print button prints WITHOUT touching any cheque record.
vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
vi.mock('../utils/print', () => ({ printCurrentView: vi.fn(() => Promise.resolve()) }));

import { api } from '../api/client';
import { printCurrentView } from '../utils/print';
import ChequeCalibrator from '../components/ChequeCalibrator';
import { cloneDefaultTemplate } from '../utils/chequeTemplate';
import { DEFAULT_GEOMETRY } from '../utils/chequeGeometry';

/**
 * مُموِّه يفرّق **حسب المسار** — كما يفعل الخادم.
 *
 * المُموِّه الشامل السابق كان يعيد `{ data: { data: [] } }` لكل GET، ومنها
 * `/cheques/calibration-geometry` — فتصل مصفوفة فارغة إلى الهندسة، وتُنتج معادلات
 * المعايرة NaN يتسرّب إلى إحداثيات SVG (تسعة تحذيرات من إحداثية واحدة فاسدة).
 * الخادم لا يُنتج ذلك أبدًا: كل مسارات `getCalibrationGeometry` تعيد كائنًا كاملًا.
 */
function mockGetByRoute(geometry: unknown = { ...DEFAULT_GEOMETRY }) {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.startsWith('/cheques/template-versions')) return { data: { data: [] } } as never;
    if (url === '/cheques/calibration-geometry') return { data: { data: geometry } } as never;
    throw new Error(`استدعاء GET غير متوقّع في الاختبار: ${url}`);
  });
}

describe('ChequeCalibrator — calibration test print isolation', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('test print triggers printing but marks/records no cheque and issues no POST', async () => {
    mockGetByRoute(); // هندسة صالحة، كما يعيدها الخادم فعلًا

    render(
      <ChequeCalibrator
        banks={['NBK']}
        initialBank="NBK"
        loadedTemplates={{ NBK: cloneDefaultTemplate() }}
        previewData={{ beneficiaryName: '', chequeDate: '', tafqeetText: '', numericText: '' }}
        onSaved={() => {}}
        onClose={() => {}}
      />,
    );

    // Version list loads on mount (read-only GET).
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/cheques/template-versions/NBK'));

    // الزرّ يفتح المعاينة أولًا (Cheque Calibration Test Sheet Preview Overlay v1) — ثم
    // «طباعة» بداخلها يفوّض إلى نفس مسار الطباعة القديم.
    fireEvent.click(screen.getByRole('button', { name: /اختبار المعايرة/ }));
    await flushAsyncUpdates();
    fireEvent.click(screen.getByRole('button', { name: 'طباعة' }));
    // `printCurrentView` وعدٌ: حارس النقر يُحرَّر عند تحقّقه — ننتظر ذلك التحديث.
    await flushAsyncUpdates();

    // Printing happened…
    expect(printCurrentView).toHaveBeenCalledTimes(1);
    // …but NOTHING was written: no mark-printed, no reprint, no template save.
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  /**
   * فجوة التحصين: الحارس القديم `if (g)` كان يقبل أي قيمة صادقة. هذه الحالات تُمرَّر
   * من **حدّ الاستجابة** — لا من الرسم — ويجب أن تُرفض هناك، فتبقى الهندسة الافتراضية
   * الآمنة ولا يصل NaN إلى SVG إطلاقًا.
   */
  const MALFORMED: Array<[string, unknown]> = [
    ['مصفوفة فارغة', []],
    ['كائن فارغ', {}],
    ['null', null],
    ['كائن ناقص (بلا offsetYMm)', { pageWidthMm: 297, pageHeightMm: 210, chequeWidthMm: 175, chequeHeightMm: 80, offsetXMm: 0 }],
    ['حقل NaN', { ...DEFAULT_GEOMETRY, pageWidthMm: NaN }],
    ['حقل Infinity', { ...DEFAULT_GEOMETRY, offsetYMm: Infinity }],
    ['نص بدل رقم', { ...DEFAULT_GEOMETRY, pageWidthMm: '297' }],
    ['بُعد صفري', { ...DEFAULT_GEOMETRY, pageHeightMm: 0 }],
    ['بُعد سالب', { ...DEFAULT_GEOMETRY, chequeWidthMm: -175 }],
  ];

  it.each(MALFORMED)('استجابة هندسة مشوّهة (%s) لا تصل إلى SVG ولا تُسقط الشاشة', async (_label, geometry) => {
    // تجسّس **للتأكيد** لا للإسكات — مع restore صريح.
    const errSpy = vi.spyOn(console, 'error');
    mockGetByRoute(geometry);

    render(
      <ChequeCalibrator
        banks={['NBK']}
        initialBank="NBK"
        loadedTemplates={{ NBK: cloneDefaultTemplate() }}
        previewData={{ beneficiaryName: '', chequeDate: '', tafqeetText: '', numericText: '' }}
        onSaved={() => {}}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/cheques/calibration-geometry'));
    await flushAsyncUpdates();

    // 1) لا انهيار — الشاشة ما زالت قائمة.
    expect(screen.getByRole('button', { name: /اختبار المعايرة/ })).toBeInTheDocument();

    // 2) لا تحذير React من نوع Received NaN.
    const nanWarnings = errSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((m) => m.includes('Received NaN'));
    expect(nanWarnings).toEqual([]);

    // 3) لا خاصية SVG واحدة بقيمة NaN.
    const attrs = ['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'width', 'height'];
    for (const el of document.querySelectorAll('svg line, svg rect, svg circle, svg text')) {
      for (const a of attrs) {
        const v = el.getAttribute(a);
        if (v !== null) expect(v).not.toMatch(/NaN/);
      }
    }

    // 4) الورقة رُسمت فعلًا بالهندسة الافتراضية الآمنة (viewBox = مقاس الصفحة الافتراضي).
    const sheet = document.querySelector('.chq-test-sheet svg');
    expect(sheet?.getAttribute('viewBox')).toBe(`0 0 ${DEFAULT_GEOMETRY.pageWidthMm} ${DEFAULT_GEOMETRY.pageHeightMm}`);

    // 5) لا كتابة إلى الخادم.
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });

  it('هندسة صالحة من الخادم تُقبل وتُطبَّق (الحارس لا يرفض الصحيح)', async () => {
    const custom = { ...DEFAULT_GEOMETRY, pageWidthMm: 320, pageHeightMm: 220 };
    mockGetByRoute(custom);

    render(
      <ChequeCalibrator
        banks={['NBK']}
        initialBank="NBK"
        loadedTemplates={{ NBK: cloneDefaultTemplate() }}
        previewData={{ beneficiaryName: '', chequeDate: '', tafqeetText: '', numericText: '' }}
        onSaved={() => {}}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/cheques/calibration-geometry'));
    await flushAsyncUpdates();

    const sheet = document.querySelector('.chq-test-sheet svg');
    expect(sheet?.getAttribute('viewBox')).toBe('0 0 320 220'); // الهندسة القادمة طُبِّقت
  });
});
