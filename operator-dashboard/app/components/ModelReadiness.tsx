import { modelReadinessCode, type ModelReadiness as ModelReadinessState } from "../lib/types";

interface ModelReadinessProps {
  models: ModelReadinessState[];
}

/**
 * PUBLIC_INTERFACE
 * Displays actual backend model readiness and makes unavailable local models visible to operators.
 */
export function ModelReadiness({ models }: ModelReadinessProps) {
  return (
    <section className="panel" aria-labelledby="model-readiness-title">
      <h2 id="model-readiness-title">Configured model readiness</h2>

      {models.length === 0 ? (
        <p className="muted">Loading configured model state…</p>
      ) : (
        <div className="readiness-list">
          {models.map((model) => {
            const code = modelReadinessCode(model);
            const ready = code === "MODEL_READY";

            return (
              <article className="readiness-item" key={model.model_id}>
                <div>
                  <strong>{model.model_id}</strong>
                  <p className="muted">{model.detail}</p>
                </div>
                <span className={`status-badge ${ready ? "status-ready" : "status-unavailable"}`}>{code}</span>
              </article>
            );
          })}
        </div>
      )}

      <p className="notice">
        A model that is not configured or not ready prevents real inference only. Upload, operational history, and prior evidence
        workflows remain available; this dashboard never generates substitute detections, events, or evidence.
      </p>
    </section>
  );
}
