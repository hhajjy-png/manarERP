import { Dispatch, SetStateAction, useRef, useState } from 'react';
import { persistPreference } from '../lib/syncedPreferences';

// All prefixes used by usePersistedState across the app.
// Update this list when adding persisted state to a new page.
const UI_STATE_PREFIXES = ['rp:', 'inv:', 'att:', 'maint:', 'invt:', 'sal:', 'acc:', 'rcp:'];

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

// يمرّ عبر `persistPreference` لا `localStorage` مباشرةً: المفاتيح المسجَّلة في
// `syncedPreferences` تُحفظ أيضًا في قاعدة البيانات فتدخل النسخ الاحتياطي والمزامنة،
// وما عداها (أرقام الصفحات، نصوص البحث، الفلاتر — حالة جلسة على هذا الجهاز) يسلك
// سلوك `localStorage.setItem` القديم حرفيًا.
function write(key: string, value: unknown): void {
  try { persistPreference(key, JSON.stringify(value)); } catch {}
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
