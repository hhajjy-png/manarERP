// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

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

describe('ChequeCalibrator — calibration test print isolation', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('test print triggers printing but marks/records no cheque and issues no POST', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { data: [] } } as any);

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

    fireEvent.click(screen.getByRole('button', { name: /اختبار المعايرة/ }));

    // Printing happened…
    expect(printCurrentView).toHaveBeenCalledTimes(1);
    // …but NOTHING was written: no mark-printed, no reprint, no template save.
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });
});
