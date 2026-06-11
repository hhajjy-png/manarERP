import { Dispatch, SetStateAction, useRef, useState } from 'react';

// All prefixes used by usePersistedState across the app.
// Update this list when adding persisted state to a new page.
const UI_STATE_PREFIXES = ['rp:', 'inv:', 'att:', 'maint:', 'invt:', 'sal:', 'acc:'];

/** Remove all persisted UI state — call on logout to prevent cross-user state leaks. */
export function clearPersistedUIState(): void {
  try {
    Object.keys(localStorage)
      .filter(k => UI_STATE_PREFIXES.some(p => k.startsWith(p)))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function usePersistedState<T>(
  storageKey: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setInner] = useState<T>(() => read(storageKey, defaultValue));
  const keyRef = useRef(storageKey);

  // Render-phase update: re-read storage on key change to avoid stale-key flash.
  if (keyRef.current !== storageKey) {
    keyRef.current = storageKey;
    setInner(read(storageKey, defaultValue));
  }

  const set: Dispatch<SetStateAction<T>> = (action) => {
    setInner((prev) => {
      const next = typeof action === 'function' ? (action as (p: T) => T)(prev) : action;
      write(keyRef.current, next);
      return next;
    });
  };

  return [value, set];
}
