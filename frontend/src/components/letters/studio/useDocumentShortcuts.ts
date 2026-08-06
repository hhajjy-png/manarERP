/**
 * Document Studio — the keyboard map.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE LISTENER, ONE TABLE. NO COMPONENT BINDS A SHORTCUT OF ITS OWN.
 * ══════════════════════════════════════════════════════════════════════════
 * Shortcuts spread across components collide silently: two handlers claim Ctrl+F, both
 * run, and which one "wins" depends on mount order. Declaring the whole map in one
 * table makes a collision a duplicate entry someone can see, and lets the studio answer
 * "what does Ctrl+Shift+V do here" by reading a list rather than by grepping.
 *
 * ── WHAT IS DELIBERATELY NOT INTERCEPTED ─────────────────────────────────
 * Ctrl+C, Ctrl+X and plain Ctrl+V are left entirely to the browser. The paragraph
 * surface is a real `<textarea>`, so the platform's own copy, cut and paste are already
 * correct — including the clipboard permissions, the IME interactions and the
 * right-to-left selection behaviour that a hand-rolled implementation gets wrong. The
 * only paste this engine touches is the MULTI-PARAGRAPH case, and that is handled at
 * the paragraph's own `onPaste` because it needs the caret offsets.
 *
 * Ctrl+A is likewise left alone INSIDE a paragraph — "select all" there means the
 * paragraph, which is what a textarea already does and what an author expects.
 *
 * ── TEXT-CONTROL AWARENESS ───────────────────────────────────────────────
 * Navigation keys (PageUp/PageDown/Home/End) belong to the caret while a text control
 * has focus and to the document otherwise. That distinction is made once, here, rather
 * than being re-derived by every handler.
 */

import { useEffect } from 'react';

/** Everything the studio can be asked to do from the keyboard. */
export interface ShortcutActions {
  readonly toggleBold: () => void;
  readonly toggleItalicRefused?: () => void;
  readonly toggleUnderline: () => void;
  readonly copyFormat: () => void;
  readonly pasteFormat: () => void;
  readonly pastePlain: () => void;
  readonly openFind: () => void;
  readonly openReplace: () => void;
  readonly findNext: () => void;
  readonly findPrevious: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly save: () => void;
  readonly print: () => void;
  readonly repeatLastAction: () => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly zoomReset: () => void;
  readonly nextPage: () => void;
  readonly previousPage: () => void;
  readonly firstPage: () => void;
  readonly lastPage: () => void;
  readonly closeOverlay: () => void;
}

/** One row of the map, for the shortcut list the help affordance shows. */
export interface ShortcutDescriptor {
  readonly keys: string;
  readonly labelAr: string;
}

/**
 * The published map, in the order the help panel lists it.
 *
 * Data rather than documentation: the panel renders THIS, so a shortcut that is added
 * without a row here is a shortcut nobody can discover.
 */
export const SHORTCUTS: readonly ShortcutDescriptor[] = [
  { keys: 'Ctrl + B', labelAr: 'عريض' },
  { keys: 'Ctrl + U', labelAr: 'تسطير' },
  { keys: 'Ctrl + Shift + C', labelAr: 'نسخ التنسيق' },
  { keys: 'Ctrl + Shift + V', labelAr: 'لصق التنسيق' },
  { keys: 'Ctrl + Alt + V', labelAr: 'لصق كنص عادي' },
  { keys: 'Ctrl + F', labelAr: 'بحث' },
  { keys: 'Ctrl + H', labelAr: 'بحث واستبدال' },
  { keys: 'F3 / Shift + F3', labelAr: 'النتيجة التالية / السابقة' },
  { keys: 'Ctrl + Z', labelAr: 'تراجع' },
  { keys: 'Ctrl + Y', labelAr: 'إعادة' },
  { keys: 'F4', labelAr: 'تكرار آخر إجراء' },
  { keys: 'Ctrl + S', labelAr: 'حفظ' },
  { keys: 'Ctrl + P', labelAr: 'طباعة' },
  { keys: 'Ctrl + عجلة الفأرة', labelAr: 'تكبير وتصغير' },
  { keys: 'Ctrl + 0', labelAr: 'تكبير ١٠٠٪' },
  { keys: 'Page Up / Page Down', labelAr: 'الصفحة السابقة / التالية' },
  { keys: 'Ctrl + Home / End', labelAr: 'أول صفحة / آخر صفحة' },
  { keys: 'Esc', labelAr: 'إغلاق لوحة البحث' },
];

/** Is focus currently inside something that owns its own key handling? */
function inTextControl(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  const tag = element?.tagName;
  return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || element?.isContentEditable === true;
}

export function useDocumentShortcuts(actions: ShortcutActions, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const ctrl = event.ctrlKey || event.metaKey;
      const editing = inTextControl(event.target);

      // Escape closes an overlay from anywhere, including from inside the find field —
      // which is the one place a user most expects it to work.
      if (event.key === 'Escape') {
        actions.closeOverlay();
        return;
      }

      if (ctrl && !event.altKey) {
        switch (event.key.toLowerCase()) {
          case 'b':
            event.preventDefault();
            actions.toggleBold();
            return;
          case 'u':
            event.preventDefault();
            actions.toggleUnderline();
            return;
          case 'c':
            // Ctrl+Shift+C is copy-format. PLAIN Ctrl+C is the platform's copy and is
            // deliberately not intercepted — see the file header.
            if (!event.shiftKey) return;
            event.preventDefault();
            actions.copyFormat();
            return;
          case 'v':
            if (!event.shiftKey) return;
            event.preventDefault();
            actions.pasteFormat();
            return;
          case 'f':
            event.preventDefault();
            actions.openFind();
            return;
          case 'h':
            event.preventDefault();
            actions.openReplace();
            return;
          case 'z':
            event.preventDefault();
            // Ctrl+Shift+Z is the other conventional redo, so both are honoured.
            if (event.shiftKey) actions.redo();
            else actions.undo();
            return;
          case 'y':
            event.preventDefault();
            actions.redo();
            return;
          case 's':
            event.preventDefault();
            actions.save();
            return;
          case 'p':
            event.preventDefault();
            actions.print();
            return;
          case '0':
            event.preventDefault();
            actions.zoomReset();
            return;
          case '=':
          case '+':
            event.preventDefault();
            actions.zoomIn();
            return;
          case '-':
            event.preventDefault();
            actions.zoomOut();
            return;
          default:
            break;
        }
      }

      // Ctrl+Alt+V — paste plain. Separate from Ctrl+Shift+V (paste FORMAT) because the
      // two are genuinely different operations and sharing a chord would make one of
      // them undiscoverable.
      if (ctrl && event.altKey && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        actions.pastePlain();
        return;
      }

      if (event.key === 'F3') {
        event.preventDefault();
        if (event.shiftKey) actions.findPrevious();
        else actions.findNext();
        return;
      }

      if (event.key === 'F4') {
        event.preventDefault();
        actions.repeatLastAction();
        return;
      }

      // Page navigation belongs to the caret while a text control has focus. PageDown
      // inside a paragraph is the author moving through their text, not through the
      // document.
      if (editing) return;

      if (event.key === 'PageDown') {
        event.preventDefault();
        actions.nextPage();
      } else if (event.key === 'PageUp') {
        event.preventDefault();
        actions.previousPage();
      } else if (event.key === 'Home' && ctrl) {
        event.preventDefault();
        actions.firstPage();
      } else if (event.key === 'End' && ctrl) {
        event.preventDefault();
        actions.lastPage();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, enabled]);
}
