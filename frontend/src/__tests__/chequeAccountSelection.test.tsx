// @vitest-environment jsdom
/**
 * Multi-Bank Cheques Foundation v1 — عقد الواجهة.
 *
 * ما تثبته هذه المجموعة على شاشة الشيكات الحقيقية (لا على نص المصدر):
 *   • منتقي **الحساب البنكي** حلّ محل قائمة البنوك المعطّلة، ويُحمَّل من الخادم.
 *   • حساب نشط واحد ⇒ يُحدَّد تلقائيًا؛ أكثر من واحد ⇒ يختار المستخدم.
 *   • العرض «اسم البنك — اسم الحساب» فقط: لا رقم حساب ولا IBAN.
 *   • الحمولة تحمل `bankAccountId`، ولا ترسل `bankName` إطلاقًا.
 *   • حساب بلا قالب طباعة معتمد: الحفظ مسموح، والطباعة والمعاينة ممنوعتان،
 *     وطبقة الطباعة **لا تُركَّب أصلًا** — فلا سقوط على قالب بنك الخليج.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import {
  bankRegistryResponse,
  gulfChequeAccountFields,
  GULF_BANK_FIXTURE,
  NBK_BANK_FIXTURE,
  GULF_ACCOUNT_FIXTURE,
  NBK_ACCOUNT_FIXTURE,
} from './helpers/bankRegistry';

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
import { printCurrentViewWithResult } from '../utils/print';
import Cheques from '../pages/Cheques';
import { FinancialPeriodProvider } from '../context/FinancialPeriodContext';

const GULF_CHEQUE = {
  id: 1, chequeNumber: '000002', chequeDate: '2026-08-02T00:00:00.000Z',
  beneficiaryName: 'مستفيد الخليج', amount: 1370, currency: 'KWD',
  description: null, bankName: 'بنك الخليج', status: 'DRAFT',
  printedAt: null, cancelledAt: null, notes: null, printCount: 0,
  paymentVoucherNumber: null, createdAt: '2026-07-30',
  ...gulfChequeAccountFields(),
};

/** شيك على بنك جديد: مسجَّل بالكامل، لكن حسابه بلا قالب طباعة معتمد. */
const NBK_CHEQUE = {
  ...GULF_CHEQUE,
  id: 2, chequeNumber: '000003', beneficiaryName: 'مستفيد الوطني',
  bankName: 'بنك الكويت الوطني',
  bankAccountId: 2,
  bankAccount: { id: 2, accountName: 'الحساب الجاري', bankNameAr: 'بنك الكويت الوطني', label: 'بنك الكويت الوطني — الحساب الجاري', isActive: true },
  printEnabled: false,
};

function mockApi(options: { rows?: unknown[]; accounts?: unknown[]; banks?: unknown[] } = {}) {
  const rows = options.rows ?? [GULF_CHEQUE];
  vi.mocked(api.get).mockImplementation((url: string) => {
    const registry = bankRegistryResponse(url, {
      banks: (options.banks ?? [GULF_BANK_FIXTURE]) as never,
      accounts: (options.accounts ?? [GULF_ACCOUNT_FIXTURE]) as never,
    });
    if (registry) return Promise.resolve(registry as never);
    if (url === '/cheques') return Promise.resolve({ data: { data: { data: rows, meta: { total: rows.length } } } } as never);
    if (url === '/cheques/stats') return Promise.resolve({ data: { data: { total: rows.length, draft: rows.length, printed: 0, cancelled: 0 } } } as never);
    if (url === '/settings') return Promise.resolve({ data: { data: { settings: [{ key: 'cheques.defaultPrintProvider', value: 'classic' }] } } } as never);
    return Promise.resolve({ data: { data: [] } } as never);
  });
  vi.mocked(api.post).mockImplementation((_url: string, body: unknown) =>
    Promise.resolve({ data: { data: { ...GULF_CHEQUE, ...(body as object), id: 99 } } } as never));
  vi.mocked(api.put).mockImplementation((url: string, body: unknown) =>
    Promise.resolve({ data: { data: { ...GULF_CHEQUE, ...(body as object), id: Number(String(url).split('/').pop()) } } } as never));
  vi.mocked(printCurrentViewWithResult).mockResolvedValue({ outcome: 'success' } as never);
}

