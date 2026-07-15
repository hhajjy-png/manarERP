// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Calendar } from '../components/ui/calendar';

afterEach(cleanup);

describe('shadcn toolchain smoke test (Task 1 scaffolding)', () => {
  it('Popover opens on trigger click and renders the vendor Calendar inside', () => {
    render(
      <Popover>
        <PopoverTrigger>افتح</PopoverTrigger>
        <PopoverContent>
          <Calendar mode="single" />
        </PopoverContent>
      </Popover>,
    );
    // Queried structurally (table presence), not by an assumed ARIA role/label —
    // the exact role react-day-picker's MonthGrid renders isn't pinned down by
    // its docs, but it is guaranteed to render as a <table> per its documented
    // anatomy (MonthGrid > Weeks (tbody) > Week (tr) > Day (td)).
    // Queried against document.body rather than the render() container: Radix's
    // PopoverContent renders through a Portal straight into document.body, so
    // it never appears inside RTL's own container element.
    expect(document.body.querySelector('table')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('افتح'));
    expect(document.body.querySelector('table')).toBeInTheDocument();
  });
});
