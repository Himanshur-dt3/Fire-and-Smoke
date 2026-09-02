import type { Metadata } from "next";
import "./globals.css";
import AppShell from "./AppShell";

export const metadata: Metadata = {
  title: "Renewi Fire & Smoke Monitor",
  description: "Renewi Fire & Smoke Operations Console"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
