import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NBA prop dashboard",
  description: "Personal 2026–27 points, rebounds, and points-plus-rebounds projections.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
