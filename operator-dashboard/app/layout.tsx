import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Renewi Fire & Smoke Monitor",
  description: "Operator dashboard for authorized Fire & Smoke Detection POC media workflows."
};

interface RootLayoutProps {
  children: ReactNode;
}

/**
 * PUBLIC_INTERFACE
 * Provides the document structure and shared visual context for the operator dashboard.
 */
export default function RootLayout({ children }: Readonly<RootLayoutProps>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to dashboard content
        </a>
        {children}
      </body>
    </html>
  );
}
