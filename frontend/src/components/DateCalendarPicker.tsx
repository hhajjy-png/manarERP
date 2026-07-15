import { useEffect, useState } from 'react';
import type { Matcher } from 'react-day-picker';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { cn } from '../lib/utils';
import { ARABIC_MONTHS, WEEKDAY_SHORT_AR } from '../lib/date';
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

  const [month, setMonth] = useState<Date>(selected ?? new Date());

  // Rule 4: never reopen on a stale previously-navigated month — recompute
  // fresh from the current value (or today) every time the popover opens.
  useEffect(() => {
    if (open) setMonth(selected ?? new Date());
    // Only the open transition should trigger this, not every `value` edit
    // while already open (that would fight the user's in-progress navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      <PopoverContent
        dir="rtl"
        align="end"
        className={cn('mnr-cal-pop w-[var(--radix-popover-trigger-width)] min-w-[19rem] z-[var(--z-popover)] p-2')}
      >
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(formatIsoLocal(date));
              setOpen(false);
            }
          }}
          month={month}
          onMonthChange={setMonth}
          startMonth={startMonth}
          endMonth={endMonth}
          disabled={disabledMatcher}
          modifiers={{ weekend: { dayOfWeek: [5, 6] } }}
          modifiersClassNames={{ weekend: 'mnr-cal-weekend' }}
          formatters={{
            formatMonthDropdown: (date) => ARABIC_MONTHS[date.getMonth()],
            formatWeekdayName: (date) => WEEKDAY_SHORT_AR[date.getDay()],
          }}
        />
        <button type="button" className="mnr-cal-today" onClick={() => setMonth(new Date())}>
          اليوم
        </button>
      </PopoverContent>
    </Popover>
  );
}