function renderPage() {
  return render(
    <FinancialPeriodProvider>
      <MemoryRouter future={ROUTER_FUTURE}><Cheques /></MemoryRouter>
    </FinancialPeriodProvider>,
  );
}

async function openNewChequeForm() {
  fireEvent.click(await screen.findByRole('button', { name: /page\.cheques\.new/ }));
  return screen.findByLabelText('field.cheque.bank_account') as Promise<HTMLSelectElement>;
}

beforeEach(() => { vi.clearAllMocks(); mockApi(); });
afterEach(cleanup);

// ── المنتقي ───────────────────────────────────────────────────────────────────

describe('the cheque form selects a BANK ACCOUNT, not a bank name', () => {
  it('offers a bank-account selector loaded from the server', async () => {
    renderPage();
    const select = await openNewChequeForm();
    expect(select).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/banks/accounts', expect.anything()));
  });

  it('is ENABLED — the old bank field was permanently disabled', async () => {
    renderPage();
    const select = await openNewChequeForm();
    await waitFor(() => expect(select).toBeEnabled());
  });

  it('shows "bank — account" and nothing more (no account number, no IBAN)', async () => {
    renderPage();
    const select = await openNewChequeForm();
    const option = await within(select).findByRole('option', { name: 'بنك الخليج — الحساب الرئيسي' });
    expect(option).toBeInTheDocument();
    expect(select.textContent).not.toMatch(/\d{6,}/);
    expect(select.textContent).not.toMatch(/KW\d{2}/i);
  });

  it('auto-selects when exactly one active account exists', async () => {
    renderPage();
    const select = await openNewChequeForm();
    await waitFor(() => expect(select.value).toBe(String(GULF_ACCOUNT_FIXTURE.id)));
  });

  it('leaves the choice to the user when several accounts exist', async () => {
    mockApi({ banks: [GULF_BANK_FIXTURE, NBK_BANK_FIXTURE], accounts: [GULF_ACCOUNT_FIXTURE, NBK_ACCOUNT_FIXTURE] });
    renderPage();
    const select = await openNewChequeForm();
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBe(3)); // + placeholder
    expect(select.value).toBe('');
  });

  it('sends bankAccountId and never a bank name', async () => {
    mockApi({ banks: [GULF_BANK_FIXTURE, NBK_BANK_FIXTURE], accounts: [GULF_ACCOUNT_FIXTURE, NBK_ACCOUNT_FIXTURE] });
    renderPage();
    const select = await openNewChequeForm();
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBe(3));

    fireEvent.change(select, { target: { value: String(NBK_ACCOUNT_FIXTURE.id) } });
    fireEvent.change(screen.getByLabelText('field.cheque.beneficiary'), { target: { value: 'مستفيد' } });
    fireEvent.change(screen.getByLabelText('field.cheque.number'), { target: { value: '000500' } });
    fireEvent.change(screen.getByLabelText('field.cheque.amount'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'page.cheques.save' }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const body = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>;
    expect(body.bankAccountId).toBe(NBK_ACCOUNT_FIXTURE.id);
    expect(body).not.toHaveProperty('bankName');
  });

  it('refuses to save with no account chosen', async () => {
    mockApi({ banks: [GULF_BANK_FIXTURE, NBK_BANK_FIXTURE], accounts: [GULF_ACCOUNT_FIXTURE, NBK_ACCOUNT_FIXTURE] });
    renderPage();
    const select = await openNewChequeForm();
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBe(3));

    fireEvent.change(screen.getByLabelText('field.cheque.beneficiary'), { target: { value: 'مستفيد' } });
    fireEvent.change(screen.getByLabelText('field.cheque.number'), { target: { value: '000500' } });
    fireEvent.change(screen.getByLabelText('field.cheque.amount'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'page.cheques.save' }));

    // الرسالة تظهر في لافتة الصفحة وفي الحوار معًا (سلوك `formError` القائم).
    expect((await screen.findAllByText('error.cheque.bank_account_required')).length).toBeGreaterThan(0);
    expect(api.post).not.toHaveBeenCalled();
  });
});

// ── بوابة الطباعة ─────────────────────────────────────────────────────────────

