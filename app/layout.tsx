import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReceiveRight — Every delivery, accounted for",
  description: "Receive orders, reconcile damage and shortages, and keep a clear record of every delivery.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
