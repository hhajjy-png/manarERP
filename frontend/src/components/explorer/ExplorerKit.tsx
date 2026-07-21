/* ════════════════════════════════════════════════════════════════════════════
   Explorer Kit — shared executive UI primitives (.xpl-* design language)
   --------------------------------------------------------------------------
   Reusable components extracted from the Bank Account Explorer (Phases A–E)
   so that Reports Center, Document Expiry Center and Data Import Center share
   one consistent, premium, fully-scoped visual language.

   Pure presentation — no business logic, no data fetching. Each consumer
   wraps its page in `<div className="xpl-scope xpl-page">` (or applies
   `xpl-scope` to the root) to activate the design tokens.
   ════════════════════════════════════════════════════════════════════════════ */
import {
  useEffect,
  useRef,
  type ReactNode,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useT } from '../../lib/i18n';

export type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

const Icon = ({ name, className }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined${className ? ` ${className}` : ''}`} aria-hidden="true">
    {name}
  </span>
);

// ─── Shared dismissable-surface hook (focus trap + escape + focus return) ───────
// Used by Drawer and Dialog here, and by any other dismissable panel outside this
// file (e.g. BankAccountExplorer's TransactionDrawer): moves focus into the panel
// on mount, traps Tab inside it (both directions), closes on Escape, locks body
// scroll, and returns focus to the previously-focused element on unmount.
export function useFocusTrap(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest `onClose` in a ref so the effect below can run exactly once
  // (on open) without re-subscribing when the caller passes a new function
  // identity on every render. Re-running the effect would call `panel.focus()`
  // again and steal focus from whatever input the user is typing into.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel?.focus();

    const focusable = (): HTMLElement[] =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key === 'Tab') {
        const items = focusable();
        if (items.length === 0) { e.preventDefault(); panel?.focus(); return; }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
    // Runs once on open; `onClose` is read via `onCloseRef` so a changing
    // callback identity never re-triggers focus management.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return panelRef;
}

// ─── Executive header ──────────────────────────────────────────────────────────

export function ExecutiveHeader({
  icon,
  title,
  subtitle,
  onBack,
  chips,
  aside,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  chips?: ReactNode;
  aside?: ReactNode;
}) {
  const { t } = useT();
  return (
    <header className="xpl-exec-header">
      {onBack && (
        <button type="button" className="xpl-back-btn" onClick={onBack} aria-label={t('btn.inv.back')}>
          <Icon name="arrow_forward" />
        </button>
      )}
      <div className="xpl-exec-identity">
        <div className="xpl-exec-logo">
          <Icon name={icon} />
        </div>
        <div className="xpl-exec-id-text">
          <h1 className="xpl-exec-title">{title}</h1>
          {subtitle && <p className="xpl-exec-subtitle">{subtitle}</p>}
          {chips && <div className="xpl-exec-chips">{chips}</div>}
        </div>
      </div>
      {aside && <div className="xpl-exec-aside">{aside}</div>}
    </header>
  );
}

// ─── Identity chip (header meta pill) ──────────────────────────────────────────

export function IdChip({
  icon,
  tone = 'neutral',
  children,
}: {
  icon?: string;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span className={`xpl-id-chip xpl-id-chip--${tone}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

// ─── Metric card ───────────────────────────────────────────────────────────────

export function MetricCard({
  icon,
  label,
  value,
  sub,
  tone = 'indigo',
  onClick,
  active,
  ariaLabel,
  trend,
}: {
  icon: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  active?: boolean;
  ariaLabel?: string;
  /**
   * Optional month-on-month style indicator. `dir` sets the arrow (real direction);
   * `invert` flips only the COLOUR for cost-type metrics where an increase is negative
   * (e.g. expenses rising reads red, not green). Omit entirely for no indicator —
   * existing MetricCard callers are unaffected.
   */
  trend?: { dir: 'up' | 'down'; text: string; invert?: boolean };
}) {
  const cls = `xpl-metric xpl-metric--${tone}${onClick ? ' xpl-metric--click' : ''}${active ? ' xpl-metric--active' : ''}`;
  const trendTone = trend ? (trend.invert ? (trend.dir === 'up' ? 'down' : 'up') : trend.dir) : null;
  const inner = (
    <>
      <div className="xpl-metric-icon"><Icon name={icon} /></div>
      <div className="xpl-metric-body">
        <span className="xpl-metric-label">{label}</span>
        <span className="xpl-metric-value">{value}</span>
        {trend && (
          <span className={`xpl-metric-trend xpl-metric-trend--${trendTone}`}>
            <span className="material-symbols-outlined" aria-hidden="true">
              {trend.dir === 'up' ? 'arrow_upward' : 'arrow_downward'}
            </span>
            {trend.text}
          </span>
        )}
        {sub != null && <span className="xpl-metric-sub">{sub}</span>}
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        onClick={onClick}
        aria-pressed={active ? 'true' : 'false'}
        aria-label={ariaLabel ?? label}
      >
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

// ─── Hero metric (dominant gradient card) ──────────────────────────────────────

export function HeroMetric({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="xpl-hero">
      <div className="xpl-hero-icon"><Icon name={icon} /></div>
      <div className="xpl-hero-body">
        <span className="xpl-hero-label">{label}</span>
        <span className="xpl-hero-value">{value}</span>
        {sub != null && <span className="xpl-hero-sub">{sub}</span>}
      </div>
    </div>
  );
}

// ─── Static status chip / metric chip ──────────────────────────────────────────

export function StatusChip({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: string; children: ReactNode }) {
  return (
    <span className={`xpl-chip xpl-chip--${tone}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function MetricChip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className="xpl-metric-chip">
      <span className={`xpl-dot xpl-dot--${tone}`} />
      {children}
    </span>
  );
}

// ─── Filter chip (toggle) ──────────────────────────────────────────────────────

export function FilterChip({
  active,
  onClick,
  icon,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button type="button" className={`xpl-filter-chip${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active ? 'true' : 'false'}>
      {icon && <Icon name={icon} />}
      {children}
      {count != null && <span className="xpl-filter-chip-count">{count}</span>}
    </button>
  );
}

// ─── Search box ────────────────────────────────────────────────────────────────

export function SearchBox({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const { t } = useT();
  return (
    <div className="xpl-search">
      <Icon name="search" />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel ?? placeholder ?? t('action.search')}
      />
      {value && (
        <button type="button" className="xpl-search-clear" onClick={() => onChange('')} aria-label={t('a11y.clear_search')}>
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

// ─── Section card ──────────────────────────────────────────────────────────────

export function SectionCard({
  title,
  icon,
  actions,
  padded = true,
  children,
  style,
}: {
  title?: string;
  icon?: string;
  actions?: ReactNode;
  padded?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section className="xpl-card" style={style}>
      {(title || actions) && (
        <div className="xpl-card-head">
          {title && (
            <h3 className="xpl-card-title">
              {icon && <Icon name={icon} />}
              {title}
            </h3>
          )}
          {actions && <div className="xpl-card-actions">{actions}</div>}
        </div>
      )}
      {padded ? <div className="xpl-card--pad">{children}</div> : children}
    </section>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  message,
  action,
  tone = 'indigo',
}: {
  icon: string;
  title: string;
  message?: string;
  action?: ReactNode;
  tone?: 'indigo' | 'neutral';
}) {
  return (
    <div className={`xpl-empty${tone === 'neutral' ? ' xpl-empty--neutral' : ''}`}>
      <div className="xpl-empty-illus"><Icon name={icon} /></div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action && <div className="xpl-empty-action">{action}</div>}
    </div>
  );
}

// ─── Error banner ──────────────────────────────────────────────────────────────

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="xpl-error-banner" role="alert">
      <Icon name="error" />
      <span>{children}</span>
    </div>
  );
}

// ─── Skeleton rows ─────────────────────────────────────────────────────────────

export function SkeletonRows({ rows = 5, withAvatar = true }: { rows?: number; withAvatar?: boolean }) {
  const { t } = useT();
  return (
    <div className="xpl-skeleton" aria-busy="true" aria-label={t('a11y.loading')}>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="xpl-skeleton-row" key={i}>
          {withAvatar && <div className="xpl-skeleton-cell xpl-sk-circle" />}
          <div className="xpl-skeleton-cell xpl-sk-lg" />
          <div className="xpl-skeleton-cell xpl-sk-md" />
          <div className="xpl-skeleton-cell xpl-sk-sm" />
        </div>
      ))}
    </div>
  );
}

// ─── Drawer (accessible: focus trap, escape, focus return, scroll lock) ────────

export function Drawer({
  title,
  onClose,
  children,
  footer,
  hero,
  labelledById = 'xpl-drawer-title',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  hero?: ReactNode;
  labelledById?: string;
}) {
  const panelRef = useFocusTrap(onClose);
  const { t } = useT();

  return (
    <>
      <div className="xpl-drawer-overlay" onClick={onClose} />
      <div
        className="xpl-drawer"
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="xpl-drawer-header">
          <h3 className="xpl-drawer-title" id={labelledById}>{title}</h3>
          <button type="button" className="xpl-drawer-close" onClick={onClose} aria-label={t('action.close')}>
            <Icon name="close" />
          </button>
        </div>
        <div className="xpl-drawer-body">
          {hero}
          {children}
        </div>
        {footer && <div className="xpl-drawer-footer">{footer}</div>}
      </div>
    </>
  );
}

export function DrawerSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="xpl-drawer-section">
      {title && <div className="xpl-drawer-section-title">{title}</div>}
      {children}
    </section>
  );
}

