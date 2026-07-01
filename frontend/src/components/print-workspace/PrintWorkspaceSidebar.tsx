import { ReactNode } from 'react';

type Lang = 'ar' | 'en';

interface Props {
  lang?: Lang;
  collapsed: boolean;
  onToggle: () => void;
  title?: string;
  /** Settings content (copies, paper, profile, doc info) supplied by the caller. */
  children: ReactNode;
}

/**
 * Collapsible print-settings panel. Contains only controls the page already
 * supports — it does not introduce new behavior. Marked `pw-chrome` so it is
 * hidden in print.
 */
export default function PrintWorkspaceSidebar({
  lang = 'ar',
  collapsed,
  onToggle,
  title,
  children,
}: Props) {
  const en = lang === 'en';
  const heading = title ?? (en ? 'Print settings' : 'إعدادات الطباعة');

  if (collapsed) {
    return (
      <aside className="pw-sidebar pw-collapsed pw-chrome">
        <button
          type="button"
          className="pw-sidebar-toggle"
          onClick={onToggle}
          aria-label={en ? 'Show print settings' : 'إظهار إعدادات الطباعة'}
          title={heading}
        >
          ⚙
        </button>
      </aside>
    );
  }

  return (
    <aside className="pw-sidebar pw-chrome">
      <div className="pw-sidebar-head">
        <span className="pw-sidebar-head-title">
          <span aria-hidden="true">🖨️</span>
          {heading}
        </span>
        <button
          type="button"
          className="pw-sidebar-toggle"
          onClick={onToggle}
          aria-label={en ? 'Hide print settings' : 'إخفاء إعدادات الطباعة'}
        >
          {en ? '‹‹' : '››'}
        </button>
      </div>
      {children}
    </aside>
  );
}
