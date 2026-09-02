"use client";

import { useEffect, useState } from "react";
import { backendRequest, formatBackendTimestamp } from "../lib/backend";
import type { DashboardEvent } from "../lib/types";
import { EventInspector } from "../components/EventInspector";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<DashboardEvent[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<DashboardEvent | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadAlerts() {
    try {
      const response = await backendRequest<{
        items?: DashboardEvent[];
      }>("/api/events");

      const active = (response.items ?? []).filter(
        (event) => event.status === "UNACKNOWLEDGED"
      );

      setAlerts(active);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAlerts();

    const timer = window.setInterval(() => {
      void loadAlerts();
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MONITORING</div>
          <h1>Active Alerts</h1>
          <p>
            Review and acknowledge persisted fire and smoke alerts.
          </p>
        </div>

        <div className="page-badge">
          <span className="badge-dot" />
          {alerts.length} ACTIVE
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">ALERTS</div>
            <h2>Unacknowledged alerts</h2>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            Loading active alertsâ€¦
          </div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            No active alerts. All operational events are acknowledged.
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

            {alerts.map((alert) => (
              <div className="event-row" key={alert.id}>
                <span>
                  {formatBackendTimestamp(alert.triggered_at)}
                </span>

                <span
                  className={
                    alert.type.includes("FIRE")
                      ? "fire-text"
                      : "smoke-text"
                  }
                >
                  {alert.type.includes("FIRE") ? "FIRE" : "SMOKE"}
                </span>

                <span>
                  {alert.camera ?? alert.camera_identifier ?? "â€”"}
                </span>

                <span>
                  {Number.isFinite(alert.confidence)
                    ? `${(alert.confidence * 100).toFixed(1)}%`
                    : "â€”"}
                </span>

                <span>
                  <span className="table-status active">
                    {alert.status}
                  </span>
                </span>

                <span>
                  <button
                    className="table-action"
                    onClick={() => setSelectedAlert(alert)}
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

      <EventInspector
        event={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onAcknowledged={() => {
          setSelectedAlert(null);
          void loadAlerts();
        }}
      />
    </div>
  );
}

