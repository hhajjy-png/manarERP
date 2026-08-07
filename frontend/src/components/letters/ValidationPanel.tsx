/**
 * Letter Engine — the validation panel.
 *
 * Presents what the engine found. It contains no rule and makes no judgement: severity,
 * message, location and suggestion all arrive from the engine already decided.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT NEVER INTERRUPTS.
 * ══════════════════════════════════════════════════════════════════════════
 * No modal, no alert, no toast, no dialog. Validation is continuous and mostly
 * uninteresting; a surface that demanded attention on every keystroke would be muted
 * within a day. The panel sits beside the paper, summarises in one line when collapsed,
 * and speaks only when opened.
 *
 * ── ACCESSIBILITY ────────────────────────────────────────────────────────
 * Each finding is a real `<button>` in a list, reachable and operable by keyboard, and
 * labelled with its severity and message rather than an icon alone. The summary is an
 * `aria-live="polite"` region: a change is announced without stealing focus from the
 * paragraph being typed.
 */

import { Icon } from '../explorer/ExplorerKit';
import {
  SEVERITY_LABELS_AR,
  type ValidationSeverity,
} from '../../letters/registry/validationRuleCatalog';
import {
  type ValidationIssue,
  type ValidationResult,
  type ValidationSummary,
} from '../../letters/validation/framework';
import './validation-panel.css';

/** Icon per severity. Never the only signal — every one is paired with its label. */
const SEVERITY_ICON: Readonly<Record<ValidationSeverity, string>> = {
  blocking: 'block',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

export interface ValidationPanelProps {
  result: ValidationResult;
  summary: ValidationSummary;
  open: boolean;
  onToggle: () => void;
  /** Focus the part of the document a finding points at. */
  onNavigate: (issue: ValidationIssue) => void;
}

export default function ValidationPanel({
  result,
  summary,
  open,
  onToggle,
  onNavigate,
}: ValidationPanelProps) {
  const statusTone = summary.blocking > 0 ? 'blocking' : summary.warnings > 0 ? 'warning' : 'ready';

  return (
    <section className={`vp-panel${open ? ' is-open' : ''}`} aria-label="نتائج التحقّق">
      <button
        type="button"
        className={`vp-summary vp-summary--${statusTone}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        <Icon name={summary.blocking > 0 ? 'block' : summary.warnings > 0 ? 'warning' : 'check_circle'} />

        {/* Announced politely: the user learns of a change without losing the caret. */}
        <span className="vp-status" aria-live="polite">
          {summary.blocking > 0
            ? `${summary.blocking} خطأ مانع`
            : summary.unimplementedCount > 0
              ? 'التحقّق غير مكتمل'
              : 'جاهز للطباعة'}
        </span>

        <span className="vp-counts">
          {summary.blocking > 0 && <Count tone="blocking" value={summary.blocking} label="خطأ مانع" />}
          {summary.errors > 0 && <Count tone="error" value={summary.errors} label="خطأ" />}
          {summary.warnings > 0 && <Count tone="warning" value={summary.warnings} label="تنبيه" />}
          {summary.info > 0 && <Count tone="info" value={summary.info} label="معلومة" />}
        </span>

        <Icon name={open ? 'expand_more' : 'expand_less'} />
      </button>

      {open && (
        <div className="vp-body">
          {/* Stated plainly rather than hidden: a panel that looks clean while four
              rules never ran would be lying by omission. */}
          {summary.unimplementedCount > 0 && (
            <p className="vp-note">
              <Icon name="pending" />
              {summary.unimplementedCount} قاعدة تحقّق تنتظر حزمًا لاحقة (الباركود، سجل المراجع، هوية الشركة) — لذلك لا يمكن اعتبار المستند مكتمل التحقّق بعد.
            </p>
          )}

          {result.issues.length === 0 ? (
            <p className="vp-empty">
              <Icon name="check_circle" />
              لا ملاحظات على المستند.
            </p>
          ) : (
            <ul className="vp-list">
              {result.issues.map((issue, index) => (
                <li key={`${issue.ruleId}-${index}`}>
                  <button
                    type="button"
                    className={`vp-issue vp-issue--${issue.severity}`}
                    onClick={() => onNavigate(issue)}
                    // Severity and location in the label, so the finding is
                    // comprehensible without seeing the colour or the icon.
                    aria-label={`${SEVERITY_LABELS_AR[issue.severity]}: ${issue.message}${
                      issue.location?.pageIndex !== undefined ? ` — صفحة ${issue.location.pageIndex + 1}` : ''
                    }`}
                  >
                    <span className="vp-issue-icon" aria-hidden="true">
                      <Icon name={SEVERITY_ICON[issue.severity]} />
                    </span>
                    <span className="vp-issue-text">
                      <span className="vp-issue-head">
                        <span className="vp-issue-severity">{SEVERITY_LABELS_AR[issue.severity]}</span>
                        {issue.location?.pageIndex !== undefined && (
                          <span className="vp-issue-where">صفحة {issue.location.pageIndex + 1}</span>
                        )}
                        {issue.location?.sectionKind && (
                          <span className="vp-issue-where">{sectionLabel(issue.location.sectionKind)}</span>
                        )}
                      </span>
                      <span className="vp-issue-message">{issue.message}</span>
                      {issue.suggestion && (
                        <span className="vp-issue-suggestion">
                          <Icon name="lightbulb" />
                          {issue.suggestion}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function Count({ tone, value, label }: { tone: ValidationSeverity; value: number; label: string }) {
  return (
    <span className={`vp-count vp-count--${tone}`} title={label}>
      {value}
    </span>
  );
}

const SECTION_LABELS: Readonly<Record<string, string>> = {
  content: 'المحتوى',
  signature: 'التوقيع',
  barcode: 'الباركود',
};

function sectionLabel(kind: string): string {
  return SECTION_LABELS[kind] ?? kind;
}

/**
 * Inline marker for a section that has findings.
 *
 * The subtle half of the feedback: a small badge on the section's own label rather
 * than anything that moves, covers or interrupts the text being written.
 */
export function SectionValidationMarker({ severity }: { severity: ValidationSeverity | null }) {
  if (!severity) return null;
  return (
    <span
      className={`vp-marker vp-marker--${severity}`}
      title={SEVERITY_LABELS_AR[severity]}
      aria-label={SEVERITY_LABELS_AR[severity]}
      role="img"
    >
      <Icon name={SEVERITY_ICON[severity]} />
    </span>
  );
}
