// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { printCurrentViewWithResult } from '../utils/print';

afterEach(() => {
  vi.restoreAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).manar;
});

describe('printCurrentViewWithResult', () => {
  it('classifies a real success as success with no failureReason', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).manar = { printPage: vi.fn().mockResolvedValue({ success: true }) };

    const result = await printCurrentViewWithResult();

    expect(result).toEqual({ outcome: 'success', failureReason: undefined });
  });

  it('classifies Electron\'s documented cancellation reason as cancelled', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).manar = {
      printPage: vi.fn().mockResolvedValue({ success: false, failureReason: 'Print job canceled' }),
    };

    const result = await printCurrentViewWithResult();

    expect(result).toEqual({ outcome: 'cancelled', failureReason: 'Print job canceled' });
  });

  it('classifies any other failure reason as error, never as success', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).manar = {
      printPage: vi.fn().mockResolvedValue({ success: false, failureReason: 'Invalid printer settings' }),
    };

    const result = await printCurrentViewWithResult();

    expect(result).toEqual({ outcome: 'error', failureReason: 'Invalid printer settings' });
  });

  it('classifies an IPC rejection as error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).manar = { printPage: vi.fn().mockRejectedValue(new Error('boom')) };

    const result = await printCurrentViewWithResult();

    expect(result.outcome).toBe('error');
    expect(result.failureReason).toBe('boom');
  });

  it('reports "unknown" — NEVER "success" — when no Electron bridge is present', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).manar;
    vi.spyOn(window, 'print').mockImplementation(() => {});

    const result = await printCurrentViewWithResult();

    expect(result.outcome).toBe('unknown');
    expect(result.outcome).not.toBe('success');
  });
});
