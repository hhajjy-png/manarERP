import { describe, it, expect, vi } from 'vitest';
import { syncProgressBus, emitSyncProgress } from '../syncProgressBus';

describe('syncProgressBus (Cloud Sync Progress Dialog v1)', () => {
  it('emits the exact phase and message passed in, with a timestamp', () => {
    const handler = vi.fn();
    syncProgressBus.on('progress', handler);
    try {
      emitSyncProgress('DOWNLOADING', 'جارٍ تنزيل النسخة الاحتياطية من Google Drive...');
      expect(handler).toHaveBeenCalledTimes(1);
      const event = handler.mock.calls[0][0];
      expect(event.phase).toBe('DOWNLOADING');
      expect(event.message).toBe('جارٍ تنزيل النسخة الاحتياطية من Google Drive...');
      expect(typeof event.at).toBe('number');
    } finally {
      syncProgressBus.off('progress', handler);
    }
  });

  it('preserves an empty message verbatim (never substitutes fabricated text)', () => {
    const handler = vi.fn();
    syncProgressBus.on('progress', handler);
    try {
      emitSyncProgress('READY', '');
      expect(handler.mock.calls[0][0]).toMatchObject({ phase: 'READY', message: '' });
    } finally {
      syncProgressBus.off('progress', handler);
    }
  });

  it('does not throw when emitted with zero subscribers', () => {
    expect(() => emitSyncProgress('OFFLINE', '')).not.toThrow();
  });

  it('notifies every subscriber for a single emit', () => {
    const a = vi.fn();
    const b = vi.fn();
    syncProgressBus.on('progress', a);
    syncProgressBus.on('progress', b);
    try {
      emitSyncProgress('COMPLETED', 'اكتملت الاستعادة بنجاح');
      expect(a).toHaveBeenCalledTimes(1);
      expect(b).toHaveBeenCalledTimes(1);
    } finally {
      syncProgressBus.off('progress', a);
      syncProgressBus.off('progress', b);
    }
  });
});
