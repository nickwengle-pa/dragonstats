import { Component, type ReactNode } from "react";

/** Last-resort catch so a render/chunk error shows a reload card instead of a
 *  silent black screen (the app renders nothing without this). */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            background: "#070a0f",
            color: "#fff",
            fontFamily: "'Barlow', system-ui, sans-serif",
            padding: 24,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, color: "#8892a4", maxWidth: 420, wordBreak: "break-word" }}>
            {String(this.state.error.message ?? this.state.error)}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: "12px 28px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1,
              color: "#fff",
              background: "linear-gradient(135deg, #dc2626, #b91c1c)",
            }}
          >
            Reload
          </button>
          <div style={{ fontSize: 11, color: "#555" }}>
            Your recorded plays are saved — reloading will not lose data.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
