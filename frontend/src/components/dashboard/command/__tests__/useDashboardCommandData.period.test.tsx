// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock the axios client BEFORE importing the hook.
vi.mock('../../../../api/client', () => ({
  api: { get: vi.fn() },
}));

import { api } from '../../../../api/client';
import { useDashboardCommandData } from '../useDashboardCommandData';

const mockedGet = api.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockedGet.mockResolvedValue({ data: { data: null } });
});

/** يلتقط معاملات استدعاء decision-center. */
function decisionCall() {
  return mockedGet.mock.calls.find((c) => String(c[0]).includes('/executive/decision-center'));
}

describe('useDashboardCommandData — period params', () => {
  it('forwards fromDate/toDate to the decision-center endpoint', async () => {
    renderHook(() => useDashboardCommandData(0, { fromDate: '2024-01-01', toDate: '2024-12-31' }));
    await waitFor(() => expect(decisionCall()).toBeDefined());
    expect(decisionCall()![1]).toEqual({ params: { fromDate: '2024-01-01', toDate: '2024-12-31' } });
  });

  it('refetches when the period changes (new query key)', async () => {
    const { rerender } = renderHook(
      ({ p }: { p: { fromDate?: string; toDate?: string } }) => useDashboardCommandData(0, p),
      { initialProps: { p: { fromDate: '2026-01-01', toDate: '2026-07-10' } } },
    );
    await waitFor(() => expect(decisionCall()).toBeDefined());
    const firstCount = mockedGet.mock.calls.filter((c) => String(c[0]).includes('decision-center')).length;

    rerender({ p: { fromDate: '2024-01-01', toDate: '2024-12-31' } });
    await waitFor(() => {
      const n = mockedGet.mock.calls.filter((c) => String(c[0]).includes('decision-center')).length;
      expect(n).toBeGreaterThan(firstCount);
    });
    // آخر استدعاء يحمل الفترة الجديدة.
    const last = [...mockedGet.mock.calls].reverse().find((c) => String(c[0]).includes('decision-center'));
    expect(last![1]).toEqual({ params: { fromDate: '2024-01-01', toDate: '2024-12-31' } });
  });

  it('all-periods → no date bounds sent', async () => {
    renderHook(() => useDashboardCommandData(0, {}));
    await waitFor(() => expect(decisionCall()).toBeDefined());
    expect(decisionCall()![1]).toEqual({ params: { fromDate: undefined, toDate: undefined } });
  });
});
