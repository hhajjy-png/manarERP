// @vitest-environment jsdom
/**
 * Cheque Printed Record Editing Fix v1 — frontend regression suite.
 *
 * The block on editing a printed cheque lived entirely in the backend service;
 * the Cheques page already offered Edit for any non-CANCELLED cheque. These tests
 * pin that UI contract so a future change cannot silently re-introduce a
 * status-based lock, and they pin the consequence that matters operationally:
 * after saving an edit, the preview / print / reprint path uses the SAVED values.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import { bankRegistryResponse, gulfChequeAccountFields } from './helpers/bankRegistry';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => (e as { message?: string })?.message ?? String(e),
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
import Cheques from '../pages/Cheques';
import { FinancialPeriodProvider } from '../context/FinancialPeriodContext';

const PRINTED_CHEQUE = {
  id: 46, chequeNumber: '000002', chequeDate: '2026-08-02T00:00:00.000Z',
  beneficiaryName: 'ساير طليحان العذاب', amount: 1370, currency: 'KWD',
  description: null, bankName: 'بنك الخليج', status: 'PRINTED',
  printedAt: '2026-08-03T00:00:00.000Z', cancelledAt: null, notes: null,
  paymentVoucherNumber: null, printCount: 1, createdAt: '2026-07-30',
  // حقول الحساب البنكي التي صار الخادم يرفقها بكل شيك.
  ...gulfChequeAccountFields(),
};
const DRAFT_CHEQUE = { ...PRINTED_CHEQUE, id: 47, chequeNumber: '000003', beneficiaryName: 'مستفيد مسودة', status: 'DRAFT', printedAt: null, printCount: 0 };
const CANCELLED_CHEQUE = { ...PRINTED_CHEQUE, id: 48, chequeNumber: '000004', beneficiaryName: 'ملغي', status: 'CANCELLED', cancelledAt: '2026-08-04' };

let rows = [PRINTED_CHEQUE, DRAFT_CHEQUE, CANCELLED_CHEQUE];

function mockApi() {
  rows = [PRINTED_CHEQUE, DRAFT_CHEQUE, CANCELLED_CHEQUE];
  vi.mocked(api.get).mockImplementation((url: string) => {
    // سجل البنوك — بنك الخليج بحسابه الرئيسي المهيأ للطباعة، كما في الإنتاج.
    const registry = bankRegistryResponse(url);
    if (registry) return Promise.resolve(registry as never);
    if (url === '/cheques') return Promise.resolve({ data: { data: { data: rows, meta: { total: rows.length } } } } as never);
    if (url === '/cheques/stats') return Promise.resolve({ data: { data: { total: rows.length, draft: 1, printed: 1, cancelled: 1 } } } as never);
    if (url === '/settings') return Promise.resolve({ data: { data: { settings: [{ key: 'cheques.defaultPrintProvider', value: 'classic' }] } } } as never);
    return Promise.resolve({ data: { data: [] } } as never);
  });
  // PUT echoes the merged record, exactly as the real API does after an update.
  vi.mocked(api.put).mockImplementation((url: string, body: unknown) => {
    const id = Number(String(url).split('/').pop());
    const updated = { ...rows.find((r) => r.id === id)!, ...(body as object), id };
    rows = rows.map((r) => (r.id === id ? updated : r));
    return Promise.resolve({ data: { data: updated } } as never);
  });
  vi.mocked(api.post).mockResolvedValue({ data: { data: {} } } as never);
}

function renderPage() {
  return render(
    <FinancialPeriodProvider>
      <MemoryRouter future={ROUTER_FUTURE}><Cheques /></MemoryRouter>
    </FinancialPeriodProvider>,
  );
}

/** Open a cheque's details drawer from its table row. */
async function openDrawer(beneficiary: string) {
  const cell = await screen.findByText(beneficiary);
  fireEvent.click(cell.closest('tr')!);
  return screen.findByRole('dialog');
}

beforeEach(() => { vi.clearAllMocks(); mockApi(); });
afterEach(cleanup);

describe('Edit action availability by status', () => {
  it('is offered for a PRINTED cheque — no status-based lock in the UI', async () => {
    renderPage();
    const drawer = await openDrawer('ساير طليحان العذاب');
    expect(within(drawer).getByRole('button', { name: 'action.edit' })).toBeEnabled();
  });

  it('is offered for a DRAFT cheque, exactly as before', async () => {
    renderPage();
    const drawer = await openDrawer('مستفيد مسودة');
    expect(within(drawer).getByRole('button', { name: 'action.edit' })).toBeEnabled();
  });

  it('is NOT offered for a CANCELLED cheque (that guard is deliberately kept)', async () => {
    renderPage();
    const drawer = await openDrawer('ملغي');
    expect(within(drawer).queryByRole('button', { name: 'action.edit' })).not.toBeInTheDocument();
  });
});

