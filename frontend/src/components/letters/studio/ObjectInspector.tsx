/**
 * Document Layout Designer — the Object Inspector.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE NUMERIC PATH TO EVERY PROPERTY THE CANVAS EDITS BY GESTURE.
 * ══════════════════════════════════════════════════════════════════════════
 * Dragging is fast and approximate; typing is slow and exact. A designer needs both,
 * and every field here routes through the SAME pure command the gesture does — so
 * "typed 40 mm" and "dragged to 40 mm" produce byte-identical documents. Two paths
 * that agreed only approximately would show up as a document that changed when
 * nothing was edited.
 *
 * ── EVERY FIELD IS COMMITTED ON BLUR OR ENTER, NEVER PER KEYSTROKE ───────
 * A width field that applied on every character would resize the object to 4 mm while
 * the author was on their way to typing 45 — and would push an undo step for each
 * digit. So the field holds its own draft text and commits once, which is also what
 * lets an invalid entry simply revert instead of needing an error message.
 *
 * ── A MULTI-SELECTION SHOWS WHAT IS SHARED ──────────────────────────────
 * With several objects selected, a field shows the common value or a blank when they
 * differ, and writing to it applies to all. Showing the first object's value would be
 * a quiet lie about the other four.
 */

import { type RefObject, useEffect, useId, useState } from 'react';
import { Icon } from '../../explorer/ExplorerKit';
import { FontPicker } from '../../common/FontPicker';
import {
  type LayoutObject,
  type LayoutPayload,
  LAYOUT_OBJECT_LABELS_AR,
} from '../../../letters/model/layoutTypes';
import { type FontId, type FontMeta } from '../../../styles/fontRegistry';
import { getLetterFontPool } from '../../../letters/fonts/fontIntegration';
import { FONT_SIZE_LADDER_PT, type TextAlignment } from '../../../letters/registry/typographyPresets';
import { LINE_HEIGHT_LADDER } from '../../../letters/registry/toolbarCommands';
import { type ResizableRail } from './useResizableRail';
import RailResizeHandle from './RailResizeHandle';
import './object-inspector.css';

export interface ObjectInspectorProps {
  readonly objects: readonly LayoutObject[];
  readonly pageCount: number;
  readonly readOnly: boolean;
  readonly resize: ResizableRail;
  readonly onFrame: (patch: { xMm?: number; yMm?: number; widthMm?: number; heightMm?: number }) => void;
  readonly onRotate: (degrees: number) => void;
  readonly onOpacity: (opacity: number) => void;
  readonly onPage: (pageIndex: number) => void;
  readonly onLocked: (locked: boolean) => void;
  readonly onHidden: (hidden: boolean) => void;
  readonly onReorder: (direction: 'front' | 'forward' | 'backward' | 'back') => void;
  readonly onPayload: (objectId: string, payload: LayoutPayload) => void;
}

/** The shared value across a selection, or `null` when they differ. */
function shared<T>(objects: readonly LayoutObject[], read: (object: LayoutObject) => T): T | null {
  if (objects.length === 0) return null;
  const first = read(objects[0]);
  return objects.every((object) => read(object) === first) ? first : null;
}

