import type { ProcessingRun } from "../lib/types";

interface ProcessingStatusProps {
  latestRun: ProcessingRun | null;
  runs: ProcessingRun[];
}

/**
 * PUBLIC_INTERFACE
 * Displays active and newly created processing runs without inventing progress or inference results.
 */
export function ProcessingStatus({ latestRun, runs }: ProcessingStatusProps) {
  const displayedRuns = latestRun && !runs.some((run) => run.id === latestRun.id) ? [latestRun, ...runs] : runs;

  return (
    <section className="panel" aria-labelledby="processing-title">
      <h2 id="processing-title">Processing status</h2>

      {displayedRuns.length === 0 ? (
        <p className="muted">No queued, running, or newly created processing attempts.</p>
      ) : (
        <div className="cards">
          {displayedRuns.map((run) => (
            <article className="run-item" key={run.id}>
              <div className="section-heading">
                <strong>{run.model_id}</strong>
                <span className={`status-badge ${run.status === "failed" ? "status-failed" : "status-unavailable"}`}>
                  {run.status}
                </span>
              </div>
              <p className="muted">
                Run {run.id} · {run.progress_percent}% complete · {run.replay_mode ? "replay pacing" : "standard processing"}
              </p>
              {run.failure_code || run.error_message ? (
                <p className="notice">{run.failure_code ?? run.error_message}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
