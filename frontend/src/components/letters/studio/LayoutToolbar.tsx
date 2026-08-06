/**
 * Document Layout Designer — the designer's own toolbar.
 *
 * Insert, align, distribute, group, stack and snap — the actions that operate on
 * OBJECTS rather than on text. Kept separate from `DocumentToolbar`, which formats the
 * flowing letter, because the two act on different things and a single strip carrying
 * both would offer "align left" and "bold" side by side with no clue which applies to
 * what is selected.
 *
 * It appears only in Design mode, which is what makes the separation legible: one mode
 * writes the letter, the other arranges what sits on top of it.
 */

import { Icon } from '../../explorer/ExplorerKit';
import {
  type AlignAction,
  ALIGN_ACTION_ICONS,
  ALIGN_ACTION_LABELS_AR,
  alignmentEnabled,
} from '../../../letters/layout/alignment';
import { type LayoutObjectKind, LAYOUT_OBJECT_KINDS, LAYOUT_OBJECT_LABELS_AR } from '../../../letters/model/layoutTypes';
import { type SnapSettings } from '../../../letters/layout/snapping';
import './layout-toolbar.css';

const KIND_ICONS: Readonly<Record<LayoutObjectKind, string>> = {
  textBlock: 'text_fields',
  image: 'image',
  divider: 'horizontal_rule',
  table: 'table',
  qrCode: 'qr_code_2',
};

/** The alignment actions, in toolbar order. */
const ALIGN_ORDER: readonly AlignAction[] = [
  'left',
  'centreHorizontal',
  'right',
  'top',
  'centreVertical',
  'bottom',
  'distributeHorizontal',
  'distributeVertical',
  'sameWidth',
  'sameHeight',
];

export interface LayoutToolbarProps {
  readonly selectionCount: number;
  readonly canGroup: boolean;
  readonly canUngroup: boolean;
  readonly snap: SnapSettings;
  readonly showGuides: boolean;
  readonly guidesLocked: boolean;
  readonly readOnly: boolean;
  readonly onInsert: (kind: LayoutObjectKind) => void;
  readonly onAlign: (action: AlignAction) => void;
  readonly onGroup: () => void;
  readonly onUngroup: () => void;
  readonly onReorder: (direction: 'front' | 'forward' | 'backward' | 'back') => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onSnapChange: (settings: SnapSettings) => void;
  readonly onToggleGuides: () => void;
  readonly onToggleGuidesLocked: () => void;
  readonly onAddGuide: (axis: 'horizontal' | 'vertical') => void;
}

