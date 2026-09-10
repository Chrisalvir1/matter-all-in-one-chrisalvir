import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../style.css";

// Global uncaught error catcher to ensure screen never silently goes black
window.addEventListener("error", (e) => {
  console.error("[Matter AIO Frontend Error]", e.error || e.message);
  const root = document.getElementById("root");
  if (root && root.children.length === 0) {
    root.innerHTML = `
      <div style="padding: 40px; color: #f8fafc; font-family: sans-serif; text-align: center;">
        <h2 style="color: #f87171;">Error al cargar la interfaz</h2>
        <p style="color: #94a3b8; font-size: 14px;">${e.message || "Error desconocido"}</p>
        <button onclick="window.location.reload()" style="margin-top: 16px; padding: 8px 16px; background: #0284c7; color: white; border: none; border-radius: 8px; cursor: pointer;">
          Reintentar
        </button>
      </div>
    `;
  }
});

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("[Matter AIO ErrorBoundary]", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: "#f8fafc", fontFamily: "sans-serif", textAlign: "center" }}>
          <h2 style={{ color: "#f87171" }}>Error en la aplicación</h2>
          <p style={{ color: "#94a3b8", fontSize: 14 }}>{String(this.state.error?.message || this.state.error)}</p>
          {this.state.error?.stack && (
            <details style={{ marginTop: 12, textAlign: "left", background: "rgba(0,0,0,0.3)", padding: 12, borderRadius: 8, fontSize: 12, color: "#cbd5e1", maxWidth: 600, margin: "12px auto" }}>
              <summary style={{ cursor: "pointer", color: "#38bdf8" }}>Ver detalles técnicos</summary>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", marginTop: 8 }}>{this.state.error.stack}</pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 16, padding: "8px 16px", background: "#0284c7", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

