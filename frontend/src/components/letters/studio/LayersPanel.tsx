/**
 * Document Layout Designer — the Layers panel.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TOP OF THE LIST IS FRONT OF THE PAGE.
 * ══════════════════════════════════════════════════════════════════════════
 * The list is painted in REVERSE paint order, because that is the convention every
 * design tool shares and the one users arrive with. `paintOrder` returns lowest
 * z-index first; this reverses it, so dragging a row upward brings the object forward.
 * Getting that backwards is the single most disorienting thing a layers panel can do.
 *
 * ── IT IS THE KEYBOARD-ACCESSIBLE FACE OF THE CANVAS ─────────────────────
 * The canvas is `aria-hidden` and carries no tab stops — a design surface is not a
 * control, and a canvas that grabbed focus would trap a keyboard user inside it. This
 * panel is where objects are reachable, selectable and operable without a pointer:
 * every row is a real button, every toggle is a real toggle, and renaming is a real
 * text field. That division is deliberate and is why the canvas can stay a bare
 * surface.
 *
 * ── THE LETTERHEAD ROWS ARE PRESENT AND LOCKED ───────────────────────────
 * Header, logo and footer appear at the top of the list, greyed and unselectable. They
 * are not objects and never can be — the ink is physically pre-printed on the stock,
 * so there is nothing to move. Listing them is honest about the document's structure;
 * omitting them would leave an author wondering where the letterhead went.
 */

import { useMemo, useState } from 'react';
import { Icon } from '../../explorer/ExplorerKit';
import { type DocumentLayout, type LayoutGroup, type LayoutObject, LAYOUT_OBJECT_LABELS_AR } from '../../../letters/model/layoutTypes';
import { childGroups, effectiveHidden, effectiveLocked, objectsInGroup } from '../../../letters/layout/layoutCommands';
import { paintOrder } from '../../../letters/layout/layoutGeometry';
import { type LayoutSelection } from './useLayoutSelection';
import './layers-panel.css';

/** Icon per object kind, so a row is identifiable before its name is read. */
const KIND_ICONS: Readonly<Record<LayoutObject['kind'], string>> = {
  textBlock: 'text_fields',
  image: 'image',
  divider: 'horizontal_rule',
  table: 'table',
  qrCode: 'qr_code_2',
};

/** The fixed, non-editable rows — the pre-printed stock. */
const LETTERHEAD_ROWS: readonly { readonly id: string; readonly label: string; readonly icon: string }[] = [
  { id: 'letterhead-header', label: 'الترويسة (مطبوعة مسبقًا)', icon: 'note_stack' },
  { id: 'letterhead-logo', label: 'الشعار (مطبوع مسبقًا)', icon: 'workspace_premium' },
  { id: 'letterhead-footer', label: 'التذييل (مطبوع مسبقًا)', icon: 'note_stack' },
];

export interface LayersPanelProps {
  readonly layout: DocumentLayout;
  readonly selection: LayoutSelection;
  readonly readOnly: boolean;
  readonly onSelect: (ids: readonly string[], additive: boolean) => void;
  readonly onToggleHidden: (ids: readonly string[], hidden: boolean) => void;
  readonly onToggleLocked: (ids: readonly string[], locked: boolean) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onRenameGroup: (id: string, name: string) => void;
  readonly onToggleGroupCollapsed: (id: string, collapsed: boolean) => void;
  readonly onToggleGroupHidden: (id: string, hidden: boolean) => void;
  readonly onToggleGroupLocked: (id: string, locked: boolean) => void;
  readonly onReorder: (movingId: string, beforeId: string | null) => void;
  readonly onUngroup: (groupId: string) => void;
}

