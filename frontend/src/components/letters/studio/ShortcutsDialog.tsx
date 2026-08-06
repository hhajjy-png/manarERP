/**
 * Document Studio — the keyboard-shortcut reference.
 *
 * Renders `SHORTCUTS` from `useDocumentShortcuts` rather than a list of its own, so a
 * chord that is added without a published row is a chord nobody can discover — and a
 * row that survives a chord's removal is impossible.
 */

import { useEffect, useRef } from 'react';
import { Icon } from '../../explorer/ExplorerKit';
import { SHORTCUTS } from './useDocumentShortcuts';
import './shortcuts-dialog.css';

export default function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement | null>(null);

  // Focus moves into the dialog on open so Escape and Tab behave, and so a screen
  // reader announces the panel rather than leaving the user on the button behind it.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <div
      className="sdg-scrim"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sdg-panel"
        role="dialog"
        aria-modal="true"
        aria-label="اختصارات لوحة المفاتيح"
        tabIndex={-1}
        ref={panel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="sdg-head">
          <h2><Icon name="keyboard" />اختصارات لوحة المفاتيح</h2>
          <button type="button" className="sdg-close" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" />
          </button>
        </div>

        <dl className="sdg-list">
          {SHORTCUTS.map((shortcut) => (
            <div className="sdg-row" key={shortcut.keys}>
              <dt>{shortcut.labelAr}</dt>
              {/* The chord is LTR even inside an RTL panel: "Ctrl + B" read
                  right-to-left becomes "B + Ctrl", which is not a shortcut. */}
              <dd dir="ltr">{shortcut.keys}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
