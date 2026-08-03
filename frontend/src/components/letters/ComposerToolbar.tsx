/**
 * Letter Engine — the composer toolbar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE TOOLBAR RENDERS FROM THE TEMPLATE'S ALLOW-LIST, NOT FROM A BUILT-IN SET.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It shows the INTERSECTION of two lists:
 *
 *   · what the template permits  (`DocumentTemplate.toolbarCommands`)
 *   · what this pack implements  (`IMPLEMENTED_COMMANDS`, below)
 *
 * That intersection is exactly the mechanism the foundation was built for: the
 * template states the approved specification of the document type, while this pack
 * states what is currently executable. Lists, indent and manual page breaks are in the
 * template's list and are NOT implemented here — so they simply do not appear, and a
 * later pack turns them on by writing a command rather than by editing a template.
 *
 * ── WHAT IS NOT HERE, AND WHY IT NEVER WILL BE ───────────────────────────
 * Italic, colour, highlight, images, tables, text boxes, line-height, page setup. They
 * are not omitted for now — they are on the engine's permanent prohibition list, each
 * with a recorded reason. The registry test asserts no template may name one, and this
 * toolbar cannot render what a template cannot name.
 *
 * This is a government-style correspondence toolbar: eleven controls, one row, no
 * ribbon. Every one of them applies to a WHOLE paragraph.
 */

import { FontPicker } from '../common/FontPicker';
import { Button, Icon } from '../explorer/ExplorerKit';
import { type ToolbarCommandId } from '../../letters/registry/toolbarCommands';
import { type FontId, type FontMeta } from '../../styles/fontRegistry';
import { FONT_SIZE_LADDER_PT, type TextAlignment } from '../../letters/registry/typographyPresets';
import { getLetterFontPool } from '../../letters/fonts/fontIntegration';
import './composer-toolbar.css';

/**
 * Commands this pack can actually execute.
 *
 * The gap between this and the template's allow-list is deliberate and visible; see
 * the header. Adding a command here is how a later pack ships a tool.
 */
export const IMPLEMENTED_COMMANDS: readonly ToolbarCommandId[] = [
  'bold',
  'underline',
  'alignJustify',
  'alignStart',
  'alignCenter',
  'fontFamily',
  'fontSize',
  'clearFormatting',
  'undo',
  'redo',
];

