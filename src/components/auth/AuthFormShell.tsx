import type { ReactNode } from "react";

// Centered, narrow auth surface per 02-UI-SPEC Teacher Auth contract:
// max-width 400px, Secondary (#FFFFFF) panel, 1px Border, 8px radius, 24px pad.
export function AuthFormShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#F7F8FA",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#111827",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#FFFFFF",
          border: "1px solid #D1D5DB",
          borderRadius: 8,
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            lineHeight: 1.2,
            margin: "0 0 16px",
          }}
        >
          {title}
        </h1>
        {children}
        {footer ? (
          <div style={{ marginTop: 16, fontSize: 14, color: "#4B5563" }}>
            {footer}
          </div>
        ) : null}
      </section>
    </main>
  );
}
