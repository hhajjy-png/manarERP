// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTableSort } from '../hooks/useTableSort';

/**
 * Enterprise Data Grid Foundation v1 — دورة الفرز الثلاثية وذاكرة الفرز لكل وحدة.
 * الحالة تُحفظ تحت rp:<module>:sort ولا تتسرّب بين الوحدات.
 */

beforeEach(() => {
  localStorage.clear();
});

describe('useTableSort — three-state cycle', () => {
  it('default → asc → desc → default on the same column', () => {
    const { result } = renderHook(() => useTableSort('customers'));
    expect(result.current.sortBy).toBeNull();
    expect(result.current.getState('name')).toBe('none');

    act(() => result.current.toggle('name'));
    expect(result.current.sortBy).toBe('name');
    expect(result.current.sortDir).toBe('asc');
    expect(result.current.getState('name')).toBe('asc');

    act(() => result.current.toggle('name'));
    expect(result.current.sortDir).toBe('desc');
    expect(result.current.getState('name')).toBe('desc');

    act(() => result.current.toggle('name'));
    expect(result.current.sortBy).toBeNull();
    expect(result.current.getState('name')).toBe('none');
  });

  it('one active column only — clicking a new column starts it at ascending', () => {
    const { result } = renderHook(() => useTableSort('customers'));
    act(() => result.current.toggle('name'));
    act(() => result.current.toggle('name')); // name desc
    act(() => result.current.toggle('code')); // عمود جديد → asc
    expect(result.current.sortBy).toBe('code');
    expect(result.current.sortDir).toBe('asc');
    expect(result.current.getState('name')).toBe('none');
  });

  it('reset() returns to default explicitly (Reset Filters path)', () => {
    const { result } = renderHook(() => useTableSort('customers'));
    act(() => result.current.toggle('name'));
    act(() => result.current.reset());
    expect(result.current.sortBy).toBeNull();
  });

  it('onChange fires on every toggle and reset (ResourcePage page-1 reset hook)', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTableSort('customers', onChange));
    act(() => result.current.toggle('name'));
    act(() => result.current.reset());
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

describe('useTableSort — per-module persistence (Enterprise Sort Memory)', () => {
  it('survives unmount/remount via rp:<module>:sort', () => {
    const first = renderHook(() => useTableSort('employees'));
    act(() => first.result.current.toggle('hireDate'));
    act(() => first.result.current.toggle('hireDate')); // desc
    first.unmount();

    const second = renderHook(() => useTableSort('employees'));
    expect(second.result.current.sortBy).toBe('hireDate');
    expect(second.result.current.sortDir).toBe('desc');
    expect(localStorage.getItem('rp:employees:sort')).toBe(JSON.stringify({ by: 'hireDate', dir: 'desc' }));
  });

  it('never leaks between modules — each key is independent', () => {
    const customers = renderHook(() => useTableSort('customers'));
    const expenses = renderHook(() => useTableSort('expenses'));
    act(() => customers.result.current.toggle('name'));
    act(() => expenses.result.current.toggle('amount'));

    expect(customers.result.current.sortBy).toBe('name');
    expect(expenses.result.current.sortBy).toBe('amount');
    expect(localStorage.getItem('rp:customers:sort')).toBe(JSON.stringify({ by: 'name', dir: 'asc' }));
    expect(localStorage.getItem('rp:expenses:sort')).toBe(JSON.stringify({ by: 'amount', dir: 'asc' }));
  });

  it('uses the rp: prefix so logout clearPersistedUIState wipes it too', () => {
    const { result } = renderHook(() => useTableSort('users'));
    act(() => result.current.toggle('username'));
    expect(Object.keys(localStorage).some((k) => k === 'rp:users:sort')).toBe(true);
  });
});
