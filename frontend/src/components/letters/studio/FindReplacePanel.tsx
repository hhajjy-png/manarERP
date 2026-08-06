/**
 * Document Studio — find and replace.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A DOCKED STRIP, NEVER A MODAL. THE DOCUMENT STAYS VISIBLE AND EDITABLE.
 * ══════════════════════════════════════════════════════════════════════════
 * A find dialogue that covers the text it is finding is the oldest bad pattern in
 * editing software. This sits in the command strip, above the paper and below the
 * toolbar, so the match it navigates to is always on screen when it lands there.
 *
 * ── SEARCHING IS PURE; THIS COMPONENT ONLY COLLECTS THE QUERY ────────────
 * Matching and replacing live in `letters/editor/documentSearch`, which has no React
 * and no DOM. This renders the query, the option toggles and the result counter, and
 * hands every decision to the studio. That is what lets the Arabic normalisation rules
 * — the part with real subtlety in it — be tested without rendering anything.
 *
 * ── REPLACE IS HIDDEN UNTIL ASKED FOR ────────────────────────────────────
 * Ctrl+F opens Find; Ctrl+H opens the same strip with the replacement field revealed.
 * Most uses are searches, and a replacement field permanently on screen invites an
 * accidental "replace all" on a registered document's neighbour.
 */

import { useEffect, useRef } from 'react';
import { Icon } from '../../explorer/ExplorerKit';
import { type SearchOptions } from '../../../letters/editor/documentSearch';
import './find-replace-panel.css';

export interface FindReplacePanelProps {
  readonly query: string;
  readonly replacement: string;
  readonly options: SearchOptions;
  /** Total matches in the document. */
  readonly matchCount: number;
  /** Zero-based index of the highlighted match, or −1 when there is none. */
  readonly activeIndex: number;
  /** True when the replacement field is shown. */
  readonly replaceMode: boolean;
  /** Replacement is refused on a registered letter, which is frozen. */
  readonly canReplace: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onReplacementChange: (replacement: string) => void;
  readonly onOptionsChange: (options: SearchOptions) => void;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onReplaceOne: () => void;
  readonly onReplaceAll: () => void;
  readonly onToggleReplaceMode: () => void;
  readonly onClose: () => void;
}

export default function FindReplacePanel({
  query,
  replacement,
  options,
  matchCount,
  activeIndex,
  replaceMode,
  canReplace,
  onQueryChange,
  onReplacementChange,
  onOptionsChange,
  onNext,
  onPrevious,
  onReplaceOne,
  onReplaceAll,
  onToggleReplaceMode,
  onClose,
}: FindReplacePanelProps) {
  const queryField = useRef<HTMLInputElement | null>(null);

  // Focus and select on open, so the common case — open, type, Enter — needs no click
  // and so reopening over an existing query replaces it rather than appending to it.
  useEffect(() => {
    queryField.current?.focus();
    queryField.current?.select();
  }, []);

  const hasQuery = query.length > 0;
  const noMatches = hasQuery && matchCount === 0;

  return (
    <div className="frp-bar" role="search" aria-label="بحث واستبدال">
      <div className="frp-row">
        <button
          type="button"
          className="frp-btn frp-btn--toggle"
          onClick={onToggleReplaceMode}
          aria-expanded={replaceMode}
          title={replaceMode ? 'إخفاء حقل الاستبدال' : 'إظهار حقل الاستبدال (Ctrl+H)'}
          aria-label="حقل الاستبدال"
        >
          <Icon name={replaceMode ? 'expand_more' : 'chevron_left'} />
        </button>

        <div className={`frp-field${noMatches ? ' has-no-match' : ''}`}>
          <Icon name="search" />
          <input
            ref={queryField}
            type="text"
            className="frp-input"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              // Shift+Enter walks backwards, the convention every editor shares.
              if (e.shiftKey) onPrevious();
              else onNext();
            }}
            placeholder="بحث في المحتوى"
            aria-label="نص البحث"
          />
          <span className="frp-count" aria-live="polite">
            {!hasQuery ? '' : matchCount === 0 ? 'لا نتائج' : `${activeIndex + 1} من ${matchCount}`}
          </span>
        </div>

        <button type="button" className="frp-btn" onClick={onPrevious} disabled={matchCount === 0} title="النتيجة السابقة (Shift+F3)" aria-label="النتيجة السابقة">
          <Icon name="keyboard_arrow_up" />
        </button>
        <button type="button" className="frp-btn" onClick={onNext} disabled={matchCount === 0} title="النتيجة التالية (F3)" aria-label="النتيجة التالية">
          <Icon name="keyboard_arrow_down" />
        </button>

        <span className="frp-sep" />

        <ToggleChip
          label="مطابقة حالة الأحرف"
          short="Aa"
          on={options.matchCase}
          onClick={() => onOptionsChange({ ...options, matchCase: !options.matchCase })}
        />
        <ToggleChip
          label="كلمة كاملة"
          short="ab|"
          on={options.wholeWord}
          onClick={() => onOptionsChange({ ...options, wholeWord: !options.wholeWord })}
        />
        {/* The Arabic fold is the option most worth explaining, because switching it OFF
            is what makes a search behave surprisingly rather than switching it on. */}
        <ToggleChip
          label="توحيد صور الحروف العربية — يعامل «شركة» و«شركه» و«أحمد» و«احمد» كنص واحد"
          short="أ ا"
          on={options.normaliseArabicForms}
          onClick={() => onOptionsChange({ ...options, normaliseArabicForms: !options.normaliseArabicForms })}
        />

        <span className="frp-spacer" />

        <button type="button" className="frp-btn" onClick={onClose} title="إغلاق (Esc)" aria-label="إغلاق البحث">
          <Icon name="close" />
        </button>
      </div>

      {replaceMode && (
        <div className="frp-row frp-row--replace">
          <span className="frp-btn frp-btn--spacer" aria-hidden="true" />
          <div className="frp-field">
            <Icon name="find_replace" />
            <input
              type="text"
              className="frp-input"
              value={replacement}
              onChange={(e) => onReplacementChange(e.target.value)}
              placeholder="استبدال بـ"
              aria-label="نص الاستبدال"
              disabled={!canReplace}
            />
          </div>

          <button
            type="button"
            className="frp-action"
            onClick={onReplaceOne}
            disabled={!canReplace || matchCount === 0}
            title={canReplace ? 'استبدال النتيجة الحالية' : 'الخطاب مسجَّل ومحتواه مُجمَّد'}
          >
            استبدال
          </button>
          <button
            type="button"
            className="frp-action"
            onClick={onReplaceAll}
            disabled={!canReplace || matchCount === 0}
            title={canReplace ? `استبدال كل النتائج (${matchCount})` : 'الخطاب مسجَّل ومحتواه مُجمَّد'}
          >
            استبدال الكل
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * An option toggle.
 *
 * A two-character glyph rather than an icon: "match case" and "whole word" have no
 * icon anyone recognises, and the abbreviations are the ones every editor uses.
 */
function ToggleChip({
  label,
  short,
  on,
  onClick,
}: {
  label: string;
  short: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`frp-chip${on ? ' is-on' : ''}`}
      onClick={onClick}
      aria-pressed={on}
      title={label}
      aria-label={label}
    >
      {short}
    </button>
  );
}
