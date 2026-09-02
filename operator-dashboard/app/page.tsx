"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { backendRequest, formatBackendTimestamp } from "./lib/backend";
import type { DashboardEvent, ModelReadiness, ProcessingRun } from "./lib/types";
import { EventInspector } from "./components/EventInspector";
import { UploadPanel } from "./components/UploadPanel";

type Summary = Record<string, unknown>;

function numberValue(summary: Summary, ...keys: string[]) {
  for (const key of keys) {
    const value = summary[key];
    if (typeof value === "number") return value;
  }
  return 0;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary>({});
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [models, setModels] = useState<ModelReadiness[]>([]);
  const [runs, setRuns] = useState<ProcessingRun[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<DashboardEvent | null>(null);

  const loadingRef = useRef(false);

  async function load() {
    // Prevent multiple dashboard refreshes from running at the same time.
    if (loadingRef.current) {
      return;
    }

    loadingRef.current = true;

    try {
      const [summaryResponse, eventsResponse] = await Promise.all([
        backendRequest<Summary>("/api/dashboard/summary"),
        backendRequest<{ items?: DashboardEvent[] }>("/api/events")
      ]);

      setSummary(summaryResponse);
      setEvents(eventsResponse.items ?? []);

      try {
        const modelResponse = await backendRequest<{ items?: ModelReadiness[] }>(
          "/api/models/readiness"
        );
        setModels(modelResponse.items ?? []);
      } catch {
        setModels([]);
      }

      try {
        const runResponse = await backendRequest<{ items?: ProcessingRun[] }>(
          "/api/processing/runs"
        );
        setRuns(runResponse.items ?? []);
      } catch {
        setRuns([]);
      }
    } catch {
      // Individual dashboard panels handle unavailable backend data.
    } finally {
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    void load();

    const interval = window.setInterval(() => {
      void load();
    }, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const activeAlerts = numberValue(
    summary,
    "active_alerts",
    "active_alert_count",
    "active"
  );

  const eventCounts =
    summary.event_counts &&
    typeof summary.event_counts === "object"
      ? (summary.event_counts as Record<string, unknown>)
      : {};

  const smokeEvents =
    typeof eventCounts.SMOKE_DETECTED === "number"
      ? eventCounts.SMOKE_DETECTED
      : 0;

  const fireEvents =
    typeof eventCounts.FIRE_DETECTED === "number"
      ? eventCounts.FIRE_DETECTED
      : 0;

  const processIngest = runs.length;

  const recentEvents = events.slice(0, 5);

  const runningRuns = runs.filter(
    (run) => run.status === "running" || run.status === "queued"
  );

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">OPERATIONS OVERVIEW</div>
          <h1>Fire & Smoke Monitoring</h1>
          <p>
            Real-time operational overview of authorized detection workflows.
          </p>
        </div>

        <div className="page-badge">
          <span className="badge-dot" />
          POC / AUTHORIZED MEDIA
        </div>
      </div>

      <section className="metric-grid">
        <MetricCard
          href="/alerts"
          label="ACTIVE"
          value={activeAlerts}
          caption="ALERTS"
          danger={activeAlerts > 0}
        />
        <MetricCard
          href="/events"
          label="SMOKE"
          value={smokeEvents}
          caption="EVENTS"
        />
        <MetricCard
          href="/events"
          label="FIRE"
          value={fireEvents}
          caption="EVENTS"
          danger={fireEvents > 0}
        />
        <MetricCard
          href="/processing"
          label="PROCESS"
          value={processIngest}
          caption="INGEST"
        />
      </section>

      <section className="overview-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">SYSTEM</div>
              <h2>Model readiness</h2>
            </div>
            <Link className="panel-link" href="/models">
              View models ?
            </Link>
          </div>

          {models.length === 0 ? (
            <div className="empty-state compact">
              Model readiness unavailable.
            </div>
          ) : (
            <div className="readiness-mini-list">
              {models.map((model) => {
                const ready =
                  model.code === "MODEL_READY" ||
                  model.status === "ready";

                return (
                  <div className="readiness-mini" key={model.model_id}>
                    <div>
                      <strong>{model.model_id}</strong>
                      <span>{model.detail}</span>
                    </div>
                    <span
                      className={`status-pill ${
                        ready ? "ready" : "unavailable"
                      }`}
                    >
                      {ready
                        ? "READY"
                        : model.code ?? model.status ?? "UNAVAILABLE"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-kicker">OPERATIONS</div>
              <h2>Processing</h2>
            </div>
            <Link className="panel-link" href="/processing">
              View runs ?
            </Link>
          </div>

          {runningRuns.length === 0 ? (
            <div className="empty-state compact">
              No queued or running processing attempts.
            </div>
          ) : (
            <div className="processing-mini-list">
              {runningRuns.slice(0, 3).map((run) => (
                <div className="processing-mini" key={run.id}>
                  <div>
                    <strong>{run.model_id}</strong>
                    <span>Run {run.id}</span>
                  </div>

                  <div className="progress-area">
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(0, run.progress_percent)
                          )}%`
                        }}
                      />
                    </div>

                    <strong>{run.progress_percent}%</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <UploadPanel
        models={models}
        onRunCreated={(run) => {
          setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
          void load();
        }}
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">MONITORING</div>
            <h2>Recent event history</h2>
          </div>

          <Link className="panel-link" href="/events">
            View all events ?
          </Link>
        </div>

        {recentEvents.length === 0 ? (
          <div className="empty-state">
            No persisted backend events are currently available.
          </div>
        ) : (
          <div className="event-table">
            <div className="event-row event-header">
              <span>TIME</span>
              <span>TYPE</span>
              <span>CAMERA</span>
              <span>CONFIDENCE</span>
              <span>STATUS</span>
              <span />
            </div>

            {recentEvents.map((event) => (
              <div className="event-row" key={event.id}>
                <span>
                  {formatBackendTimestamp(event.triggered_at)}
                </span>

                <span
                  className={
                    event.type.includes("FIRE")
                      ? "fire-text"
                      : "smoke-text"
                  }
                >
                  {event.type.includes("FIRE") ? "FIRE" : "SMOKE"}
                </span>

                <span>
                  {event.camera ?? event.camera_identifier ?? "â€”"}
                </span>

                <span>
                  {Number.isFinite(event.confidence)
                    ? `${(event.confidence * 100).toFixed(1)}%`
                    : "â€”"}
                </span>

                <span>
                  <span
                    className={`table-status ${
                      event.status === "ACKNOWLEDGED" ? "ack" : "active"
                    }`}
                  >
                    {event.status}
                  </span>
                </span>

                <span>
                  <button
                    className="table-action"
                    onClick={() => setSelectedEvent(event)}
                    type="button"
                  >
                    Inspect
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="quick-actions">
<Link href="/alerts" className="action-card">
          <span className="action-icon alert-icon">!</span>
          <div>
            <strong>Review Alerts</strong>
            <span>
              Inspect persisted detections and evidence
            </span>
          </div>
          <span>?</span>
        </Link>
      </section>

      <EventInspector
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onAcknowledged={() => void load()}
      />
    </div>
  );
}

function MetricCard({
  href,
  label,
  value,
  caption,
  danger
}: {
  href: string;
  label: string;
  value: number;
  caption: string;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`metric-card ${danger ? "danger" : ""}`}
      aria-label={`View ${label.toLowerCase()} ${caption.toLowerCase()}`}
    >
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <span className="metric-caption">{caption}</span>
    </Link>
  );
}









