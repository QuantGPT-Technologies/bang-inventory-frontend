import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bang Inventory — Production Tracker",
  description: "Powder Metallurgy Factory Production Line Tracking System",
};

// Runs before paint so the correct theme is applied on first render -- otherwise the page would
// flash light before the ThemeToggle's client-side effect could read localStorage and switch it.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('bang-theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
