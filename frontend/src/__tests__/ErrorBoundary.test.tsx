// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useState } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';

afterEach(cleanup);

function Boom({ explode }: { explode: boolean }): JSX.Element {
  if (explode) throw new Error('kaboom');
  return <div>صحيح</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<ErrorBoundary><div>محتوى سليم</div></ErrorBoundary>);
    expect(screen.getByText('محتوى سليم')).toBeInTheDocument();
  });

  it('renders fallback (not a white screen) when a child throws', () => {
    // Silence React's expected error logging for this test.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Boom explode /></ErrorBoundary>);
    expect(screen.getByText('حدث خطأ أثناء عرض هذا القسم')).toBeInTheDocument();
    expect(screen.getByText(/kaboom/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('shows the reset action and invokes onReset', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onReset = vi.fn();
    render(
      <ErrorBoundary onReset={onReset} resetLabel="العودة">
        <Boom explode />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText('العودة'));
    expect(onReset).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('recovers when resetKey changes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Harness(): JSX.Element {
      const [tab, setTab] = useState('a');
      const [explode, setExplode] = useState(true);
      return (
        <div>
          <button onClick={() => { setExplode(false); setTab('b'); }}>fix</button>
          <ErrorBoundary resetKey={tab}><Boom explode={explode} /></ErrorBoundary>
        </div>
      );
    }
    render(<Harness />);
    expect(screen.getByText('حدث خطأ أثناء عرض هذا القسم')).toBeInTheDocument();
    fireEvent.click(screen.getByText('fix'));
    expect(screen.getByText('صحيح')).toBeInTheDocument();
    spy.mockRestore();
  });
});
