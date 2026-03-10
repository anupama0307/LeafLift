import React, { Component, ErrorInfo, ReactNode } from 'react';

// ════════════════════════════════════════════════════════════════════════════════
// Error Boundary – catches React rendering errors and shows a recovery UI
// ════════════════════════════════════════════════════════════════════════════════

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
  lastErrorTimestamp: number;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      lastErrorTimestamp: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error, lastErrorTimestamp: Date.now() };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState((prev) => ({
      errorInfo,
      errorCount: prev.errorCount + 1,
    }));

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log error details for debugging
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // Send error to telemetry endpoint (fire and forget)
    try {
      const API_BASE_URL =
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
        'http://localhost:5001';

      const payload = {
        message: error.message,
        stack: error.stack?.substring(0, 2000), // trim to avoid huge payloads
        componentStack: errorInfo.componentStack?.substring(0, 2000),
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      };

      fetch(`${API_BASE_URL}/api/telemetry/errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {
        /* silently ignore telemetry failures */
      });
    } catch {
      /* ignore telemetry setup failures */
    }
  }

  componentWillUnmount(): void {
    if (this.resetTimeout) clearTimeout(this.resetTimeout);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    // Use custom fallback if provided
    if (this.props.fallback) {
      return this.props.fallback;
    }

    const { error, errorInfo, errorCount } = this.state;
    const showDetails = this.props.showDetails ?? false;
    const isCrashLoop = errorCount > 3;

    return (
      <div style={styles.container}>
        <div style={styles.card}>
          {/* Icon */}
          <div style={styles.iconContainer}>
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          {/* Title */}
          <h2 style={styles.title}>Something went wrong</h2>

          {/* Description */}
          <p style={styles.description}>
            {isCrashLoop
              ? 'This section keeps crashing. Try reloading the page or going back home.'
              : 'An unexpected error occurred. You can try again or reload the page.'}
          </p>

          {/* Error message (condensed) */}
          {error && (
            <div style={styles.errorBox}>
              <span style={styles.errorLabel}>Error:</span> {error.message}
            </div>
          )}

          {/* Action buttons */}
          <div style={styles.buttonRow}>
            {!isCrashLoop && (
              <button onClick={this.handleRetry} style={styles.primaryButton}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginRight: 6 }}
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Try Again
              </button>
            )}

            <button onClick={this.handleReload} style={styles.secondaryButton}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ marginRight: 6 }}
              >
                <path d="M21.5 2v6h-6" />
                <path d="M2.5 22v-6h6" />
                <path d="M2 11.5a10 10 0 0 1 18.8-4.3" />
                <path d="M22 12.5a10 10 0 0 1-18.8 4.3" />
              </svg>
              Reload Page
            </button>

            <button onClick={this.handleGoHome} style={styles.ghostButton}>
              Go Home
            </button>
          </div>

          {/* Expandable details */}
          {showDetails && errorInfo && (
            <details style={styles.details}>
              <summary style={styles.detailsSummary}>Technical details</summary>
              <div style={styles.detailsContent}>
                <div style={styles.stackSection}>
                  <strong>Stack trace:</strong>
                  <pre style={styles.stackPre}>{error?.stack}</pre>
                </div>
                <div style={styles.stackSection}>
                  <strong>Component stack:</strong>
                  <pre style={styles.stackPre}>{errorInfo.componentStack}</pre>
                </div>
              </div>
            </details>
          )}

          {/* Crash count indicator */}
          {errorCount > 1 && (
            <p style={styles.crashCount}>
              This section has crashed {errorCount} time{errorCount > 1 ? 's' : ''} this session.
            </p>
          )}
        </div>
      </div>
    );
  }
}

// ── Inline styles (avoiding CSS-in-JS dependency) ──
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: 24,
    background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  card: {
    background: '#ffffff',
    borderRadius: 16,
    padding: '40px 32px',
    maxWidth: 480,
    width: '100%',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    textAlign: 'center' as const,
  },
  iconContainer: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#1e293b',
    margin: '0 0 8px',
  },
  description: {
    fontSize: 15,
    color: '#64748b',
    margin: '0 0 20px',
    lineHeight: 1.5,
  },
  errorBox: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 20,
    fontSize: 13,
    color: '#991b1b',
    textAlign: 'left' as const,
    wordBreak: 'break-word' as const,
    maxHeight: 80,
    overflow: 'auto',
  },
  errorLabel: {
    fontWeight: 600,
  },
  buttonRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 10,
    justifyContent: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    background: '#10b981',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  secondaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 20px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
    color: '#334155',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  ghostButton: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '10px 20px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    fontWeight: 500,
    fontSize: 14,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  details: {
    textAlign: 'left' as const,
    marginTop: 12,
  },
  detailsSummary: {
    cursor: 'pointer',
    fontSize: 13,
    color: '#94a3b8',
    userSelect: 'none' as const,
  },
  detailsContent: {
    marginTop: 8,
  },
  stackSection: {
    marginBottom: 12,
    fontSize: 12,
    color: '#475569',
  },
  stackPre: {
    background: '#f1f5f9',
    padding: 10,
    borderRadius: 6,
    overflow: 'auto',
    maxHeight: 200,
    fontSize: 11,
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  crashCount: {
    fontSize: 12,
    color: '#94a3b8',
    margin: '8px 0 0',
  },
};

export default ErrorBoundary;
