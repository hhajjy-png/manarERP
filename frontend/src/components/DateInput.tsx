import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isoToDisplay, displayToIso, isWithinRange, sanitizeDateTyping } from '../lib/dateInput';
import './DateInput.css';

// Local alias to keep the JSX readable.
const fmt = isoToDisplay;

export interface DateInputProps {
  /** Canonical date-only value: 'YYYY-MM-DD' or '' (empty). */
  value: string;
  /** Emits the canonical 'YYYY-MM-DD' value, or '' for empty/invalid. */
  onChange: (value: string) => void;
  id?: string;
  /** Applied to the visible text field so it inherits the surrounding design system
   *  (e.g. 'xpl-input'). The calendar affordance is layered on top. */
  className?: string;
  ariaLabel?: string;
  /** Native title tooltip; also used as the accessible name when no ariaLabel is given. */
  title?: string;
  /** Inline style forwarded to the visible text field (parity with the inputs being replaced). */
  style?: CSSProperties;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Inclusive bounds, canonical 'YYYY-MM-DD'. */
  min?: string;
  max?: string;
  autoFocus?: boolean;
  /** Visible hint; defaults to the DD/MM/YYYY mask. */
  placeholder?: string;
  /** Form-level error flag (adds the invalid styling on top of internal parse errors). */
  invalid?: boolean;
  onBlur?: () => void;
}

// HTMLInputElement.showPicker is not in every TS lib.dom yet.
type PickerInput = HTMLInputElement & { showPicker?: () => void };

/**
 * Standardized date input for manarERP.
 *
 * Displays and accepts DD/MM/YYYY with Western digits, deterministically in
 * Electron/Chromium (a masked text field — NOT the OS-locale-formatted native
 * widget). A hidden native <input type="date"> is used only as the calendar
 * picker. The value contract is date-only 'YYYY-MM-DD' in and out, converted by
 * pure string helpers, so a business date can never shift a day across timezones.
 */
export default function DateInput({
  value,
  onChange,
  id,
  className,
  ariaLabel,
  title,
  style,
  required,
  disabled,
  readOnly,
  min,
  max,
  autoFocus,
  placeholder = 'يوم/شهر/سنة',
  invalid,
  onBlur,
}: DateInputProps) {
  const [text, setText] = useState(() => fmt(value));
  const [parseError, setParseError] = useState(false);
  // Tracks the value we last emitted so an external change (rehydrate/reset) can be told
  // apart from our own echo — the former re-syncs the visible text, the latter must not.
  const valueRef = useRef(value);
  const nativeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value !== valueRef.current) {
      valueRef.current = value;
      setText(fmt(value));
      setParseError(false);
    }
  }, [value]);

  function emit(iso: string) {
    valueRef.current = iso;
    onChange(iso);
  }

  function commit() {
    const raw = text.trim();
    if (raw === '') {
      setParseError(false);
      if (value !== '') emit('');
      return;
    }
    const iso = displayToIso(raw);
    if (iso && isWithinRange(iso, min, max)) {
      setParseError(false);
      setText(fmt(iso));
      emit(iso);
    } else {
      // Invalid or out-of-range — surface the error and do NOT save a bad date.
      setParseError(true);
      if (value !== '') emit('');
    }
  }

  function openPicker() {
    if (disabled || readOnly) return;
    const el = nativeRef.current as PickerInput | null;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return; } catch { /* fall through to focus */ }
    }
    el.focus();
    el.click();
  }

  const showError = invalid || parseError;

  return (
    <div className={`mnr-dateinput${disabled ? ' is-disabled' : ''}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        dir="ltr"
        className={className}
        style={style}
        title={title}
        aria-label={ariaLabel ?? title}
        aria-invalid={showError || undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(sanitizeDateTyping(e.target.value));
          if (parseError) setParseError(false);
        }}
        onBlur={() => { commit(); onBlur?.(); }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          const asDisplay = fmt(pasted); // handles a pasted ISO 'YYYY-MM-DD'
          if (asDisplay) {
            e.preventDefault();
            setText(asDisplay);
            setParseError(false);
            emit(displayToIso(asDisplay)!);
          }
          // Otherwise let onChange sanitize a pasted DD/MM/YYYY string.
        }}
      />
      {!readOnly && (
        <button
          type="button"
          className="mnr-dateinput__cal"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          onClick={openPicker}
          title="اختيار من التقويم"
        >
          <span className="material-symbols-outlined">calendar_month</span>
        </button>
      )}
      {/* Hidden native input — calendar picker only; its OS-locale display is never shown. */}
      <input
        ref={nativeRef}
        type="date"
        className="mnr-dateinput__native"
        tabIndex={-1}
        aria-hidden="true"
        value={value || ''}
        min={min}
        max={max}
        disabled={disabled || readOnly}
        onChange={(e) => {
          setParseError(false);
          setText(fmt(e.target.value));
          emit(e.target.value);
        }}
      />
    </div>
  );
}
