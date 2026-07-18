import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bang Inventory — Production Tracker",
  description: "Powder Metallurgy Factory Production Line Tracking System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
