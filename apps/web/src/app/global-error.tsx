"use client";

/**
 * Last resort boundary: catches errors thrown in the root layout itself, where
 * error.tsx cannot reach. Must render its own html and body, and must not depend on
 * anything that could be the thing that just broke, so the styling is inline.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#06080A",
          color: "#F3F6F8",
          fontFamily: "Archivo, 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: "100%",
            border: "1px solid rgba(255,255,255,0.10)",
            background: "#0B0E11",
            padding: 32,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", color: "#35C2DB" }}>
            SOMETHING BROKE
          </div>
          <h1 style={{ margin: "12px 0 0", fontSize: 30, letterSpacing: "-0.03em" }}>
            The app hit an error
          </h1>
          <p
            style={{
              marginTop: 20,
              padding: 16,
              border: "1px solid rgba(255,255,255,0.06)",
              background: "#101418",
              color: "#8B949C",
              fontFamily: "'IBM Plex Mono', Menlo, monospace",
              fontSize: 13,
              wordBreak: "break-word",
            }}
          >
            {error.message || "Unknown client error"}
            {error.digest ? ` (digest ${error.digest})` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 24,
              border: "1px solid #35C2DB",
              background: "#35C2DB",
              color: "#04060A",
              padding: "12px 20px",
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
