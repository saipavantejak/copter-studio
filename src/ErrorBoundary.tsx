// src/ErrorBoundary.tsx — v11
// Granular error boundaries that catch runtime errors inside individual panels
// without unmounting the whole app. Each panel gets its own boundary so a bad
// TF.js tensor shape in PolicyXRay can't kill the Simulation view.
//
// Usage:
//   <PanelErrorBoundary name="Policy X-Ray">
//     <PolicyXRay ... />
//   </PanelErrorBoundary>

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  name:     string;
  children: React.ReactNode;
  /** Compact single-line fallback for narrow panels (default false = full card) */
  compact?: boolean;
}

interface State {
  error:     Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class PanelErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
    // Surface to console so it shows in dev tools
    console.error(`[ErrorBoundary: ${this.props.name}]`, error, errorInfo.componentStack);
  }

  private reset = () => this.setState({ error: null, errorInfo: null });

  render() {
    const { error, errorInfo } = this.state;
    const { name, children, compact } = this.props;

    if (!error) return children;

    if (compact) {
      return (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-700">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span className="flex-1 truncate">{name}: {error.message}</span>
          <button onClick={this.reset}
            className="shrink-0 px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded text-[10px] flex items-center gap-1 transition-colors">
            <RefreshCw className="w-2.5 h-2.5" /> Reset
          </button>
        </div>
      );
    }

    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6 bg-surface border border-red-500/20 rounded-2xl">
        <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-700" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold text-ink mb-1">{name} crashed</p>
          <p className="text-xs text-muted max-w-xs leading-relaxed">{error.message}</p>
        </div>
        {/* Collapsed stack trace */}
        <details className="w-full max-w-md">
          <summary className="text-[10px] text-muted cursor-pointer hover:text-muted transition-colors">
            Stack trace
          </summary>
          <pre className="mt-2 text-[9px] text-muted bg-surface border border-line rounded-lg p-2 overflow-auto max-h-32 leading-relaxed">
            {errorInfo?.componentStack ?? error.stack}
          </pre>
        </details>
        <button onClick={this.reset}
          className="flex items-center gap-2 px-4 py-2 bg-canvas hover:bg-selected border border-line-strong text-ink rounded-xl text-xs font-medium transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }
}