export function DrawerField({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="xpl-drawer-field">
      <span className="xpl-drawer-field-label">{label}</span>
      <span className={`xpl-drawer-field-value${mono ? ' mono' : ''}`}>{value}</span>
    </div>
  );
}

// ─── Information Hub drawer primitives (presentation-only, additive) ──────────────

export interface DrawerKpi { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; }

export function DrawerHeaderCard({
  icon, title, subtitle, status, kpis,
}: {
  icon: string;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: { tone?: Tone; icon?: string; label: string };
  kpis?: DrawerKpi[];
}) {
  return (
    <div className="xpl-drawer-headcard">
      <div className="xpl-drawer-headcard-top">
        <div className="xpl-drawer-headcard-icon"><Icon name={icon} /></div>
        <div className="xpl-drawer-headcard-id">
          <span className="xpl-drawer-headcard-title">{title}</span>
          {subtitle != null && <span className="xpl-drawer-headcard-sub">{subtitle}</span>}
        </div>
        {status && <StatusChip tone={status.tone} icon={status.icon}>{status.label}</StatusChip>}
      </div>
      {kpis && kpis.length > 0 && (
        <div className="xpl-drawer-kpis">
          {kpis.map((k, i) => (
            <div className={`xpl-drawer-kpi${k.tone ? ` xpl-drawer-kpi--${k.tone}` : ''}`} key={i}>
              <span className="xpl-drawer-kpi-label">{k.label}</span>
              <span className="xpl-drawer-kpi-value">{k.value}</span>
              {k.sub != null && <span className="xpl-drawer-kpi-sub">{k.sub}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface QuickAction {
  key: string;
  icon: string;
  label: string;
  onClick: () => void;
  tone?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
}

export function DrawerQuickActions({ actions }: { actions: QuickAction[] }) {
  if (!actions.length) return null;
  return (
    <div className="xpl-quick-actions">
      {actions.map((a) => (
        <button
          type="button"
          key={a.key}
          className={`xpl-quick-action${a.tone && a.tone !== 'default' ? ` xpl-quick-action--${a.tone}` : ''}`}
          onClick={a.onClick}
          disabled={a.disabled}
          aria-label={a.label}
        >
          <span className="xpl-quick-action-icon"><Icon name={a.icon} /></span>
          <span className="xpl-quick-action-label">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

export interface InfoItem { label: string; value: ReactNode; mono?: boolean; }

function infoValueIsEmpty(v: ReactNode): boolean {
  return v == null || v === '' || v === '—';
}

export function DrawerInfoGrid({ title, items }: { title?: string; items: InfoItem[] }) {
  const shown = items.filter((it) => !infoValueIsEmpty(it.value));
  if (!shown.length) return null;
  return (
    <DrawerSection title={title}>
      <div className="xpl-info-grid">
        {shown.map((it, i) => (
          <DrawerField key={i} label={it.label} value={it.value} mono={it.mono} />
        ))}
      </div>
    </DrawerSection>
  );
}

export interface RelatedItem {
  key: string;
  icon?: string;
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
}

export function DrawerRelated({
  title, loading, error, items, onSeeAll,
}: {
  title: string;
  loading?: boolean;
  error?: string;
  items?: RelatedItem[];
  onSeeAll?: () => void;
}) {
  const { t } = useT();
  if (!loading && !error && (!items || items.length === 0)) return null; // hide when empty
  return (
    <DrawerSection title={title}>
      {error ? (
        <ErrorBanner>{error}</ErrorBanner>
      ) : loading ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="xpl-related">
          {items!.map((it) =>
            it.onClick ? (
              <button type="button" key={it.key} className="xpl-related-row xpl-related-row--click" onClick={it.onClick}>
                {it.icon && <span className={`xpl-related-icon${it.tone ? ` xpl-dot--${it.tone}` : ''}`}><Icon name={it.icon} /></span>}
                <span className="xpl-related-text">
                  <span className="xpl-related-primary">{it.primary}</span>
                  {it.secondary != null && <span className="xpl-related-secondary">{it.secondary}</span>}
                </span>
                {it.trailing != null && <span className="xpl-related-trailing">{it.trailing}</span>}
              </button>
            ) : (
              <div key={it.key} className="xpl-related-row">
                {it.icon && <span className={`xpl-related-icon${it.tone ? ` xpl-dot--${it.tone}` : ''}`}><Icon name={it.icon} /></span>}
                <span className="xpl-related-text">
                  <span className="xpl-related-primary">{it.primary}</span>
                  {it.secondary != null && <span className="xpl-related-secondary">{it.secondary}</span>}
                </span>
                {it.trailing != null && <span className="xpl-related-trailing">{it.trailing}</span>}
              </div>
            ),
          )}
          {onSeeAll && <button type="button" className="xpl-related-seeall" onClick={onSeeAll}>{t('page.dashboard.view_all')}</button>}
        </div>
      )}
    </DrawerSection>
  );
}

export interface ActivityItem {
  key: string;
  icon?: string;
  tone?: Tone;
  title: ReactNode;
  meta?: ReactNode;
  timestamp?: string;
}

export function DrawerActivity({
  title, loading, items,
}: {
  title?: string;
  loading?: boolean;
  items?: ActivityItem[];
}) {
  const { t } = useT();
  if (!loading && (!items || items.length === 0)) return null;
  return (
    <DrawerSection title={title ?? t('section.recent_activity')}>
      {loading ? (
        <SkeletonRows rows={3} />
      ) : (
        <ul className="xpl-timeline">
          {items!.map((it) => (
            <li className="xpl-timeline-item" key={it.key}>
              <span className={`xpl-timeline-dot${it.tone ? ` xpl-dot--${it.tone}` : ''}`}>
                {it.icon && <Icon name={it.icon} />}
              </span>
              <div className="xpl-timeline-body">
                <span className="xpl-timeline-title">{it.title}</span>
                {it.meta != null && <span className="xpl-timeline-meta">{it.meta}</span>}
              </div>
              {it.timestamp && <span className="xpl-timeline-time">{it.timestamp}</span>}
            </li>
          ))}
        </ul>
      )}
    </DrawerSection>
  );
}

export interface ActionBtn {
  key: string;
  label: string;
  icon?: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
}

export function DrawerActionBar({
  primary, secondary, danger,
}: {
  primary?: ActionBtn;
  secondary?: ActionBtn[];
  danger?: ActionBtn[];
}) {
  return (
    <div className="xpl-actionbar">
      <div className="xpl-actionbar-main">
        {primary && (
          <Button variant="primary" icon={primary.icon} busy={primary.busy} disabled={primary.disabled} onClick={primary.onClick}>
            {primary.label}
          </Button>
        )}
        {secondary?.map((b) => (
          <Button key={b.key} variant="secondary" icon={b.icon} busy={b.busy} disabled={b.disabled} onClick={b.onClick}>
            {b.label}
          </Button>
        ))}
      </div>
      {danger && danger.length > 0 && (
        <div className="xpl-actionbar-danger">
          {danger.map((b) => (
            <Button key={b.key} variant="danger" icon={b.icon} busy={b.busy} disabled={b.disabled} onClick={b.onClick}>
              {b.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dialog (modal standard: header icon/title/subtitle → body sections → footer) ──

export function Dialog({
  icon,
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'md',
  labelledById = 'xpl-dialog-title',
  elevated = false,
}: {
  icon?: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  labelledById?: string;
  /** Opt in when this Dialog is opened as a confirmation step ON TOP OF an
   *  already-open legacy Modal (`components/Modal.tsx`, z-index 500) — the
   *  default Dialog overlay (410) sits below Modal by design (see theme.css),
   *  so without this it renders hidden behind the Modal it's meant to confirm. */
  elevated?: boolean;
}) {
  const panelRef = useFocusTrap(onClose);
  const { t } = useT();
  return (
    <div className={`xpl-dialog-overlay${elevated ? ' xpl-dialog-overlay--elevated' : ''}`} onClick={onClose}>
      <div
        className={`xpl-dialog xpl-dialog--${size}`}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="xpl-dialog-header">
          <div className="xpl-dialog-header-id">
            {icon && <div className="xpl-dialog-header-icon"><Icon name={icon} /></div>}
            <div className="xpl-dialog-header-text">
              <h3 className="xpl-dialog-title" id={labelledById}>{title}</h3>
              {subtitle && <p className="xpl-dialog-subtitle">{subtitle}</p>}
            </div>
          </div>
          <button type="button" className="xpl-drawer-close" onClick={onClose} aria-label={t('action.close')}>
            <Icon name="close" />
          </button>
        </div>
        <div className="xpl-dialog-body">{children}</div>
        {footer && <div className="xpl-dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function DialogSection({ title, icon, children }: { title?: string; icon?: string; children: ReactNode }) {
  return (
    <section className="xpl-dialog-section">
      {title && (
        <div className="xpl-dialog-section-title">
          {icon && <Icon name={icon} />}
          {title}
        </div>
      )}
      <div className="xpl-form-grid">{children}</div>
    </section>
  );
}

// ─── Slim tab bar ──────────────────────────────────────────────────────────────

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; icon?: string }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="xpl-tabs" role="tablist">
      {tabs.map((tb) => (
        <button
          key={tb.key}
          type="button"
          role="tab"
          aria-selected={active === tb.key ? 'true' : 'false'}
          className={`xpl-tab${active === tb.key ? ' active' : ''}`}
          onClick={() => onChange(tb.key)}
        >
          {tb.icon && <Icon name={tb.icon} className="xpl-tab-icon" />}
          {tb.label}
        </button>
      ))}
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────────────────────────

export function Pagination({
  meta,
  onPage,
  disabled,
}: {
  meta: { page: number; pageSize: number; total: number; totalPages: number } | null | undefined;
  onPage: (page: number) => void;
  /** Disables both nav buttons regardless of page position — e.g. while a fetch is in flight. */
  disabled?: boolean;
}) {
  const { t } = useT();
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <div className="xpl-pagination">
      <span className="xpl-pagination-info">
        {meta.totalPages > 1
          ? <>{t('msg.showing_range', { from, to, total: meta.total })} · {t('msg.page')} {meta.page} {t('msg.of')} {meta.totalPages}</>
          : <>{t('msg.total')} {meta.total}</>}
      </span>
      {meta.totalPages > 1 && (
        <div className="xpl-pagination-btns">
          <button type="button" className="xpl-btn xpl-btn--secondary xpl-btn--sm" disabled={meta.page <= 1 || disabled} onClick={() => onPage(meta.page - 1)}>
            <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>{t('action.prev')}
          </button>
          <button type="button" className="xpl-btn xpl-btn--secondary xpl-btn--sm" disabled={meta.page >= meta.totalPages || disabled} onClick={() => onPage(meta.page + 1)}>
            {t('action.next')}<span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Button (kit-local premium button) ─────────────────────────────────────────

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  icon,
  busy,
  block,
  small,
  iconOnly,
  children,
  onKeyDown,
  ...rest
}: {
  variant?: BtnVariant;
  icon?: string;
  busy?: boolean;
  block?: boolean;
  small?: boolean;
  iconOnly?: boolean;
  children?: ReactNode;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLButtonElement>) => void;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  const cls = [
    'xpl-btn',
    `xpl-btn--${variant}`,
    block ? 'xpl-btn--block' : '',
    small ? 'xpl-btn--sm' : '',
    iconOnly ? 'xpl-btn--icon' : '',
  ].filter(Boolean).join(' ');
  return (
    <button type="button" {...rest} className={cls} disabled={busy || rest.disabled} onKeyDown={onKeyDown}>
      {busy ? <span className="xpl-spin" /> : icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export { Icon as XplIcon };
