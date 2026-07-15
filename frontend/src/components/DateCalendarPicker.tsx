import { useState } from 'react';
import type { Matcher } from 'react-day-picker';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import './DateCalendarPicker.css';

export interface DateCalendarPickerProps {
  /** Canonical date-only value: 'YYYY-MM-DD' or '' (empty). */
  value: string;
  /** Emits the canonical 'YYYY-MM-DD' value on day selection. */
  onChange: (value: string) => void;
  /** Inclusive bounds, canonical 'YYYY-MM-DD'. */
  min?: string;
  max?: string;
  disabled?: boolean;
}

const FALLBACK_START_YEAR = 1940;

/**
 * 'YYYY-MM-DD' -> local Date. Never parses via `new Date(iso)` (UTC midnight
 * can shift a day in Kuwait's UTC+3) — see lib/date.ts's `toLocalDateOnly`.
 * Rejects calendar-invalid strings (e.g. '2026-02-30') instead of letting
 * JS Date silently roll them into the next month.
 */
function parseIsoLocal(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return undefined;
  return d;
}

/** Local Date -> 'YYYY-MM-DD'. Never `.toISOString()` — same day-shift risk. */
function formatIsoLocal(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Known, accepted limitation: the vendor `ui/calendar.tsx`/`ui/button.tsx`
// target React 19's ref-as-prop convention (no `forwardRef`), so React 18
// logs "Function components cannot be given refs" on every open, and
// react-day-picker's programmatic keyboard day-focus silently no-ops. This
// doesn't affect the shipped UX: the trigger is `aria-hidden`/`tabIndex={-1}`
// (mouse-only by design, matching DateInput's own icon-button convention) and
// Radix's own positioning primitives are unaffected (they are forwardRef).
// Per the standing "shadcn files stay upstream-pure" rule, this is not
// patched here — revisit if/when keyboard day-navigation is required, in the
// deferred design-system restyling phase.
export default function DateCalendarPicker({ value, onChange, min, max, disabled }: DateCalendarPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseIsoLocal(value) : undefined;
  const minDate = min ? parseIsoLocal(min) : undefined;
  const maxDate = max ? parseIsoLocal(max) : undefined;

  // Rule 1: explicit years, not date arithmetic — avoids "today + 10" ambiguity.
  const fallbackEndYear = new Date().getFullYear() + 10;
  const startMonth = minDate ?? new Date(FALLBACK_START_YEAR, 0, 1);
  const endMonth = maxDate ?? new Date(fallbackEndYear, 11, 31);

  // Two independent matchers (before min, or after max) — NOT a single merged
  // `{ before, after }` object. The merged-object form (built via conditional spread,
  // e.g. `{ ...(minDate ? { before: minDate } : {}) , ...(maxDate ? { after: maxDate } : {}) }`)
  // fails `tsc`: TypeScript widens that spread to a shape that doesn't structurally
  // match react-day-picker's `Matcher` union type. The array form both type-checks and
  // is natively supported by the `disabled` prop.
  const disabledMatcher: Matcher[] | undefined = (() => {
    const matchers: Matcher[] = [];
    if (minDate) matchers.push({ before: minDate });
    if (maxDate) matchers.push({ after: maxDate });
    return matchers.length ? matchers : undefined;
  })();

  // No controlled `month`/onMonthChange state, no Today button (Part B:
  // upstream-faithful interaction only). Verified: react-day-picker's own
  // uncontrolled default (no `month`/`defaultMonth` at all) opens on TODAY's
  // month regardless of `selected` — so `defaultMonth={selected}` below is
  // load-bearing, not decorative; it's the officially-documented prop for
  // "which month to show initially" (see react-day-picker's `defaultMonth`
  // docs), not custom state machinery. Radix's PopoverContent unmounts on
  // close by default (Presence, no forceMount), so the Calendar remounts
  // fresh each open and `defaultMonth` is re-evaluated against the current
  // `selected` every time — never a stale previously-navigated month.

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mnr-dateinput__cal"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          title="اختيار من التقويم"
        >
          <span className="material-symbols-outlined">calendar_month</span>
        </button>
      </PopoverTrigger>
      {/* dir="ltr" is NOT a design customization: the app root is
          <html lang="ar" dir="rtl">, and PopoverContent portals straight into
          document.body, so without an explicit override it would inherit RTL
          from the app rather than actually rendering LTR as required. Verified
          live: without it, the weekday header and layout mirror (Sa..Su
          instead of Su..Sa) — see docs/superpowers/plans temp comparison page.
          z-[var(--z-popover)] is NOT a design customization either: this
          Calendar's only real host context is DateInput fields inside the
          app's Modal/Dialog/Drawer forms (z-index 400-500), so the vendor's
          own default z-50 would render it invisible behind them — this is
          the minimum integration plumbing needed for the upstream appearance
          to be visible/reviewable at all in this app's shell, not a visual
          restyle. w-auto p-0 is the vendor's own reference usage (every
          official Calendar-in-Popover demo overrides PopoverContent's raw
          w-72/p-4 default this way, since Calendar already brings its own
          w-fit sizing and p-3 padding — leaving the raw default in place
          double-pads and over-widens the box, which is what Part B had
          incorrectly left in place). align="center" is the only remaining
          vendor default, unmodified. */}
      <PopoverContent dir="ltr" className={cn('mnr-cal-pop z-[var(--z-popover)]', 'w-auto p-0')}>
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (date) {
              onChange(formatIsoLocal(date));
              setOpen(false);
            }
          }}
          startMonth={startMonth}
          endMonth={endMonth}
          disabled={disabledMatcher}
        />
      </PopoverContent>
    </Popover>
  );
}
