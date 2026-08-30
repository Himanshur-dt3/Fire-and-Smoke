"use client";

import { useEffect, useState } from "react";

import { BackendRequestError, backendRequest } from "../lib/backend";
import type { DashboardEvent, EventDetail } from "../lib/types";

interface EventInspectorProps {
  event: DashboardEvent | null;
  onClose: () => void;
  onAcknowledged: () => void;
}

/**
 * PUBLIC_INTERFACE
 * Retrieves an authenticated event detail record and renders protected evidence only when the backend supplies it.
 */
export function EventInspector({ event, onClose, onAcknowledged }: EventInspectorProps) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEvent() {
      if (!event) {
        setDetail(null);
        return;
      }

      setMessage(null);
      try {
        const nextDetail = await backendRequest<EventDetail>(`/api/events/${event.id}`);
        if (!cancelled) {
          setDetail(nextDetail);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof BackendRequestError || error instanceof Error ? error.message : "Unable to load event detail.");
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
    if (!detail) {
      return;
    }

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
      setMessage(error instanceof BackendRequestError || error instanceof Error ? error.message : "Unable to acknowledge this event.");
    }
  }

  return (
    <section className="panel" aria-labelledby="event-inspector-title">
      <div className="section-heading">
        <h2 id="event-inspector-title">Alert evidence</h2>
        <button className="secondary" onClick={onClose} type="button">
          Close
        </button>
      </div>

      {message ? <p className="error-message">{message}</p> : null}
      {!detail && !message ? <p className="muted">Loading event detail…</p> : null}

      {detail ? (
        <>
          <div className="inspector-data">
            <p>
              <strong>{detail.type}</strong> at {detail.camera_identifier ?? "unavailable camera"} ·{" "}
              {(detail.confidence * 100).toFixed(1)}%
            </p>
            <p className="muted">
              Status: {detail.status}. Trigger frame {detail.trigger_detection?.frame_number ?? "unavailable"} at{" "}
              {detail.trigger_detection?.frame_timestamp ?? "unavailable"} seconds.
            </p>
            {detail.status === "UNACKNOWLEDGED" ? (
              <button onClick={() => void acknowledge()} type="button">
                Acknowledge alert
              </button>
            ) : (
              <p className="success-message">Acknowledged by {detail.acknowledged_by ?? "an operator"}.</p>
            )}
          </div>

          {detail.evidence_id ? (
            <img
              alt={`Protected annotated evidence for ${detail.type}`}
              className="evidence-image"
              src={`/backend/api/evidence/${detail.evidence_id}/content`}
            />
          ) : (
            <p className="notice">Protected evidence is unavailable for this persisted event.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
