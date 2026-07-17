import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import './PrintWorkspace.css';
import PrintWorkspaceToolbar from './PrintWorkspaceToolbar';
import PrintWorkspaceStatusBar from './PrintWorkspaceStatusBar';
import PrintWorkspaceSidebar from './PrintWorkspaceSidebar';
import PrintWorkspacePreview, { FitMode, clampScale } from './PrintWorkspacePreview';

type Lang = 'ar' | 'en';

interface Props {
  lang?: Lang;
  /** The existing document/form content, rendered unchanged inside the preview. */
  children: ReactNode;
  /** Control buttons for the unified toolbar (Print, PDF, Copies, Back, extras). */
  toolbar: ReactNode;
  /** Optional settings content for the collapsible sidebar. */
  sidebar?: ReactNode;
  sidebarTitle?: string;
  /** Whether the sidebar starts collapsed (default: expanded). */
  sidebarCollapsed?: boolean;

  // ── Metadata for the status bar / footer (existing state only) ──
  documentName?: string;
  paperLabel?: string;
  paperSize?: string;
  statusText?: string;
}

/** View options menu (⋮) — screen-only shell actions, never business logic. */
function MoreMenu({
  lang,
  onToggleSidebar,
  onFit,
  onResetZoom,
}: {
  lang: Lang;
  onToggleSidebar: () => void;
  onFit: (m: 'width' | 'page') => void;
  onResetZoom: () => void;
}) {
  const en = lang === 'en';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="pw-more" ref={ref}>
      <button
        type="button"
        className="pw-more-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={en ? 'More view options' : 'خيارات عرض إضافية'}
        onClick={() => setOpen((o) => !o)}
      >
        ⋮
      </button>
      {open && (
        <div className="pw-more-menu" role="menu">
          <button type="button" role="menuitem" className="pw-more-item" onClick={run(onToggleSidebar)}>
            {en ? 'Toggle settings panel' : 'إظهار/إخفاء لوحة الإعدادات'}
          </button>
          <button type="button" role="menuitem" className="pw-more-item" onClick={run(() => onFit('width'))}>
            {en ? 'Fit width' : 'ملاءمة العرض'}
          </button>
          <button type="button" role="menuitem" className="pw-more-item" onClick={run(() => onFit('page'))}>
            {en ? 'Fit page' : 'ملاءمة الصفحة'}
          </button>
          <button type="button" role="menuitem" className="pw-more-item" onClick={run(onResetZoom)}>
            {en ? 'Reset zoom (100%)' : 'إعادة التكبير (100%)'}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Reusable print workspace shell. Wraps an existing print document with a
 * unified toolbar, status bar, collapsible settings sidebar, and a zoomable
 * preview — all screen-only. The wrapped document and its print output are
 * never modified; in print the whole shell collapses away (see PrintWorkspace.css).
 */
export default function PrintWorkspace({
  lang = 'ar',
  children,
  toolbar,
  sidebar,
  sidebarTitle,
  sidebarCollapsed = false,
  documentName,
  paperLabel,
  paperSize,
  statusText,
}: Props) {
  const en = lang === 'en';
  const [collapsed, setCollapsed] = useState(sidebarCollapsed);

  // Screen-only zoom state (owned here so the footer / More menu can share it).
  // Initial view is "Fit to Page" (session-only; every fresh mount — i.e. opening
  // another template — resets to fit-to-page). Not persisted anywhere. The user
  // can still zoom with +/−, Ctrl/⌘+wheel, Fit width/page, and Reset (100%); the
  // placeholder scale below is overwritten by the fit computation before paint.
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState<FitMode>('page');
  const [pageCount, setPageCount] = useState(1);

  const onScale = useCallback((n: number) => setScale(n), []);
  const onStep = useCallback((delta: number) => {
    setFitMode(null);
    setScale((s) => clampScale(Math.round((s + delta) * 100) / 100));
  }, []);
  const onReset = useCallback(() => {
    setFitMode(null);
    setScale(1);
  }, []);
  const onFit = useCallback((m: 'width' | 'page') => setFitMode(m), []);
  const onPageCount = useCallback((n: number) => setPageCount(n), []);

  const toggleSidebar = useCallback(() => setCollapsed((c) => !c), []);

  const paperDetail =
    paperSize === 'A4'
      ? `A4 · 210 × 297 ${en ? 'mm' : 'مم'}`
      : paperSize;

  const pagesLabel = en
    ? `${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`
    : `${pageCount} ${pageCount === 1 ? 'صفحة' : 'صفحات'}`;

  return (
    <div className="print-workspace" dir={en ? 'ltr' : 'rtl'}>
      <PrintWorkspaceToolbar>
        <MoreMenu
          lang={lang}
          onToggleSidebar={toggleSidebar}
          onFit={onFit}
          onResetZoom={onReset}
        />
        {toolbar}
      </PrintWorkspaceToolbar>

      <PrintWorkspaceStatusBar lang={lang} statusText={statusText} hint={paperLabel} />

      <div className="pw-body">
        {sidebar != null && (
          <PrintWorkspaceSidebar
            lang={lang}
            title={sidebarTitle}
            collapsed={collapsed}
            onToggle={toggleSidebar}
          >
            {sidebar}
          </PrintWorkspaceSidebar>
        )}

        <PrintWorkspacePreview
          lang={lang}
          scale={scale}
          fitMode={fitMode}
          onScale={onScale}
          onStep={onStep}
          onReset={onReset}
          onFit={onFit}
          onPageCount={onPageCount}
        >
          {children}
        </PrintWorkspacePreview>
      </div>

      <div className="pw-footer pw-chrome">
        <span className="pw-footer-start">
          {documentName && (
            <>
              <span aria-hidden="true">📄</span>
              {documentName}
            </>
          )}
        </span>
        <span className="pw-footer-center">{pagesLabel}</span>
        <span className="pw-footer-end">{paperDetail}</span>
      </div>
    </div>
  );
}
