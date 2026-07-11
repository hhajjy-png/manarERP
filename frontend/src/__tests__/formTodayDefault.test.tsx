// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('../api/client', () => ({
  api: { get: vi.fn().mockResolvedValue({ data: { data: [] } }), post: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));

import FastMonthlyExpenseDialog from '../components/FastMonthlyExpenseDialog';
import { todayDateOnly, toLocalDateOnly } from '../lib/date';
import { isoToDisplay } from '../lib/dateInput';

afterEach(cleanup);

describe('New-record form default date uses the LOCAL calendar date (not UTC)', () => {
  it('FastMonthlyExpenseDialog defaults its date field to today in DD/MM/YYYY (local)', () => {
    render(<FastMonthlyExpenseDialog onClose={() => {}} onSaved={() => {}} suppliers={[]} />);
    const field = screen.getByLabelText('التاريخ') as HTMLInputElement;
    // The default must equal today's LOCAL date rendered as DD/MM/YYYY, proving the
    // form flows through todayDateOnly() rather than new Date().toISOString().slice(0,10).
    expect(field.value).toBe(isoToDisplay(todayDateOnly()));
    // And it equals the local formatting of the real current instant.
    expect(field.value).toBe(isoToDisplay(toLocalDateOnly(new Date())));
  });
});