/** The current paragraph's formatting, so the toolbar can reflect it. */
export interface ToolbarState {
  fontId: FontId | null;
  sizePt: number | null;
  alignment: TextAlignment | null;
  bold: boolean;
  underline: boolean;
  /** False when no paragraph is focused — formatting has nothing to act on. */
  hasTarget: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface ComposerToolbarProps {
  /** The template's permitted commands. Intersected with `IMPLEMENTED_COMMANDS`. */
  allowedCommands: readonly ToolbarCommandId[];
  state: ToolbarState;
  disabled: boolean;
  onToggleBold: () => void;
  onToggleUnderline: () => void;
  onAlign: (alignment: TextAlignment) => void;
  onFont: (fontId: FontId) => void;
  onSize: (sizePt: number) => void;
  onClearFormatting: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export default function ComposerToolbar({
  allowedCommands,
  state,
  disabled,
  onToggleBold,
  onToggleUnderline,
  onAlign,
  onFont,
  onSize,
  onClearFormatting,
  onUndo,
  onRedo,
}: ComposerToolbarProps) {
  const shows = (id: ToolbarCommandId) => allowedCommands.includes(id) && IMPLEMENTED_COMMANDS.includes(id);

  // Formatting needs a paragraph to act on; history does not.
  const noTarget = disabled || !state.hasTarget;

  return (
    <div className="ct-bar" role="toolbar" aria-label="أدوات التنسيق">
      {(shows('bold') || shows('underline')) && (
        <div className="ct-group">
          {shows('bold') && (
            <button
              type="button"
              className={`ct-btn${state.bold ? ' is-on' : ''}`}
              onClick={onToggleBold}
              disabled={noTarget}
              aria-pressed={state.bold}
              title="عريض — يطبَّق على الفقرة كاملة"
              aria-label="عريض"
            >
              <Icon name="format_bold" />
            </button>
          )}
          {shows('underline') && (
            <button
              type="button"
              className={`ct-btn${state.underline ? ' is-on' : ''}`}
              onClick={onToggleUnderline}
              disabled={noTarget}
              aria-pressed={state.underline}
              title="تسطير — يطبَّق على الفقرة كاملة"
              aria-label="تسطير"
            >
              <Icon name="format_underlined" />
            </button>
          )}
        </div>
      )}

      {(shows('alignJustify') || shows('alignStart') || shows('alignCenter')) && (
        <div className="ct-group">
          {/* Logical alignment: `start` IS right under RTL, and "left" has no name in
              this engine — it is unrepresentable rather than merely discouraged. */}
          {shows('alignJustify') && (
            <AlignButton icon="format_align_justify" label="ضبط" on={state.alignment === 'justify'} disabled={noTarget} onClick={() => onAlign('justify')} />
          )}
          {shows('alignStart') && (
            <AlignButton icon="format_align_right" label="محاذاة للبداية" on={state.alignment === 'start'} disabled={noTarget} onClick={() => onAlign('start')} />
          )}
          {shows('alignCenter') && (
            <AlignButton icon="format_align_center" label="توسيط" on={state.alignment === 'center'} disabled={noTarget} onClick={() => onAlign('center')} />
          )}
        </div>
      )}

      {shows('fontFamily') && (
        <div className="ct-group ct-group--font">
          {/* The Font Picker's first production use. Scoped to the letter pool — the
              registry's Official category — so a letter cannot be set in a UI face. */}
          <FontPicker
            value={state.fontId}
            onChange={(id: FontId, _meta: FontMeta) => onFont(id)}
            fonts={getLetterFontPool()}
            disabled={noTarget}
            ariaLabel="خط الفقرة"
            placeholder="الخط"
            className="ct-font-picker"
          />
        </div>
      )}

      {shows('fontSize') && (
        <div className="ct-group">
          {/* A fixed ladder, not a free number: every size is an input to pagination,
              so a bounded set is a bounded surface for a later pack to validate. */}
          <select
            className="ct-select"
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
        </div>
      )}

      {shows('clearFormatting') && (
        <div className="ct-group">
          <button
            type="button"
            className="ct-btn"
            onClick={onClearFormatting}
            disabled={noTarget}
            title="إزالة التنسيق — إعادة الفقرة إلى تنسيق القالب"
            aria-label="إزالة التنسيق"
          >
            <Icon name="format_clear" />
          </button>
        </div>
      )}

      <span className="ct-spacer" />

      {(shows('undo') || shows('redo')) && (
        <div className="ct-group">
          {shows('undo') && (
            <button type="button" className="ct-btn" onClick={onUndo} disabled={disabled || !state.canUndo} title="تراجع" aria-label="تراجع">
              <Icon name="undo" />
            </button>
          )}
          {shows('redo') && (
            <button type="button" className="ct-btn" onClick={onRedo} disabled={disabled || !state.canRedo} title="إعادة" aria-label="إعادة">
              <Icon name="redo" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AlignButton({
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
      className={`ct-btn${on ? ' is-on' : ''}`}
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

/**
 * View options — not formatting, so they sit apart from the command toolbar.
 *
 * Zoom moved to `PageNavigator`, where it belongs beside the page controls: both are
 * about looking at the document rather than changing it.
 */
export function ComposerViewControls({
  showRulers,
  onToggleRulers,
  showGrid,
  onToggleGrid,
  showZones,
  onToggleZones,
}: {
  showRulers: boolean;
  onToggleRulers: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showZones: boolean;
  onToggleZones: () => void;
}) {
  return (
    <div className="ct-view" role="group" aria-label="خيارات العرض">
      <Button small iconOnly icon="straighten" onClick={onToggleRulers} title={showRulers ? 'إخفاء المساطر' : 'إظهار المساطر'} aria-label="المساطر" aria-pressed={showRulers} />
      <Button small iconOnly icon="grid_4x4" onClick={onToggleGrid} title={showGrid ? 'إخفاء الشبكة' : 'إظهار الشبكة'} aria-label="الشبكة" aria-pressed={showGrid} />
      <Button small iconOnly icon="crop_free" onClick={onToggleZones} title={showZones ? 'إخفاء المناطق المحجوزة' : 'إظهار المناطق المحجوزة'} aria-label="المناطق المحجوزة" aria-pressed={showZones} />
    </div>
  );
}
