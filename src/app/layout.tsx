import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DB Designer",
  description: "Design database schemas as ERDs, import and export SQL and JSON.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
