import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught render error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearCache = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "24px",
            background: "var(--bg, #09101f)",
            color: "var(--text, #f2f6ff)",
            fontFamily: "var(--font, system-ui, sans-serif)",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              maxWidth: 580,
              width: "100%",
              background: "rgba(20, 31, 53, 0.85)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(251, 132, 150, 0.35)",
              borderRadius: 16,
              padding: 28,
              boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ fontSize: 20, margin: "0 0 8px 0", color: "#fb8496" }}>
              Error al cargar la interfaz
            </h2>
            <p style={{ fontSize: 13, color: "var(--muted, #9aa9c2)", margin: "0 0 20px 0" }}>
              Se produjo una excepción inesperada durante la inicialización visual. Puedes
              intentar recargar o restablecer los datos guardados en caché local.
            </p>

            {this.state.error && (
              <div
                style={{
                  textAlign: "left",
                  background: "rgba(0, 0, 0, 0.35)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 20,
                  maxHeight: 180,
                  overflowY: "auto",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fca5a5" }}>
                  {this.state.error.name}: {this.state.error.message}
                </div>
                {this.state.error.stack && (
                  <pre
                    style={{
                      fontSize: 10,
                      color: "rgba(255, 255, 255, 0.6)",
                      margin: "8px 0 0 0",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                  color: "#ffffff",
                  border: "none",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ↻ Recargar interfaz
              </button>
              <button
                onClick={this.handleClearCache}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  background: "rgba(255, 255, 255, 0.08)",
                  color: "var(--text, #f2f6ff)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                🧹 Limpiar caché local
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
