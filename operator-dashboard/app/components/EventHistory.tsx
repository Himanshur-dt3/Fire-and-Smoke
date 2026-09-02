"use client";

import { useMemo, useState } from "react";

import { BackendRequestError, backendRequest, formatBackendTimestamp } from "../lib/backend";
import type { DashboardEvent } from "../lib/types";

interface EventHistoryProps {
  events: DashboardEvent[];
  onInspect: (event: DashboardEvent) => void;
  onAcknowledged: () => void;
  onDeleted: () => void;
}

/**
 * PUBLIC_INTERFACE
 * Lists persisted events with local camera/type/state filters and sends CSRF-protected acknowledgements.
 */
export function EventHistory({ events, onInspect, onAcknowledged, onDeleted }: EventHistoryProps) {
  const [eventType, setEventType] = useState("");
  const [cameraFilter, setCameraFilter] = useState("");
  const [eventStatus, setEventStatus] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const camera = event.camera ?? event.camera_identifier ?? "";
        return (
          (!eventType || event.type === eventType) &&
          (!eventStatus || event.status === eventStatus) &&
          (!cameraFilter || camera.toLowerCase().includes(cameraFilter.toLowerCase()))
        );
      }),
    [cameraFilter, eventStatus, eventType, events]
  );

  async function deleteEvent(event: DashboardEvent) {
    const confirmed = window.confirm(
      `Delete this ${event.type.replace("_DETECTED", "").toLowerCase()} detection event? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await backendRequest<{ deleted: boolean }>(
        `/api/events/${event.id}`,
        {
          method: "DELETE",
        }
      );

      setMessage(`Event ${event.id} was deleted.`);
      onDeleted();
    } catch (error) {
      setMessage(
        error instanceof BackendRequestError
          ? error.message
          : "The event could not be deleted."
      );
    }
  }
  async function acknowledge(event: DashboardEvent) {
    setMessage(null);
    try {
      await backendRequest<DashboardEvent>(
        `/api/events/${event.id}/acknowledge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: null })
        },
        true
      );
      setMessage(`Event ${event.id} was acknowledged.`);
      onAcknowledged();
    } catch (error) {
      setMessage(error instanceof BackendRequestError || error instanceof Error ? error.message : "Unable to acknowledge the event.");
    }
  }

  return (
    <section className="panel" aria-labelledby="event-history-title">
      <div className="section-heading">
        <div>
          <h2 id="event-history-title">Event history</h2>
          <p className="muted">Only persisted backend event records are shown.</p>
        </div>
      </div>

      <div className="filter-grid" aria-label="Event filters">
        <label htmlFor="event-type-filter">
          Event type
          <select id="event-type-filter" onChange={(event) => setEventType(event.target.value)} value={eventType}>
            <option value="">All event types</option>
            <option value="SMOKE_DETECTED">Smoke</option>
            <option value="FIRE_DETECTED">Fire</option>
          </select>
        </label>

        <label htmlFor="camera-filter">
          Camera
          <input
            id="camera-filter"
            onChange={(event) => setCameraFilter(event.target.value)}
            placeholder="Filter camera"
            value={cameraFilter}
          />
        </label>

        <label htmlFor="event-status-filter">
          Alert status
          <select id="event-status-filter" onChange={(event) => setEventStatus(event.target.value)} value={eventStatus}>
            <option value="">All states</option>
            <option value="UNACKNOWLEDGED">Unacknowledged</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
          </select>
        </label>
      </div>

      {message ? <p className={message.includes("acknowledged") ? "success-message" : "error-message"}>{message}</p> : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Type</th>
              <th scope="col">Camera</th>
              <th scope="col">Confidence</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.length > 0 ? (
              filteredEvents.map((event) => (
                <tr key={event.id}>
                  <td>{formatBackendTimestamp(event.triggered_at)}</td>
                  <td>{event.type}</td>
                  <td>{event.camera ?? event.camera_identifier ?? "Unavailable"}</td>
                  <td>{formatConfidence(event.confidence)}</td>
                  <td>{event.status}</td>
                  <td>
                    <button className="secondary" onClick={() => onInspect(event)} type="button">
                      Inspect
                    </button>{" "}
                    {event.status === "UNACKNOWLEDGED" ? (
                      <button onClick={() => void acknowledge(event)} type="button">
                        Acknowledge
                      </button>
                    ) : null}{" "}
                    <button
                      className="danger"
                      onClick={() => void deleteEvent(event)}
                      type="button"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="muted" colSpan={6}>
                  No persisted events match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatConfidence(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "Unavailable";
}












