import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useHighlight(): string | null {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  useEffect(() => {
    if (!highlightId) return;

    const el = document.getElementById(`row-${highlightId}`);
    if (!el) {
      // Row may render asynchronously — retry after 300ms
      const timer = setTimeout(() => {
        const delayed = document.getElementById(`row-${highlightId}`);
        if (!delayed) return;
        delayed.scrollIntoView({ behavior: 'smooth', block: 'center' });
        delayed.classList.add('highlight-row');
        setTimeout(() => delayed.classList.remove('highlight-row'), 3000);
      }, 300);
      return () => clearTimeout(timer);
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-row');
    const timer = setTimeout(() => el.classList.remove('highlight-row'), 3000);
    return () => clearTimeout(timer);
  }, [highlightId]);

  return highlightId;
}
