/**
 * Document Studio — the floating selection toolbar (Document Studio UX Polish Pack v1).
 *
 * A compact bar that appears near an active text selection, offering the controls an
 * author reaches for most while writing without forcing a trip back to the docked
 * toolbar. It is a SECOND SURFACE for existing commands, not a second command set: every
 * handler here is the exact same prop `DocumentToolbar` already receives from
 * `LetterComposer`, filtered through the same `allowedCommands ∩ IMPLEMENTED_COMMANDS`
 * gate, so it can never offer something the template forbids or this pack does not
 * implement. It still applies to the whole paragraph, never a character range — the
 * same invariant `DocumentToolbar` documents for itself.
 *
 * Positioned via `useFloatingPosition` against a rect computed from the LIVE `<textarea>`
 * selection (`textareaSelectionRect`), portaled to `document.body` so it is never clipped
 * by an ancestor and always renders above every panel.
 */

import { createPortal } from 'react-dom';
import { Icon } from '../../explorer/ExplorerKit';
import { FontPicker } from '../../common/FontPicker';
import { useFloatingPosition, type FloatingRect } from '../../../hooks/useFloatingPosition';
import { type FontId, type FontMeta } from '../../../styles/fontRegistry';
import { FONT_SIZE_LADDER_PT, type TextAlignment } from '../../../letters/registry/typographyPresets';
import { getLetterFontPool } from '../../../letters/fonts/fontIntegration';
import { type ToolbarCommandId } from '../../../letters/registry/toolbarCommands';
import { IMPLEMENTED_COMMANDS, ToolButton, type ToolbarState } from './DocumentToolbar';
import './floating-context-toolbar.css';

export interface FloatingContextToolbarProps {
  readonly open: boolean;
  readonly getAnchorRect: () => FloatingRect | null;
  readonly allowedCommands: readonly ToolbarCommandId[];
  readonly state: ToolbarState;
  readonly onToggleMark: (mark: 'bold' | 'underline' | 'highlight') => void;
  readonly onAlign: (alignment: TextAlignment) => void;
  readonly onFont: (fontId: FontId) => void;
  readonly onSize: (sizePt: number) => void;
  readonly onClearFormatting: () => void;
}

export default function FloatingContextToolbar({
  open,
  getAnchorRect,
  allowedCommands,
  state,
  onToggleMark,
  onAlign,
  onFont,
  onSize,
  onClearFormatting,
}: FloatingContextToolbarProps) {
  const shows = (id: ToolbarCommandId) => allowedCommands.includes(id) && IMPLEMENTED_COMMANDS.includes(id);
  const { panelRef, position } = useFloatingPosition(getAnchorRect, open, { align: 'center', gap: 8 });

  if (!open) return null;

  return createPortal(
    <div
      className="fct-bar"
      role="toolbar"
      aria-label="أدوات التنسيق السريعة"
      ref={panelRef}
      style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
      // A pointer-down inside the toolbar would otherwise collapse the textarea's
      // selection (focus moves to the button) before the click handler runs — losing the
      // very target the command needs to act on.
      onMouseDown={(e) => e.preventDefault()}
    >
      {shows('fontFamily') && (
        <FontPicker
          value={state.fontId}
          onChange={(id: FontId, _meta: FontMeta) => onFont(id)}
          fonts={getLetterFontPool()}
          ariaLabel="خط الفقرة"
          placeholder="الخط"
          className="fct-font-picker"
        />
      )}
      {shows('fontSize') && (
        <select
          className="fct-select"
          value={state.sizePt ?? ''}
          onChange={(e) => onSize(Number(e.target.value))}
          aria-label="حجم الخط"
          title="حجم الخط"
        >
          {FONT_SIZE_LADDER_PT.map((pt) => (
            <option key={pt} value={pt}>{pt}</option>
          ))}
        </select>
      )}
      {(shows('fontFamily') || shows('fontSize')) && <span className="fct-sep" aria-hidden="true" />}
      {shows('bold') && (
        <ToolButton icon="format_bold" label="عريض" title="عريض — يطبَّق على الفقرة كاملة" on={state.bold} disabled={false} onClick={() => onToggleMark('bold')} />
      )}
      {shows('underline') && (
        <ToolButton icon="format_underlined" label="تسطير" title="تسطير — يطبَّق على الفقرة كاملة" on={state.underline} disabled={false} onClick={() => onToggleMark('underline')} />
      )}
      {shows('highlight') && (
        <ToolButton icon="format_ink_highlighter" label="تظليل" title="تظليل رمادي محايد" on={state.highlight} disabled={false} onClick={() => onToggleMark('highlight')} />
      )}
      {(shows('bold') || shows('underline') || shows('highlight')) && <span className="fct-sep" aria-hidden="true" />}
      {shows('alignJustify') && (
        <ToolButton icon="format_align_justify" label="ضبط" title="ضبط" on={state.alignment === 'justify'} disabled={false} onClick={() => onAlign('justify')} />
      )}
      {shows('alignStart') && (
        <ToolButton icon="format_align_right" label="محاذاة للبداية" title="محاذاة للبداية" on={state.alignment === 'start'} disabled={false} onClick={() => onAlign('start')} />
      )}
      {shows('alignCenter') && (
        <ToolButton icon="format_align_center" label="توسيط" title="توسيط" on={state.alignment === 'center'} disabled={false} onClick={() => onAlign('center')} />
      )}
      {shows('clearFormatting') && (
        <>
          <span className="fct-sep" aria-hidden="true" />
          <ToolButton icon="format_clear" label="إزالة التنسيق" title="إزالة التنسيق" on={false} disabled={false} onClick={onClearFormatting} />
        </>
      )}
    </div>,
    document.body,
  );
}
