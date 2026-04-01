"use client";

import { AlertTriangle } from "lucide-react";

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
          backgroundColor: "#FDFAF5",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center", width: "100%" }}>
          {/* Warning icon */}
          <div
            style={{
              margin: "0 auto 1.5rem",
              display: "flex",
              height: "5rem",
              width: "5rem",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "9999px",
              backgroundColor: "#FEF3C7",
            }}
          >
            <AlertTriangle
              style={{ height: "2.5rem", width: "2.5rem", color: "#C8912E" }}
            />
          </div>

          {/* Heading */}
          <h1
            style={{
              marginBottom: "0.75rem",
              fontSize: "1.875rem",
              fontWeight: 700,
              color: "#1B2A4A",
              fontFamily: "Georgia, serif",
            }}
          >
            Something went wrong
          </h1>

          {/* Error message */}
          <p
            style={{
              marginBottom: "2rem",
              color: "#6B7A99",
              lineHeight: 1.6,
            }}
          >
            {error.message ||
              "An unexpected error occurred. Please try again or return to the homepage."}
          </p>

          {/* Buttons */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.75rem",
            }}
          >
            <button
              onClick={reset}
              style={{
                borderRadius: "0.75rem",
                backgroundColor: "#C8912E",
                padding: "0.75rem 2rem",
                fontWeight: 600,
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Try Again
            </button>
            <a
              href="/"
              style={{
                borderRadius: "0.75rem",
                backgroundColor: "#fff",
                padding: "0.75rem 2rem",
                fontWeight: 600,
                color: "#1B2A4A",
                textDecoration: "none",
                fontSize: "1rem",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}
            >
              Go Home
            </a>
          </div>

          {/* Branding */}
          <p
            style={{
              marginTop: "4rem",
              fontSize: "0.875rem",
              color: "#A0AABB",
              fontFamily: "Georgia, serif",
            }}
          >
            VakayGo
          </p>
        </div>
      </body>
    </html>
  );
}
