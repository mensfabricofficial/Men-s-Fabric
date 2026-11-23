import React from 'react';
import { RefreshCw, RotateCcw, AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  resetKeys?: unknown[];
  inline?: boolean;
  label?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

const CLEARABLE_LOCAL_PREFIXES = ['mf_', 'selvee_'];
const PRESERVED_KEYS = new Set([
  'selvee_admin_device_id_v2',
  'selvee_customer_device_id_v1',
]);

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected display error',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Captured UI render error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (!this.state.hasError) return;
    const prevKeys = prevProps.resetKeys || [];
    const nextKeys = this.props.resetKeys || [];
    const changed =
      prevKeys.length !== nextKeys.length ||
      nextKeys.some((val, idx) => !Object.is(val, prevKeys[idx]));
    if (changed) {
      this.setState({ hasError: false, errorMessage: '' });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleClearCacheAndReload = () => {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          !PRESERVED_KEYS.has(key) &&
          CLEARABLE_LOCAL_PREFIXES.some((prefix) => key.startsWith(prefix))
        ) {
          toRemove.push(key);
        }
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore storage clear failures
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { inline = false, label } = this.props;

    return (
      <div
        className={
          inline
            ? 'w-full py-14 px-4 flex items-center justify-center'
            : 'min-h-screen bg-[#FAFAFA] px-4 py-16 flex items-center justify-center text-neutral-900'
        }
      >
        <div className="max-w-md w-full bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base sm:text-lg font-extrabold text-neutral-900 tracking-tight">
              {label ? `${label} couldn't load properly` : 'Something went wrong displaying this view'}
            </h2>
            <p className="text-xs text-neutral-500 leading-relaxed">
              A temporary data or display issue prevented this section from rendering cleanly. You can retry or reload the page below.
            </p>
            {this.state.errorMessage && (
              <p className="mt-2 px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono text-[11px] text-neutral-600 break-words">
                {this.state.errorMessage}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="py-2.5 px-3 border border-neutral-300 text-neutral-800 text-xs font-bold uppercase tracking-wider rounded-lg hover:border-black hover:bg-neutral-50 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="py-2.5 px-3 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Page</span>
              </button>
            </div>
            <button
              type="button"
              onClick={this.handleClearCacheAndReload}
              className="w-full py-2 text-[11px] font-semibold text-neutral-500 hover:text-neutral-900 underline underline-offset-2 cursor-pointer"
            >
              Clear Local Cache &amp; Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
