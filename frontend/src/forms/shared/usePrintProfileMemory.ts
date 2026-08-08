import { useState, useCallback } from 'react';
import { ProfileId, DEFAULT_PROFILE_ID, PRINT_PROFILES } from './printProfiles';
// Zero Data Loss Certification Pack v1 — الكتابة تذهب إلى قاعدة البيانات أيضًا،
// فينتقل ملف الطباعة وعدد النسخ المحفوظان لكل نموذج مع النسخة الاحتياطية والمزامنة.
import { persistPreference } from '../../lib/syncedPreferences';

function loadSaved(formType: string): ProfileId | null {
  try {
    const raw = localStorage.getItem(`manar.printProfile.${formType}`);
    if (raw && raw in PRINT_PROFILES) return raw as ProfileId;
  } catch {}
  return null;
}

function savePref(formType: string, profile: ProfileId): void {
  try {
    persistPreference(`manar.printProfile.${formType}`, profile);
  } catch {}
}

/**
 * Persists the active print profile per form type in localStorage.
 * URL-seeded value takes priority over saved preference when it differs from the default.
 */
export function usePrintProfileMemory(
  formType: string,
  initial: ProfileId = DEFAULT_PROFILE_ID,
): [ProfileId, (p: ProfileId) => void] {
  const [profile, setProfileState] = useState<ProfileId>(() => {
    if (initial !== DEFAULT_PROFILE_ID) return initial;
    return loadSaved(formType) ?? DEFAULT_PROFILE_ID;
  });

  const setProfile = useCallback(
    (p: ProfileId) => {
      setProfileState(p);
      savePref(formType, p);
    },
    [formType],
  );

  return [profile, setProfile];
}

export function loadCopies(formType: string): number {
  try {
    const n = parseInt(localStorage.getItem(`manar.copies.${formType}`) ?? '', 10);
    if (!isNaN(n) && n >= 1 && n <= 10) return n;
  } catch {}
  return 1;
}

export function saveCopies(formType: string, n: number): void {
  try {
    persistPreference(`manar.copies.${formType}`, String(n));
  } catch {}
}
