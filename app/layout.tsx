import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codex Companion",
  description: "Ask a Destiny 2 question, get an answer with its sources attached.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
