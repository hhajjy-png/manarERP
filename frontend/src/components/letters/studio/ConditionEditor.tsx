/**
 * Document Automation — the visual condition editor.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THREE DROPDOWNS AND A BUTTON. THERE IS NOTHING TO TYPE AND NOTHING TO PARSE.
 * ══════════════════════════════════════════════════════════════════════════
 * The specification is explicit: "No scripting language. Visual editor only." This is
 * what that constraint looks like when it is honoured structurally rather than by
 * discipline — every control below writes a field of a typed record, so an author
 * cannot express something the model has no place for.
 *
 * A text field with a small expression language would have been less code here and a
 * parser, a sandbox and a security review everywhere else.
 *
 * ── NESTING IS A TREE, DRAWN AS A TREE ───────────────────────────────────
 * A group holds children combined by "all" or "any", and a group can hold groups. The
 * editor renders that as indentation, which needs no precedence rules explained: what
 * you can see is what it means. An expression string would have needed brackets the
 * author had to reason about.
 */

import { Icon } from '../../explorer/ExplorerKit';
import {
  type Condition,
  type ConditionGroup,
  type ConditionLeaf,
  type ConditionOperator,
  CONDITION_OPERATORS,
  CONDITION_OPERATOR_LABELS_AR,
  createGroup,
  createLeaf,
  describeCondition,
  isUnaryOperator,
} from '../../../letters/variables/conditions';
import { getAllVariables, isVariableAvailable } from '../../../letters/variables/variableCatalog';
import './condition-editor.css';

export interface ConditionEditorProps {
  /** The block's current condition, or `undefined` for "always shown". */
  readonly condition: Condition | undefined;
  readonly readOnly: boolean;
  /** `undefined` removes the condition entirely. */
  readonly onChange: (condition: Condition | undefined) => void;
  readonly onClose: () => void;
}

export default function ConditionEditor({ condition, readOnly, onChange, onClose }: ConditionEditorProps) {
  const variables = getAllVariables().filter(isVariableAvailable);

  return (
    <div className="cnd-panel" role="dialog" aria-label="محرّر شرط الظهور">
      <div className="cnd-head">
        <Icon name="rule" />
        <span className="cnd-title">شرط ظهور الفقرة</span>
        <button type="button" className="cnd-close" onClick={onClose} aria-label="إغلاق">
          <Icon name="close" />
        </button>
      </div>

      {condition ? (
        <>
          <div className="cnd-tree">
            <ConditionNode
              node={condition}
              readOnly={readOnly}
              variables={variables}
              depth={0}
              onChange={onChange}
              onRemove={() => onChange(undefined)}
            />
          </div>

          <p className="cnd-summary">
            <Icon name="visibility" />
            تظهر الفقرة إذا: {describeCondition(condition)}
          </p>

          <div className="cnd-actions">
            <button
              type="button"
              className="cnd-btn"
              disabled={readOnly}
              onClick={() => {
                // Wrapping the existing condition rather than replacing it: an author
                // adding nesting means "and also…", never "start again".
                const group: ConditionGroup =
                  condition.kind === 'group'
                    ? { ...condition, children: [...condition.children, createLeaf(variables[0].name)] }
                    : createGroup('all', [condition, createLeaf(variables[0].name)]);
                onChange(group);
              }}
            >
              <Icon name="add" />
              إضافة شرط
            </button>
            <button type="button" className="cnd-btn cnd-btn--danger" disabled={readOnly} onClick={() => onChange(undefined)}>
              <Icon name="delete" />
              إزالة الشرط
            </button>
          </div>
        </>
      ) : (
        <div className="cnd-empty">
          <p>تظهر هذه الفقرة دائمًا.</p>
          <button
            type="button"
            className="cnd-btn"
            disabled={readOnly}
            onClick={() => onChange(createLeaf(variables[0].name))}
          >
            <Icon name="add" />
            إضافة شرط ظهور
          </button>
        </div>
      )}
    </div>
  );
}

/** One node — a leaf's three controls, or a group's combiner and its children. */
function ConditionNode({
  node,
  readOnly,
  variables,
  depth,
  onChange,
  onRemove,
}: {
  node: Condition;
  readOnly: boolean;
  variables: ReturnType<typeof getAllVariables>;
  depth: number;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
}) {
  if (node.kind === 'group') {
    return (
      <div className="cnd-group" style={{ marginInlineStart: `${depth * 12}px` }}>
        <div className="cnd-group-head">
          <select
            className="cnd-select cnd-select--combine"
            value={node.combine}
            disabled={readOnly}
            onChange={(e) => onChange({ ...node, combine: e.target.value as 'all' | 'any' })}
            aria-label="طريقة الدمج"
          >
            <option value="all">كل الشروط</option>
            <option value="any">أي شرط</option>
          </select>
          <button type="button" className="cnd-icon" disabled={readOnly} onClick={onRemove} aria-label="حذف المجموعة">
            <Icon name="close" />
          </button>
        </div>

        {node.children.map((child, index) => (
          <ConditionNode
            key={index}
            node={child}
            readOnly={readOnly}
            variables={variables}
            depth={depth + 1}
            onChange={(next) =>
              onChange({ ...node, children: node.children.map((c, i) => (i === index ? next : c)) })
            }
            onRemove={() => {
              const remaining = node.children.filter((_, i) => i !== index);
              // A group down to ONE child collapses into that child: a group of one
              // behaves identically to its member and only adds a row to read.
              onChange(remaining.length === 1 ? remaining[0] : { ...node, children: remaining });
            }}
          />
        ))}
      </div>
    );
  }

  return <LeafRow leaf={node} readOnly={readOnly} variables={variables} depth={depth} onChange={onChange} onRemove={onRemove} />;
}

function LeafRow({
  leaf,
  readOnly,
  variables,
  depth,
  onChange,
  onRemove,
}: {
  leaf: ConditionLeaf;
  readOnly: boolean;
  variables: ReturnType<typeof getAllVariables>;
  depth: number;
  onChange: (condition: ConditionLeaf) => void;
  onRemove: () => void;
}) {
  const unary = isUnaryOperator(leaf.operator);

  return (
    <div className="cnd-leaf" style={{ marginInlineStart: `${depth * 12}px` }}>
      <select
        className="cnd-select"
        value={leaf.variable}
        disabled={readOnly}
        onChange={(e) => onChange({ ...leaf, variable: e.target.value })}
        aria-label="المتغيّر"
      >
        {variables.map((variable) => (
          <option key={variable.name} value={variable.name}>{variable.labelAr}</option>
        ))}
      </select>

      <select
        className="cnd-select"
        value={leaf.operator}
        disabled={readOnly}
        onChange={(e) => onChange({ ...leaf, operator: e.target.value as ConditionOperator })}
        aria-label="عامل المقارنة"
      >
        {CONDITION_OPERATORS.map((operator) => (
          <option key={operator} value={operator}>{CONDITION_OPERATOR_LABELS_AR[operator]}</option>
        ))}
      </select>

      {/* The value field DISAPPEARS for a unary operator rather than being disabled:
          "الراتب موجود قيمة ___" is not a sentence, and a greyed box invites the
          author to wonder what belongs in it. */}
      {!unary && (
        <input
          type="text"
          className="cnd-value"
          value={leaf.value ?? ''}
          disabled={readOnly}
          onChange={(e) => onChange({ ...leaf, value: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="القيمة"
          aria-label="قيمة المقارنة"
        />
      )}

      <button type="button" className="cnd-icon" disabled={readOnly} onClick={onRemove} aria-label="حذف الشرط">
        <Icon name="close" />
      </button>
    </div>
  );
}
