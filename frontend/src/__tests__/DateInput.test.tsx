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

describe('DateInput — calendar icon layout (overlap fix)', () => {
  function wrapper() {
    return field().closest('.mnr-dateinput') as HTMLElement;
  }

  it('renders exactly one visible text input and one calendar trigger', () => {
    render(<Host initial="2026-07-01" />);
    const w = wrapper();
    expect(w.querySelectorAll('input[type="text"]').length).toBe(1);
    expect(w.querySelectorAll('.mnr-dateinput__cal').length).toBe(1);
  });

  it('pins the control to dir="ltr" so the icon lane and value padding share one physical side', () => {
    render(<Host initial="2026-07-01" />);
    // The fix: a single inline axis regardless of the surrounding form direction.
    expect(wrapper().getAttribute('dir')).toBe('ltr');
    // The visible value input also stays ltr (reading order) and is the direct child
    // that receives the reserved icon padding via `.mnr-dateinput > input[type=text]`.
    expect(field().getAttribute('dir')).toBe('ltr');
    expect(field().parentElement).toBe(wrapper());
  });

  it('keeps dir="ltr" even inside an RTL container (the RTL overlap case)', () => {
    render(<div dir="rtl"><Host initial="2026-07-01" /></div>);
    expect(wrapper().getAttribute('dir')).toBe('ltr');
  });

  it('the calendar trigger opens the native picker (interaction preserved)', () => {
    const showPicker = vi.fn();
    // JSDOM has no showPicker — install a spy on the prototype for this test.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (HTMLInputElement.prototype as any).showPicker = showPicker;
    render(<Host initial="2026-07-01" />);
    fireEvent.click(wrapper().querySelector('.mnr-dateinput__cal') as HTMLElement);
    expect(showPicker).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLInputElement.prototype as any).showPicker;
  });

  it('read-only hides the calendar trigger (no second overlapping control)', () => {
    function ROHost() {
      const [v] = useState('2026-07-01');
      return <DateInput value={v} onChange={() => {}} ariaLabel="تاريخ" readOnly />;
    }
    render(<ROHost />);
    expect(wrapper().querySelectorAll('.mnr-dateinput__cal').length).toBe(0);
    expect(field().value).toBe('01/07/2026'); // value still readable
  });
});
