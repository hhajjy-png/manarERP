// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { printCurrentView } from '../utils/print';

afterEach(() => {
  vi.restoreAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).manar;
});

describe('printCurrentView', () => {
  it('uses the Electron native bridge (window.manar.printPage) when available', () => {
    const printPage = vi.fn().mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).manar = { printPage };
    const winPrint = vi.spyOn(window, 'print').mockImplementation(() => {});

    printCurrentView();

    expect(printPage).toHaveBeenCalledOnce();
    expect(winPrint).not.toHaveBeenCalled();
  });

  it('falls back to window.print() when the bridge is absent (web/dev)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).manar;
    const winPrint = vi.spyOn(window, 'print').mockImplementation(() => {});

    printCurrentView();

    expect(winPrint).toHaveBeenCalledOnce();
  });
});
