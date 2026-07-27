// @vitest-environment jsdom
//
// NBK Salary Export — Native XLS Generation v1.
//
// Verifies the safety property this pack exists for: when the native Excel-COM
// path is available (window.manar.generateNbkSalaryXls present) but fails, the
// component must show the error and must NEVER silently fall back to the SheetJS
// writer — that writer is proven (manual Excel A/B test) to produce a file Office
// flags with the Protected View "may harm your computer" warning. The SheetJS path
// stays reachable ONLY when there is no Electron bridge at all (dev/browser preview).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { PayrollBankExportResult } from '../api/payrollBankExport';

// `vi.mock` factories are hoisted above all top-level const declarations, so the
// fixture must be self-contained inside the factory rather than referencing an
// outer helper function.
vi.mock('../api/payrollBankExport', () => ({
  getExportProfiles: vi.fn().mockResolvedValue([]),
  getExportPreview: vi.fn().mockResolvedValue({
    profileId: 'nbk_salary_xls', profileLabel: 'NBK', fileExtension: 'xls',
    currency: 'KWD', amountDecimals: 3, month: 7, year: 2026,
    sheets: [
      {
        name: 'Salary Details',
        columns: [
          { header: 'Payment Serial Number', key: 'serial' },
          { header: 'Beneficiary Name', key: 'name' },
          { header: 'Beneficiary Civil Id', key: 'civilId', numFmt: '0' },
          { header: 'Account # for NBK A/C & IBAN for other Bank', key: 'account' },
          { header: "Beneficiary Bank (Refer next sheet 'Bank Codes' for list of Banks)", key: 'bank' },
          { header: 'Payment Currency (only KWD)', key: 'currency' },
          { header: 'Payment Amount', key: 'amount' },
        ],
        rows: [
          { serial: 1, name: 'FAKE EMPLOYEE', civilId: 111111111111, account: 1111111111, bank: 'NBK', currency: 'KWD', amount: 100 },
        ],
      },
      { name: 'Bank Codes', columns: [{ header: 'Bank Code', key: 'code' }, { header: 'Bank Name', key: 'name' }], rows: [] },
    ],
    summary: { employeeCount: 1, totalAmount: 100, currency: 'KWD' },
    valid: true, errors: [],
  }),
}));

const downloadBankExportXls = vi.fn();
vi.mock('../utils/payrollBankExportXls', () => ({
  downloadBankExportXls: (...args: unknown[]) => downloadBankExportXls(...args),
  bankExportFileName: () => 'NBK_Salary_2026_07.xls',
}));

const downloadBlob = vi.fn();
vi.mock('../utils/exportUtils', () => ({
  downloadBlob: (...args: unknown[]) => downloadBlob(...args),
}));

import PayrollBankExport from '../components/salaries/PayrollBankExport';

function fixtureResult(): PayrollBankExportResult {
  return {
    profileId: 'nbk_salary_xls', profileLabel: 'NBK', fileExtension: 'xls',
    currency: 'KWD', amountDecimals: 3, month: 7, year: 2026,
    sheets: [
      {
        name: 'Salary Details',
        columns: [
          { header: 'Payment Serial Number', key: 'serial' },
          { header: 'Beneficiary Name', key: 'name' },
          { header: 'Beneficiary Civil Id', key: 'civilId', numFmt: '0' },
          { header: 'Account # for NBK A/C & IBAN for other Bank', key: 'account' },
          { header: "Beneficiary Bank (Refer next sheet 'Bank Codes' for list of Banks)", key: 'bank' },
          { header: 'Payment Currency (only KWD)', key: 'currency' },
          { header: 'Payment Amount', key: 'amount' },
        ],
        rows: [
          { serial: 1, name: 'FAKE EMPLOYEE', civilId: 111111111111, account: 1111111111, bank: 'NBK', currency: 'KWD', amount: 100 },
        ],
      },
      { name: 'Bank Codes', columns: [{ header: 'Bank Code', key: 'code' }, { header: 'Bank Name', key: 'name' }], rows: [] },
    ],
    summary: { employeeCount: 1, totalAmount: 100, currency: 'KWD' },
    valid: true, errors: [],
  };
}

async function renderAndPreview() {
  render(<PayrollBankExport />);
  fireEvent.click(await screen.findByText('معاينة'));
  await waitFor(() => expect(screen.getByText('توليد ملف NBK (.xls)')).toBeInTheDocument());
}

afterEach(() => {
  cleanup();
  downloadBankExportXls.mockClear();
  downloadBlob.mockClear();
  delete (window as unknown as { manar?: unknown }).manar;
});

describe('PayrollBankExport — generate() native-vs-fallback safety', () => {
  it('uses the native Excel-COM bridge and never touches SheetJS when it is available and succeeds', async () => {
    const generateNbkSalaryXls = vi.fn().mockResolvedValue({ success: true, bytes: new Uint8Array([1, 2, 3]) });
    (window as unknown as { manar: unknown }).manar = { generateNbkSalaryXls };

    await renderAndPreview();
    fireEvent.click(screen.getByText('توليد ملف NBK (.xls)'));

    await waitFor(() => expect(generateNbkSalaryXls).toHaveBeenCalledTimes(1));
    // The exact rows/columns the backend already validated are forwarded verbatim.
    expect(generateNbkSalaryXls).toHaveBeenCalledWith(fixtureResult().sheets);
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1));
    expect(downloadBlob.mock.calls[0][1]).toBe('NBK_Salary_2026_07.xls');
    expect(downloadBankExportXls).not.toHaveBeenCalled();
  });

  it('shows the error and does NOT silently fall back to SheetJS when the native bridge fails', async () => {
    const generateNbkSalaryXls = vi.fn().mockResolvedValue({
      success: false,
      error: 'تعذّر إنشاء ملف الرواتب البنكي: Microsoft Excel غير مثبَّت أو غير متاح على هذا الجهاز.',
      errorCode: 'EXCEL_COM_UNAVAILABLE',
    });
    (window as unknown as { manar: unknown }).manar = { generateNbkSalaryXls };

    await renderAndPreview();
    fireEvent.click(screen.getByText('توليد ملف NBK (.xls)'));

    await waitFor(() => expect(generateNbkSalaryXls).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Microsoft Excel غير مثبَّت/)).toBeInTheDocument();
    // The critical safety property: no silent fallback to a writer known to trigger
    // Office Protected View.
    expect(downloadBankExportXls).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('falls back to the SheetJS path only when there is no Electron bridge at all (dev/browser preview)', async () => {
    // window.manar is left undefined entirely — distinct from "bridge present but failed".
    await renderAndPreview();
    fireEvent.click(screen.getByText('توليد ملف NBK (.xls)'));

    await waitFor(() => expect(downloadBankExportXls).toHaveBeenCalledTimes(1));
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
