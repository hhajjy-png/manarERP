import { Component, createRef, type ErrorInfo, type ReactNode } from 'react';
import './RootErrorBoundary.css';

type Scope = 'root' | 'page';

interface Props {
  children: ReactNode;
  /** 'root' → full-screen fallback (outside the layout); 'page' → fills the content area. */
  scope?: Scope;
  /** When this value changes (e.g. the active route path), the boundary auto-resets. */
  resetKey?: unknown;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

const HOME_HASH = '#/';

/**
 * Application-level React error boundary. Any synchronous render error inside
 * `children` is caught here and rendered as a professional ExplorerKit fallback
 * instead of white-screening the whole Electron renderer.
 *
 * Two placements are used:
 *   - scope="root"  wraps <App/> in main.tsx (catches catastrophic + print/form routes)
 *   - scope="page"  wraps the router <Outlet/> in Layout.tsx, resetKey={pathname},
 *                   so a page crash keeps the shell and auto-recovers on navigation.
 *
 * This is intentionally separate from the scoped inline `ErrorBoundary` used
 * inside individual pages — that component and its usage are left untouched.
 */
export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: '', copied: false };

  private regionRef = createRef<HTMLDivElement>();

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const scope = this.props.scope ?? 'root';
    // Offline desktop app — the console is the developer-facing channel.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary:${scope}] render error:`, error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? '' });
  }

  componentDidUpdate(prevProps: Props, prevState: State): void {
    // Auto-recover when the reset key (route path) changes after a crash.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
      return;
    }
    // Move focus to the alert region for screen-reader + keyboard users.
    if (this.state.hasError && !prevState.hasError) {
      this.regionRef.current?.focus();
    }
  }

  private reset = (): void => {
    this.setState({ hasError: false, error: null, componentStack: '', copied: false });
  };

  private handleHome = (): void => {
    // HashRouter-friendly: works whether or not this boundary sits inside the router.
    if (window.location.hash !== HOME_HASH) window.location.hash = HOME_HASH;
    this.reset();
  };

  private handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard?.writeText(this.buildReport());
      this.setState({ copied: true });
    } catch {
      // Clipboard unavailable (e.g. denied) — fail silently, the details stay visible on screen.
    }
  };

  private buildReport(): string {
    const { error, componentStack } = this.state;
    return [
      `scope: ${this.props.scope ?? 'root'}`,
      `time: ${new Date().toISOString()}`,
      `message: ${error?.message ?? 'unknown'}`,
      `stack:\n${error?.stack ?? '(none)'}`,
      `componentStack:${componentStack ? `\n${componentStack}` : ' (none)'}`,
    ].join('\n');
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    const { error, componentStack, copied } = this.state;
    const variant = this.props.scope === 'page' ? 'reb-root--page' : 'reb-root--full';

    return (
      <div
        className={`reb-root ${variant}`}
        dir="rtl"
        role="alert"
        aria-live="assertive"
        ref={this.regionRef}
        tabIndex={-1}
      >
        <div className="reb-card">
          <span className="material-symbols-outlined reb-icon" aria-hidden="true">warning</span>
          <h1 className="reb-title">تعذّر عرض هذه الصفحة</h1>
          <p className="reb-msg">
            حدث خطأ غير متوقع أثناء عرض هذا الجزء من التطبيق. بياناتك محفوظة ولم تتأثر.
            يمكنك إعادة المحاولة أو العودة إلى الصفحة الرئيسية.
          </p>

          <div className="reb-actions">
            <button type="button" className="btn" onClick={this.reset}>
              <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
              إعادة المحاولة
            </button>
            <button type="button" className="btn secondary" onClick={this.handleHome}>
              <span className="material-symbols-outlined" aria-hidden="true">home</span>
              العودة للرئيسية
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={this.handleCopy}
              aria-label="نسخ التفاصيل الفنية للخطأ"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {copied ? 'check' : 'content_copy'}
              </span>
              {copied ? 'تم النسخ' : 'نسخ التفاصيل الفنية'}
            </button>
          </div>

          <details className="reb-details">
            <summary>تفاصيل للمطوّر</summary>
            <div className="reb-detail-block" dir="ltr">
              <strong>Message</strong>
              <pre>{error?.message || '—'}</pre>
              {error?.stack && (
                <>
                  <strong>Stack</strong>
                  <pre>{error.stack}</pre>
                </>
              )}
              {componentStack && (
                <>
                  <strong>Component stack</strong>
                  <pre>{componentStack}</pre>
                </>
              )}
            </div>
          </details>
        </div>
      </div>
    );
  }
}
