import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  FONT_CATEGORY_LABELS_AR,
  fontStackOf,
  findFont,
  getEnabledFonts,
  getFontsByCategory,
  searchFonts,
  type FontCategory,
  type FontId,
  type FontMeta,
} from '../../../styles/fontRegistry';
import './FontPicker.css';

/**
 * FontPicker — منتقي خطوط بمعاينة حقيقية (Font Registry Enhancement Pack v2).
 *
 * لماذا ليس `SearchableSelect`
 * ────────────────────────────
 * `SearchableSelect` يعرض الخيار سطرًا نصيًّا واحدًا (`msel-opt-label`) ولا يملك
 * فتحة لمحتوى مخصَّص. أما هنا فجسم الخيار **عيّنة خط**: سطر اسم بخط الواجهة،
 * وتحته نص معاينة بخط العيّنة نفسها وبمقاسها الافتراضي. إضافة `renderOption`
 * إلى `SearchableSelect` كانت ستمسّ مكوّنًا يعمل في ست شاشات قائمة مقابل حزمة
 * تأسيسية لا تُشغَّل بعد — مخاطرة لا يشتريها المكسب.
 *
 * ما شورك فعلًا هو المنطق الذي يستحق المشاركة: تطبيع البحث العربي، المنقول إلى
 * `lib/arabicSearch` ويستعمله الاثنان عبر `searchFonts`. أما هيكل اللوحة
 * ولوحة المفاتيح فمكرَّران عمدًا لأن تشريح الصف مختلف جوهريًا. سلوك المفاتيح
 * مطابق لـ`SearchableSelect` حرفيًا كي لا يتعلّم المستخدم تفاعلين.
 *
 * هذه الحزمة **لا تربط المنتقي بأي شاشة**. لا يستورده أي ملف إنتاجي بعد.
 */

export interface FontPickerProps {
  /**
   * معرّف الخط المختار. `string` لا `FontId` عمدًا: القيمة قد تأتي من مستند
   * محفوظ يشير إلى خط أُزيل — والمنتقي يعرضها بوضوح بدل ابتلاعها.
   */
  value?: string | null;
  /** يُستدعى بالمعرّف وببياناته معًا، فلا يحتاج المستدعي إلى استعلام إضافي. */
  onChange: (id: FontId, meta: FontMeta) => void;
  /** نطاق الخطوط المعروضة. الافتراضي: كل الخطوط المُفعَّلة في السجل. */
  fonts?: readonly FontMeta[];
  /** اختصار لتقييد النطاق بتصنيف واحد. يتجاهله `fonts` إن مُرِّر صراحةً. */
  category?: FontCategory;
  /** نص معاينة موحَّد يتجاوز `previewText` الخاص بكل خط (مثلًا نص المستند الفعلي). */
  previewText?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

export default function FontPicker({
  value,
  onChange,
  fonts,
  category,
  previewText,
  placeholder = 'اختر خطًا…',
  searchPlaceholder = 'ابحث عن خط…',
  ariaLabel = 'اختيار الخط',
  id,
  disabled = false,
  className,
}: FontPickerProps) {
  const autoId = useId();
  const baseId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const pool = useMemo<readonly FontMeta[]>(
    () => fonts ?? (category ? getFontsByCategory(category) : getEnabledFonts()),
    [fonts, category],
  );

  const matches = useMemo(() => searchFonts(query, pool), [query, pool]);

  /** بيانات المختار — `undefined` حين يشير `value` إلى خط غير مسجَّل. */
  const selected = useMemo(() => findFont(value), [value]);
  /** `value` مضبوط لكنه غير معروف: نعرضه كما هو بدل إظهار عنصر نائب كاذب. */
  const unknownValue = !!value && !selected;

  const openMenu = useCallback(() => {
    if (disabled) return;
    setQuery('');
    const idx = pool.findIndex((f) => f.id === value);
    setActive(idx >= 0 ? idx : 0);
    setOpen(true);
  }, [disabled, pool, value]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const choose = useCallback(
    (meta: FontMeta) => {
      onChange(meta.id as FontId, meta);
      close();
    },
    [onChange, close],
  );

  // إبقاء المؤشر ضمن الحدود عند تغيّر نتائج البحث.
  useEffect(() => {
    if (!open) return;
    setActive((a) => (matches.length === 0 ? 0 : Math.min(a, matches.length - 1)));
  }, [matches.length, open]);

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
        setActive((a) => (matches.length ? (a + 1) % matches.length : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => (matches.length ? (a - 1 + matches.length) % matches.length : 0));
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(Math.max(0, matches.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (matches[active]) choose(matches[active]);
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

  const listboxId = `${baseId}-listbox`;
  const activeOptId = open && matches[active] ? `${baseId}-opt-${active}` : undefined;

  return (
    <div
      className={`fpk${disabled ? ' fpk--disabled' : ''}${className ? ` ${className}` : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="fpk-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="fpk-trigger-body">
          {selected ? (
            <>
              {/* الاسم بخطّه هو — أسرع تمييز بصري من نص محايد. */}
              <span className="fpk-trigger-name" style={{ fontFamily: fontStackOf(selected) }}>
                {selected.displayName}
              </span>
              <span className="fpk-trigger-cat">{FONT_CATEGORY_LABELS_AR[selected.category]}</span>
            </>
          ) : unknownValue ? (
            <span className="fpk-trigger-name fpk-unknown" title="خط غير مسجَّل في سجل الخطوط">
              {value}
            </span>
          ) : (
            <span className="fpk-trigger-name fpk-placeholder">{placeholder}</span>
          )}
        </span>
        <span className="material-symbols-outlined fpk-chevron" aria-hidden="true">
          expand_more
        </span>
      </button>

      {open && (
        <div className="fpk-pop">
          <div className="fpk-search">
            <span className="material-symbols-outlined" aria-hidden="true">
              search
            </span>
            <input
              ref={inputRef}
              className="fpk-search-input"
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listboxId}
              aria-activedescendant={activeOptId}
              aria-autocomplete="list"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>

          <ul className="fpk-list" role="listbox" id={listboxId} aria-label={ariaLabel} ref={listRef}>
            {matches.length === 0 && (
              <li className="fpk-noresult" aria-disabled="true">
                لا توجد نتائج مطابقة
              </li>
            )}
            {matches.map((f, i) => {
              const isSelected = f.id === value;
              return (
                <li
                  key={f.id}
                  id={`${baseId}-opt-${i}`}
                  role="option"
                  aria-selected={isSelected}
                  data-font-id={f.id}
                  className={`fpk-opt${i === active ? ' fpk-opt--active' : ''}${
                    isSelected ? ' fpk-opt--selected' : ''
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(f);
                  }}
                >
                  <span className="fpk-opt-head">
                    <span className="fpk-opt-name">{f.displayName}</span>
                    <span className="fpk-opt-cat">{FONT_CATEGORY_LABELS_AR[f.category]}</span>
                    {isSelected && (
                      <span className="material-symbols-outlined fpk-check" aria-hidden="true">
                        check
                      </span>
                    )}
                  </span>
                  {/*
                    المعاينة بالخط الحقيقي وبمقاسه الافتراضي — لا بمقاس موحَّد.
                    خطوط النسخ تُصيَّر أصغر بكثير من الـsans عند نفس المقاس، فتوحيد
                    المقاس يجعل المقارنة كاذبة.
                  */}
                  <span
                    className="fpk-opt-preview"
                    style={{
                      fontFamily: fontStackOf(f),
                      fontSize: `${f.defaultSize}px`,
                      lineHeight: f.defaultLineHeight,
                    }}
                  >
                    {previewText ?? f.previewText}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