export default function LayersPanel(props: LayersPanelProps) {
  const { layout, selection, readOnly } = props;
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  /** Which row a drag is currently over — the drop-line indicator (Document Studio UX
   *  Polish Pack v1). Separate from `dragging`: that names the SOURCE, this the TARGET. */
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const search = query.trim().toLowerCase();

  /**
   * Rows in display order.
   *
   * Built by walking the group tree so nesting is real rather than an indent computed
   * from a flat list. Objects inside a collapsed group are omitted entirely — which is
   * what makes collapsing worth doing on a page with forty objects.
   */
  const rows = useMemo(() => buildRows(layout, null, 0, search), [layout, search]);

  return (
    <div className="lyp-panel">
      <div className="lyp-head">
        <Icon name="layers" />
        <span className="lyp-title">الطبقات</span>
        <span className="lyp-count">{layout.objects.length}</span>
      </div>

      <label className="lyp-search">
        <Icon name="search" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث في الطبقات"
          aria-label="بحث في الطبقات"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="مسح البحث">
            <Icon name="close" />
          </button>
        )}
      </label>

      <ul className="lyp-list" role="tree" aria-label="طبقات المستند">
        {/* The pre-printed stock, always at the front and never operable. */}
        {search.length === 0 &&
          LETTERHEAD_ROWS.map((row) => (
            <li key={row.id} role="none">
              <div
                className="lyp-row lyp-row--fixed"
                role="treeitem"
                aria-selected={false}
                aria-disabled="true"
                title="مطبوع مسبقًا على الورق — لا يمكن تحريكه أو حذفه"
              >
                <Icon name={row.icon} />
                <span className="lyp-name">{row.label}</span>
                <Icon name="lock" />
              </div>
            </li>
          ))}

        {rows.length === 0 && (
          <li className="lyp-empty" role="none">
            <Icon name={search ? 'search_off' : 'dashboard_customize'} />
            <p>{search ? 'لا نتائج' : 'لا عناصر بعد — أضف عنصرًا من شريط الإدراج.'}</p>
          </li>
        )}

        {rows.map((row) =>
          row.type === 'group' ? (
            <GroupRow
              key={row.group.id}
              {...props}
              row={row}
              renaming={renaming === row.group.id}
              onStartRename={() => setRenaming(row.group.id)}
              onEndRename={() => setRenaming(null)}
            />
          ) : (
            <ObjectRow
              key={row.object.id}
              {...props}
              row={row}
              dragging={dragging}
              setDragging={setDragging}
              dragOverId={dragOverId}
              setDragOverId={setDragOverId}
              renaming={renaming === row.object.id}
              onStartRename={() => setRenaming(row.object.id)}
              onEndRename={() => setRenaming(null)}
            />
          ),
        )}
      </ul>
    </div>
  );
}

/* ── Row model ──────────────────────────────────────────────────────────── */

type Row =
  | { readonly type: 'group'; readonly group: LayoutGroup; readonly depth: number }
  | { readonly type: 'object'; readonly object: LayoutObject; readonly depth: number };

/**
 * Walk the tree into a flat, ordered row list.
 *
 * Groups first at each level, then loose objects in reverse paint order — so the
 * structural containers stay together at the top of their level instead of being
 * interleaved with the objects by z-index, which reads as noise.
 *
 * A search matches names at any depth and FLATTENS: an author searching for "شعار"
 * wants to find it, not to be told which collapsed group it is hiding in.
 */
function buildRows(layout: DocumentLayout, parentGroupId: string | null, depth: number, search: string): Row[] {
  if (search.length > 0) {
    return paintOrder(layout.objects)
      .reverse()
      .filter((object) => object.name.toLowerCase().includes(search))
      .map((object) => ({ type: 'object' as const, object, depth: 0 }));
  }

  const rows: Row[] = [];

  for (const group of childGroups(layout, parentGroupId)) {
    rows.push({ type: 'group', group, depth });
    if (!group.collapsed) rows.push(...buildRows(layout, group.id, depth + 1, search));
  }

  const loose = paintOrder(layout.objects.filter((object) => object.groupId === parentGroupId)).reverse();
  for (const object of loose) rows.push({ type: 'object', object, depth });

  return rows;
}

