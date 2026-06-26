import { useEffect } from 'react';

interface Options {
  ctrl?:    boolean;
  shift?:   boolean;
  alt?:     boolean;
  enabled?: boolean; // default true
}

export function useShortcut(
  key: string,
  handler: () => void,
  options: Options = {},
): void {
  const { ctrl = false, shift = false, alt = false, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== key) return;
      if (ctrl  && !e.ctrlKey)  return;
      if (shift && !e.shiftKey) return;
      if (alt   && !e.altKey)   return;
      // Don't fire when user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        // Allow Escape to fire even inside inputs
        if (key !== 'Escape') return;
      }
      e.preventDefault();
      handler();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, ctrl, shift, alt, enabled, handler]);
}