describe('an account with no approved print profile cannot print', () => {
  const openCheque = async (beneficiary: string) => {
    const cell = await screen.findByText(beneficiary);
    fireEvent.click(cell.closest('tr')!);
    const drawer = await screen.findByRole('dialog');
    fireEvent.click(within(drawer).getByRole('button', { name: 'action.preview_and_print' }));
  };

  it('blocks printing for an unconfigured account', async () => {
    mockApi({ rows: [NBK_CHEQUE], accounts: [NBK_ACCOUNT_FIXTURE], banks: [NBK_BANK_FIXTURE] });
    renderPage();
    await openCheque('مستفيد الوطني');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings'));
    expect(await screen.findByRole('button', { name: /page\.cheques\.print/ })).toBeDisabled();
  });

  it('never reaches the printer for an unconfigured account', async () => {
    mockApi({ rows: [NBK_CHEQUE], accounts: [NBK_ACCOUNT_FIXTURE], banks: [NBK_BANK_FIXTURE] });
    renderPage();
    await openCheque('مستفيد الوطني');

    // زر الطباعة معطّل أصلًا (`isPrintable` يشمل بوابة الحساب)، وهو حارس أقوى من
    // رسالة بعد الضغط: لا يوجد مسار يصل الطابعة أساسًا. الضغط عليه بلا أثر.
    const printButton = await screen.findByRole('button', { name: /page\.cheques\.print/ });
    expect(printButton).toBeDisabled();
    fireEvent.click(printButton);
    expect(printCurrentViewWithResult).not.toHaveBeenCalled();
  });

  it('keeps the print button available for the configured Gulf account', async () => {
    renderPage();
    await openCheque('مستفيد الخليج');
    await waitFor(async () =>
      expect(await screen.findByRole('button', { name: /page\.cheques\.print/ })).toBeEnabled());
  });

  // Legacy hardening gate: شيك قديم بلا حساب مربوط. الخادم يحسب `printEnabled`
  // من اسم بنكه: بنك مجهول ⇒ false، فلا طبقة ولا طباعة ولا سقوط على قالب الخليج.
  it('blocks printing for a legacy cheque of an unknown bank', async () => {
    const legacyUnknown = {
      ...GULF_CHEQUE, id: 3, chequeNumber: '000009', beneficiaryName: 'مستفيد قديم',
      bankName: 'بنك برقان', bankAccountId: null, bankAccount: null, printEnabled: false,
    };
    mockApi({ rows: [legacyUnknown] });
    renderPage();
    await openCheque('مستفيد قديم');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings'));
    expect(await screen.findByRole('button', { name: /page\.cheques\.print/ })).toBeDisabled();
  });

  it('allows printing a legacy cheque whose bank really is Gulf Bank', async () => {
    const legacyGulf = {
      ...GULF_CHEQUE, id: 4, chequeNumber: '000010', beneficiaryName: 'مستفيد خليج قديم',
      bankAccountId: null, bankAccount: null, printEnabled: true,
    };
    mockApi({ rows: [legacyGulf] });
    renderPage();
    await openCheque('مستفيد خليج قديم');
    await waitFor(async () =>
      expect(await screen.findByRole('button', { name: /page\.cheques\.print/ })).toBeEnabled());
  });

  it('still allows SAVING an edit on an unconfigured account', async () => {
    mockApi({ rows: [NBK_CHEQUE], accounts: [NBK_ACCOUNT_FIXTURE], banks: [NBK_BANK_FIXTURE] });
    renderPage();
    const cell = await screen.findByText('مستفيد الوطني');
    fireEvent.click(cell.closest('tr')!);
    const drawer = await screen.findByRole('dialog');
    fireEvent.click(within(drawer).getByRole('button', { name: 'action.edit' }));

    fireEvent.change(await screen.findByLabelText('field.cheque.amount'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'page.cheques.save' }));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(vi.mocked(api.put).mock.calls[0][1]).toMatchObject({ amount: 999 });
  });

  it('warns in the editor that printing is not configured for the chosen account', async () => {
    mockApi({ rows: [NBK_CHEQUE], accounts: [NBK_ACCOUNT_FIXTURE], banks: [NBK_BANK_FIXTURE] });
    renderPage();
    const cell = await screen.findByText('مستفيد الوطني');
    fireEvent.click(cell.closest('tr')!);
    const drawer = await screen.findByRole('dialog');
    fireEvent.click(within(drawer).getByRole('button', { name: 'action.edit' }));

    expect(await screen.findByText(/لم يتم إعداد قالب الطباعة/)).toBeInTheDocument();
  });
});
