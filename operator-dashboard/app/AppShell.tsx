"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { backendRequest, logout } from "./lib/backend";

const navigation = [
  { href: "/", label: "Dashboard", icon: "⌂", section: "OVERVIEW" },
  { href: "/alerts", label: "Alerts", icon: "⚠", section: "MONITORING" },
  { href: "/events", label: "Events", icon: "◉", section: "MONITORING" },
  { href: "/processing", label: "Processing", icon: "⚙", section: "OPERATIONS" },
  { href: "/models", label: "Models", icon: "◆", section: "ANALYTICS" },
  { href: "/settings", label: "Settings", icon: "⚙", section: "SYSTEM" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (pathname === "/login") {
      setAuthenticated(true);
      return;
    }

    let cancelled = false;

    async function checkSession() {
      try {
        const session = await backendRequest<{ authenticated?: boolean }>("/api/auth/session");

        if (!cancelled) {
          if (!session.authenticated) {
            router.replace("/login");
          } else {
            setAuthenticated(true);
          }
        }
      } catch {
        if (!cancelled) {
          router.replace("/login");
        }
      }
    }

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  async function handleLogout() {
    setSigningOut(true);

    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (authenticated === null) {
    return (
      <div className="app-loading">
        <div className="loading-mark">R</div>
        <span>Loading operations consoleâ€¦</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">R</div>
          <div>
            <div className="brand-name">RENEWI</div>
            <div className="brand-subtitle">Fire & Smoke Operations</div>
          </div>
        </div>

        <div className="sidebar-status">
          <span className="online-dot" />
          <span>ONLINE</span>
          <small>Operator</small>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {["OVERVIEW", "MONITORING", "OPERATIONS", "ANALYTICS", "SYSTEM"].map((section) => {
            const items = navigation.filter((item) => item.section === section);

            return (
              <div className="nav-group" key={section}>
                <div className="nav-group-title">{section}</div>

                {items.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/" && pathname.startsWith(item.href));

                  return (
                    <button
                      className={`nav-item ${active ? "active" : ""}`}
                      key={item.href}
                      onClick={() => router.push(item.href)}
                      type="button"
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="environment">
            <span className="environment-dot" />
            <div>
              <strong>POC ENVIRONMENT</strong>
              <small>Authorized media only</small>
            </div>
          </div>

          <button
            className="signout-button"
            disabled={signingOut}
            onClick={() => void handleLogout()}
            type="button"
          >
            {signingOut ? "Signing outâ€¦" : "Sign out"}
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="breadcrumb">RENEWI / FIRE & SMOKE</div>
            <div className="topbar-title">Operations Console</div>
          </div>

          <div className="topbar-right">
            <span className="live-indicator">
              <span className="online-dot" />
              SYSTEM ONLINE
            </span>
            <span className="operator-label">OPERATOR</span>
          </div>
        </header>

        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}



