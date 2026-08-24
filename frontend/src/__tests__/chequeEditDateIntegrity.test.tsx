// @vitest-environment jsdom
/**
 * Printed Cheque Edit Data & Date Integrity Fix v1 — regression suite.
 *
 * ROOT CAUSE (proven, not assumed): `loadChequeIntoForm` seeded `form.chequeDate`
 * with `formatDisplayDate(cheque.chequeDate)` — a DD/MM/YYYY DISPLAY string meant
 * for read-only rendering — while `DateInput` and `handleSave`'s save payload both
 * require the canonical 'YYYY-MM-DD' contract (see lib/dateInput.ts).
 *
 * Two independent symptoms followed from that ONE mismatch:
 *   1. `DateInput`'s internal text is `isoToDisplay(value)`, which returns '' for
 *      anything that isn't already ISO — so the visible date field rendered BLANK
 *      the instant an existing cheque's edit form opened.
 *   2. If the user never touched the date, `handleSave` forwarded that raw
 *      DD/MM/YYYY string to the API unconverted. The backend's `z.coerce.date()`
 *      calls `new Date(...)`, and a non-ISO slash-separated string is parsed by
 *      V8's ambiguous MM/DD/YYYY heuristic — silently rewriting, e.g.,
 *      `02/08/2026` (2 August) to 8 February, on nothing more than an
 *      amount-only edit. `31/03/2025` (day > 12) instead produced an outright
 *      Invalid Date, failing the save.
 *
 * Fix: `loadChequeIntoForm` now seeds `form.chequeDate` with
 * `normalizeDateOnly(cheque.chequeDate)` — the project's existing pure-string ISO
 * extractor already used elsewhere for exactly this contract. No `Date` is built
 * on the value path, so no timezone-driven day shift either.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Route, Routes, useLocation, MemoryRouter } from 'react-router-dom';
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

// ── Fixtures ─────────────────────────────────────────────────────────────────
// Every date is stored the way the API actually serializes a Prisma DateTime:
// an ISO datetime string at UTC midnight.

function makeCheque(over: Record<string, unknown>) {
  return {
    id: 46, chequeNumber: '000002', chequeDate: '2026-08-02T00:00:00.000Z',
    beneficiaryName: 'ساير طليحان العذاب', amount: 1370, currency: 'KWD',
    description: null, bankName: 'بنك الخليج', status: 'PRINTED',
    printedAt: '2026-08-03T00:00:00.000Z', cancelledAt: null, notes: null,
    paymentVoucherNumber: null, printCount: 1, createdAt: '2026-07-30',
    // حقول الحساب البنكي التي صار الخادم يرفقها بكل شيك.
    ...gulfChequeAccountFields(),
    ...over,
  };
}

// 2 August 2026 — the case from the bug report.
const CHEQUE_AUG2 = makeCheque({});
// 8 February 2026 — the digit-swapped counterpart; must NEVER become Aug 2.
const CHEQUE_FEB8 = makeCheque({ id: 50, chequeNumber: '000010', chequeDate: '2026-02-08T00:00:00.000Z' });
// 31 March 2025 — day > 12, defeats any MM/DD-style parser outright.
const CHEQUE_MAR31 = makeCheque({ id: 51, chequeNumber: '000011', chequeDate: '2025-03-31T00:00:00.000Z' });

let rows: ReturnType<typeof makeCheque>[] = [];

function mockApi(seed: ReturnType<typeof makeCheque>[]) {
  rows = seed;
  vi.mocked(api.get).mockImplementation((url: string) => {
    // سجل البنوك — بنك الخليج بحسابه الرئيسي المهيأ للطباعة، كما في الإنتاج.
    const registry = bankRegistryResponse(url);
    if (registry) return Promise.resolve(registry as never);
    if (url === '/cheques') return Promise.resolve({ data: { data: { data: rows, meta: { total: rows.length } } } } as never);
    if (url === '/cheques/stats') return Promise.resolve({ data: { data: { total: rows.length, draft: 0, printed: rows.length, cancelled: 0 } } } as never);
    if (url === '/settings') return Promise.resolve({ data: { data: { settings: [{ key: 'cheques.defaultPrintProvider', value: 'classic' }] } } } as never);
    return Promise.resolve({ data: { data: [] } } as never);
  });
  // PUT echoes the merged record exactly as the real API does — INCLUDING running
  // the same coercion the real Zod schema performs on chequeDate, so a bug that
  // only manifests server-side (the MM/DD/YYYY misparse) is caught here too.
  vi.mocked(api.put).mockImplementation((url: string, data?: unknown) => {
    const body = data as Record<string, unknown>;
    const id = Number(String(url).split('/').pop());
    const current = rows.find((r) => r.id === id)!;
    const coercedDate = body.chequeDate !== undefined
      ? new Date(body.chequeDate as string).toISOString()
      : current.chequeDate;
    const updated = { ...current, ...body, chequeDate: coercedDate, id };
    rows = rows.map((r) => (r.id === id ? updated : r));
    return Promise.resolve({ data: { data: updated } } as never);
  });
  vi.mocked(api.post).mockResolvedValue({ data: { data: {} } } as never);
}

function renderPage() {
  return render(
    <FinancialPeriodProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/cheques']}>
        <Routes>
          <Route path="/cheques" element={<Cheques />} />
          <Route path="/cheque-template/print" element={<PrintStateProbe />} />
        </Routes>
      </MemoryRouter>
    </FinancialPeriodProvider>,
  );
}

/**
 * The printed values used to be observable in the hidden Classic print layer.
 * That layer was removed with the Classic template ("Keep Gulf Bank Template
 * Only"); printing now navigates to the cheque print route carrying the resolved
 * runtime data. This probe renders at that route and exposes the state, so these
 * tests still assert what ACTUALLY reaches the paper — one step closer to it than
 * the old DOM layer was.
 */
