/**
 * Form Editor — the single door to everything advanced.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE ENTRY POINT. NOTHING WAS REMOVED; EVERYTHING MOVED BEHIND THIS BUTTON.
 * ══════════════════════════════════════════════════════════════════════════
 * Before this pack the editor carried its whole capability on its face: two mode
 * tabs, nineteen toolbar controls, four automation buttons, four view toggles and up
 * to three simultaneous rails. Every one of those is still here and still works —
 * they are reached through this menu instead of being permanently on screen.
 *
 * That is the whole of the simplification, and it is deliberately a VISIBILITY change
 * rather than a capability one. The document model, the paginator, the validation
 * engine, the layout designer, the variables engine and both output paths are
 * untouched; a power user is two clicks from exactly what they had.
 *
 * ── WHY A MENU AND NOT A SECOND TOOLBAR ROW ──────────────────────────────
 * A row of chrome is a row of paper the author cannot see — the reasoning
 * `LetterComposer.css` already records for collapsing three bars into one. A menu
 * costs one button at rest and nothing at all when closed.
 *
 * ── WHY EACH ROW IS A DESTINATION, NOT A SWITCH ──────────────────────────
 * Clicking «تصميم التخطيط» takes you INTO design mode; clicking «المراجعة» opens the
 * review rail. A menu of switches would leave the author to work out which
 * combination of four toggles produces the surface they wanted. The one genuine
 * switch — the advanced-mode master — is rendered as a switch and labelled as one.
 *
 * ── THE MASTER SWITCH IS NOT REQUIRED FOR ANY ROW ────────────────────────
 * Every destination below works with advanced mode OFF. The switch exists for the
 * author who wants the old, dense studio permanently: it reveals the full toolbar,
 * the mode tabs and the view toggles, and it is remembered. Making the rows depend on
 * it would have turned one decision into two.
 */

