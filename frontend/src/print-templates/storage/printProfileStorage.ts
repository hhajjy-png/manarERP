/**
 * Print profile storage — the only place that touches localStorage.
 *
 * SSR/window-safe: all reads and writes are guarded so this module is safe to
 * import in any environment (Electron renderer, SSR, test runners with no DOM).
 *
 * Key format: `manar:print-profile:<category>`
 *   e.g.    `manar:print-profile:invoice`
 *
 * Zero Data Loss Certification Pack v1: القراءة تبقى متزامنة من `localStorage`
 * (المخبأ)، أما الكتابة فتمرّ عبر `persistPreference` لتُحفظ أيضًا في قاعدة البيانات
 * — فيدخل ملف الطباعة المضبوط لكل فئة النسخَ الاحتياطي والمزامنة وينتقل مع الجهاز.
 */

import type { PrintTemplateCategory } from '../engine/types';
import { persistPreference, removePreference } from '../../lib/syncedPreferences';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PrintPaperType = 'plain-a4' | 'letterhead';

export interface PrintProfile {
  /** ID of the selected original-variant template, e.g. "invoice-design-2" */
  templateId: string;
  /** Paper stock in the printer */
  paperType: PrintPaperType;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const PRINT_PROFILE_DEFAULTS: Readonly<Record<PrintTemplateCategory, PrintProfile>> = {
  'invoice':        { templateId: 'invoice-design-1',        paperType: 'plain-a4' },
  'quotation':      { templateId: 'quotation-design-1',      paperType: 'plain-a4' },
  'purchase-order': { templateId: 'purchase-order-design-1', paperType: 'plain-a4' },
  'rfq':            { templateId: 'rfq-design-1',            paperType: 'plain-a4' },
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function storageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function storageKey(category: PrintTemplateCategory): string {
  return `manar:print-profile:${category}`;
}

function parseProfile(raw: string, fallback: PrintProfile): PrintProfile {
  try {
    const parsed = JSON.parse(raw) as Partial<PrintProfile>;
    return {
      templateId: typeof parsed.templateId === 'string' ? parsed.templateId : fallback.templateId,
      paperType:
        parsed.paperType === 'plain-a4' || parsed.paperType === 'letterhead'
          ? parsed.paperType
          : fallback.paperType,
    };
  } catch {
    return fallback;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads the persisted print profile for a category.
 * Returns the category default when nothing is stored or storage is unavailable.
 */
export function loadPrintProfile(category: PrintTemplateCategory): PrintProfile {
  const fallback = PRINT_PROFILE_DEFAULTS[category];
  if (!storageAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(category));
    return raw ? parseProfile(raw, fallback) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Persists the print profile for a category.
 * Silently no-ops when storage is unavailable (private mode, quota exceeded, etc.).
 */
export function savePrintProfile(category: PrintTemplateCategory, profile: PrintProfile): void {
  if (!storageAvailable()) return;
  try {
    persistPreference(storageKey(category), JSON.stringify(profile));
  } catch {
    // ignore — quota exceeded, private mode, etc.
  }
}

/**
 * Removes the persisted profile for a category, reverting to the category default.
 */
export function resetPrintProfile(category: PrintTemplateCategory): void {
  if (!storageAvailable()) return;
  try {
    removePreference(storageKey(category));
  } catch {
    // ignore
  }
}
