// @vitest-environment jsdom
/**
 * Cheque print ENTRY POINTS — Deterministic Geometry & Unified Pipeline Pack v1.
 *
 * Covers the defects that live in the Cheques page rather than in the geometry
 * layer:
 *
 *   H5  printing before /settings resolved silently used the initial 'classic'
 *       provider AND the built-in calibration instead of the saved ones — two
 *       different geometry systems chosen by timing.
 *   H7  the Classic path resolved the per-bank calibration from `form.bankName`,
 *       which a batch never updates, so a mixed-bank batch printed every cheque
 *       with one stale bank's template.
 *   +   production template resolution must be the flagged default, with an
 *       explicit block (never an updatedAt-ordered fallback) when none is set.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
vi.mock('../utils/print', () => ({ printCurrentViewWithResult: vi.fn() }));
vi.mock('../stores/authStore', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    isSystemAdmin: () => true,
    user: { id: 1, username: 'admin', role: 'SYSTEM_ADMIN' },
  }),
}));
vi.mock('../lib/i18n', () => ({ useT: () => ({ t: (k: string) => k }), t: (k: string) => k }));

import { api } from '../api/client';
import { printCurrentViewWithResult } from '../utils/print';
import Cheques from '../pages/Cheques';
import { FinancialPeriodProvider } from '../context/FinancialPeriodContext';
import { DEFAULT_TEMPLATE_MISSING_MESSAGE } from '../modules/chequePrint';
import { DEFAULT_TEMPLATE } from '../utils/chequeTemplate';

const BANK_X = 'بنك الخليج';
const BANK_Y = 'بنك الكويت الوطني';

const CHEQUE_X = { id: 1, chequeNumber: 'C-1', chequeDate: '2026-08-02T00:00:00.000Z', beneficiaryName: 'Ali', amount: 1370, currency: 'KWD', description: null, bankName: BANK_X, status: 'DRAFT', printedAt: null, cancelledAt: null, notes: null, paymentVoucherNumber: null, createdAt: '2026-01-01' };
const CHEQUE_Y = { ...CHEQUE_X, id: 2, chequeNumber: 'C-2', beneficiaryName: 'Sara', amount: 250, bankName: BANK_Y };
const CHEQUES = [CHEQUE_X, CHEQUE_Y];

/** Distinct per-bank calibrations, so a leak between them is observable. */
const TEMPLATE_X = { ...DEFAULT_TEMPLATE, date: { ...DEFAULT_TEMPLATE.date, top: 11.1, left: 11.1 } };
const TEMPLATE_Y = { ...DEFAULT_TEMPLATE, date: { ...DEFAULT_TEMPLATE.date, top: 77.7, left: 77.7 } };

const SETTINGS_ROWS = [
  { key: `cheque.template.${BANK_X}`, value: JSON.stringify(TEMPLATE_X) },
  { key: `cheque.template.${BANK_Y}`, value: JSON.stringify(TEMPLATE_Y) },
];

/** `/settings` resolution is controllable so the load race is testable. */
let settingsDeferred: { resolve: (rows: unknown[]) => void; reject: (e: unknown) => void; promise: Promise<unknown> };

function mockApi(provider = 'classic') {
  settingsDeferred = {} as never;
  settingsDeferred.promise = new Promise((resolve, reject) => {
    settingsDeferred.resolve = (rows) => resolve({ data: { data: { settings: rows } } });
    settingsDeferred.reject = reject;
  });
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === '/cheques') return Promise.resolve({ data: { data: { data: CHEQUES, meta: { total: 2 } } } } as never);
    if (url === '/cheques/stats') return Promise.resolve({ data: { data: { total: 2, draft: 2, printed: 0, cancelled: 0 } } } as never);
    if (url === '/settings') return settingsDeferred.promise as never;
    return Promise.resolve({ data: { data: [] } } as never);
  });
  vi.mocked(api.post).mockResolvedValue({ data: { data: {} } } as never);
  return () => settingsDeferred.resolve([
    ...SETTINGS_ROWS,
    { key: 'cheques.defaultPrintProvider', value: provider },
  ]);
}

function renderPage() {
  return render(
    <FinancialPeriodProvider>
      <MemoryRouter future={ROUTER_FUTURE}><Cheques /></MemoryRouter>
    </FinancialPeriodProvider>,
  );
}

async function selectRows(...indices: number[]) {
  const boxes = await screen.findAllByRole('checkbox', { name: /a11y.cheque_select_row/ });
  for (const i of indices) fireEvent.click(boxes[i]);
}

/** The batch bar's print button. Its label is the multi-selection key whenever
 *  two or more rows are selected — every test here selects two. */