import { useCallback, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../explorer/ExplorerKit';
import {
  rectOfElement,
  useCloseOnOutsideInteraction,
  useFloatingPosition,
} from '../../../hooks/useFloatingPosition';
import './advanced-tools-menu.css';

export interface AdvancedToolsMenuProps {
  /** The master switch: reveal the full toolbar, the mode tabs and the view toggles. */
  readonly advanced: boolean;
  readonly onAdvancedChange: (advanced: boolean) => void;
  /** A registered document is frozen — every editing destination is inert. */
  readonly readOnly: boolean;
  /** A paragraph is focused. The condition editor has nothing to attach to without one. */
  readonly hasCaret: boolean;

  readonly designMode: boolean;
  readonly onDesignMode: (on: boolean) => void;
  /** How many positioned objects the document carries, for the design row's badge. */
  readonly objectCount: number;

  readonly previewValues: boolean;
  readonly onPreviewValues: (on: boolean) => void;

  /** The document-level properties rail — stats, versions, author, dates. Insert is a
   *  primary surface now (Form Editor UX Rebuild v2) and is no longer a row here; see
   *  the composer's own Insert toggle on the strip. */
  readonly propertiesOpen: boolean;
  readonly onPropertiesOpen: (open: boolean) => void;
  readonly onCondition: () => void;

  readonly findOpen: boolean;
  readonly onToggleFind: () => void;

  readonly validationOpen: boolean;
  readonly onToggleValidation: () => void;
  /** Findings currently outstanding, for the validation row's badge. */
  readonly validationCount: number;

  readonly showNavigator: boolean;
  readonly onToggleNavigator: () => void;
}

export default function AdvancedToolsMenu({
  advanced,
  onAdvancedChange,
  readOnly,
  hasCaret,
  designMode,
  onDesignMode,
  objectCount,
  previewValues,
  onPreviewValues,
  propertiesOpen,
  onPropertiesOpen,
  onCondition,
  findOpen,
  onToggleFind,
  validationOpen,
  onToggleValidation,
  validationCount,
  showNavigator,
  onToggleNavigator,
}: AdvancedToolsMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  // Portaled for the same reason `SpacingMenu` is: `.lc-bars` and `.dt-bar` both
  // establish scrolling/stacking contexts that would clip a panel rendered inline.
  const getAnchorRect = useCallback(() => rectOfElement(wrapper.current), []);
  const { panelRef, position } = useFloatingPosition(getAnchorRect, open, { align: 'start' });
  useCloseOnOutsideInteraction(open, [wrapper, panelRef], () => setOpen(false));

  /**
   * Run a destination and close.
   *
   * Closing is the default because every row below changes what is on screen behind
   * the menu — leaving it open would cover the surface the author just asked for.
   */
  const go = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <div className="atm" ref={wrapper}>
      <button
        type="button"
        className={`atm-trigger${open ? ' is-open' : ''}${advanced ? ' is-advanced' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="menu"
        title="أدوات متقدّمة — التصميم والأتمتة والمراجعة وخيارات العرض"
      >
        <Icon name="tune" />
        <span className="atm-trigger-label">أدوات متقدّمة</span>
        <Icon name="expand_more" />
      </button>

      {open && createPortal(
        <div
          className="atm-panel"
          id={panelId}
          role="menu"
          aria-label="أدوات متقدّمة"
          ref={panelRef}
          style={position ? { top: position.top, left: position.left, minWidth: position.minWidth } : { visibility: 'hidden' }}
        >
          {/* ── The master switch ─────────────────────────────────────────
              First, and visually distinct from the destinations beneath it, because it
              is the only control here that changes the editor's resting state rather
              than opening something. */}
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={advanced}
            className={`atm-switch${advanced ? ' is-on' : ''}`}
            onClick={() => onAdvancedChange(!advanced)}
          >
            <Icon name={advanced ? 'toggle_on' : 'toggle_off'} />
            <span className="atm-switch-text">
              <span className="atm-switch-title">الوضع المتقدّم</span>
              <span className="atm-switch-hint">
                يُظهر شريط التنسيق الكامل وتبويبَي التحرير والتصميم وخيارات العرض بشكل دائم.
              </span>
            </span>
          </button>

          <Section title="التصميم">
            <Row
              icon="design_services"
              label="تصميم التخطيط"
              hint="إضافة صور ومربّعات نص وجداول ورموز فوق المستند"
              on={designMode}
              disabled={false}
              badge={objectCount > 0 ? objectCount : undefined}
              onClick={() => go(() => onDesignMode(!designMode))}
            />
            <Row
              icon="account_tree"
              label="لوحة الطبقات"
              hint="ترتيب العناصر وإخفاؤها وقفلها — تظهر داخل وضع التصميم"
              on={designMode && showNavigator}
              disabled={false}
              onClick={() =>
                go(() => {
                  onDesignMode(true);
                  if (!showNavigator) onToggleNavigator();
                })
              }
            />
          </Section>

          <Section title="الأتمتة">
            <Row
              icon="rule"
              label="شرط ظهور الفقرة"
              hint={hasCaret ? 'إظهار الفقرة الحالية بشرط' : 'ضع المؤشّر داخل فقرة أولًا'}
              on={false}
              disabled={readOnly || !hasCaret}
              onClick={() => go(onCondition)}
            />
            <Row
              icon="visibility"
              label="معاينة قيم المتغيّرات"
              hint="عرض المستند بالقيم كما سيُطبع بدل رموز المتغيّرات"
              on={previewValues}
              disabled={false}
              onClick={() => go(() => onPreviewValues(!previewValues))}
            />
          </Section>

          <Section title="المراجعة">
            <Row
              icon="search"
              label="بحث واستبدال"
              hint="Ctrl+F للبحث · Ctrl+H للاستبدال"
              on={findOpen}
              disabled={false}
              onClick={() => go(onToggleFind)}
            />
            <Row
              icon="fact_check"
              label="نتائج التحقّق"
              hint="ما يمنع الطباعة، وما ينبّه إليه المحرّك"
              on={validationOpen}
              disabled={false}
              badge={validationCount > 0 ? validationCount : undefined}
              onClick={() => go(onToggleValidation)}
            />
          </Section>

          <Section title="المستند" last>
            <Row
              icon="info"
              label="خصائص المستند"
              hint="الإحصاءات والإصدارات ومَن أنشأه ومتى"
              on={propertiesOpen}
              disabled={false}
              onClick={() => go(() => onPropertiesOpen(!propertiesOpen))}
            />
            <Row
              icon="menu_book"
              label="لوحة التنقّل"
              hint="خريطة الصفحات ومخطّط العناوين"
              on={showNavigator && !designMode}
              disabled={false}
              onClick={() =>
                go(() => {
                  if (designMode) onDesignMode(false);
                  onToggleNavigator();
                })
              }
            />
          </Section>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** A labelled run of destinations. The label is a landmark, not a heading. */
function Section({ title, last, children }: { title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={`atm-section${last ? ' atm-section--last' : ''}`} role="group" aria-label={title}>
      <span className="atm-section-title" aria-hidden="true">{title}</span>
      {children}
    </div>
  );
}

/**
 * One destination.
 *
 * `hint` carries the reason to open it, in the author's own terms — «ترتيب العناصر
 * وإخفاؤها وقفلها» rather than «Layers». A menu of nouns tells someone what the system
 * has; a menu of hints tells them what it does for them, which is the whole point of
 * hiding these surfaces in the first place.
 */
function Row({
  icon,
  label,
  hint,
  on,
  disabled,
  badge,
  onClick,
}: {
  icon: string;
  label: string;
  hint: string;
  on: boolean;
  disabled: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`atm-row${on ? ' is-on' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
    >
      <Icon name={icon} />
      <span className="atm-row-text">
        <span className="atm-row-label">{label}</span>
        <span className="atm-row-hint">{hint}</span>
      </span>
      {badge !== undefined && <span className="atm-row-badge">{badge}</span>}
    </button>
  );
}
