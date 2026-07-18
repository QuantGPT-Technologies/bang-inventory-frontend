'use client';
import { useEffect } from 'react';

export default function GlobalRootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled root error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ textAlign: 'center', maxWidth: 380 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700 }}>Application error</h1>
            <p style={{ fontSize: 14, color: '#666', marginTop: 8 }}>
              A critical error occurred. Please try reloading the page.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: 24,
                padding: '8px 16px',
                background: '#8b2e00',
                color: 'white',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
