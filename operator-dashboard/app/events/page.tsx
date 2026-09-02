"use client";

import { useEffect, useState } from "react";
import { EventHistory } from "../components/EventHistory";
import { EventInspector } from "../components/EventInspector";
import { backendRequest } from "../lib/backend";
import type { DashboardEvent } from "../lib/types";

export default function EventsPage() {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<DashboardEvent | null>(null);

  async function loadEvents() {
    try {
      const response = await backendRequest<{ items?: DashboardEvent[] }>("/api/events");
      setEvents(response.items ?? []);
    } catch {
      setEvents([]);
    }
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MONITORING</div>
          <h1>Event History</h1>
          <p>Review persisted fire and smoke detection events.</p>
        </div>
      </div>

      <EventHistory
        events={events}
        onInspect={setSelectedEvent}
        onAcknowledged={() => void loadEvents()}
        onDeleted={() => void loadEvents()}
      />

      <EventInspector
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onAcknowledged={() => void loadEvents()}
      />
    </div>
  );
}




