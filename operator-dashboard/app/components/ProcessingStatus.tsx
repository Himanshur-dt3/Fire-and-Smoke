"use client";

import { useEffect, useState } from "react";
import { backendRequest } from "../lib/backend";
import type { ProcessingRun } from "../lib/types";

interface ProcessingStatusProps {
  latestRun: ProcessingRun | null;
  runs: ProcessingRun[];
}

interface DetectionResult {
  id: string;
  label: string;
  confidence: number;
  frame_number: number;
  frame_timestamp: number;
  bounding_box?: unknown;
}

interface EventResult {
  id: string;
  type: string;
  confidence: number;
  status: string;
}

interface RunResults {
  run_id: string;
  status: string;
  detection_count: number;
  event_count: number;
  detections: DetectionResult[];
  events: EventResult[];
}

/**
 * Displays processing state and persisted inference results.
 */
export function ProcessingStatus({ latestRun, runs }: ProcessingStatusProps) {
  const displayedRuns =
    latestRun && !runs.some((run) => run.id === latestRun.id)
      ? [latestRun, ...runs]
      : runs;

  const [results, setResults] = useState<RunResults | null>(null);

  useEffect(() => {
    if (!latestRun) {
      setResults(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refresh = async () => {
      try {
        const response = await backendRequest<RunResults>(
          `/api/processing/runs/${latestRun.id}/results`
        );

        if (!cancelled) {
          setResults(response);
        }

        if (!cancelled && !["completed", "failed", "blocked"].includes(response.status)) {
          timer = setTimeout(refresh, 1000);
        }
      } catch {
        if (!cancelled) {
          timer = setTimeout(refresh, 2000);
        }
      }
    };

    void refresh();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [latestRun?.id, latestRun?.status]);

  return (
    <section className="panel" aria-labelledby="processing-title">
      <h2 id="processing-title">Processing status</h2>

      {displayedRuns.length === 0 ? (
        <p className="muted">
          No queued, running, or newly created processing attempts.
        </p>
      ) : (
        <div className="cards">
          {displayedRuns.map((run) => (
            <article className="run-item" key={run.id}>
              <div className="section-heading">
                <strong>{run.model_id}</strong>
                <span
                  className={`status-badge ${
                    run.status === "failed"
                      ? "status-failed"
                      : run.status === "completed"
                        ? "status-ready"
                        : "status-unavailable"
                  }`}
                >
                  {run.status}
                </span>
              </div>

              <p className="muted">
                Run {run.id} · {run.progress_percent}% complete ·{" "}
                {run.replay_mode ? "replay pacing" : "standard processing"}
              </p>

              {run.failure_code || run.error_message ? (
                <p className="notice">
                  {run.failure_code ?? run.error_message}
                </p>
              ) : null}

              {latestRun?.id === run.id && results ? (
                <div className="results-panel">
                  <div className="results-summary">
                    <div>
                      <strong>{results.detection_count}</strong>
                      <span>detections</span>
                    </div>
                    <div>
                      <strong>{results.event_count}</strong>
                      <span>events</span>
                    </div>
                  </div>

                  {results.detections.length > 0 ? (
                    <div className="detection-list">
                      <h3>Top detections</h3>

                      {results.detections.slice(0, 10).map((detection) => (
                        <div className="detection-row" key={detection.id}>
                          <strong>{detection.label.toUpperCase()}</strong>

                          <span>
                            {(detection.confidence * 100).toFixed(1)}%
                          </span>

                          <span>
                            Frame {detection.frame_number}
                          </span>

                          <span>
                            {detection.frame_timestamp.toFixed(2)}s
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">
                      Processing completed with no qualifying detections.
                    </p>
                  )}

                  {results.events.length > 0 ? (
                    <div className="detection-list">
                      <h3>Generated events</h3>

                      {results.events.map((event) => (
                        <div className="detection-row" key={event.id}>
                          <strong>{event.type}</strong>
                          <span>
                            {(event.confidence * 100).toFixed(1)}%
                          </span>
                          <span>{event.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">
                      No operational events were generated for this run.
                    </p>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
