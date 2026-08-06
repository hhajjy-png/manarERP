/**
 * Document Studio — the toolbar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  STILL RENDERS FROM THE TEMPLATE'S ALLOW-LIST, NOT FROM A BUILT-IN SET.
 * ══════════════════════════════════════════════════════════════════════════
 * The mechanism the previous toolbar established is unchanged and is the reason this
 * one could grow safely: it shows the INTERSECTION of what the template permits
 * (`DocumentTemplate.toolbarCommands`) with what this pack implements
 * (`IMPLEMENTED_COMMANDS`). Document Studio Foundation v1 widened both lists; it did
 * not bypass either.
 *
 * `pageBreak` is still permitted and still unimplemented, so it still does not appear.
 * That is the mechanism working, not an oversight.
 *
 * ── WHY GROUPS, AND WHY NOT A RIBBON ─────────────────────────────────────
 * The controls roughly tripled, so an undifferentiated row would have become a wall of
 * nineteen identical icons. They are now in six named sections — Typography,
 * Paragraph, Spacing, Formatting, View, Editing — separated by the same short centred
 * rule the previous toolbar used.
 *
 * A ribbon was rejected for the reason recorded in `LetterComposer.css`: every row of
 * chrome is a row of paper the author cannot see, and a two-tier ribbon would cost
 * roughly 70px permanently. Instead the least-used section (Spacing) collapses into a
 * single popover button, so the resting height stays one row while nothing becomes
 * unreachable.
 *
 * ── EVERY CONTROL STILL APPLIES TO A WHOLE PARAGRAPH ─────────────────────
 * Including the three marks version 2 added. The one-span-per-block invariant is
 * untouched: there is no character-range control here, and there is no code path that
 * could produce one.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { FontPicker } from '../../common/FontPicker';
import { Icon } from '../../explorer/ExplorerKit';
import {
  type ToolbarCommandId,
  FIRST_LINE_INDENT_LADDER_MM,
  HANGING_INDENT_LADDER_MM,
  LETTER_SPACING_LADDER_PT,
  LINE_HEIGHT_LADDER,
  PARAGRAPH_SPACING_LADDER_PT,
} from '../../../letters/registry/toolbarCommands';
import { type FontId, type FontMeta } from '../../../styles/fontRegistry';
import { FONT_SIZE_LADDER_PT, type TextAlignment } from '../../../letters/registry/typographyPresets';
import {
  type CharacterStyle,
  type ParagraphStyle,
  getAllCharacterStyles,
  getAllParagraphStyles,
} from '../../../letters/registry/documentStyles';
import { type ListType } from '../../../letters/model/blockTypes';
import { getLetterFontPool } from '../../../letters/fonts/fontIntegration';
import './document-toolbar.css';

/**
 * Commands this pack can actually execute.
 *
 * The gap between this and the template's allow-list is deliberate and visible; see the
 * header. Adding a command here is how a later pack ships a tool.
 */
export const IMPLEMENTED_COMMANDS: readonly ToolbarCommandId[] = [
  'bold',
  'underline',
  'highlight',
  'superscript',
  'subscript',
  'alignJustify',
  'alignStart',
  'alignCenter',
  'fontFamily',
  'fontSize',
  'paragraphStyle',
  'characterStyle',
  'listNumbered',
  'listBulleted',
  'indent',
  'outdent',
  'lineHeight',
  'paragraphSpacing',
  'letterSpacing',
  'firstLineIndent',
  'hangingIndent',
  'formatPainter',
  'pastePlain',
  'findReplace',
  'clearFormatting',
  'undo',
  'redo',
];

/** The active paragraph's formatting, so the toolbar can reflect it. */
export interface ToolbarState {
  readonly fontId: FontId | null;
  readonly sizePt: number | null;
  readonly alignment: TextAlignment | null;
  readonly bold: boolean;
  readonly underline: boolean;
  readonly highlight: boolean;
  readonly superscript: boolean;
  readonly subscript: boolean;
  /** The matched named style, or `null` when the paragraph's type is custom. */
  readonly paragraphStyle: ParagraphStyle | null;
  readonly characterStyle: CharacterStyle | null;
  readonly listType: ListType | null;
  readonly indentLevel: number;
  readonly lineHeight: number | null;
  readonly paragraphSpacingPt: number | null;
  readonly letterSpacingPt: number | null;
  readonly firstLineIndentMm: number | null;
  readonly hangingIndentMm: number | null;
  /** False when no paragraph is focused — formatting has nothing to act on. */
  readonly hasTarget: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** True while the format painter holds a copied format, awaiting a target. */
  readonly formatPainterArmed: boolean;
  readonly findOpen: boolean;
}