export default function LayoutToolbar({
  selectionCount,
  canGroup,
  canUngroup,
  snap,
  showGuides,
  guidesLocked,
  readOnly,
  onInsert,
  onAlign,
  onGroup,
  onUngroup,
  onReorder,
  onDuplicate,
  onDelete,
  onSnapChange,
  onToggleGuides,
  onToggleGuidesLocked,
  onAddGuide,
}: LayoutToolbarProps) {
  const hasSelection = selectionCount > 0;

  return (
    <div className="ltb-bar" role="toolbar" aria-label="أدوات التصميم">
      {/* ── Insert ──────────────────────────────────────────────────────── */}
      <Group label="إدراج">
        {LAYOUT_OBJECT_KINDS.map((kind) => (
          <Btn
            key={kind}
            icon={KIND_ICONS[kind]}
            label={`إدراج ${LAYOUT_OBJECT_LABELS_AR[kind]}`}
            disabled={readOnly}
            onClick={() => onInsert(kind)}
          />
        ))}
      </Group>

      {/* ── Align and distribute ────────────────────────────────────────── */}
      <Group label="المحاذاة">
        {ALIGN_ORDER.map((action) => (
          <Btn
            key={action}
            icon={ALIGN_ACTION_ICONS[action]}
            label={ALIGN_ACTION_LABELS_AR[action]}
            // Distribution needs three objects and size-matching needs two; the
            // disabled state says so before the click does nothing.
            disabled={readOnly || !alignmentEnabled(action, selectionCount)}
            onClick={() => onAlign(action)}
          />
        ))}
      </Group>

      {/* ── Arrange ─────────────────────────────────────────────────────── */}
      <Group label="الترتيب">
        <Btn icon="flip_to_front" label="إلى الأمام تمامًا" disabled={readOnly || !hasSelection} onClick={() => onReorder('front')} />
        <Btn icon="keyboard_arrow_up" label="إلى الأمام" disabled={readOnly || !hasSelection} onClick={() => onReorder('forward')} />
        <Btn icon="keyboard_arrow_down" label="إلى الخلف" disabled={readOnly || !hasSelection} onClick={() => onReorder('backward')} />
        <Btn icon="flip_to_back" label="إلى الخلف تمامًا" disabled={readOnly || !hasSelection} onClick={() => onReorder('back')} />
      </Group>

      <Group label="التجميع">
        <Btn icon="join_inner" label="تجميع" disabled={readOnly || !canGroup} onClick={onGroup} />
        <Btn icon="call_split" label="فك التجميع" disabled={readOnly || !canUngroup} onClick={onUngroup} />
        <Btn icon="content_copy" label="تكرار" disabled={readOnly || !hasSelection} onClick={onDuplicate} />
        <Btn icon="delete" label="حذف" disabled={readOnly || !hasSelection} onClick={onDelete} />
      </Group>

      <span className="ltb-spacer" />

      {/* ── Snapping ────────────────────────────────────────────────────── */}
      <Group label="المحاذاة الذكية">
        <Btn
          icon="grid_goldenratio"
          label={snap.enabled ? 'إيقاف المحاذاة الذكية' : 'تشغيل المحاذاة الذكية'}
          on={snap.enabled}
          disabled={false}
          onClick={() => onSnapChange({ ...snap, enabled: !snap.enabled })}
        />
        <Btn
          icon="grid_4x4"
          label="محاذاة للشبكة"
          on={snap.toGrid}
          disabled={!snap.enabled}
          onClick={() => onSnapChange({ ...snap, toGrid: !snap.toGrid })}
        />
        <Btn
          icon="align_horizontal_center"
          label="محاذاة للعناصر"
          on={snap.toObjects}
          disabled={!snap.enabled}
          onClick={() => onSnapChange({ ...snap, toObjects: !snap.toObjects })}
        />
        <Btn
          icon="crop_free"
          label="محاذاة للهوامش"
          on={snap.toMargins}
          disabled={!snap.enabled}
          onClick={() => onSnapChange({ ...snap, toMargins: !snap.toMargins })}
        />
      </Group>

      {/* ── Guides ──────────────────────────────────────────────────────── */}
      <Group label="الأدلّة" last>
        <Btn icon="visibility" label={showGuides ? 'إخفاء الأدلّة' : 'إظهار الأدلّة'} on={showGuides} disabled={false} onClick={onToggleGuides} />
        <Btn icon="add_road" label="دليل رأسي" disabled={readOnly} onClick={() => onAddGuide('vertical')} />
        <Btn icon="horizontal_rule" label="دليل أفقي" disabled={readOnly} onClick={() => onAddGuide('horizontal')} />
        <Btn icon={guidesLocked ? 'lock' : 'lock_open'} label={guidesLocked ? 'فتح قفل الأدلّة' : 'قفل الأدلّة'} on={guidesLocked} disabled={readOnly} onClick={onToggleGuidesLocked} />
      </Group>
    </div>
  );
}

function Group({ label, last, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={`ltb-group${last ? ' ltb-group--last' : ''}`} role="group" aria-label={label}>
      <span className="ltb-group-label" aria-hidden="true">{label}</span>
      <div className="ltb-group-items">{children}</div>
    </div>
  );
}

function Btn({
  icon,
  label,
  on,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  on?: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`ltb-btn${on ? ' is-on' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on === undefined ? undefined : on}
      title={label}
      aria-label={label}
    >
      <Icon name={icon} />
    </button>
  );
}
