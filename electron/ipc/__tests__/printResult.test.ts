import { describe, it, expect } from 'vitest';
import { mapPrintCallback, NO_FOCUSED_WINDOW_RESULT } from '../printResult';

describe('mapPrintCallback', () => {
  it('reports success with no failureReason when the print succeeds', () => {
    expect(mapPrintCallback(true, '')).toEqual({ success: true, failureReason: undefined });
  });

  it('reports failure with the reason when Electron reports a cancellation', () => {
    expect(mapPrintCallback(false, 'Print job canceled')).toEqual({
      success: false,
      failureReason: 'Print job canceled',
    });
  });

  it('reports failure with the reason on any other Electron failure', () => {
    expect(mapPrintCallback(false, 'Invalid printer settings')).toEqual({
      success: false,
      failureReason: 'Invalid printer settings',
    });
    expect(mapPrintCallback(false, 'Print job failed')).toEqual({
      success: false,
      failureReason: 'Print job failed',
    });
  });

  it('never carries a failureReason alongside success', () => {
    const result = mapPrintCallback(true, 'Print job canceled');
    expect(result.success).toBe(true);
    expect(result.failureReason).toBeUndefined();
  });
});

describe('NO_FOCUSED_WINDOW_RESULT', () => {
  it('is a failure with a descriptive reason', () => {
    expect(NO_FOCUSED_WINDOW_RESULT).toEqual({ success: false, failureReason: 'No focused window' });
  });
});