export interface DocumentToolbarProps {
  readonly allowedCommands: readonly ToolbarCommandId[];
  readonly state: ToolbarState;
  readonly disabled: boolean;
  readonly onToggleMark: (mark: 'bold' | 'underline' | 'highlight' | 'superscript' | 'subscript') => void;
  readonly onAlign: (alignment: TextAlignment) => void;
  readonly onFont: (fontId: FontId) => void;
  readonly onSize: (sizePt: number) => void;
  readonly onParagraphStyle: (style: ParagraphStyle) => void;
  readonly onCharacterStyle: (style: CharacterStyle) => void;
  readonly onToggleList: (listType: ListType) => void;
  readonly onIndent: (direction: 'in' | 'out') => void;
  readonly onLineHeight: (value: number) => void;
  readonly onParagraphSpacing: (pt: number) => void;
  readonly onLetterSpacing: (pt: number) => void;
  readonly onFirstLineIndent: (mm: number) => void;
  readonly onHangingIndent: (mm: number) => void;
  readonly onFormatPainter: () => void;
  readonly onPastePlain: () => void;
  readonly onClearFormatting: () => void;
  readonly onToggleFind: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
}

export default function DocumentToolbar({
  allowedCommands,
  state,
  disabled,
  onToggleMark,
  onAlign,
  onFont,
  onSize,
  onParagraphStyle,
  onCharacterStyle,
  onToggleList,
  onIndent,
  onLineHeight,
  onParagraphSpacing,
  onLetterSpacing,
  onFirstLineIndent,
  onHangingIndent,
  onFormatPainter,
  onPastePlain,
  onClearFormatting,
  onToggleFind,
  onUndo,
  onRedo,
}: DocumentToolbarProps) {
  const shows = (id: ToolbarCommandId) =>
    allowedCommands.includes(id) && IMPLEMENTED_COMMANDS.includes(id);

  // Formatting needs a paragraph to act on; history and find do not.
  const noTarget = disabled || !state.hasTarget;

  const paragraphStyles = getAllParagraphStyles();
  const characterStyles = getAllCharacterStyles();

  const showsSpacing =
    shows('lineHeight') ||
    shows('paragraphSpacing') ||
    shows('letterSpacing') ||
    shows('firstLineIndent') ||
    shows('hangingIndent');

  return (
    <div className="dt-bar" role="toolbar" aria-label="أدوات التنسيق">
      {/* ── Typography ──────────────────────────────────────────────────── */}
      {(shows('paragraphStyle') || shows('characterStyle')) && (
        <Group label="الأنماط">
          {shows('paragraphStyle') && (
            <select
              className="dt-select dt-select--style"
              value={state.paragraphStyle?.id ?? ''}
              onChange={(e) => {
                const style = paragraphStyles.find((s) => s.id === e.target.value);
                if (style) onParagraphStyle(style);
              }}
              disabled={noTarget}
              aria-label="نمط الفقرة"
              title="نمط الفقرة — عنوان، نص عادي أو اقتباس"
            >
              {/* An empty option ONLY when the paragraph matches no named style. It is
                  never selectable: "custom" is a state to report, not one to choose. */}
              {state.paragraphStyle === null && <option value="" disabled>مخصّص</option>}
              {paragraphStyles.map((style) => (
                <option key={style.id} value={style.id}>{style.labelAr}</option>
              ))}
            </select>
          )}
          {shows('characterStyle') && (
            <select
              className="dt-select dt-select--charstyle"
              value={state.characterStyle?.id ?? ''}
              onChange={(e) => {
                const style = characterStyles.find((s) => s.id === e.target.value);
                if (style) onCharacterStyle(style);
              }}
              disabled={noTarget}
              aria-label="نمط الأحرف"
              title="نمط الأحرف — يُطبَّق على الفقرة كاملة"
            >
              {state.characterStyle === null && <option value="" disabled>مخصّص</option>}
              {characterStyles.map((style) => (
                <option key={style.id} value={style.id}>{style.labelAr}</option>
              ))}
            </select>
          )}
        </Group>
      )}

      {(shows('fontFamily') || shows('fontSize')) && (
        <Group label="الخط">
          {shows('fontFamily') && (
            <FontPicker
              value={state.fontId}
              onChange={(id: FontId, _meta: FontMeta) => onFont(id)}
              fonts={getLetterFontPool()}
              disabled={noTarget}
              ariaLabel="خط الفقرة"
              placeholder="الخط"
              className="dt-font-picker"
            />
          )}
          {shows('fontSize') && (
            // A fixed ladder, not a free number: every size is an input to pagination,
            // so a bounded set is a bounded surface to validate.
            <select
              className="dt-select dt-select--size"
              value={state.sizePt ?? ''}
              onChange={(e) => onSize(Number(e.target.value))}
              disabled={noTarget}
              aria-label="مقاس الخط"
              title="مقاس الخط"
            >
              {state.sizePt === null && <option value="">—</option>}
              {FONT_SIZE_LADDER_PT.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          )}
        </Group>
      )}

      {/* ── Marks ───────────────────────────────────────────────────────── */}
      {(shows('bold') || shows('underline') || shows('highlight') || shows('superscript') || shows('subscript')) && (
        <Group label="التنسيق">
          {shows('bold') && (
            <ToolButton icon="format_bold" label="عريض" title="عريض — يطبَّق على الفقرة كاملة" on={state.bold} disabled={noTarget} onClick={() => onToggleMark('bold')} />
          )}
          {shows('underline') && (
            <ToolButton icon="format_underlined" label="تسطير" title="تسطير — يطبَّق على الفقرة كاملة" on={state.underline} disabled={noTarget} onClick={() => onToggleMark('underline')} />
          )}
          {shows('highlight') && (
            <ToolButton icon="format_ink_highlighter" label="تظليل" title="تظليل رمادي محايد — بلا لون، حفاظًا على الطابع الرسمي" on={state.highlight} disabled={noTarget} onClick={() => onToggleMark('highlight')} />
          )}
          {shows('superscript') && (
            <ToolButton icon="superscript" label="رفع" title="رفع — لا يجتمع مع الخفض" on={state.superscript} disabled={noTarget} onClick={() => onToggleMark('superscript')} />
          )}
          {shows('subscript') && (
            <ToolButton icon="subscript" label="خفض" title="خفض — لا يجتمع مع الرفع" on={state.subscript} disabled={noTarget} onClick={() => onToggleMark('subscript')} />
          )}
        </Group>
      )}

      {/* ── Paragraph ───────────────────────────────────────────────────── */}
      {(shows('alignJustify') || shows('alignStart') || shows('alignCenter')) && (
        <Group label="المحاذاة">
          {/* Logical alignment: `start` IS right under RTL, and "left" has no name in
              this engine — it is unrepresentable rather than merely discouraged. */}
          {shows('alignJustify') && (
            <ToolButton icon="format_align_justify" label="ضبط" title="ضبط" on={state.alignment === 'justify'} disabled={noTarget} onClick={() => onAlign('justify')} />
          )}
          {shows('alignStart') && (
            <ToolButton icon="format_align_right" label="محاذاة للبداية" title="محاذاة للبداية" on={state.alignment === 'start'} disabled={noTarget} onClick={() => onAlign('start')} />
          )}
          {shows('alignCenter') && (
            <ToolButton icon="format_align_center" label="توسيط" title="توسيط" on={state.alignment === 'center'} disabled={noTarget} onClick={() => onAlign('center')} />
          )}
        </Group>
      )}

      {(shows('listBulleted') || shows('listNumbered') || shows('indent') || shows('outdent')) && (
        <Group label="الفقرة">
          {shows('listBulleted') && (
            <ToolButton icon="format_list_bulleted" label="قائمة نقطية" title="قائمة نقطية" on={state.listType === 'bulleted'} disabled={noTarget} onClick={() => onToggleList('bulleted')} />
          )}
          {shows('listNumbered') && (
            <ToolButton icon="format_list_numbered" label="قائمة مرقّمة" title="قائمة مرقّمة" on={state.listType === 'numbered'} disabled={noTarget} onClick={() => onToggleList('numbered')} />
          )}
          {shows('indent') && (
            <ToolButton icon="format_indent_increase" label="زيادة الإزاحة" title="زيادة الإزاحة" on={false} disabled={noTarget || state.indentLevel >= 2} onClick={() => onIndent('in')} />
          )}
          {shows('outdent') && (
            <ToolButton icon="format_indent_decrease" label="تقليل الإزاحة" title="تقليل الإزاحة" on={false} disabled={noTarget || state.indentLevel <= 0} onClick={() => onIndent('out')} />
          )}
        </Group>
      )}

      {/* ── Spacing — collapsed into one popover, see the header ─────────── */}
      {showsSpacing && (
        <Group label="التباعد">
          <SpacingMenu
            state={state}
            disabled={noTarget}
            shows={shows}
            onLineHeight={onLineHeight}
            onParagraphSpacing={onParagraphSpacing}
            onLetterSpacing={onLetterSpacing}
            onFirstLineIndent={onFirstLineIndent}
            onHangingIndent={onHangingIndent}
          />
        </Group>
      )}

      {/* ── Clipboard and reset ─────────────────────────────────────────── */}
      {(shows('formatPainter') || shows('pastePlain') || shows('clearFormatting')) && (
        <Group label="النسخ">
          {shows('formatPainter') && (
            <ToolButton
              icon="format_paint"
              label="ناسخ التنسيق"
              title={state.formatPainterArmed ? 'اختر فقرة لتطبيق التنسيق المنسوخ — أو اضغط مرة أخرى للإلغاء' : 'نسخ تنسيق الفقرة الحالية (Ctrl+Shift+C)'}
              on={state.formatPainterArmed}
              disabled={noTarget}
              onClick={onFormatPainter}
            />
          )}
          {shows('pastePlain') && (
            <ToolButton icon="content_paste_go" label="لصق كنص عادي" title="لصق كنص عادي (Ctrl+Alt+V)" on={false} disabled={noTarget} onClick={onPastePlain} />
          )}
          {shows('clearFormatting') && (
            <ToolButton icon="format_clear" label="إزالة التنسيق" title="إزالة التنسيق — إعادة الفقرة إلى تنسيق القالب" on={false} disabled={noTarget} onClick={onClearFormatting} />
          )}
        </Group>
      )}

      <span className="dt-spacer" />

      {/* ── Editing ─────────────────────────────────────────────────────── */}
      {shows('findReplace') && (
        <Group label="بحث">
          <ToolButton
            icon="search"
            label="بحث واستبدال"
            title="بحث واستبدال (Ctrl+F)"
            on={state.findOpen}
            // Find reads the document; it does not need a focused paragraph, and it
            // stays available on a registered letter that cannot be edited.
            disabled={false}
            onClick={onToggleFind}
          />
        </Group>
      )}

      {(shows('undo') || shows('redo')) && (
        <Group label="التراجع" last>
          {shows('undo') && (
            <ToolButton icon="undo" label="تراجع" title="تراجع (Ctrl+Z)" on={false} disabled={disabled || !state.canUndo} onClick={onUndo} />
          )}
          {shows('redo') && (
            <ToolButton icon="redo" label="إعادة" title="إعادة (Ctrl+Y)" on={false} disabled={disabled || !state.canRedo} onClick={onRedo} />
          )}
        </Group>
      )}
    </div>
  );
}

/**
 * A named section of the toolbar.
 *
 * The label is visually hidden at the default density and revealed at wider widths —
 * it is a grouping cue for the eye and a landmark for a screen reader, and it must not
 * cost a row of height to provide either.
 */
function Group({ label, last, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={`dt-group${last ? ' dt-group--last' : ''}`} role="group" aria-label={label}>
      <span className="dt-group-label" aria-hidden="true">{label}</span>
      <div className="dt-group-items">{children}</div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  title,
  on,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  title: string;
  on: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`dt-btn${on ? ' is-on' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      title={title}
      aria-label={label}
    >
      <Icon name={icon} />
    </button>
  );
}

/**
 * The spacing controls, in a popover.
 *
 * Five selects that an author touches rarely but must be able to reach precisely. In
 * the row they would have doubled the toolbar's width for controls used on a minority
 * of paragraphs; behind one button they cost 30px and stay one click away.
 *
 * Closes on Escape and on a click outside — both, because either alone leaves a way to
 * get stuck with an open panel over the paper.
 */
function SpacingMenu({
  state,
  disabled,
  shows,
  onLineHeight,
  onParagraphSpacing,
  onLetterSpacing,
  onFirstLineIndent,
  onHangingIndent,
}: {
  state: ToolbarState;
  disabled: boolean;
  shows: (id: ToolbarCommandId) => boolean;
  onLineHeight: (value: number) => void;
  onParagraphSpacing: (pt: number) => void;
  onLetterSpacing: (pt: number) => void;
  onFirstLineIndent: (mm: number) => void;
  onHangingIndent: (mm: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  // A paragraph left at the engine's defaults reports no explicit spacing, so the
  // button is only marked "on" when something actually deviates — otherwise every
  // paragraph would look as though it had been adjusted.
  const customised =
    (state.lineHeight !== null && state.lineHeight !== 1.35) ||
    Boolean(state.paragraphSpacingPt) ||
    Boolean(state.letterSpacingPt) ||
    Boolean(state.firstLineIndentMm) ||
    Boolean(state.hangingIndentMm);

  return (
    <div className="dt-menu" ref={wrapper}>
      <button
        type="button"
        className={`dt-btn${open || customised ? ' is-on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        title="التباعد والإزاحة — تباعد الأسطر والفقرات والأحرف وإزاحة السطر الأول"
        aria-label="التباعد والإزاحة"
      >
        <Icon name="format_line_spacing" />
      </button>

      {open && (
        <div className="dt-menu-panel" id={panelId} role="dialog" aria-label="التباعد والإزاحة">
          {shows('lineHeight') && (
            <LadderField
              label="تباعد الأسطر"
              value={state.lineHeight ?? 1.35}
              ladder={LINE_HEIGHT_LADDER}
              format={(v) => `${v}×`}
              onChange={onLineHeight}
            />
          )}
          {shows('paragraphSpacing') && (
            <LadderField
              label="تباعد الفقرات"
              value={state.paragraphSpacingPt ?? 0}
              ladder={PARAGRAPH_SPACING_LADDER_PT}
              format={(v) => (v === 0 ? 'بلا' : `${v} نقطة`)}
              onChange={onParagraphSpacing}
            />
          )}
          {shows('letterSpacing') && (
            <LadderField
              label="تباعد الأحرف"
              value={state.letterSpacingPt ?? 0}
              ladder={LETTER_SPACING_LADDER_PT}
              format={(v) => (v === 0 ? 'بلا' : `${v} نقطة`)}
              onChange={onLetterSpacing}
            />
          )}
          {shows('firstLineIndent') && (
            <LadderField
              label="إزاحة السطر الأول"
              value={state.firstLineIndentMm ?? 0}
              ladder={FIRST_LINE_INDENT_LADDER_MM}
              format={(v) => (v === 0 ? 'بلا' : `${v} مم`)}
              onChange={onFirstLineIndent}
            />
          )}
          {shows('hangingIndent') && (
            <LadderField
              label="إزاحة معلّقة"
              value={state.hangingIndentMm ?? 0}
              ladder={HANGING_INDENT_LADDER_MM}
              format={(v) => (v === 0 ? 'بلا' : `${v} مم`)}
              onChange={onHangingIndent}
            />
          )}
          <p className="dt-menu-note">
            لا تجتمع إزاحة السطر الأول مع الإزاحة المعلّقة — يُلغى أحدهما تلقائيًا عند ضبط الآخر.
          </p>
        </div>
      )}
    </div>
  );
}

/** One bounded ladder, rendered as a select so an off-ladder value is unreachable. */
function LadderField({
  label,
  value,
  ladder,
  format,
  onChange,
}: {
  label: string;
  value: number;
  ladder: readonly number[];
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="dt-field">
      <span className="dt-field-label">{label}</span>
      <select
        className="dt-select"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      >
        {ladder.map((rung) => (
          <option key={rung} value={String(rung)}>{format(rung)}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * View options — not formatting, so they sit apart from the command toolbar.
 *
 * Unchanged in purpose from the previous composer's controls; extended with the two
 * navigation panels Document Studio added.
 */
export function DocumentViewControls({
  showRulers,
  onToggleRulers,
  showGrid,
  onToggleGrid,
  showZones,
  onToggleZones,
  showNavigator,
  onToggleNavigator,
}: {
  showRulers: boolean;
  onToggleRulers: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showZones: boolean;
  onToggleZones: () => void;
  showNavigator: boolean;
  onToggleNavigator: () => void;
}) {
  return (
    <div className="dt-view" role="group" aria-label="خيارات العرض">
      <ToolButton icon="left_panel_open" label="لوحة التنقّل" title={showNavigator ? 'إخفاء لوحة التنقّل' : 'إظهار لوحة التنقّل'} on={showNavigator} disabled={false} onClick={onToggleNavigator} />
      <ToolButton icon="straighten" label="المساطر" title={showRulers ? 'إخفاء المساطر' : 'إظهار المساطر'} on={showRulers} disabled={false} onClick={onToggleRulers} />
      <ToolButton icon="grid_4x4" label="الشبكة" title={showGrid ? 'إخفاء الشبكة' : 'إظهار الشبكة'} on={showGrid} disabled={false} onClick={onToggleGrid} />
      <ToolButton icon="crop_free" label="المناطق المحجوزة" title={showZones ? 'إخفاء المناطق المحجوزة' : 'إظهار المناطق المحجوزة'} on={showZones} disabled={false} onClick={onToggleZones} />
    </div>
  );
}
