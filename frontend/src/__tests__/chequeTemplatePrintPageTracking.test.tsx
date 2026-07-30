// @vitest-environment jsdom
/**
 * Template Real/A4 print tracking + batch safety (Cheque Multi-Selection & Batch
 * Printing Pack v1 — Provider Parity & Print Result Correctness).
 *
 * Covers: single Template printing gaining mark-printed/reprint tracking (which
 * did not exist before this pack), stop-on-cancel/error (no premature
 * printed-state update), and batch "Next" only appearing after a real success +
 * completed tracking step.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { flushAsyncUpdates } from './helpers/flush';
import { ROUTER_FUTURE } from './helpers/router';
import type { DesignerSurfaceSpec, DesignerField } from '../modules/chequeTemplateDesigner';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('../utils/print', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/print')>();
  return { ...actual, printCurrentViewWithResult: vi.fn() };
});

vi.mock('../utils/chequePrintTracking', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/chequePrintTracking')>();
  return { ...actual, markChequePrinted: vi.fn(), reprintCheque: vi.fn() };
});

import { printCurrentViewWithResult } from '../utils/print';
import { markChequePrinted, reprintCheque } from '../utils/chequePrintTracking';
import ChequeTemplatePrintPage from '../components/chequeTemplateManager/ChequeTemplatePrintPage';

const SURFACE: DesignerSurfaceSpec = { widthCm: 17.8, heightCm: 8.9 };
// A single static (non-semantic) field — enough for the Runtime Engine to report
// no errors, so `blocked` is false and the print button is enabled.
const FIELDS: DesignerField[] = [{
  id: 'note', label: '', value: 'x', x: 10, y: 10, width: 20, height: 6, rotation: 0,
  fontSize: 12, fontWeight: 400, textAlign: 'left', color: '#000000', zIndex: 1, visible: true,
}];
// Real print state must carry runtime data (Cheque Printing Data Integrity &
// Formatting Pack v1): a state with only a layout is rejected so mock/sample
// values can never reach cheque paper. These tests exercise TRACKING, so the data
// only has to be present and well-formed.
const RUNTIME = { beneficiary: 'Ali', chequeDate: '02 / 08 / 2026', amount: '#1,370.000#' };

function renderPage(state: Record<string, unknown>) {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[{ pathname: '/cheque-template/print', state }]}>
      <ChequeTemplatePrintPage />
    </MemoryRouter>,
  );
}

describe('ChequeTemplatePrintPage — print-result tracking', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('offers the mark-printed confirm ONLY after a real success — DRAFT cheque', async () => {
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'success' });
    vi.mocked(markChequePrinted).mockResolvedValue({ id: 5, status: 'PRINTED', printedAt: null, paymentVoucherNumber: null });

    renderPage({ surface: SURFACE, fields: FIELDS, runtimeData: RUNTIME, tracking: { id: 5, status: 'DRAFT', chequeNumber: 'C-1', beneficiaryName: 'Ali' } });

    fireEvent.click(screen.getByRole('button', { name: /طباعة/ }));
    await flushAsyncUpdates();

    expect(await screen.findByRole('heading', { name: 'تأكيد الطباعة' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الطباعة' }));
    await waitFor(() => expect(markChequePrinted).toHaveBeenCalledWith(5));
  });

  it('offers the reprint-reason modal for an already-PRINTED cheque, and requires a reason', async () => {
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'success' });
    vi.mocked(reprintCheque).mockResolvedValue({ id: 9, status: 'PRINTED', printedAt: null, paymentVoucherNumber: null });

    renderPage({ surface: SURFACE, fields: FIELDS, runtimeData: RUNTIME, tracking: { id: 9, status: 'PRINTED', chequeNumber: 'C-2', beneficiaryName: 'Sara' } });

    fireEvent.click(screen.getByRole('button', { name: /طباعة/ }));
    await flushAsyncUpdates();

    const confirmBtn = await screen.findByRole('button', { name: 'تسجيل وإعادة الطباعة' });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox', { name: 'سبب إعادة الطباعة' }), { target: { value: 'PAPER_JAM' } });
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);
    await waitFor(() => expect(reprintCheque).toHaveBeenCalledWith(9, 'PAPER_JAM', null));
  });

  it('never offers tracking and never marks printed when the print was cancelled', async () => {
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'cancelled', failureReason: 'Print job canceled' });

    renderPage({ surface: SURFACE, fields: FIELDS, runtimeData: RUNTIME, tracking: { id: 5, status: 'DRAFT', chequeNumber: 'C-1', beneficiaryName: 'Ali' } });

    fireEvent.click(screen.getByRole('button', { name: /طباعة/ }));
    await flushAsyncUpdates();

    expect(screen.queryByText(/تأكيد الطباعة/)).not.toBeInTheDocument();
    expect(markChequePrinted).not.toHaveBeenCalled();
    expect(reprintCheque).not.toHaveBeenCalled();
  });

  it('never offers tracking when the print result is an error', async () => {
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'error', failureReason: 'Invalid printer settings' });

    renderPage({ surface: SURFACE, fields: FIELDS, runtimeData: RUNTIME, tracking: { id: 5, status: 'DRAFT', chequeNumber: 'C-1', beneficiaryName: 'Ali' } });

    fireEvent.click(screen.getByRole('button', { name: /طباعة/ }));
    await flushAsyncUpdates();

    expect(screen.queryByText(/تأكيد الطباعة/)).not.toBeInTheDocument();
    expect(markChequePrinted).not.toHaveBeenCalled();
  });
});

describe('ChequeTemplatePrintPage — Batch Preview Navigator (Previous/Next never print or track)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  function batchState(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      surface: SURFACE,
      fields: FIELDS,
      paperMode: 'real-cheque',
      ctppBatchItems: [
        { runtimeData: {}, tracking: { id: 5, status: 'DRAFT', chequeNumber: 'C-1', beneficiaryName: 'Ali' } },
        { runtimeData: {}, tracking: { id: 6, status: 'DRAFT', chequeNumber: 'C-2', beneficiaryName: 'Bo' } },
      ],
      ...overrides,
    };
  }

  it('shows "السابق"/"التالي" immediately — not gated on printing or tracking', () => {
    renderPage(batchState());
    expect(screen.getByRole('button', { name: 'التالي' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();
    expect(markChequePrinted).not.toHaveBeenCalled();
    expect(printCurrentViewWithResult).not.toHaveBeenCalled();
  });

  it('clicking "التالي" never prints and never marks anything printed', () => {
    renderPage(batchState());
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(printCurrentViewWithResult).not.toHaveBeenCalled();
    expect(markChequePrinted).not.toHaveBeenCalled();
    expect(reprintCheque).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('disables "السابق" on the first item and "التالي" on the last item', () => {
    renderPage(batchState());
    expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByRole('button', { name: 'التالي' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'السابق' })).toBeEnabled();
  });

  it('printing the CURRENT item tracks only that item, not the other', async () => {
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'success' });
    vi.mocked(markChequePrinted).mockResolvedValue({ id: 6, status: 'PRINTED', printedAt: null, paymentVoucherNumber: null });

    renderPage(batchState());
    fireEvent.click(screen.getByRole('button', { name: 'التالي' })); // now on item 2 (id 6)

    fireEvent.click(screen.getByRole('button', { name: /طباعة/ }));
    await flushAsyncUpdates();
    fireEvent.click(await screen.findByRole('button', { name: 'تأكيد الطباعة' }));

    await waitFor(() => expect(markChequePrinted).toHaveBeenCalledWith(6));
    expect(markChequePrinted).not.toHaveBeenCalledWith(5);
  });

  it('cancelled/error print never tracks — Previous/Next remain free to use regardless', async () => {
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'cancelled', failureReason: 'Print job canceled' });

    renderPage(batchState());
    fireEvent.click(screen.getByRole('button', { name: /طباعة/ }));
    await flushAsyncUpdates();

    expect(markChequePrinted).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'التالي' })).toBeEnabled();
  });
});
