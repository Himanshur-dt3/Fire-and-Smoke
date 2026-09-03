"use client";

import { useEffect, useState } from "react";

import { BackendRequestError, backendRequest } from "../lib/backend";
import type { DashboardEvent, EventDetail } from "../lib/types";

interface EventInspectorProps {
  event: DashboardEvent | null;
  onClose: () => void;
  onAcknowledged: () => void;
}

interface OperationalSettings {
  persistence_frames?: number;
}

/**
 * PUBLIC_INTERFACE
 * Retrieves an authenticated event detail record and renders an
 * enterprise-style incident investigation view without changing
 * the underlying event/evidence APIs.
 */
export function EventInspector({ event, onClose, onAcknowledged }: EventInspectorProps) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [persistenceFrames, setPersistenceFrames] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadEvent() {
      if (!event) {
        setDetail(null);
        setPersistenceFrames(null);
        return;
      }

      setMessage(null);
      setDetail(null);

      try {
        const [nextDetail, settings] = await Promise.all([
          backendRequest<EventDetail>(`/api/events/${event.id}`),
          backendRequest<OperationalSettings>("/api/settings")
        ]);

        if (!cancelled) {
          setDetail(nextDetail);
          setPersistenceFrames(
            typeof settings.persistence_frames === "number"
              ? settings.persistence_frames
              : null
          );
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof BackendRequestError || error instanceof Error
              ? error.message
              : "Unable to load event detail."
          );
        }
      }
    }

    void loadEvent();

    return () => {
      cancelled = true;
    };
  }, [event]);

  if (!event) {
    return null;
  }

  async function acknowledge() {
    if (!detail || acknowledging) {
      return;
    }

    setAcknowledging(true);
    setMessage(null);

    try {
      const updated = await backendRequest<EventDetail>(
        `/api/events/${detail.id}/acknowledge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: null })
        },
        true
      );

      setDetail(updated);
      onAcknowledged();
    } catch (error) {
      setMessage(
        error instanceof BackendRequestError || error instanceof Error
          ? error.message
          : "Unable to acknowledge this event."
      );
    } finally {
      setAcknowledging(false);
    }
  }

  const isFire = detail?.type === "FIRE_DETECTED";
  const isActive = detail?.status === "UNACKNOWLEDGED";

  const eventLabel = detail?.type === "FIRE_DETECTED"
    ? "FIRE DETECTED"
    : detail?.type === "SMOKE_DETECTED"
      ? "SMOKE DETECTED"
      : "EVENT";

  const camera = detail?.camera_identifier ?? detail?.camera ?? "Unavailable";

  const confidence =
    typeof detail?.confidence === "number"
      ? `${(detail.confidence * 100).toFixed(1)}%`
      : "Unavailable";

  const triggeredAt = detail?.triggered_at
    ? formatDateTime(detail.triggered_at)
    : "Unavailable";

  const triggerFrame =
    detail?.trigger_detection?.frame_number !== undefined
      ? String(detail.trigger_detection.frame_number)
      : "Unavailable";

  const frameTimestamp =
    detail?.trigger_detection?.frame_timestamp !== undefined
      ? `${detail.trigger_detection.frame_timestamp.toFixed(2)}s`
      : "Unavailable";

  const model =
    detail?.trigger_detection?.model_identifier ?? "Unavailable";

  const persistence =
    persistenceFrames !== null
      ? `${persistenceFrames} frame${persistenceFrames === 1 ? "" : "s"}`
      : "Configured rule";

  return (
    <section
      className={`event-inspector ${isFire ? "event-inspector-fire" : "event-inspector-smoke"}`}
      aria-labelledby="event-inspector-title"
    >
      <header className="incident-header">
        <div className="incident-header-main">
          <div className="incident-kicker">
            <span className={`incident-status-dot ${isActive ? "is-active" : "is-acknowledged"}`} />
            EVENT / {detail?.type ?? event.type}
          </div>

          <h2 id="event-inspector-title">
            {eventLabel}
          </h2>

          <p>
            AI-detected safety event requiring operator review and acknowledgement.
          </p>
        </div>

        <div className="incident-header-actions">
          <span className={`incident-status ${isActive ? "status-active" : "status-acknowledged"}`}>
            {isActive ? "ACTIVE ALERT" : "ACKNOWLEDGED"}
          </span>

          <button
            className="incident-close"
            onClick={onClose}
            type="button"
            aria-label="Close event investigation"
          >
            <span aria-hidden="true">×</span>
            Close
          </button>
        </div>
      </header>

      {message ? (
        <div className="incident-error" role="alert">
          {message}
        </div>
      ) : null}

      {!detail && !message ? (
        <div className="incident-loading">
          <div className="incident-loading-pulse" />
          <div>
            <strong>Loading event evidence</strong>
            <span>Retrieving protected incident details…</span>
          </div>
        </div>
      ) : null}

      {detail ? (
        <>
          <div className="incident-summary">
            <div className="incident-summary-item">
              <span>CAMERA</span>
              <strong>{camera}</strong>
            </div>

            <div className="incident-summary-item">
              <span>TRIGGERED</span>
              <strong>{triggeredAt}</strong>
            </div>

            <div className="incident-summary-item incident-summary-confidence">
              <span>CONFIDENCE</span>
              <strong>{confidence}</strong>
            </div>

            <div className="incident-summary-item">
              <span>PERSISTENCE</span>
              <strong>{persistence}</strong>
            </div>
          </div>

          <div className="incident-workspace">
            <div className="incident-evidence-column">
              <div className="incident-section-label">
                <span>01</span>
                ANNOTATED EVIDENCE
              </div>

              <div className="evidence-frame">
                <div className="evidence-frame-toolbar">
                  <span className="evidence-live-indicator">
                    <span />
                    PROTECTED EVIDENCE
                  </span>

                  <span>
                    FRAME {triggerFrame}
                  </span>
                </div>

                {detail.evidence_id ? (
                  <div className="evidence-image-wrap">
                    <img
                      alt={`Protected annotated evidence for ${eventLabel}`}
                      className="evidence-image"
                      src={`/backend/api/evidence/${detail.evidence_id}/content`}
                    />

                    <div className="evidence-corner evidence-corner-tl" />
                    <div className="evidence-corner evidence-corner-tr" />
                    <div className="evidence-corner evidence-corner-bl" />
                    <div className="evidence-corner evidence-corner-br" />
                  </div>
                ) : (
                  <div className="evidence-unavailable">
                    <div className="evidence-unavailable-icon">!</div>
                    <strong>Evidence unavailable</strong>
                    <span>
                      The persisted event does not currently have an associated
                      evidence snapshot.
                    </span>
                  </div>
                )}

                <div className="evidence-frame-footer">
                  <span>Trigger timestamp</span>
                  <strong>{frameTimestamp}</strong>
                </div>
              </div>
            </div>

            <aside className="incident-details-column">
              <div className="incident-section-label">
                <span>02</span>
                EVENT DETAILS
              </div>

              <div className="detail-card">
                <div className="detail-card-heading">
                  <div>
                    <span>Detection intelligence</span>
                    <strong>Incident telemetry</strong>
                  </div>

                  <span className="detail-severity-mark">
                    {isFire ? "F" : "S"}
                  </span>
                </div>

                <div className="detail-grid">
                  <div className="detail-row">
                    <span>Model</span>
                    <strong>{model}</strong>
                  </div>

                  <div className="detail-row">
                    <span>Detection</span>
                    <strong>{eventLabel}</strong>
                  </div>

                  <div className="detail-row">
                    <span>Frame</span>
                    <strong>{triggerFrame}</strong>
                  </div>

                  <div className="detail-row">
                    <span>Confidence</span>
                    <strong className="detail-confidence">{confidence}</strong>
                  </div>

                  <div className="detail-row">
                    <span>Persistence</span>
                    <strong>{persistence}</strong>
                  </div>

                  <div className="detail-row">
                    <span>Status</span>
                    <strong>
                      <span className={`detail-status ${isActive ? "active" : "acknowledged"}`}>
                        <span />
                        {detail.status}
                      </span>
                    </strong>
                  </div>
                </div>
              </div>

              <div className="incident-action-card">
                <div className="action-card-heading">
                  <span>Operator action</span>

                  <span className={`action-status ${isActive ? "pending" : "complete"}`}>
                    {isActive ? "ACTION REQUIRED" : "COMPLETE"}
                  </span>
                </div>

                {isActive ? (
                  <>
                    <p>
                      Review the annotated evidence before acknowledging this
                      detection. The acknowledgement is recorded against the
                      persisted event.
                    </p>

                    <button
                      className={`acknowledge-incident ${isFire ? "acknowledge-fire" : "acknowledge-smoke"}`}
                      onClick={() => void acknowledge()}
                      type="button"
                      disabled={acknowledging}
                    >
                      <span className="acknowledge-icon" aria-hidden="true">
                        ✓
                      </span>

                      <span>
                        {acknowledging ? "Acknowledging…" : "Acknowledge Alert"}
                      </span>

                      <span className="acknowledge-arrow" aria-hidden="true">
                        →
                      </span>
                    </button>
                  </>
                ) : (
                  <div className="acknowledged-message">
                    <span className="acknowledged-check">✓</span>

                    <div>
                      <strong>Alert acknowledged</strong>
                      <span>
                        {detail.acknowledged_by
                          ? `Acknowledged by ${detail.acknowledged_by}.`
                          : "This event has been acknowledged by an operator."}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="incident-meta">
                <span>EVENT ID</span>
                <code>{detail.id}</code>
              </div>
            </aside>
          </div>
        </>
      ) : null}
    </section>
  );
}

function formatDateTime(value: string): string {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Unavailable";
  }

  return timestamp.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
