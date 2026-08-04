// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { handoffToModule } from '../../../lib/drilldownHandoff';
import { monthDisplay } from '../AnalysisTable';

/* اختبارات نقاط الاقتران الحسّاسة في مركز التحليل المالي:
   تسليم الفلاتر إلى مستعرضات الوحدات، وتنسيق وسم الشهر. */

const read = (key: string) => JSON.parse(localStorage.getItem(key) ?? 'null');

describe('monthDisplay', () => {
  it('renders YYYY-MM as MM/YYYY with western digits', () => {
    expect(monthDisplay('2026-01')).toBe('01/2026');
    expect(monthDisplay('2025-12')).toBe('12/2025');
  });

  it('passes malformed input through untouched instead of inventing a date', () => {
    expect(monthDisplay('2026')).toBe('2026');
    expect(monthDisplay('')).toBe('');
  });
});

describe('handoffToModule', () => {
  beforeEach(() => localStorage.clear());

  it('seeds the invoice browser with the sales direction and the drilled customer', () => {
    handoffToModule({ kind: 'revenue', customerId: 42 });
    expect(read('inv:direction')).toBe('SALES');
    expect(read('inv:customer')).toBe('42');
    expect(read('inv:page')).toBe(1);
    expect(read('inv:status')).toBe('');
    expect(read('inv:search')).toBe('');
  });

  it('clears the customer filter when the drill had no customer scope', () => {
    localStorage.setItem('inv:customer', JSON.stringify('7'));
    handoffToModule({ kind: 'revenue' });
    expect(read('inv:customer')).toBe('');
  });

  it('routes collections through the invoice browser too (payments live on invoices)', () => {
    handoffToModule({ kind: 'collections', customerId: 9 });
    expect(read('inv:customer')).toBe('9');
    expect(read('inv:direction')).toBe('SALES');
    expect(localStorage.getItem('exp:category')).toBeNull();
  });

  it('seeds the expense browser with the approved status the analysis engine counts', () => {
    handoffToModule({ kind: 'expenses', category: 'FUEL' });
    expect(read('exp:status')).toBe('APPROVED');
    expect(read('exp:category')).toBe('FUEL');
    expect(read('exp:page')).toBe(1);
    expect(read('exp:supplier')).toBe('');
    expect(localStorage.getItem('inv:customer')).toBeNull();
  });

  it('clears the category filter when the drill was the expenses total', () => {
    localStorage.setItem('exp:category', JSON.stringify('RENT'));
    handoffToModule({ kind: 'expenses' });
    expect(read('exp:category')).toBe('');
  });
});
