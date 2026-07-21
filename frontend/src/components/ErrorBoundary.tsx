import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children:    ReactNode;
  /** When this value changes, the boundary resets (e.g. the active tab key). */
  resetKey?:   unknown;
  /** Optional secondary action, e.g. "go back to overview". */
  onReset?:    () => void;
  resetLabel?: string;
  title?:      string;
}

interface State {
  hasError: boolean;
  error:    Error | null;
}

/**
 * Scoped React error boundary. Any synchronous render error in `children` is
 * caught here and rendered as an inline panel instead of white-screening the
 * whole Electron app. Resets automatically when `resetKey` changes so switching
 * tabs (or retrying) recovers cleanly.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Offline desktop app — the console is the developer-facing channel.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] render error:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleReset = (): void => {
    this.handleRetry();
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="bae-boundary" role="alert">
        <span className="material-symbols-outlined bae-boundary-icon">report</span>
        <h3 className="bae-boundary-title">
          {this.props.title ?? 'حدث خطأ أثناء عرض هذا القسم'}
        </h3>
        <p className="bae-boundary-msg">
          {this.state.error?.message || 'خطأ غير متوقع. يمكنك إعادة المحاولة.'}
        </p>
        <div className="bae-boundary-actions">
          <button type="button" className="btn" onClick={this.handleRetry}>
            <span className="material-symbols-outlined">refresh</span>
            إعادة المحاولة
          </button>
          {this.props.onReset && (
            <button type="button" className="btn secondary" onClick={this.handleReset}>
              <span className="material-symbols-outlined">dashboard</span>
              {this.props.resetLabel ?? 'العودة للنظرة العامة'}
            </button>
          )}
        </div>
      </div>
    );
  }
}