export default function ObjectInspector({
  objects,
  pageCount,
  readOnly,
  onFrame,
  onRotate,
  onOpacity,
  onPage,
  onLocked,
  onHidden,
  onReorder,
  onPayload,
  resize,
}: ObjectInspectorProps) {
  const railStyle = { '--rail-w': `${resize.width}px` } as React.CSSProperties;
  const handle = (
    <RailResizeHandle
      handleRef={resize.handleRef}
      label="تغيير عرض لوحة الخصائص"
      // Form Editor UX Rebuild v2 moved the inspector from the left (after the
      // canvas in DOM order) to the right ("خصائص العنصر", before it) — the handle
      // follows, per `RailResizeHandle`'s own before/after convention.
      edge="before"
      onPointerDown={resize.startDrag}
      onKeyDown={resize.onHandleKeyDown}
    />
  );

  if (objects.length === 0) {
    return (
      <div className="obi-panel obi-panel--empty lc-rail-in" ref={resize.railRef as RefObject<HTMLDivElement>} style={railStyle}>
        {handle}
        <Icon name="ads_click" />
        <p>اختر عنصرًا لعرض خصائصه</p>
      </div>
    );
  }

  const single = objects.length === 1 ? objects[0] : null;
  const disabled = readOnly;

  return (
    <div className="obi-panel lc-rail-in" ref={resize.railRef as RefObject<HTMLDivElement>} style={railStyle}>
      {handle}
      <div className="obi-head">
        <Icon name="tune" />
        <span className="obi-title">
          {single ? single.name : `${objects.length} عناصر محدّدة`}
        </span>
        {single && <span className="obi-kind">{LAYOUT_OBJECT_LABELS_AR[single.kind]}</span>}
      </div>

      {/* ── Position and size ───────────────────────────────────────────── */}
      <Section title="الموضع والحجم">
        <div className="obi-grid">
          <NumberField
            label="س"
            unit="مم"
            value={shared(objects, (o) => o.frame.xMm)}
            disabled={disabled}
            onCommit={(v) => onFrame({ xMm: v })}
          />
          <NumberField
            label="ص"
            unit="مم"
            value={shared(objects, (o) => o.frame.yMm)}
            disabled={disabled}
            onCommit={(v) => onFrame({ yMm: v })}
          />
          <NumberField
            label="العرض"
            unit="مم"
            value={shared(objects, (o) => o.frame.widthMm)}
            disabled={disabled}
            min={3}
            onCommit={(v) => onFrame({ widthMm: v })}
          />
          <NumberField
            label="الارتفاع"
            unit="مم"
            value={shared(objects, (o) => o.frame.heightMm)}
            disabled={disabled}
            min={3}
            onCommit={(v) => onFrame({ heightMm: v })}
          />
          <NumberField
            label="الدوران"
            unit="°"
            value={shared(objects, (o) => o.rotationDeg)}
            disabled={disabled}
            onCommit={onRotate}
          />
          <NumberField
            label="الشفافية"
            unit="٪"
            value={(() => {
              const value = shared(objects, (o) => o.opacity);
              return value === null ? null : Math.round(value * 100);
            })()}
            disabled={disabled}
            min={0}
            max={100}
            onCommit={(v) => onOpacity(v / 100)}
          />
        </div>
      </Section>

      {/* ── Placement ───────────────────────────────────────────────────── */}
      <Section title="الصفحة والترتيب">
        <label className="obi-field">
          <span>الصفحة</span>
          <select
            value={shared(objects, (o) => o.pageIndex) ?? ''}
            disabled={disabled}
            onChange={(e) => onPage(Number(e.target.value))}
            aria-label="صفحة العنصر"
          >
            {shared(objects, (o) => o.pageIndex) === null && <option value="">—</option>}
            {Array.from({ length: pageCount }, (_, index) => (
              <option key={index} value={index}>{index + 1}</option>
            ))}
          </select>
        </label>

        <div className="obi-buttons" role="group" aria-label="ترتيب الطبقات">
          <IconAction icon="flip_to_front" label="إلى الأمام تمامًا" disabled={disabled} onClick={() => onReorder('front')} />
          <IconAction icon="keyboard_arrow_up" label="إلى الأمام" disabled={disabled} onClick={() => onReorder('forward')} />
          <IconAction icon="keyboard_arrow_down" label="إلى الخلف" disabled={disabled} onClick={() => onReorder('backward')} />
          <IconAction icon="flip_to_back" label="إلى الخلف تمامًا" disabled={disabled} onClick={() => onReorder('back')} />
        </div>

        <div className="obi-buttons" role="group" aria-label="القفل والإظهار">
          <ToggleAction
            icon={shared(objects, (o) => o.locked) ? 'lock' : 'lock_open'}
            label={shared(objects, (o) => o.locked) ? 'فتح القفل' : 'قفل'}
            on={shared(objects, (o) => o.locked) === true}
            disabled={readOnly}
            onClick={() => onLocked(!(shared(objects, (o) => o.locked) === true))}
          />
          <ToggleAction
            icon={shared(objects, (o) => o.hidden) ? 'visibility_off' : 'visibility'}
            label={shared(objects, (o) => o.hidden) ? 'إظهار' : 'إخفاء'}
            on={shared(objects, (o) => o.hidden) === true}
            disabled={readOnly}
            onClick={() => onHidden(!(shared(objects, (o) => o.hidden) === true))}
          />
        </div>
      </Section>

      {/* ── Per-kind properties, single selection only ──────────────────────
          A payload editor for a mixed selection would have to reconcile a table's
          columns with a text block's font, which is not a shared vocabulary. */}
      {single && (
        <PayloadSection object={single} disabled={disabled} onPayload={onPayload} />
      )}
    </div>
  );
}

