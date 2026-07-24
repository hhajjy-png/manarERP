// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ChequeTemplateDesigner from '../modules/chequeTemplateDesigner/ChequeTemplateDesigner';
import type { DesignerField, DesignerSurfaceSpec } from '../modules/chequeTemplateDesigner';

/**
 * Regression guard for the infinite render loop (Cheque Template).
 *
 * The designer must notify the host ONLY on a genuine field change — never
 * because the parent recreated the `onChange` callback. Before the fix, the
 * notify effect depended on `onChange`'s identity, so re-rendering with a fresh
 * callback re-fired the notification (and, with a state-storing parent, looped
 * to "Maximum update depth exceeded").
 */

const SURFACE: DesignerSurfaceSpec = { widthCm: 17.8, heightCm: 8.9 };

const FIELDS: DesignerField[] = [
  { id: 'beneficiary', label: 'المستفيد', value: 'x', x: 20, y: 30, width: 40, height: 6, rotation: 0, fontSize: 12, fontWeight: 400, textAlign: 'right', color: '#000000', zIndex: 1, visible: true },
];

describe('ChequeTemplateDesigner — host notification resilience', () => {
  it('does not fire onChange on initial mount', () => {
    const onChange = vi.fn();
    render(<ChequeTemplateDesigner surface={SURFACE} initialFields={FIELDS} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not fire onChange when only the callback identity changes (no field change)', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();
    const { rerender } = render(
      <ChequeTemplateDesigner surface={SURFACE} initialFields={FIELDS} onChange={cb1} />,
    );
    // Parent re-renders that recreate `onChange` (the exact loop trigger) —
    // with the same fields, none of these may notify.
    rerender(<ChequeTemplateDesigner surface={SURFACE} initialFields={FIELDS} onChange={cb2} />);
    rerender(<ChequeTemplateDesigner surface={SURFACE} initialFields={FIELDS} onChange={cb3} />);

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
    expect(cb3).not.toHaveBeenCalled();
  });
});
