"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { EventHistory } from "./components/EventHistory";
import { EventInspector } from "./components/EventInspector";
import { EvaluationPanel } from "./components/EvaluationPanel";
import { ModelReadiness } from "./components/ModelReadiness";
import { ProcessingStatus } from "./components/ProcessingStatus";
import { SettingsPanel } from "./components/SettingsPanel";
import { UploadPanel } from "./components/UploadPanel";
import { BackendRequestError, backendRequest, getSession, logout } from "./lib/backend";
import type { DashboardEvent, DashboardSummary, ProcessingRun } from "./lib/types";

const POLL_INTERVAL_MS = 5_000;

/**
 * PUBLIC_INTERFACE
 * Renders the authenticated operator dashboard and refreshes persisted state while the page is visible.
 */
export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<DashboardEvent | null>(null);
  const [latestRun, setLatestRun] = useState<ProcessingRun | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [operatorName, setOperatorName] = useState("");

  const loadSummary = useCallback(async () => {
    try {
      const nextSummary = await backendRequest<DashboardSummary>("/api/dashboard/summary");
      setSummary(nextSummary);
      setErrorMessage(null);
    } catch (error) {
      if (error instanceof BackendRequestError && error.status === 401) {
        router.replace("/login");
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Unable to refresh operational state.");
    }
  }, [router]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function initialize() {
      try {
        const session = await getSession();
        if (!session.authenticated || disposed) {
          router.replace("/login");
          return;
        }
        setOperatorName(session.username ?? "operator");
        await loadSummary();
      } catch {
        if (!disposed) {
          router.replace("/login");
        }
      }
    }

    function scheduleRefresh() {
      if (disposed) {
        return;
      }

      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") {
          await loadSummary();
        }
        scheduleRefresh();
      }, POLL_INTERVAL_MS);
    }

    void initialize();
    scheduleRefresh();

    return () => {
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [loadSummary, router]);

  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  }

  return (
    <>
      <header className="dashboard-header">
        <div>
          <p className="brand-eyebrow">Renewi POC</p>
          <h1 className="brand-title">Fire &amp; Smoke Monitor</h1>
        </div>
        <div className="operator-actions">
          <span className="muted">Signed in as {operatorName || "…"}</span>
          <button className="secondary" onClick={() => void handleLogout()} type="button">
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard-main" id="main-content">
        <section className="boundary" aria-label="POC operating boundary">
          <strong>POC boundary:</strong> This workflow handles authorized image and video uploads only. It does not connect to
          live Renewi CCTV, replace fire-safety systems, make site-performance claims, or establish model licence clearance.
        </section>

        {errorMessage ? (
          <p className="error-message" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <section className="metrics-grid" aria-label="Operational summary">
          <article className="metric-card">
            <span>Active alerts</span>
            <strong>{summary?.active_alert_count ?? "—"}</strong>
          </article>
          <article className="metric-card">
            <span>Smoke events</span>
            <strong>{summary?.event_counts.SMOKE_DETECTED ?? "—"}</strong>
          </article>
          <article className="metric-card">
            <span>Fire events</span>
            <strong>{summary?.event_counts.FIRE_DETECTED ?? "—"}</strong>
          </article>
          <article className="metric-card">
            <span>Active processing</span>
            <strong>{summary?.active_runs.length ?? "—"}</strong>
          </article>
        </section>

        <ModelReadiness models={summary?.models ?? []} />
        <UploadPanel models={summary?.models ?? []} onRunCreated={setLatestRun} />
        <ProcessingStatus latestRun={latestRun} runs={summary?.active_runs ?? []} />
        <EventHistory
          events={summary?.recent_events ?? []}
          onInspect={(event) => setSelectedEvent(event)}
          onAcknowledged={() => void loadSummary()}
        />
        <EventInspector event={selectedEvent} onClose={() => setSelectedEvent(null)} onAcknowledged={() => void loadSummary()} />

        <section className="two-column-grid">
          <SettingsPanel />
          <EvaluationPanel />
        </section>
      </main>
    </>
  );
}