function printSelected() {
  fireEvent.click(screen.getByRole('button', { name: 'action.cheque.print_selected' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => { cleanup(); localStorage.clear(); });

// ── H5 — settings load race ──────────────────────────────────────────────────

describe('settings load race (H5)', () => {
  it('BLOCKS printing before /settings has resolved — no accidental Classic fallback', async () => {
    mockApi('template-real');
    renderPage();
    await selectRows(0, 1);
    printSelected();

    // Nothing printed, nothing navigated: the provider is not yet known.
    expect(printCurrentViewWithResult).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/جارٍ تحميل إعدادات الطباعة/)).toBeInTheDocument();
  });

  it('uses the SAVED provider once settings resolve, not the initial classic default', async () => {
    const resolveSettings = mockApi('template-real');
    renderPage();
    await selectRows(0, 1);
    resolveSettings();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings'));

    // Seed a default Designer template so the template provider can resolve one.
    localStorage.setItem('chequeDesigner.templates.v1', JSON.stringify({
      version: 1,
      templates: [{
        id: 'tpl-1', name: 'تجربه', isDefault: true,
        surface: { widthCm: 17.8, heightCm: 8.9 },
        fields: [{ id: 'date', label: '', value: 'x', x: 10, y: 10, width: 20, height: 6, rotation: 0, fontSize: 12, fontWeight: 400, textAlign: 'center', color: '#000', zIndex: 1, visible: true }],
        createdAt: 'a', updatedAt: 'b',
      }],
    }));

    await waitFor(() => expect(screen.queryByText(/جارٍ تحميل إعدادات الطباعة/)).not.toBeInTheDocument());
    printSelected();

    // Template provider → navigates to the template print page, never the
    // in-page Classic print.
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/cheque-template/print', expect.anything()));
    expect(printCurrentViewWithResult).not.toHaveBeenCalled();
  });

  it('a failed settings load shows an error and still refuses to print', async () => {
    mockApi();
    renderPage();
    settingsDeferred.reject(new Error('network'));
    await selectRows(0, 1);
    printSelected();

    expect(await screen.findByText(/تعذّر تحميل إعدادات الطباعة/)).toBeInTheDocument();
    expect(printCurrentViewWithResult).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

// ── Default template contract at the entry point ─────────────────────────────

describe('default template at the Cheques entry point', () => {
  it('blocks Designer printing with the explicit Arabic message when no default is flagged', async () => {
    const resolveSettings = mockApi('template-real');
    renderPage();
    resolveSettings();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings'));
    // A template EXISTS but none is flagged default — the old code would have
    // silently used it via the updatedAt-ordered fallback.
    localStorage.setItem('chequeDesigner.templates.v1', JSON.stringify({
      version: 1,
      templates: [{
        id: 'tpl-not-default', name: 'غير افتراضي', isDefault: false,
        surface: { widthCm: 17.8, heightCm: 8.9 },
        fields: [{ id: 'date', label: '', value: 'x', x: 10, y: 10, width: 20, height: 6, rotation: 0, fontSize: 12, fontWeight: 400, textAlign: 'center', color: '#000', zIndex: 1, visible: true }],
        createdAt: 'a', updatedAt: '2099-01-01',
      }],
    }));

    await selectRows(0, 1);
    await waitFor(() => expect(screen.queryByText(/جارٍ تحميل/)).not.toBeInTheDocument());
    printSelected();

    expect(await screen.findByText(DEFAULT_TEMPLATE_MISSING_MESSAGE)).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

// ── H7 — mixed-bank Classic batch ────────────────────────────────────────────

describe('Classic mixed-bank batch (H7)', () => {
  /** Read the calibration actually rendered into the hidden Classic print layer. */
  function renderedDateTop(): string | undefined {
    const layer = document.querySelector('.cheque-print-only');
    const divs = layer ? Array.from(layer.querySelectorAll<HTMLElement>('div[style*="top"]')) : [];
    return divs.map((d) => d.style.top).find((t) => t === '11.1%' || t === '77.7%');
  }

  it('each cheque uses ITS OWN bank calibration — no form.bankName leakage', async () => {
    const resolveSettings = mockApi('classic');
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'success' });
    renderPage();
    resolveSettings();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings'));
    await waitFor(() => expect(screen.queryByText(/جارٍ تحميل/)).not.toBeInTheDocument());

    await selectRows(0, 1);
    printSelected();

    // Item 1 — bank X calibration.
    await waitFor(() => expect(printCurrentViewWithResult).toHaveBeenCalledTimes(1));
    expect(renderedDateTop()).toBe('11.1%');

    fireEvent.click(await screen.findByRole('button', { name: 'page.cheques.mark_printed' }));

    // Item 2 — bank Y calibration, NOT bank X's.
    await waitFor(() => expect(printCurrentViewWithResult).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(renderedDateTop()).toBe('77.7%'));
  });

  it('Classic prints with the pinned A4-landscape physical page', async () => {
    const resolveSettings = mockApi('classic');
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'success' });
    renderPage();
    resolveSettings();
    await waitFor(() => expect(screen.queryByText(/جارٍ تحميل/)).not.toBeInTheDocument());

    await selectRows(0, 1);
    printSelected();

    await waitFor(() => expect(printCurrentViewWithResult).toHaveBeenCalled());
    expect(printCurrentViewWithResult).toHaveBeenCalledWith({
      landscape: false,
      pageSize: { width: 297000, height: 210000 },
      marginType: 'none',
      scaleFactor: 100,
    });
  });

  it('the Classic @page rule declares an explicit size AND zero margins', async () => {
    const resolveSettings = mockApi('classic');
    const { container } = renderPage();
    resolveSettings();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings'));
    const css = Array.from(container.querySelectorAll('style')).map((s) => s.textContent).join('\n');
    expect(css).toContain('@page { size: 297mm 210mm; margin: 0; }');
    expect(css).not.toContain('size: A4 landscape');
  });
});
