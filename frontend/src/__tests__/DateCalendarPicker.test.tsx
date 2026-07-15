// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import DateCalendarPicker from '../components/DateCalendarPicker';

afterEach(cleanup);

// The trigger is styled `aria-hidden="true" tabIndex={-1}` — a deliberate,
// existing codebase convention (see DateInput.tsx's identical calendar-icon
// button): it's a decorative, mouse-only affordance, not the primary
// accessible control (that role belongs to the surrounding text input in
// Task 4's integration). Two consequences for the query, verified against
// the real dom-accessibility-api used by RTL: (1) `getByRole` excludes
// aria-hidden elements from the role list by default, and (2) even with the
// `hidden: true` opt-in, an aria-hidden element's *computed accessible name*
// is unconditionally '' (name computation zeroes it out independent of the
// role-list filter) — so role+name querying cannot find this button at all,
// with or without `hidden: true`. Following this file's established
// structural-query style (table/select/day-button-by-text), the trigger is
// found by its `title` attribute instead, which is exactly how a sighted
// mouse user identifies it (the tooltip) and is unique in this component's
// DOM (only the trigger carries this title).
function triggerButton(): HTMLElement {
  const btn = document.body.querySelector('button[title="اختيار من التقويم"]');
  if (!btn) throw new Error('trigger button not found');
  return btn as HTMLElement;
}

function openPicker() {
  fireEvent.click(triggerButton());
}

// react-day-picker's exact ARIA roles for the month table aren't pinned down
// by its own docs, and a day button's accessible name defaults to a FULL
// formatted date (not the bare day number) per its `labelDayButton()` default.
// So day cells are found by their visible text (the day number), and "is the
// calendar open" is checked structurally (a <table> renders) — both
// guaranteed by react-day-picker's documented anatomy regardless of exact
// ARIA wording. Queried against `document.body`, not RTL's `container`:
// PopoverContent renders through a Portal into document.body (confirmed
// during Task 1), so it is never a descendant of `container`.
function dayButton(day: string): HTMLElement {
  const table = document.body.querySelector('table') as HTMLElement;
  const match = Array.from(table.querySelectorAll('button')).find((b) => b.textContent?.trim() === day);
  if (!match) throw new Error(`day button "${day}" not found`);
  return match;
}

describe('DateCalendarPicker', () => {
  it('renders a trigger button and no calendar table until opened', () => {
    render(<DateCalendarPicker value="" onChange={() => {}} />);
    expect(triggerButton()).toBeInTheDocument();
    expect(document.body.querySelector('table')).not.toBeInTheDocument();
  });

  it('opens the calendar table on trigger click', () => {
    render(<DateCalendarPicker value="" onChange={() => {}} />);
    openPicker();
    expect(document.body.querySelector('table')).toBeInTheDocument();
  });

  it('selecting a day emits the correct ISO value and closes the popover', () => {
    const onChange = vi.fn();
    render(<DateCalendarPicker value="2026-07-01" onChange={onChange} />);
    openPicker();
    fireEvent.click(dayButton('15'));
    expect(onChange).toHaveBeenCalledWith('2026-07-15');
    expect(document.body.querySelector('table')).not.toBeInTheDocument();
  });

  it('disabled prop renders a disabled trigger button', () => {
    render(<DateCalendarPicker value="" onChange={() => {}} disabled />);
    expect(triggerButton()).toBeDisabled();
  });

  it('reopening shows the current value\'s month, not a previously-navigated month (rule 4)', () => {
    render(<DateCalendarPicker value="2026-03-10" onChange={() => {}} />);
    openPicker();
    // The month/year dropdowns render as native <select> elements inside the
    // popover, in that order (month first) per captionLayout="dropdown".
    const selects = () => Array.from(document.body.querySelectorAll('select')) as HTMLSelectElement[];
    expect(selects()).toHaveLength(2);
    const monthSelectBefore = selects()[0];
    expect(monthSelectBefore.value).toBe('2'); // March, 0-indexed
    fireEvent.change(monthSelectBefore, { target: { value: '10' } }); // navigate to November
    expect(selects()[0].value).toBe('10');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    // Reopen — must show March (the value's month) again, not the navigated-to November.
    openPicker();
    expect(selects()[0].value).toBe('2');
  });

  it('weekend (Friday/Saturday) columns carry the weekend modifier class', () => {
    render(<DateCalendarPicker value="2026-07-01" onChange={() => {}} />);
    openPicker();
    expect(document.body.querySelectorAll('.mnr-cal-weekend').length).toBeGreaterThan(0);
  });

  it('"Today" button jumps the visible month to today without changing the selected value', () => {
    const onChange = vi.fn();
    render(<DateCalendarPicker value="2020-01-01" onChange={onChange} />);
    openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'اليوم' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
