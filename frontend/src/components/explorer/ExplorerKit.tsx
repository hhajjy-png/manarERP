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

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

const Icon = ({ name, className }: { name: string; className?: string }) => (
  <span className={`material-symbols-outlined${className ? ` ${className}` : ''}`} aria-hidden="true">
    {name}
  </span>
);

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
  return (
    <header className="xpl-exec-header">
      {onBack && (
        <button type="button" className="xpl-back-btn" onClick={onBack} aria-label="رجوع">
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
}: {
  icon: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  active?: boolean;
  ariaLabel?: string;
}) {
  const cls = `xpl-metric xpl-metric--${tone}${onClick ? ' xpl-metric--click' : ''}${active ? ' xpl-metric--active' : ''}`;
  const inner = (
    <>
      <div className="xpl-metric-icon"><Icon name={icon} /></div>
      <div className="xpl-metric-body">
        <span className="xpl-metric-label">{label}</span>
        <span className="xpl-metric-value">{value}</span>
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
  return (
    <div className="xpl-search">
      <Icon name="search" />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel ?? placeholder ?? 'بحث'}
      />
      {value && (
        <button type="button" className="xpl-search-clear" onClick={() => onChange('')} aria-label="مسح البحث">
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
  return (
    <div className="xpl-skeleton" aria-busy="true" aria-label="جارٍ التحميل">
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
  const panelRef = useRef<HTMLDivElement>(null);

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
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
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
  }, [onClose]);

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
          <button type="button" className="xpl-drawer-close" onClick={onClose} aria-label="إغلاق">
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
