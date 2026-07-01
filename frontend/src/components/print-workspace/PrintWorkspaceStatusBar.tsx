type Lang = 'ar' | 'en';

interface Props {
  lang?: Lang;
  /** Overall document state, e.g. "Ready to print". Defaults per language. */
  statusText?: string;
  /** Optional muted hint shown at the far (end) side — e.g. the paper profile. */
  hint?: string;
}

/**
 * Read-only status strip. Shows existing state only — never triggers API calls.
 * Kept intentionally minimal (Acrobat-style): a single readiness indicator.
 * Marked `pw-chrome` so it is hidden in print.
 */
export default function PrintWorkspaceStatusBar({ lang = 'ar', statusText, hint }: Props) {
  const en = lang === 'en';
  const ready = statusText ?? (en ? 'Ready to print' : 'جاهزة للطباعة');

  return (
    <div className="pw-statusbar pw-chrome">
      <span className="pw-status-chip">
        <span className="pw-status-dot" />
        {ready}
      </span>
      {hint && <span className="pw-status-muted pw-status-hint">{hint}</span>}
    </div>
  );
}
