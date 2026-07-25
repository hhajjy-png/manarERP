// @vitest-environment jsdom
/**
 * Batch Preview Navigator regression suite (Cheque Multi-Selection & Batch
 * Printing Pack v1).
 *
 * An earlier implementation advanced the batch by calling `navigate()` back to
 * the SAME route path per item; in real manual testing this left the page
 * showing the first cheque instead of the next one. That auto-advance /
 * same-route queue-navigation approach has been removed entirely. The page now
 * stays on ONE mount for the whole batch — `ctppBatchItems` (the full,
 * pre-built list) is read once, and the user browses it via a plain in-page
 * `activeIndex`. These tests render the REAL page (no mocked `useNavigate` for
 * the navigation assertions that matter) and drive it exactly like a user
 * would: Next/Next/Previous/Previous.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import type { DesignerSurfaceSpec, DesignerField } from '../modules/chequeTemplateDesigner';

vi.mock('../utils/print', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/print')>();
  return { ...actual, printCurrentViewWithResult: vi.fn() };
});
vi.mock('../utils/chequePrintTracking', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/chequePrintTracking')>();
  return { ...actual, markChequePrinted: vi.fn(), reprintCheque: vi.fn() };
});

import { printCurrentViewWithResult } from '../utils/print';
import { markChequePrinted } from '../utils/chequePrintTracking';
import ChequeTemplatePrintPage from '../components/chequeTemplateManager/ChequeTemplatePrintPage';

const SURFACE: DesignerSurfaceSpec = { widthCm: 17.8, heightCm: 8.9 };
function beneficiaryField(): DesignerField {
  return {
    id: 'beneficiary', label: '', value: 'x', x: 10, y: 10, width: 20, height: 6, rotation: 0,
    fontSize: 12, fontWeight: 400, textAlign: 'left', color: '#000000', zIndex: 1, visible: true,
  };
}

interface Item { id: number; beneficiary: string; status: 'DRAFT' | 'PRINTED'; }

function buildBatchState(items: Item[], paperMode: 'real-cheque' | 'a4' = 'real-cheque') {
  return {
    surface: SURFACE,
    fields: [beneficiaryField()],
    paperMode,
    ctppBatchItems: items.map((it) => ({
      runtimeData: { beneficiary: it.beneficiary },
      tracking: { id: it.id, status: it.status, chequeNumber: `C-${it.id}`, beneficiaryName: it.beneficiary },
    })),
  };
}

function renderBatchPage(state: Record<string, unknown>) {
  return render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={[{ pathname: '/cheque-template/print', state }]}>
      <Routes>
        <Route path="/cheque-template/print" element={<ChequeTemplatePrintPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function printAndConfirm() {
  fireEvent.click(screen.getByRole('button', { name: /طباعة/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'تأكيد الطباعة' }));
  await waitFor(() => expect(markChequePrinted).toHaveBeenCalled());
}

describe('ChequeTemplatePrintPage — Batch Preview Navigator renders the correct item (regression)', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  const ITEMS: Item[] = [
    { id: 1, beneficiary: 'AAA', status: 'DRAFT' },
    { id: 2, beneficiary: 'BBB', status: 'DRAFT' },
    { id: 3, beneficiary: 'CCC', status: 'DRAFT' },
  ];

  it('Select A, B, C → A preview → Next → B (B data, no stale A) → Next → C (C data) → Previous → B → Previous → A', async () => {
    renderBatchPage(buildBatchState(ITEMS));

    // A renders.
    expect(await screen.findByText('AAA')).toBeInTheDocument();
    expect(screen.getByText('الشيك 1 من 3')).toBeInTheDocument();
    expect(screen.queryByText('BBB')).not.toBeInTheDocument();
    expect(screen.queryByText('CCC')).not.toBeInTheDocument();

    // Next -> B.
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('BBB')).toBeInTheDocument();
    expect(screen.getByText('الشيك 2 من 3')).toBeInTheDocument();
    expect(screen.queryByText('AAA')).not.toBeInTheDocument();
    expect(screen.queryByText('CCC')).not.toBeInTheDocument();

    // Next -> C.
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('CCC')).toBeInTheDocument();
    expect(screen.getByText('الشيك 3 من 3')).toBeInTheDocument();
    expect(screen.queryByText('AAA')).not.toBeInTheDocument();
    expect(screen.queryByText('BBB')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'التالي' })).toBeDisabled();

    // Previous -> B.
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    expect(screen.getByText('BBB')).toBeInTheDocument();
    expect(screen.getByText('الشيك 2 من 3')).toBeInTheDocument();
    expect(screen.queryByText('AAA')).not.toBeInTheDocument();
    expect(screen.queryByText('CCC')).not.toBeInTheDocument();

    // Previous -> A.
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    expect(screen.getByText('AAA')).toBeInTheDocument();
    expect(screen.getByText('الشيك 1 من 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();

    // No printing or tracking happened from navigation alone anywhere above.
    expect(printCurrentViewWithResult).not.toHaveBeenCalled();
    expect(markChequePrinted).not.toHaveBeenCalled();
  });

  it('never skips or repeats an item across a full Next/Next/Previous/Previous walk', async () => {
    renderBatchPage(buildBatchState(ITEMS));
    const seen: string[] = [];

    const readActive = () => {
      if (screen.queryByText('AAA')) return 'AAA';
      if (screen.queryByText('BBB')) return 'BBB';
      if (screen.queryByText('CCC')) return 'CCC';
      return 'none';
    };

    seen.push(readActive());
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    seen.push(readActive());
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    seen.push(readActive());
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    seen.push(readActive());
    fireEvent.click(screen.getByRole('button', { name: 'السابق' }));
    seen.push(readActive());

    expect(seen).toEqual(['AAA', 'BBB', 'CCC', 'BBB', 'AAA']);
  });

  it('printing item B tracks only B\'s cheque id', async () => {
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'success' });
    vi.mocked(markChequePrinted).mockResolvedValue({ id: 2, status: 'PRINTED', printedAt: null, paymentVoucherNumber: null });

    renderBatchPage(buildBatchState(ITEMS));
    fireEvent.click(screen.getByRole('button', { name: 'التالي' })); // -> B (id 2)

    await printAndConfirm();

    expect(markChequePrinted).toHaveBeenCalledWith(2);
    expect(markChequePrinted).not.toHaveBeenCalledWith(1);
    expect(markChequePrinted).not.toHaveBeenCalledWith(3);
  });

  it('a successful DRAFT print is tracked correctly via the existing mark-printed flow', async () => {
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'success' });
    vi.mocked(markChequePrinted).mockResolvedValue({ id: 1, status: 'PRINTED', printedAt: null, paymentVoucherNumber: null });

    renderBatchPage(buildBatchState(ITEMS));
    await printAndConfirm();

    expect(markChequePrinted).toHaveBeenCalledWith(1);
  });

  it('cancel/error print result is never tracked', async () => {
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'cancelled', failureReason: 'Print job canceled' });

    renderBatchPage(buildBatchState(ITEMS));
    fireEvent.click(await screen.findByRole('button', { name: /طباعة/ }));
    await waitFor(() => expect(printCurrentViewWithResult).toHaveBeenCalledTimes(1));

    expect(markChequePrinted).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'تأكيد الطباعة' })).not.toBeInTheDocument();
  });

  it('Template A4 batch navigator also renders each item correctly (paperMode: a4)', async () => {
    renderBatchPage(buildBatchState(ITEMS, 'a4'));

    expect(await screen.findByText('AAA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('BBB')).toBeInTheDocument();
    expect(screen.queryByText('AAA')).not.toBeInTheDocument();
  });

  it('Template Real (178×89) batch navigator renders each item correctly', async () => {
    renderBatchPage(buildBatchState(ITEMS, 'real-cheque'));

    expect(await screen.findByText('AAA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('CCC')).toBeInTheDocument();
  });

  it('single (non-batch) Template printing is unchanged — no navigator, print+track works once', async () => {
    vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'success' });
    vi.mocked(markChequePrinted).mockResolvedValue({ id: 1, status: 'PRINTED', printedAt: null, paymentVoucherNumber: null });

    render(
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[{
        pathname: '/cheque-template/print',
        state: {
          surface: SURFACE,
          fields: [beneficiaryField()],
          runtimeData: { beneficiary: 'AAA' },
          paperMode: 'real-cheque',
          tracking: { id: 1, status: 'DRAFT', chequeNumber: 'C-1', beneficiaryName: 'AAA' },
        },
      }]}>
        <Routes>
          <Route path="/cheque-template/print" element={<ChequeTemplatePrintPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('AAA')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'التالي' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'السابق' })).not.toBeInTheDocument();
    expect(screen.queryByText(/الشيك \d+ من \d+/)).not.toBeInTheDocument();

    await printAndConfirm();
    expect(markChequePrinted).toHaveBeenCalledWith(1);
  });
});
