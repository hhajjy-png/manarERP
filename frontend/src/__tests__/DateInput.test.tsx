// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useState } from 'react';
import DateInput from '../components/DateInput';

// A tiny controlled host mirrors how forms use the component (value in, onChange out).
function Host({ initial = '', min, max, onValue }: { initial?: string; min?: string; max?: string; onValue?: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <div>
      <DateInput
        value={v}
        onChange={(next) => { setV(next); onValue?.(next); }}
        ariaLabel="تاريخ"
        min={min}
        max={max}
      />
      <span data-testid="iso">{v}</span>
    </div>
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function field() {
  return screen.getByLabelText('تاريخ') as HTMLInputElement;
}

describe('DateInput', () => {
  it('renders an existing value as DD/MM/YYYY (never raw ISO)', () => {
    render(<Host initial="2026-07-01" />);
    expect(field().value).toBe('01/07/2026');
    expect(field().value).not.toContain('-');
  });

  it('the visible field is a Western-digit, LTR text field (not a native date widget)', () => {
    render(<Host initial="2026-07-01" />);
    expect(field().getAttribute('type')).toBe('text');
    expect(field().getAttribute('dir')).toBe('ltr');
    expect(field().value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('accepts typed DD/MM/YYYY and emits canonical YYYY-MM-DD on blur', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '31/12/2025' } });
    fireEvent.blur(field());
    expect(screen.getByTestId('iso')).toHaveTextContent('2025-12-31');
    expect(onValue).toHaveBeenLastCalledWith('2025-12-31');
  });

  it('marks invalid calendar dates and does not emit a bad value', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '31/02/2026' } });
    fireEvent.blur(field());
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('iso')).toHaveTextContent(''); // nothing committed
    expect(onValue).not.toHaveBeenCalledWith('2026-02-31');
  });

  it('empty optional value stays empty (never Invalid Date / 1970)', () => {
    const onValue = vi.fn();
    render(<Host initial="2026-07-01" onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.blur(field());
    expect(onValue).toHaveBeenLastCalledWith('');
    expect(screen.getByTestId('iso')).toHaveTextContent('');
  });

  it('edit-without-change round-trips the stored date unchanged', () => {
    render(<Host initial="2024-02-29" />);
    expect(field().value).toBe('29/02/2024');
    fireEvent.blur(field()); // user opened and left the field untouched
    expect(screen.getByTestId('iso')).toHaveTextContent('2024-02-29');
  });

  it('rejects an out-of-range date via canonical min/max', () => {
    const onValue = vi.fn();
    render(<Host min="2026-01-01" max="2026-12-31" onValue={onValue} />);
    fireEvent.change(field(), { target: { value: '01/01/2027' } });
    fireEvent.blur(field());
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(onValue).not.toHaveBeenCalledWith('2027-01-01');
  });

  it('normalizes Arabic-Indic digits typed by the user', () => {
    render(<Host />);
    fireEvent.change(field(), { target: { value: '٠١/٠٧/٢٠٢٦' } });
    fireEvent.blur(field());
    expect(screen.getByTestId('iso')).toHaveTextContent('2026-07-01');
  });

  it('normalizes a pasted ISO date to DD/MM/YYYY', () => {
    render(<Host />);
    const el = field();
    fireEvent.paste(el, { clipboardData: { getData: () => '2026-07-01' } });
    expect(el.value).toBe('01/07/2026');
    expect(screen.getByTestId('iso')).toHaveTextContent('2026-07-01');
  });

  it('strips non-date characters while typing', () => {
    render(<Host />);
    fireEvent.change(field(), { target: { value: 'ab12/06/2026' } });
    expect(field().value).toBe('12/06/2026');
  });
});
