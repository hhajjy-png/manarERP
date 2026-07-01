// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useState } from 'react';
import { Dialog } from '../components/explorer/ExplorerKit';

afterEach(cleanup);

// Regression test for the "types one character, then focus jumps to the dialog
// box itself" bug in every ExplorerKit add/edit window (customers, equipment, …).
//
// Root cause: FormDialog passes a fresh `onClose` (tryClose) on every render, and
// the Dialog's focus-trap effect used to depend on `onClose`. So every keystroke
// re-ran the effect, which calls `panel.focus()` and stole focus from the input.
//
// This harness reproduces the trigger: an inline `onClose` (new identity each
// render) + an input that updates state on change.
function DialogHarness(): JSX.Element {
  const [val, setVal] = useState('');
  return (
    <Dialog title="إضافة" icon="add" onClose={() => {}}>
      <input
        aria-label="name"
        value={val}
        onChange={(e) => setVal(e.target.value)}
      />
    </Dialog>
  );
}

describe('ExplorerKit Dialog — keeps input focus while typing', () => {
  it('does not steal focus after state-updating keystrokes', () => {
    render(<DialogHarness />);
    const input = screen.getByLabelText('name') as HTMLInputElement;

    input.focus();
    expect(document.activeElement).toBe(input);

    // First character — value is kept, focus must stay on the field.
    fireEvent.change(input, { target: { value: 'ح' } });
    expect(input.value).toBe('ح');
    expect(document.activeElement).toBe(input);

    // Second character must land in the same field (previously impossible).
    fireEvent.change(input, { target: { value: 'حس' } });
    expect(input.value).toBe('حس');
    expect(document.activeElement).toBe(input);

    // Third character, to be sure a full word can be typed.
    fireEvent.change(input, { target: { value: 'حسن' } });
    expect(input.value).toBe('حسن');
    expect(document.activeElement).toBe(input);
  });
});