/* ── Payload editors ────────────────────────────────────────────────────── */

function PayloadSection({
  object,
  disabled,
  onPayload,
}: {
  object: LayoutObject;
  disabled: boolean;
  onPayload: (objectId: string, payload: LayoutPayload) => void;
}) {
  const payload = object.payload;

  switch (payload.kind) {
    case 'textBlock': {
      const text = payload.text;
      const set = (patch: Partial<typeof text>) =>
        onPayload(object.id, { kind: 'textBlock', text: { ...text, ...patch } });

      return (
        <Section title="النص">
          <label className="obi-field obi-field--stack">
            <span>المحتوى</span>
            <textarea
              className="obi-textarea"
              value={text.text}
              disabled={disabled}
              rows={3}
              onChange={(e) => set({ text: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label="نص العنصر"
            />
          </label>

          <label className="obi-field">
            <span>الخط</span>
            <FontPicker
              value={text.fontId}
              onChange={(id: FontId, _meta: FontMeta) => set({ fontId: id })}
              fonts={getLetterFontPool()}
              disabled={disabled}
              ariaLabel="خط العنصر"
              placeholder="الخط"
              className="obi-font-picker"
            />
          </label>

          <div className="obi-grid obi-grid--two">
            <SelectField
              label="المقاس"
              value={String(text.sizePt)}
              disabled={disabled}
              options={FONT_SIZE_LADDER_PT.map((pt) => ({ value: String(pt), label: `${pt}` }))}
              onChange={(v) => set({ sizePt: Number(v) })}
            />
            <SelectField
              label="تباعد الأسطر"
              value={String(text.lineHeight)}
              disabled={disabled}
              options={LINE_HEIGHT_LADDER.map((v) => ({ value: String(v), label: `${v}×` }))}
              onChange={(v) => set({ lineHeight: Number(v) })}
            />
          </div>

          <div className="obi-grid obi-grid--two">
            <SelectField
              label="المحاذاة"
              value={text.alignment}
              disabled={disabled}
              options={[
                { value: 'start', label: 'للبداية' },
                { value: 'center', label: 'توسيط' },
                { value: 'justify', label: 'ضبط' },
              ]}
              onChange={(v) => set({ alignment: v as TextAlignment })}
            />
            <NumberField
              label="الحشو"
              unit="مم"
              value={text.paddingMm}
              disabled={disabled}
              min={0}
              onCommit={(v) => set({ paddingMm: v })}
            />
          </div>

          <div className="obi-buttons" role="group" aria-label="تنسيق النص">
            {(['bold', 'underline', 'highlight'] as const).map((mark) => (
              <ToggleAction
                key={mark}
                icon={mark === 'bold' ? 'format_bold' : mark === 'underline' ? 'format_underlined' : 'format_ink_highlighter'}
                label={mark === 'bold' ? 'عريض' : mark === 'underline' ? 'تسطير' : 'تظليل'}
                on={text.marks.includes(mark)}
                disabled={disabled}
                onClick={() =>
                  set({
                    marks: text.marks.includes(mark)
                      ? text.marks.filter((m) => m !== mark)
                      : [...text.marks, mark],
                  })
                }
              />
            ))}
          </div>
        </Section>
      );
    }

    case 'image': {
      const image = payload.image;
      const set = (patch: Partial<typeof image>) =>
        onPayload(object.id, { kind: 'image', image: { ...image, ...patch } });

      return (
        <Section title="الصورة">
          {/* Read as a data URL so the image travels INSIDE the document, exactly as
              the branding registry's assets do. A file path would break the moment the
              letter was opened on another machine. */}
          <label className="obi-field obi-field--stack">
            <span>الملف</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              disabled={disabled}
              aria-label="اختيار صورة"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => set({ imageUrl: String(reader.result), alt: image.alt || file.name });
                reader.readAsDataURL(file);
              }}
            />
          </label>

          <label className="obi-field">
            <span>نص بديل</span>
            <input
              type="text"
              value={image.alt}
              disabled={disabled}
              onChange={(e) => set({ alt: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label="نص بديل للصورة"
            />
          </label>

          <SelectField
            label="الملاءمة"
            value={image.fit}
            disabled={disabled}
            options={[
              { value: 'contain', label: 'احتواء (بلا قصّ)' },
              { value: 'cover', label: 'تغطية (مع قصّ)' },
            ]}
            onChange={(v) => set({ fit: v as 'contain' | 'cover' })}
          />
        </Section>
      );
    }

    case 'divider': {
      const divider = payload.divider;
      const set = (patch: Partial<typeof divider>) =>
        onPayload(object.id, { kind: 'divider', divider: { ...divider, ...patch } });

      return (
        <Section title="الفاصل">
          <NumberField
            label="السماكة"
            unit="مم"
            value={divider.thicknessMm}
            disabled={disabled}
            min={0.1}
            step={0.1}
            onCommit={(v) => set({ thicknessMm: v })}
          />
          <SelectField
            label="النمط"
            value={divider.style}
            disabled={disabled}
            options={[
              { value: 'solid', label: 'متصل' },
              { value: 'dashed', label: 'متقطّع' },
              { value: 'dotted', label: 'منقّط' },
            ]}
            onChange={(v) => set({ style: v as 'solid' | 'dashed' | 'dotted' })}
          />
        </Section>
      );
    }

    case 'table': {
      const table = payload.table;
      const set = (patch: Partial<typeof table>) =>
        onPayload(object.id, { kind: 'table', table: { ...table, ...patch } });

      /** Resize the cell array, preserving what fits. */
      const resize = (rows: number, columns: number) => {
        const cells = Array.from({ length: rows * columns }, (_, index) => {
          const row = Math.floor(index / columns);
          const column = index % columns;
          // Reads from the OLD geometry, so shrinking then re-growing recovers the
          // cells that are still in range rather than clearing the whole grid.
          return row < table.rows && column < table.columns ? table.cells[row * table.columns + column] ?? '' : '';
        });
        set({ rows, columns, cells });
      };

      return (
        <Section title="الجدول">
          <div className="obi-grid obi-grid--two">
            <NumberField
              label="الصفوف"
              value={table.rows}
              disabled={disabled}
              min={1}
              max={30}
              onCommit={(v) => resize(Math.round(v), table.columns)}
            />
            <NumberField
              label="الأعمدة"
              value={table.columns}
              disabled={disabled}
              min={1}
              max={12}
              onCommit={(v) => resize(table.rows, Math.round(v))}
            />
          </div>

          <label className="obi-field obi-field--checkbox">
            <input
              type="checkbox"
              checked={table.headerRow}
              disabled={disabled}
              onChange={(e) => set({ headerRow: e.target.checked })}
            />
            <span>الصف الأول رأس جدول</span>
          </label>

          <div className="obi-cells" role="group" aria-label="خلايا الجدول">
            {Array.from({ length: table.rows }, (_, row) => (
              <div key={row} className="obi-cell-row">
                {Array.from({ length: table.columns }, (_, column) => (
                  <input
                    key={column}
                    type="text"
                    className="obi-cell"
                    value={table.cells[row * table.columns + column] ?? ''}
                    disabled={disabled}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const cells = [...table.cells];
                      cells[row * table.columns + column] = e.target.value;
                      set({ cells });
                    }}
                    aria-label={`الصف ${row + 1} العمود ${column + 1}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </Section>
      );
    }

    case 'qrCode': {
      const qr = payload.qr;
      const set = (patch: Partial<typeof qr>) =>
        onPayload(object.id, { kind: 'qrCode', qr: { ...qr, ...patch } });

      return (
        <Section title="رمز QR">
          <label className="obi-field obi-field--stack">
            <span>المحتوى</span>
            <textarea
              className="obi-textarea"
              value={qr.payload}
              disabled={disabled}
              rows={2}
              onChange={(e) => set({ payload: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label="محتوى رمز QR"
            />
          </label>
          <label className="obi-field">
            <span>التسمية</span>
            <input
              type="text"
              value={qr.caption}
              disabled={disabled}
              onChange={(e) => set({ caption: e.target.value })}
              onKeyDown={(e) => e.stopPropagation()}
              aria-label="تسمية رمز QR"
            />
          </label>
          <p className="obi-note">
            هذا رمز إضافي يضعه المُحرِّر. الباركود الرسمي للخطاب يُنشئه النظام ويُجمَّد عند التسجيل، ولا يمكن نقله أو حذفه.
          </p>
        </Section>
      );
    }
  }
}

/* ── Small parts ────────────────────────────────────────────────────────── */

/**
 * A collapsible card (Document Studio UX Polish Pack v1). Collapse is component state,
 * not persisted — it naturally survives switching between objects of the same session
 * (this component stays mounted; only the per-kind section below it unmounts/remounts
 * when the selection's KIND changes), which is exactly the behaviour worth keeping:
 * collapse "Position & size" once, and it stays collapsed while you click through
 * several objects, but a fresh session starts every card open.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <section className={`obi-section${open ? '' : ' is-collapsed'}`}>
      <button
        type="button"
        className="obi-section-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <Icon name="expand_more" className="obi-section-chevron" />
        <h3 className="obi-section-title">{title}</h3>
      </button>
      <div className="obi-section-collapse" id={bodyId} role="region" aria-label={title}>
        <div className="obi-section-body">{children}</div>
      </div>
    </section>
  );
}

/**
 * A numeric field that commits on blur or Enter.
 *
 * The draft is local state seeded from the prop, and RESEEDED whenever the prop
 * changes — which is what makes a value typed here and a value dragged on the canvas
 * stay in step without the field fighting the drag.
 */
function NumberField({
  label,
  unit,
  value,
  disabled,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  unit?: string;
  value: number | null;
  disabled: boolean;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value === null ? '' : String(value));

  useEffect(() => {
    setDraft(value === null ? '' : String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    // An unparseable entry REVERTS rather than erroring: the author sees the old value
    // return, which says "that was not a number" without a message to dismiss.
    if (!Number.isFinite(parsed)) {
      setDraft(value === null ? '' : String(value));
      return;
    }
    const bounded = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    onCommit(bounded);
  };

  return (
    <label className="obi-num" htmlFor={id}>
      <span className="obi-num-label">{label}</span>
      <span className="obi-num-input">
        <input
          id={id}
          type="number"
          value={draft}
          disabled={disabled}
          min={min}
          max={max}
          step={step ?? 1}
          placeholder={value === null ? 'مختلف' : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
        {unit && <span className="obi-unit">{unit}</span>}
      </span>
    </label>
  );
}

function SelectField({
  label,
  value,
  disabled,
  options,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="obi-field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function IconAction({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="obi-btn" onClick={onClick} disabled={disabled} title={label} aria-label={label}>
      <Icon name={icon} />
    </button>
  );
}

function ToggleAction({
  icon,
  label,
  on,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`obi-btn${on ? ' is-on' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      title={label}
      aria-label={label}
    >
      <Icon name={icon} />
    </button>
  );
}
