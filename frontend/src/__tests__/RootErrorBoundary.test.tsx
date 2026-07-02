// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useState } from 'react';
import RootErrorBoundary from '../components/RootErrorBoundary';

afterEach(cleanup);

function Boom({ explode }: { explode: boolean }): JSX.Element {
  if (explode) throw new Error('kaboom');
  return <div>صحيح</div>;
}

describe('RootErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <RootErrorBoundary>
        <div>محتوى سليم</div>
      </RootErrorBoundary>,
    );
    expect(screen.getByText('محتوى سليم')).toBeInTheDocument();
  });

  it('renders the fallback (not a white screen) when a child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RootErrorBoundary>
        <Boom explode />
      </RootErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('تعذّر عرض هذه الصفحة')).toBeInTheDocument();
    // Developer details section carries the raw message.
    expect(screen.getAllByText(/kaboom/).length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('exposes retry, back-to-home and copy actions', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RootErrorBoundary>
        <Boom explode />
      </RootErrorBoundary>,
    );
    expect(screen.getByText('إعادة المحاولة')).toBeInTheDocument();
    expect(screen.getByText('العودة للرئيسية')).toBeInTheDocument();
    expect(screen.getByText('نسخ التفاصيل الفنية')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('recovers via Retry once the child stops throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Harness(): JSX.Element {
      const [explode, setExplode] = useState(true);
      return (
        <div>
          <button type="button" onClick={() => setExplode(false)}>fix</button>
          <RootErrorBoundary>
            <Boom explode={explode} />
          </RootErrorBoundary>
        </div>
      );
    }
    render(<Harness />);
    expect(screen.getByText('تعذّر عرض هذه الصفحة')).toBeInTheDocument();
    // Stop throwing, then retry to re-render the children.
    fireEvent.click(screen.getByText('fix'));
    fireEvent.click(screen.getByText('إعادة المحاولة'));
    expect(screen.getByText('صحيح')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('auto-recovers when resetKey changes (route navigation)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Harness(): JSX.Element {
      const [path, setPath] = useState('/a');
      const [explode, setExplode] = useState(true);
      return (
        <div>
          <button type="button" onClick={() => { setExplode(false); setPath('/b'); }}>navigate</button>
          <RootErrorBoundary scope="page" resetKey={path}>
            <Boom explode={explode} />
          </RootErrorBoundary>
        </div>
      );
    }
    render(<Harness />);
    expect(screen.getByText('تعذّر عرض هذه الصفحة')).toBeInTheDocument();
    fireEvent.click(screen.getByText('navigate'));
    expect(screen.getByText('صحيح')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('copies the technical report to the clipboard', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <RootErrorBoundary>
        <Boom explode />
      </RootErrorBoundary>,
    );
    fireEvent.click(screen.getByText('نسخ التفاصيل الفنية'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toMatch(/kaboom/);
    expect(await screen.findByText('تم النسخ')).toBeInTheDocument();
    spy.mockRestore();
  });
});