/* ── Rows ───────────────────────────────────────────────────────────────── */

function GroupRow({
  row,
  layout,
  selection,
  readOnly,
  renaming,
  onStartRename,
  onEndRename,
  onSelect,
  onRenameGroup,
  onToggleGroupCollapsed,
  onToggleGroupHidden,
  onToggleGroupLocked,
  onUngroup,
}: LayersPanelProps & {
  row: Extract<Row, { type: 'group' }>;
  renaming: boolean;
  onStartRename: () => void;
  onEndRename: () => void;
}) {
  const group = row.group;
  const members = objectsInGroup(layout, group.id);
  const allSelected = members.length > 0 && members.every((object) => selection.has(object.id));

  return (
    <li role="none">
      <div
        className={`lyp-row lyp-row--group${allSelected ? ' is-selected' : ''}`}
        role="treeitem"
        aria-selected={allSelected}
        aria-expanded={!group.collapsed}
        style={{ paddingInlineStart: `${8 + row.depth * 12}px` }}
      >
        <button
          type="button"
          className="lyp-twisty"
          onClick={() => onToggleGroupCollapsed(group.id, !group.collapsed)}
          aria-label={group.collapsed ? 'توسيع المجموعة' : 'طيّ المجموعة'}
        >
          <Icon name={group.collapsed ? 'chevron_left' : 'expand_more'} />
        </button>

        <Icon name="folder" />

        {renaming ? (
          <RenameField
            value={group.name}
            onCommit={(name) => {
              onRenameGroup(group.id, name);
              onEndRename();
            }}
            onCancel={onEndRename}
          />
        ) : (
          <button
            type="button"
            className="lyp-name lyp-name--button"
            onClick={(e) => onSelect(members.map((o) => o.id), e.shiftKey || e.ctrlKey || e.metaKey)}
            onDoubleClick={onStartRename}
            title={`${group.name} — ${members.length} عنصر`}
          >
            {group.name}
          </button>
        )}

        <span className="lyp-actions">
          <RowToggle
            on={group.hidden}
            onIcon="visibility_off"
            offIcon="visibility"
            label={group.hidden ? 'إظهار المجموعة' : 'إخفاء المجموعة'}
            disabled={readOnly}
            onClick={() => onToggleGroupHidden(group.id, !group.hidden)}
          />
          <RowToggle
            on={group.locked}
            onIcon="lock"
            offIcon="lock_open"
            label={group.locked ? 'فتح قفل المجموعة' : 'قفل المجموعة'}
            disabled={readOnly}
            onClick={() => onToggleGroupLocked(group.id, !group.locked)}
          />
          <button
            type="button"
            className="lyp-icon-btn"
            onClick={() => onUngroup(group.id)}
            disabled={readOnly}
            title="فك التجميع"
            aria-label="فك التجميع"
          >
            <Icon name="call_split" />
          </button>
        </span>
      </div>
    </li>
  );
}

