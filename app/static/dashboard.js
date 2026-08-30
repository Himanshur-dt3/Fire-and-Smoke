(() => {
  const csrfToken = document.body.dataset.csrfToken;
  const pollInterval = Number(document.body.dataset.pollInterval || 5000);
  const headers = { "X-CSRF-Token": csrfToken };

  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[character]);

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", ...options });
    if (response.status === 401) window.location.assign("/auth/login");
    const payload = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
    if (!response.ok) throw new Error(payload?.detail || "Request failed.");
    return payload;
  }

  function renderSummary(summary) {
    document.querySelector("#active-count").textContent = summary.active_alert_count;
    document.querySelector("#smoke-count").textContent = summary.event_counts.SMOKE_DETECTED || 0;
    document.querySelector("#fire-count").textContent = summary.event_counts.FIRE_DETECTED || 0;
    document.querySelector("#run-count").textContent = summary.active_runs.length;

    document.querySelector("#model-readiness").innerHTML = summary.models.map(model =>
      `<span class="badge ${model.status === "ready" ? "ready" : "not-ready"}"><strong>${escapeHtml(model.model_id)}</strong>: ${escapeHtml(model.status)} — ${escapeHtml(model.detail)}</span>`
    ).join("");

    const active = document.querySelector("#active-alerts");
    active.innerHTML = summary.active_alerts.length ? summary.active_alerts.map(event =>
      `<article class="alert-card"><strong>${escapeHtml(event.type)}</strong><br>${escapeHtml(event.camera)} · ${(event.confidence * 100).toFixed(1)}%<br><button data-event="${event.id}">Inspect alert</button></article>`
    ).join("") : `<p class="muted">No active alerts.</p>`;

    renderEvents(summary.recent_events);
  }

  function renderEvents(events) {
    const filter = document.querySelector("#event-filter").value;
    const rows = events.filter(event => !filter || event.type === filter).map(event =>
      `<tr><td>${new Date(event.triggered_at).toLocaleString()}</td><td>${escapeHtml(event.type)}</td><td>${escapeHtml(event.camera)}</td><td>${(event.confidence * 100).toFixed(1)}%</td><td>${escapeHtml(event.status)}</td><td><button class="secondary" data-event="${event.id}">Inspect</button></td></tr>`
    ).join("");
    document.querySelector("#event-history").innerHTML = rows || `<tr><td colspan="6" class="muted">No persisted events match this filter.</td></tr>`;
  }

  async function refresh() {
    try {
      const summary = await request("/api/dashboard/summary");
      window.latestSummary = summary;
      renderSummary(summary);
    } catch (error) {
      document.querySelector("#upload-status").textContent = error.message;
    }
  }

  async function inspectEvent(eventId) {
    const event = await request(`/api/events/${eventId}`);
    const detail = document.querySelector("#event-detail");
    const content = document.querySelector("#event-detail-content");
    detail.hidden = false;
    content.innerHTML = `<p><strong>${escapeHtml(event.type)}</strong> at ${escapeHtml(event.camera_identifier)} · ${(event.confidence * 100).toFixed(1)}%</p>
      <p>Status: ${escapeHtml(event.status)}. Trigger frame ${event.trigger_detection?.frame_number ?? "unavailable"} at ${event.trigger_detection?.frame_timestamp ?? "unavailable"} seconds.</p>
      ${event.evidence_id ? `<img alt="Annotated ${escapeHtml(event.type)} evidence" src="/api/evidence/${event.evidence_id}/content">` : "<p>Required evidence is unavailable.</p>"}
      ${event.status === "UNACKNOWLEDGED" ? `<p><button id="acknowledge-button" data-event="${event.id}">Acknowledge alert</button></p>` : `<p class="muted">Acknowledged by ${escapeHtml(event.acknowledged_by)}.</p>`}`;
    document.querySelector("#acknowledge-button")?.addEventListener("click", async (click) => {
      await request(`/api/events/${click.currentTarget.dataset.event}/acknowledge`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ note: null })
      });
      await inspectEvent(eventId); await refresh();
    });
  }

  document.querySelector("#upload-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.querySelector("#upload-status");
    const data = new FormData();
    data.append("camera_identifier", document.querySelector("#camera-identifier").value);
    data.append("file", document.querySelector("#media-file").files[0]);
    try {
      status.textContent = "Uploading private media…";
      const media = await request("/api/media/upload", { method: "POST", headers, body: data });
      status.textContent = "Queuing real model inference…";
      const run = await request("/api/processing/runs", {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ media_id: media.id, model_id: document.querySelector("#model-id").value, replay_mode: document.querySelector("#replay-mode").checked })
      });
      status.textContent = `Run ${run.id} is queued. The dashboard will show genuine progress or a safe failure state.`;
      await refresh();
    } catch (error) { status.textContent = error.message; }
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-event]");
    if (button) inspectEvent(button.dataset.event).catch(error => alert(error.message));
  });
  document.querySelector("#event-filter").addEventListener("change", () => renderEvents(window.latestSummary?.recent_events || []));
  document.querySelector("#logout-button").addEventListener("click", () => request("/auth/logout", { method: "POST", headers }).then(() => window.location.assign("/auth/login")));
  refresh();
  window.setInterval(refresh, pollInterval);
})();
