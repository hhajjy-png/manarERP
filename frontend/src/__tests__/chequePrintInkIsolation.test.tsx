// @vitest-environment jsdom
/**
 * Ink isolation between the calibration test print and the real cheque print.
 *
 * Electron's webContents.print() prints the ENTIRE focused window — it takes no
 * element or selector. So whichever print layers are mounted compete for the page,
 * and CSS alone decides the winner. A previous attempt suppressed the real-cheque
 * layer with `.cheque-print-only { display: none !important }` from inside the
 * calibrator; that rule LOST the cascade, because Cheques.tsx declares the same
 * selector with the same specificity and `!important` later in document order.
 * The real cheque then painted over the test sheet at z-index 9999.
 *
 * These tests assert the durable fix at the DOM level: while the calibrator is open
 * the real-cheque layer is not mounted at all. They render the actual Cheques page,
 * not a source string, so they fail if the guard is ever removed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
vi.mock('../utils/print', () => ({ printCurrentView: vi.fn(() => Promise.resolve()) }));
vi.mock('../stores/authStore', () => ({
  useAuth: () => ({ hasPermission: () => true, user: { id: 1, username: 'admin', role: 'SYSTEM_ADMIN' } }),
}));
vi.mock('../lib/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));

import { api } from '../api/client';
import { printCurrentView } from '../utils/print';
import Cheques from '../pages/Cheques';

function mockApi() {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === '/cheques') return Promise.resolve({ data: { data: { data: [], meta: null } } } as never);
    if (url === '/cheques/stats') return Promise.resolve({ data: { data: { total: 0, draft: 0, printed: 0, cancelled: 0 } } } as never);
    if (url === '/settings') return Promise.resolve({ data: { data: { settings: [] } } } as never);
    if (url.includes('calibration-geometry')) return Promise.resolve({ data: { data: undefined } } as never);
    if (url.includes('template-versions')) return Promise.resolve({ data: { data: [] } } as never);
    return Promise.resolve({ data: { data: [] } } as never);
  });
}

function renderPage() {
  return render(<MemoryRouter><Cheques /></MemoryRouter>);
}

/** Open the calibration overlay via its real toolbar button. */
async function openCalibrator() {
  fireEvent.click(await screen.findByRole('button', { name: /معايرة الطباعة/ }));
  await screen.findByText(/معايرة الشيكات/);
}

describe('cheque print ink isolation', () => {
  beforeEach(() => { vi.clearAllMocks(); mockApi(); });
  afterEach(cleanup);

  it('mounts the real-cheque print layer when the calibrator is CLOSED', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings'));
    expect(container.querySelector('.cheque-print-only')).toBeInTheDocument();
    expect(container.querySelector('.chq-calib-testprint')).toBeNull();
  });

  it('UNMOUNTS the real-cheque layer when the calibrator is OPEN, leaving the test sheet as the only print surface', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings'));
    await openCalibrator();

    expect(container.querySelector('.cheque-print-only')).toBeNull();
    expect(container.querySelector('.chq-calib-testprint')).toBeInTheDocument();
    expect(container.querySelector('.chq-calib-testprint .chq-test-footer')).toBeInTheDocument();
  });

  it('remounts the real-cheque layer after the calibrator closes', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings'));
    await openCalibrator();
    expect(container.querySelector('.cheque-print-only')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^إغلاق$/ }));
    await waitFor(() => expect(container.querySelector('.cheque-print-only')).toBeInTheDocument());
    expect(container.querySelector('.chq-calib-testprint')).toBeNull();
  });

  it('no real cheque field data is present anywhere in the DOM while the calibrator is open', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings'));
    await openCalibrator();
    // ChequePrintOutput is the only thing that renders the 40 mm page-offset wrapper.
    expect(container.innerHTML).not.toContain('translate(0mm, 40mm)');
  });

  it('the real-cheque layer keeps its 40 mm page offset when the calibrator is closed', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings'));
    const inner = container.querySelector('.cheque-print-only > div') as HTMLElement;
    expect(inner.style.transform).toBe('translate(0mm, 40mm)');
  });

  it('calibration test print calls printCurrentView exactly once and writes nothing', async () => {
    renderPage();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings'));
    await openCalibrator();
    vi.mocked(api.post).mockClear();
    vi.mocked(api.put).mockClear();

    const btn = screen.getByRole('button', { name: /اختبار المعايرة/ });
    fireEvent.click(btn);
    fireEvent.click(btn); // duplicate click while printing → ignored

    expect(printCurrentView).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});
