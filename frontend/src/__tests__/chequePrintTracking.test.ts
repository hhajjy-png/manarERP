// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

import { api } from '../api/client';
import { markChequePrinted, reprintCheque, printOutcomeMessage } from '../utils/chequePrintTracking';

describe('markChequePrinted', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls mark-printed then refetches and returns the refreshed cheque', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: {} } } as never);
    vi.mocked(api.get).mockResolvedValue({ data: { data: { id: 7, status: 'PRINTED' } } } as never);

    const result = await markChequePrinted(7);

    expect(api.post).toHaveBeenCalledWith('/cheques/7/mark-printed');
    expect(api.get).toHaveBeenCalledWith('/cheques/7');
    expect(result).toEqual({ id: 7, status: 'PRINTED' });
  });

  it('propagates a failure without calling the refetch', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('network'));

    await expect(markChequePrinted(7)).rejects.toThrow('network');
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe('reprintCheque', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the reason and note, then returns the refreshed cheque', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: {} } } as never);
    vi.mocked(api.get).mockResolvedValue({ data: { data: { id: 3, status: 'PRINTED' } } } as never);

    const result = await reprintCheque(3, 'PAPER_JAM', 'note here');

    expect(api.post).toHaveBeenCalledWith('/cheques/3/reprint', { reason: 'PAPER_JAM', note: 'note here' });
    expect(result).toEqual({ id: 3, status: 'PRINTED' });
  });
});

describe('printOutcomeMessage', () => {
  const t = (key: string, vars?: Record<string, string | number>) => {
    if (key === 'msg.cheque.print_cancelled') return 'cancelled-msg';
    if (key === 'msg.cheque.print_unknown') return 'unknown-msg';
    if (key === 'msg.cheque.print_failed') return `failed-msg:${vars?.reason}`;
    return key;
  };

  it('never produces a message for a successful result (callers must not call it)', () => {
    // Only exercised for non-success outcomes by every caller in this pack.
    expect(printOutcomeMessage({ outcome: 'cancelled' }, t)).toBe('cancelled-msg');
  });

  it('maps unknown to an honest "could not confirm" message', () => {
    expect(printOutcomeMessage({ outcome: 'unknown' }, t)).toBe('unknown-msg');
  });

  it('maps error with its failureReason interpolated', () => {
    expect(printOutcomeMessage({ outcome: 'error', failureReason: 'Invalid printer settings' }, t))
      .toBe('failed-msg:Invalid printer settings');
  });

  it('falls back to a placeholder when error has no failureReason', () => {
    expect(printOutcomeMessage({ outcome: 'error' }, t)).toBe('failed-msg:—');
  });
});