function ObjectRow({
  row,
  layout,
  selection,
  readOnly,
  dragging,
  setDragging,
  dragOverId,
  setDragOverId,
  renaming,
  onStartRename,
  onEndRename,
  onSelect,
  onToggleHidden,
  onToggleLocked,
  onRename,
  onReorder,
}: LayersPanelProps & {
  row: Extract<Row, { type: 'object' }>;
  dragging: string | null;
  setDragging: (id: string | null) => void;
  dragOverId: string | null;
  setDragOverId: (id: string | null) => void;
  renaming: boolean;
  onStartRename: () => void;
  onEndRename: () => void;
}) {
  const object = row.object;
  const selected = selection.has(object.id);
  const inheritedHidden = effectiveHidden(layout, object) && !object.hidden;
  const inheritedLocked = effectiveLocked(layout, object) && !object.locked;
  const isDropTarget = dragOverId === object.id && dragging !== null && dragging !== object.id;

  return (
    <li role="none">
      <div
        className={`lyp-row${selected ? ' is-selected' : ''}${dragging === object.id ? ' is-dragging' : ''}${isDropTarget ? ' is-drop-target' : ''}`}
        role="treeitem"
        aria-selected={selected}
        style={{ paddingInlineStart: `${8 + row.depth * 12}px` }}
        draggable={!readOnly && !renaming}
        onDragStart={() => setDragging(object.id)}
        onDragEnd={() => {
          setDragging(null);
          setDragOverId(null);
        }}
        onDragOver={(e) => {
          if (dragging && dragging !== object.id) {
            e.preventDefault();
            if (dragOverId !== object.id) setDragOverId(object.id);
          }
        }}
        onDragLeave={() => {
          if (dragOverId === object.id) setDragOverId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOverId(null);
          if (!dragging || dragging === object.id) return;
          // The list is reversed, so dropping ON a row means "go in FRONT of it" —
          // which in paint order means directly after it. Passing the row's own id as
          // `beforeId` would send the object backwards, the opposite of what the
          // gesture looks like.
          onReorder(dragging, object.id);
          setDragging(null);
        }}
      >
        <span className="lyp-twisty" aria-hidden="true" />
        <Icon name={KIND_ICONS[object.kind]} />

        {renaming ? (
          <RenameField
            value={object.name}
            onCommit={(name) => {
              onRename(object.id, name);
              onEndRename();
            }}
            onCancel={onEndRename}
          />
        ) : (
          <button
            type="button"
            className="lyp-name lyp-name--button"
            onClick={(e) => onSelect([object.id], e.shiftKey || e.ctrlKey || e.metaKey)}
            onDoubleClick={onStartRename}
            title={`${object.name} — ${LAYOUT_OBJECT_LABELS_AR[object.kind]} · صفحة ${object.pageIndex + 1}`}
          >
            {object.name}
          </button>
        )}

        <span className="lyp-page">{object.pageIndex + 1}</span>

        <span className="lyp-actions">
          <RowToggle
            on={object.hidden}
            onIcon="visibility_off"
            offIcon="visibility"
            label={object.hidden ? 'إظهار' : 'إخفاء'}
            // Inherited state is shown but not togglable here: unhiding a member of a
            // hidden group would do nothing visible, which reads as a broken button.
            disabled={readOnly || inheritedHidden}
            dimmed={inheritedHidden}
            onClick={() => onToggleHidden([object.id], !object.hidden)}
          />
          <RowToggle
            on={object.locked}
            onIcon="lock"
            offIcon="lock_open"
            label={object.locked ? 'فتح القفل' : 'قفل'}
            disabled={readOnly || inheritedLocked}
            dimmed={inheritedLocked}
            onClick={() => onToggleLocked([object.id], !object.locked)}
          />
        </span>
      </div>
    </li>
  );
}

/* ── Small parts ────────────────────────────────────────────────────────── */

function RowToggle({
  on,
  onIcon,
  offIcon,
  label,
  disabled,
  dimmed,
  onClick,
}: {
  on: boolean;
  onIcon: string;
  offIcon: string;
  label: string;
  disabled: boolean;
  dimmed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`lyp-icon-btn${on ? ' is-on' : ''}${dimmed ? ' is-inherited' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      title={dimmed ? `${label} — موروث من المجموعة` : label}
      aria-label={label}
    >
      <Icon name={on || dimmed ? onIcon : offIcon} />
    </button>
  );
}

/** Inline rename. Enter commits, Escape abandons, blur commits. */
function RenameField({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <input
      className="lyp-rename"
      defaultValue={value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onKeyDown={(e) => {
        // Stopped from bubbling so the studio's document shortcuts — Delete, Ctrl+D,
        // the arrow keys — do not fire while a name is being typed.
        e.stopPropagation();
        if (e.key === 'Enter') onCommit(e.currentTarget.value);
        else if (e.key === 'Escape') onCancel();
      }}
      aria-label="إعادة التسمية"
    />
  );
}