function PrintStateProbe() {
  const { state } = useLocation() as { state: { runtimeData?: Record<string, string> } | null };
  return <div data-testid="print-state">{JSON.stringify(state?.runtimeData ?? {})}</div>;
}

/** Print the currently selected cheque and return the runtime data handed to the printer. */
async function printedRuntimeData(): Promise<Record<string, string>> {
  fireEvent.click(await screen.findByRole('button', { name: /page\.cheques\.print/ }));
  const probe = await screen.findByTestId('print-state');
  return JSON.parse(probe.textContent || '{}') as Record<string, string>;
}

async function openDrawer(beneficiary: string) {
  const cell = await screen.findByText(beneficiary);
  fireEvent.click(cell.closest('tr')!);
  return screen.findByRole('dialog');
}

async function openEditFor(beneficiary: string) {
  const drawer = await openDrawer(beneficiary);
  fireEvent.click(within(drawer).getByRole('button', { name: 'action.edit' }));
  return screen.findByLabelText('field.cheque.date') as Promise<HTMLInputElement>;
}

function dateField(): HTMLInputElement {
  return screen.getByLabelText('field.cheque.date') as HTMLInputElement;
}

async function save() {
  fireEvent.click(screen.getByRole('button', { name: 'page.cheques.save' }));
  await waitFor(() => expect(api.put).toHaveBeenCalled());
  return vi.mocked(api.put).mock.calls[0][1] as Record<string, unknown>;
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

// ── A) Open → Save without edits ─────────────────────────────────────────────

describe('A) Open → Save without edits', () => {
  it('every field round-trips identically — old value == form value == save payload', async () => {
    mockApi([CHEQUE_AUG2]);
    renderPage();
    const dateInput = await openEditFor('ساير طليحان العذاب');

    // The field the user SEES, right after opening — this is symptom #1 of the bug.
    expect(dateInput).toHaveValue('02/08/2026');
    expect(screen.getByLabelText('field.cheque.beneficiary')).toHaveValue('ساير طليحان العذاب');
    expect(screen.getByLabelText('field.cheque.number')).toHaveValue('000002');
    expect(screen.getByLabelText('field.cheque.amount')).toHaveValue(1370);

    const body = await save();
    expect(body).toMatchObject({
      chequeDate: '2026-08-02',
      chequeNumber: '000002',
      beneficiaryName: 'ساير طليحان العذاب',
      amount: 1370,
      currency: 'KWD',
      // هوية البنك في الحمولة صارت الحساب البنكي منذ Multi-Bank Cheques
      // Foundation v1؛ `bankName` يشتقه الخادم من بنك ذلك الحساب ولا يُرسَل.
      bankAccountId: 1,
    });
    expect(rows.find((r) => r.id === 46)!.chequeDate).toBe('2026-08-02T00:00:00.000Z');
  });
});

// ── B) Edit amount only ──────────────────────────────────────────────────────

describe('B) Edit amount only', () => {
  it('the date and every other field are untouched in the save payload', async () => {
    mockApi([CHEQUE_AUG2]);
    renderPage();
    await openEditFor('ساير طليحان العذاب');
    fireEvent.change(screen.getByLabelText('field.cheque.amount'), { target: { value: '2480.500' } });

    const body = await save();
    expect(body.amount).toBe(2480.5);
    expect(body.chequeDate).toBe('2026-08-02');
    expect(body.beneficiaryName).toBe('ساير طليحان العذاب');
    expect(body.bankAccountId).toBe(1);
    expect(body.chequeNumber).toBe('000002');
    // The persisted record's date must survive the round trip unchanged.
    expect(rows.find((r) => r.id === 46)!.chequeDate).toBe('2026-08-02T00:00:00.000Z');
  });
});

// ── C) Edit payee only ───────────────────────────────────────────────────────

describe('C) Edit payee only', () => {
  it('the date, amount and every other field are untouched', async () => {
    mockApi([CHEQUE_AUG2]);
    renderPage();
    await openEditFor('ساير طليحان العذاب');
    fireEvent.change(screen.getByLabelText('field.cheque.beneficiary'), { target: { value: 'مستفيد مصحّح' } });

    const body = await save();
    expect(body.beneficiaryName).toBe('مستفيد مصحّح');
    expect(body.chequeDate).toBe('2026-08-02');
    expect(body.amount).toBe(1370);
    expect(body.bankAccountId).toBe(1);
    expect(rows.find((r) => r.id === 46)!.chequeDate).toBe('2026-08-02T00:00:00.000Z');
  });
});

// ── D) 02/08/2026 stays 2 August across the whole round trip ────────────────

describe('D) 02/08/2026 = 2 August 2026, end to end', () => {
  it('load → form display → save payload → reload all agree on 2 August', async () => {
    mockApi([CHEQUE_AUG2]);
    renderPage();
    const dateInput = await openEditFor('ساير طليحان العذاب');
    expect(dateInput).toHaveValue('02/08/2026'); // displayed, not blank, not swapped

    const body = await save();
    expect(body.chequeDate).toBe('2026-08-02');
    expect(rows.find((r) => r.id === 46)!.chequeDate).toBe('2026-08-02T00:00:00.000Z');

    // Reopen — re-fetched record must still read 2 August.
    cleanup();
    renderPage();
    const reopened = await openEditFor('ساير طليحان العذاب');
    expect(reopened).toHaveValue('02/08/2026');
  });

  it('never becomes 8 February anywhere in the pipeline', async () => {
    mockApi([CHEQUE_AUG2]);
    renderPage();
    const dateInput = await openEditFor('ساير طليحان العذاب');
    expect(dateInput).not.toHaveValue('08/02/2026');
    const body = await save();
    expect(body.chequeDate).not.toBe('2026-02-08');
  });
});

// ── E) 08/02/2026 stays 8 February ───────────────────────────────────────────

describe('E) 08/02/2026 = 8 February 2026, end to end', () => {
  it('load → form display → save payload → reload all agree on 8 February', async () => {
    mockApi([CHEQUE_FEB8]);
    renderPage();
    const dateInput = await openEditFor('ساير طليحان العذاب');
    expect(dateInput).toHaveValue('08/02/2026');

    const body = await save();
    expect(body.chequeDate).toBe('2026-02-08');
    expect(rows.find((r) => r.id === 50)!.chequeDate).toBe('2026-02-08T00:00:00.000Z');

    cleanup();
    renderPage();
    const reopened = await openEditFor('ساير طليحان العذاب');
    expect(reopened).toHaveValue('08/02/2026');
    expect(reopened).not.toHaveValue('02/08/2026'); // never inverted back to Aug 2
  });
});

// ── F) 31/03/2025 defeats any ambiguous parser ───────────────────────────────

describe('F) 31/03/2025 — day > 12, reveals any US-style/ambiguous parser', () => {
  it('displays correctly and SAVES SUCCESSFULLY (no Invalid Date rejection)', async () => {
    mockApi([CHEQUE_MAR31]);
    renderPage();
    const dateInput = await openEditFor('ساير طليحان العذاب');
    expect(dateInput).toHaveValue('31/03/2025'); // not blank

    const body = await save();
    expect(body.chequeDate).toBe('2025-03-31');
    // A month/day-swapping parser would reject "31/03/2025" as Invalid Date,
    // failing the save outright — proves the payload is unambiguous ISO.
    expect(new Date(body.chequeDate as string).toString()).not.toBe('Invalid Date');
    expect(rows.find((r) => r.id === 51)!.chequeDate).toBe('2025-03-31T00:00:00.000Z');
  });
});

// ── G) User intentionally changes the date ───────────────────────────────────

describe('G) User intentionally changes the date', () => {
  it('saves and reopens with the NEW date the user typed, not the original', async () => {
    mockApi([CHEQUE_AUG2]); // starts at 02/08/2026
    renderPage();
    const dateInput = await openEditFor('ساير طليحان العذاب');
    expect(dateInput).toHaveValue('02/08/2026');

    fireEvent.change(dateInput, { target: { value: '08/02/2026' } });
    fireEvent.blur(dateInput);
    expect(dateField()).toHaveValue('08/02/2026');

    const body = await save();
    expect(body.chequeDate).toBe('2026-02-08');
    expect(rows.find((r) => r.id === 46)!.chequeDate).toBe('2026-02-08T00:00:00.000Z');

    cleanup();
    renderPage();
    const reopened = await openEditFor('ساير طليحان العذاب');
    expect(reopened).toHaveValue('08/02/2026');
  });
});

// ── H) Printing after edit uses the corrected chequeDate ────────────────────

describe('H) Printing after edit reads the saved chequeDate', () => {
  it('the print job carries the edited date, not the pre-edit one', async () => {
    mockApi([CHEQUE_AUG2]);
    renderPage();
    await openEditFor('ساير طليحان العذاب');
    const dateInput = dateField();
    fireEvent.change(dateInput, { target: { value: '08/02/2026' } });
    fireEvent.blur(dateInput);
    await save();

    const runtime = await printedRuntimeData();
    expect(runtime.chequeDate).toBe('08 / 02 / 2026');
    expect(runtime.chequeDay).toBe('08');
    expect(runtime.chequeMonth).toBe('02');
    expect(runtime.chequeYear).toBe('2026');
  });

  it('an unmodified date still prints correctly after an unrelated edit', async () => {
    mockApi([CHEQUE_AUG2]);
    renderPage();
    await openEditFor('ساير طليحان العذاب');
    fireEvent.change(screen.getByLabelText('field.cheque.amount'), { target: { value: '999' } });
    await save();

    const runtime = await printedRuntimeData();
    expect(runtime.chequeDate).toBe('02 / 08 / 2026');
  });
});

// ── I) No regression on cheque creation / plain view / print ────────────────

describe('I) No regression elsewhere', () => {
  it('creating a NEW cheque still defaults chequeDate to today (ISO) and is unaffected', async () => {
    mockApi([]);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'page.cheques.new' }));
    const dateInput = await screen.findByLabelText('field.cheque.date') as HTMLInputElement;
    // Today's date, displayed DD/MM/YYYY — a real, non-empty value (proves the
    // create path, which never goes through `loadChequeIntoForm`, is untouched).
    expect(dateInput.value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('viewing (not editing) an existing cheque still shows the correct date', async () => {
    mockApi([CHEQUE_AUG2]);
    renderPage();
    const drawer = await openDrawer('ساير طليحان العذاب');
    expect(within(drawer).getByText('02/08/2026')).toBeInTheDocument();
  });

  it('the cheques table itself still renders the correct date per row', async () => {
    mockApi([CHEQUE_AUG2, CHEQUE_FEB8]);
    renderPage();
    const table = await screen.findByRole('table');
    await waitFor(() => {
      expect(within(table).getByText('02/08/2026')).toBeInTheDocument();
      expect(within(table).getByText('08/02/2026')).toBeInTheDocument();
    });
  });
});
