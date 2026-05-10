import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Global error boundary. Catches render-time errors anywhere in the
 * tree and renders a runtime-safe fallback instead of a blank screen.
 * Async errors (promise rejections inside effects) still need to be
 * caught locally — React error boundaries don't see those.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('ErrorBoundary caught', { message: error.message, stack: error.stack, componentStack: info.componentStack });
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-lg w-full space-y-4 rounded-lg border bg-card p-6 text-card-foreground shadow">
          <h1 className="text-lg font-semibold">Algo salió mal</h1>
          <p className="text-sm text-muted-foreground">
            La aplicación encontró un error inesperado. Puedes intentar continuar
            o recargar la página.
          </p>
          <pre className="text-xs whitespace-pre-wrap rounded bg-muted p-3 max-h-48 overflow-auto">
            {error.message}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Recargar
            </button>
          </div>
        </div>
      </div>
    );
  }
}