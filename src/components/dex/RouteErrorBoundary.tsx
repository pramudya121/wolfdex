import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Changing this value resets the boundary (used to reset on navigation). */
  resetKey?: string;
}
interface State {
  error: Error | null;
}

/**
 * RouteErrorBoundary — last line of defence against blank pages.
 *
 * Any render-time throw inside a route (including a lazy chunk that failed to
 * load) used to unmount the whole subtree and leave an empty <main>. Now the
 * user gets a readable card with retry / reload actions, and the error is
 * logged for debugging.
 */
export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RouteErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    // Navigating away must clear the error so the next page renders.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="wolf-card max-w-md rounded-2xl border border-wolf-border/40 p-8 text-center">
          <h2 className="text-xl font-semibold">This section failed to load</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Something went wrong while rendering this page. You can retry — your wallet stays connected.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
              {error.message}
            </pre>
          )}
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => this.setState({ error: null })}
              className="wolf-btn-primary inline-flex items-center rounded-xl px-5 py-2.5 text-sm font-medium"
            >
              Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center rounded-xl border border-wolf-border/60 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
