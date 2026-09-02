"use client";

import { useEffect, useState } from "react";
import { UploadPanel } from "../components/UploadPanel";
import { backendRequest } from "../lib/backend";
import type { ModelReadiness, ProcessingRun } from "../lib/types";

const TERMINAL_STATUSES = new Set(["completed", "failed", "blocked"]);

export default function UploadPage() {
  const [models, setModels] = useState<ModelReadiness[]>([]);
  const [latestRun, setLatestRun] = useState<ProcessingRun | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await backendRequest<{ items?: ModelReadiness[] }>(
          "/api/models/readiness"
        );
        setModels(response.items ?? []);
      } catch {
        setModels([]);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    if (!latestRun || TERMINAL_STATUSES.has(latestRun.status)) {
      return;
    }

    let cancelled = false;

    const refreshRun = async () => {
      try {
        const run = await backendRequest<ProcessingRun>(
          `/api/processing/runs/${latestRun.id}`
        );

        if (!cancelled) {
          setLatestRun(run);
        }

        if (!cancelled && !TERMINAL_STATUSES.has(run.status)) {
          window.setTimeout(refreshRun, 1000);
        }
      } catch {
        if (!cancelled) {
          window.setTimeout(refreshRun, 2000);
        }
      }
    };

    const timer = window.setTimeout(refreshRun, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [latestRun?.id, latestRun?.status]);

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">MEDIA INGESTION</div>
          <h1>Upload Media</h1>
          <p>Submit authorized image or video media for processing.</p>
        </div>
      </div>

      <UploadPanel
        models={models}
        onRunCreated={setLatestRun}
      />

      {latestRun ? (
        <div className="panel">
          <div className="panel-kicker">LATEST REQUEST</div>
          <h2>Processing request created</h2>
          <p className="muted">
            Run {latestRun.id} · {latestRun.status}
          </p>

          {latestRun.status === "queued" || latestRun.status === "running" ? (
            <p className="muted">
              Processing is active. Status will update automatically.
              {typeof latestRun.progress_percent === "number"
                ? ` ${latestRun.progress_percent}% complete.`
                : ""}
            </p>
          ) : null}

          {latestRun.status === "completed" ? (
            <p className="muted">
              Processing completed successfully — 100%.
            </p>
          ) : null}

          {latestRun.status === "failed" ? (
            <p className="muted">
              Processing failed:{" "}
              {latestRun.error_message ?? latestRun.failure_code ?? "Unknown error"}
            </p>
          ) : null}

          {latestRun.status === "blocked" ? (
            <p className="muted">
              Processing was blocked:{" "}
              {latestRun.failure_code ?? "MODEL_NOT_READY"}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
