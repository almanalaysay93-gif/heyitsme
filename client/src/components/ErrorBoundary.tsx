import { isChunkLoadError } from "@/lib/lazyRoute";
import { reportError } from "@/lib/reportError";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Changing this (the current path) clears a caught error, so one broken route does not block every other page. */
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) this.setState({ hasError: false, error: null });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, "boundary", info.componentStack ?? undefined);
  }

  render() {
    if (this.state.hasError && isChunkLoadError(this.state.error)) {
      // The page's files changed under an open tab (a new release) and the automatic reload already ran.
      return (
        <main className="public-loading" id="main" role="alert">
          <div className="not-found-mark">↻</div>
          <h1>heyitsme was just updated.</h1>
          <p>This tab still has the previous version. Reload to open the page.</p>
          <div className="error-actions">
            <button className="outline-button" onClick={() => window.location.reload()}>Reload page</button>
            <a href="/">Back to heyitsme</a>
          </div>
        </main>
      );
    }
    if (this.state.hasError) {
      return (
        <main className="public-loading" id="main" role="alert">
          <div className="not-found-mark">!</div>
          <h1>Something went sideways.</h1>
          <p>We hit an unexpected error. Reloading usually sorts it out.</p>
          {import.meta.env.DEV && this.state.error?.stack ? (
            <pre className="error-stack">{this.state.error.stack}</pre>
          ) : null}
          <div className="error-actions">
            <button className="outline-button" onClick={() => window.location.reload()}>Reload page</button>
            <a href="/">Back to heyitsme</a>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
