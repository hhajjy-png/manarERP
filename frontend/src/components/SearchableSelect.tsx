import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { normalizeSearch } from '../lib/arabicSearch';
import './SearchableSelect.css';

/**
 * أُخرِجت إلى `lib/arabicSearch` كي يشاركها `components/common/FontPicker` دون
 * جرّ هذا المكوّن وأنماطه. تُعاد هنا كما كانت — كل وارد قائم يبقى يعمل.
 */
export { normalizeSearch };

export interface SearchableOption {
  /** القيمة المخزّنة. */
  value: string;
  /** النص المعروض والمبحوث فيه (بالعربية). */
  label: string;
  /** كلمات بحث إضافية (مثل الاسم الإنجليزي) — لا تُعرض. */
  keywords?: string;
  /** أيقونة Material Symbols (اختياري). */
  icon?: string;
  /** عنوان المجموعة لعرض فاصل — اختياري. */
  group?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  /** نص العنصر الفارغ (مثل «كل التصنيفات») — تفعيله يسمح باختيار قيمة فارغة. */
  emptyLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * هل يطابق هذا الخيار نص البحث؟ يبحث في الاسم المعروض (label) وكلمات المساعدة
 * (keywords، مثل الاسم الإنجليزي) فقط — لا يبحث في المفتاح (value).
 */
export function optionMatchesQuery(option: SearchableOption, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return (
    normalizeSearch(option.label).includes(normalizedQuery) ||
    (option.keywords ? normalizeSearch(option.keywords).includes(normalizedQuery) : false)
  );
}

type Row =
  | { kind: 'header'; label: string }
  | { kind: 'option'; option: SearchableOption; index: number };

/**
 * قائمة اختيار قابلة للبحث — مكوّن موحّد يُستخدم في الإنشاء/التعديل/الفلترة.
 * البحث يتم في الاسم العربي (label) وكلمات المساعدة (keywords) فقط — لا يبحث في المفتاح.
 */
export default function SearchableSelect({
  value,
  onChange,
  options,
  emptyLabel,
  placeholder = 'اختر…',
  searchPlaceholder = 'ابحث…',
  ariaLabel,
  id,
  disabled,
}: Props) {
  const autoId = useId();
  const baseId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  // العناصر المطابقة (بترتيب الأصل) + صفوف العرض مع عناوين المجموعات.
  const { flat, rows } = useMemo(() => {
    const q = normalizeSearch(query);
    const matched = q ? options.filter((o) => optionMatchesQuery(o, q)) : options.slice();

    const builtRows: Row[] = [];
    const flatOpts: SearchableOption[] = [];
    let lastGroup: string | undefined;
    for (const o of matched) {
      if (o.group && o.group !== lastGroup) {
        builtRows.push({ kind: 'header', label: o.group });
        lastGroup = o.group;
      }
      builtRows.push({ kind: 'option', option: o, index: flatOpts.length });
      flatOpts.push(o);
    }
    return { flat: flatOpts, rows: builtRows };
  }, [options, query]);

  // فتح القائمة يعيد ضبط البحث ويضع المؤشر على العنصر المحدَّد إن وُجد.
  const openMenu = useCallback(() => {
    if (disabled) return;
    setQuery('');
    const idx = flat.findIndex((o) => o.value === value);
    setActive(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [disabled, flat, value]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const choose = useCallback(
    (v: string) => {
      onChange(v);
      close();
    },
    [onChange, close],
  );

  // إبقاء المؤشر ضمن الحدود عند تغيّر نتائج البحث.
  useEffect(() => {
    if (!open) return;
    setActive((a) => (flat.length === 0 ? 0 : Math.min(a, flat.length - 1)));
  }, [flat.length, open]);

  // تركيز حقل البحث عند الفتح.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // إغلاق عند النقر خارج المكوّن.
  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, close]);

  // تمرير العنصر النشط إلى النطاق المرئي.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`#${CSS.escape(baseId)}-opt-${active}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open, baseId]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((a) => (flat.length ? (a + 1) % flat.length : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => (flat.length ? (a - 1 + flat.length) % flat.length : 0));
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(Math.max(0, flat.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (flat[active]) choose(flat[active].value);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        close();
        break;
    }
  }

  const displayLabel = selected?.label ?? (value === '' && emptyLabel ? emptyLabel : '');
  const listboxId = `${baseId}-listbox`;
  const activeOptId = open && flat[active] ? `${baseId}-opt-${active}` : undefined;

  return (
    <div className={`msel${disabled ? ' msel--disabled' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="msel-trigger xpl-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        {selected?.icon && <span className="material-symbols-outlined msel-trigger-icon" aria-hidden="true">{selected.icon}</span>}
        <span className={`msel-trigger-label${displayLabel ? '' : ' msel-placeholder'}`}>{displayLabel || placeholder}</span>
        <span className="material-symbols-outlined msel-chevron" aria-hidden="true">expand_more</span>
      </button>

      {open && (
        <div className="msel-pop">
          <div className="msel-search">
            <span className="material-symbols-outlined" aria-hidden="true">search</span>
            <input
              ref={inputRef}
              className="msel-search-input"
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeOptId}
              aria-autocomplete="list"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul className="msel-list" role="listbox" id={listboxId} aria-label={ariaLabel} ref={listRef}>
            {emptyLabel !== undefined && !query && (
              <li
                role="option"
                aria-selected={value === ''}
                className={`msel-opt${value === '' ? ' msel-opt--selected' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); choose(''); }}
              >
                <span className="msel-opt-label msel-muted">{emptyLabel}</span>
              </li>
            )}
            {rows.length === 0 && (
              <li className="msel-noresult" aria-disabled="true">لا توجد نتائج مطابقة</li>
            )}
            {rows.map((row) =>
              row.kind === 'header' ? (
                <li key={`h-${row.label}`} className="msel-group" role="presentation">{row.label}</li>
              ) : (
                <li
                  key={row.option.value}
                  id={`${baseId}-opt-${row.index}`}
                  role="option"
                  aria-selected={row.option.value === value}
                  className={`msel-opt${row.index === active ? ' msel-opt--active' : ''}${row.option.value === value ? ' msel-opt--selected' : ''}`}
                  onMouseEnter={() => setActive(row.index)}
                  onMouseDown={(e) => { e.preventDefault(); choose(row.option.value); }}
                >
                  {row.option.icon && <span className="material-symbols-outlined msel-opt-icon" aria-hidden="true">{row.option.icon}</span>}
                  <span className="msel-opt-label">{row.option.label}</span>
                  {row.option.value === value && <span className="material-symbols-outlined msel-check" aria-hidden="true">check</span>}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
