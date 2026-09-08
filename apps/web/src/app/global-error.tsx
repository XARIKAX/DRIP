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
          background: "#0A0510",
          color: "#F1EBFF",
          fontFamily: "'Instrument Sans', 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: "100%",
            border: "1px solid rgba(233,224,255,0.12)",
            borderRadius: 20,
            background: "#150A24",
            padding: 32,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", color: "#AC85FB" }}>
            SOMETHING BROKE
          </div>
          <h1 style={{ margin: "12px 0 0", fontSize: 30, letterSpacing: "-0.03em" }}>
            The app hit an error
          </h1>
          <p
            style={{
              marginTop: 20,
              padding: 16,
              border: "1px solid rgba(233,224,255,0.08)",
              borderRadius: 12,
              background: "#1D1030",
              color: "#A99BC4",
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
              border: "1px solid #AC85FB",
              borderRadius: 9999,
              background: "#AC85FB",
              color: "#0A0510",
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