describe('editing a PRINTED cheque end to end', () => {
  it('loads the printed cheque into an editable form with all its values', async () => {
    renderPage();
    const drawer = await openDrawer('ساير طليحان العذاب');
    fireEvent.click(within(drawer).getByRole('button', { name: 'action.edit' }));

    const payee = await screen.findByLabelText('field.cheque.beneficiary');
    expect(payee).toHaveValue('ساير طليحان العذاب');
    expect(payee).toBeEnabled();
    expect(screen.getByLabelText('field.cheque.number')).toHaveValue('000002');
    expect(screen.getByLabelText('field.cheque.amount')).toHaveValue(1370);
    // Every field the form exposes stays editable for a printed cheque.
    for (const label of ['field.cheque.beneficiary', 'field.cheque.number', 'field.cheque.amount', 'field.cheque.currency', 'field.cheque.date', 'field.cheque.description', 'field.cheque.notes']) {
      expect(screen.getByLabelText(label), label).toBeEnabled();
    }
  });

  it('saves via PUT to the SAME id — never POSTs a new cheque', async () => {
    renderPage();
    const drawer = await openDrawer('ساير طليحان العذاب');
    fireEvent.click(within(drawer).getByRole('button', { name: 'action.edit' }));

    const payee = await screen.findByLabelText('field.cheque.beneficiary');
    fireEvent.change(payee, { target: { value: 'مستفيد مصحّح' } });
    fireEvent.change(screen.getByLabelText('field.cheque.amount'), { target: { value: '2480.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'page.cheques.save' }));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [url, body] = vi.mocked(api.put).mock.calls[0];
    expect(url).toBe('/cheques/46');
    expect(body).toMatchObject({ beneficiaryName: 'مستفيد مصحّح', amount: 2480.5, chequeNumber: '000002' });
    expect(api.post).not.toHaveBeenCalledWith('/cheques', expect.anything());
  });

  it('re-fetches and shows the edited values in the list', async () => {
    renderPage();
    const drawer = await openDrawer('ساير طليحان العذاب');
    fireEvent.click(within(drawer).getByRole('button', { name: 'action.edit' }));

    fireEvent.change(await screen.findByLabelText('field.cheque.beneficiary'), { target: { value: 'مستفيد مصحّح' } });
    fireEvent.click(screen.getByRole('button', { name: 'page.cheques.save' }));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    // /cheques is re-queried after the save, and the ROW reflects the new value.
    // Scoped to the table: the edited name also legitimately appears in the form
    // and in the hidden print layer, which the next test asserts separately.
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getByText('مستفيد مصحّح')).toBeInTheDocument());
    expect(within(table).queryByText('ساير طليحان العذاب')).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/cheques', expect.anything());
  });

  it('the subsequent preview/print layer uses the SAVED values, not the pre-edit ones', async () => {
    renderPage();
    const drawer = await openDrawer('ساير طليحان العذاب');
    fireEvent.click(within(drawer).getByRole('button', { name: 'action.edit' }));

    fireEvent.change(await screen.findByLabelText('field.cheque.beneficiary'), { target: { value: 'مستفيد مصحّح' } });
    fireEvent.change(screen.getByLabelText('field.cheque.amount'), { target: { value: '2480.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'page.cheques.save' }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());

    // The hidden Classic print layer renders from `previewData`, which follows the
    // saved record — so a reprint after an edit carries the corrected values.
    await waitFor(() => {
      const layer = document.querySelector('.cheque-print-only');
      expect(layer?.textContent).toContain('مستفيد مصحّح');
    });
    const layer = document.querySelector('.cheque-print-only');
    expect(layer?.textContent).toContain('#2,480.500#');
    expect(layer?.textContent).not.toContain('ساير طليحان العذاب');
    expect(layer?.textContent).not.toContain('#1,370.000#');
  });

  it('the cheque stays PRINTED after the edit — print state is not reset by the UI', async () => {
    renderPage();
    const drawer = await openDrawer('ساير طليحان العذاب');
    fireEvent.click(within(drawer).getByRole('button', { name: 'action.edit' }));

    fireEvent.change(await screen.findByLabelText('field.cheque.beneficiary'), { target: { value: 'مستفيد مصحّح' } });
    fireEvent.click(screen.getByRole('button', { name: 'page.cheques.save' }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());

    // The client never sends status/printedAt/printCount in the update payload.
    const body = vi.mocked(api.put).mock.calls[0][1] as Record<string, unknown>;
    for (const f of ['status', 'printedAt', 'printCount', 'cancelledAt']) {
      expect(body, f).not.toHaveProperty(f);
    }
    expect(rows.find((r) => r.id === 46)!.status).toBe('PRINTED');
    expect(rows.find((r) => r.id === 46)!.printCount).toBe(1);
  });
});
