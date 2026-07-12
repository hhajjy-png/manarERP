// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { flushAsyncUpdates } from './helpers/flush';

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

function mockApiGet() {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.includes('calibration-geometry')) return Promise.resolve({ data: { data: DEFAULT_GEOMETRY } } as any);
    if (url.includes('template-versions')) return Promise.resolve({ data: { data: [] } } as any);
    return Promise.resolve({ data: { data: [] } } as any);
  });
}

function renderStudio(isSystemAdmin = false) {
  return render(
    <ChequeCalibrator
      banks={['NBK']}
      initialBank="NBK"
      loadedTemplates={{ NBK: cloneDefaultTemplate() }}
      previewData={{ beneficiaryName: '', chequeDate: '', tafqeetText: '', numericText: '' }}
      onSaved={() => {}}
      onClose={() => {}}
      isSystemAdmin={isSystemAdmin}
    />,
  );
}

describe('Cheque Calibration Studio', () => {
  beforeEach(() => { vi.clearAllMocks(); mockApiGet(); });
  afterEach(cleanup);

  it('loads geometry + versions on open (read-only GETs)', async () => {
    renderStudio();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/cheques/calibration-geometry'));
    expect(api.get).toHaveBeenCalledWith('/cheques/template-versions/NBK');
  });

  it('test-print writes nothing (isolation)', async () => {
    renderStudio();
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /اختبار المعايرة/ }));
    // `printCurrentView` وعدٌ: حارس النقر يُحرَّر عند تحقّقه — ننتظر ذلك التحديث.
    await flushAsyncUpdates();
    expect(printCurrentView).toHaveBeenCalled();
    // No cheque/template mutation from test-printing.
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  // Ink isolation is enforced by UNMOUNTING the real-cheque layer in Cheques.tsx, not
  // by a CSS suppression rule here — such a rule lost the cascade to the page's own
  // later `!important` declaration. See chequePrintInkIsolation.test.tsx for the
  // DOM-level proof. The calibrator must therefore not try to suppress it at all.
  it('does not attempt to suppress .cheque-print-only from its own print CSS', async () => {
    const { container } = renderStudio();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('\n');
    expect(css).not.toContain('.cheque-print-only');
    expect(css).toContain('.chq-calib-testprint');
  });

  it('reveals its test sheet in print without relying on a z-index race', async () => {
    const { container } = renderStudio();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('\n');

    const rule = /\.chq-calib-testprint\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/display:\s*block\s*!important/);
    // No z-index DECLARATION (the surrounding comment may mention the word).
    expect(rule![1]).not.toMatch(/z-index\s*:/);
    expect(css).not.toMatch(/z-index\s*:\s*2147483647/);
  });

  // ── Rollback guard: the full-page diagnostic grid and its print workarounds are gone.
  it('exposes no grid/diagnostic-sheet mode controls', async () => {
    renderStudio();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    for (const label of [/الشبكة فقط/, /الشبكة \+ إطار الشيك/, /خطوط 5 مم/, /ورقة تشخيص كاملة/]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('carries no max-int z-index or print-color-adjust workaround in its print CSS', async () => {
    const { container } = renderStudio();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('\n');
    expect(css).not.toContain('2147483647');
    expect(css).not.toContain('print-color-adjust');
    expect(css).not.toContain('repeating-linear-gradient');
    expect(css).not.toContain('transform: none');
    expect(css).not.toContain('overflow: visible');
  });

  it('the Measurement Assistant no longer gates confidence on a printed 100 mm ruler', async () => {
    renderStudio();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText(/شريط 100 مم/)).not.toBeInTheDocument();
    expect(screen.getByText(/مساعد القياس/)).toBeInTheDocument();
  });

  it('test-print is guarded against double-click (prints once, no timeout in path)', async () => {
    renderStudio();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    const btn = screen.getByRole('button', { name: /اختبار المعايرة/ });
    fireEvent.click(btn);
    fireEvent.click(btn); // immediate second click while "printing" → ignored
    await flushAsyncUpdates();
    expect(printCurrentView).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('Measurement Assistant applies a correction as a NEW version (POST versions, never PUT settings)', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { version: 2 } } } as any);
    renderStudio();
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText('إزاحة أفقية بالمليمتر'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('إزاحة رأسية بالمليمتر'), { target: { value: '3' } });

    // Apply → confirmation dialog appears (never auto-saves)
    fireEvent.click(screen.getByRole('button', { name: /تطبيق كنسخة جديدة/ }));
    const dialog = await screen.findByRole('dialog', { name: /تأكيد التصحيح/ });
    expect(api.post).not.toHaveBeenCalled(); // still nothing until confirmed

    fireEvent.click(within(dialog).getByRole('button', { name: /تطبيق كنسخة جديدة/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/cheques/template-versions', expect.objectContaining({ bankName: 'NBK' })));
    // The active template is versioned, never written straight to settings.
    expect(api.put).not.toHaveBeenCalled();
  });

  it('wizard opens and is skippable without side effects', async () => {
    renderStudio();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /معالج المعايرة/ }));
    expect(await screen.findByRole('dialog', { name: /معالج معايرة الطابعة/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /تخطّي/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /معالج معايرة الطابعة/ })).not.toBeInTheDocument());
    expect(api.post).not.toHaveBeenCalled();
  });

  it('advanced geometry is hidden for non-admins and shown for SYSTEM_ADMIN', async () => {
    const { unmount } = renderStudio(false);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText(/إعدادات القياس المتقدمة/)).not.toBeInTheDocument();
    unmount();

    mockApiGet();
    renderStudio(true);
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.getByText(/إعدادات القياس المتقدمة/)).toBeInTheDocument();
  });
});
