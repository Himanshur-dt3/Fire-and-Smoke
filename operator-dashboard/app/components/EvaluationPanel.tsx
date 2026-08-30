"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { BackendRequestError, backendRequest } from "../lib/backend";
import type { EvaluationResponse } from "../lib/types";

/**
 * PUBLIC_INTERFACE
 * Creates a backend evaluation record from real run identifiers and displays persisted evaluation history with source-supported metrics.
 */
export function EvaluationPanel() {
  const [name, setName] = useState("");
  const [runIds, setRunIds] = useState("");
  const [manifestReference, setManifestReference] = useState("");
  const [labelSummary, setLabelSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [history, setHistory] = useState<EvaluationResponse[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const response = await backendRequest<{ items: EvaluationResponse[] }>("/api/evaluations");
      setHistory(response.items ?? []);
    } catch {
      // Evaluation history optional load
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedRunIds = runIds
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (normalizedRunIds.length === 0) {
      setMessage("Provide at least one persisted processing run identifier.");
      return;
    }

    let labels: Record<string, unknown> | null = null;
    if (labelSummary.trim()) {
      try {
        const parsed: unknown = JSON.parse(labelSummary);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error("not an object");
        }
        labels = parsed as Record<string, unknown>;
      } catch {
        setMessage("The optional label summary must be a valid JSON object.");
        return;
      }
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await backendRequest<EvaluationResponse>(
        "/api/evaluations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            run_ids: normalizedRunIds,
            manifest_reference: manifestReference || null,
            labels,
            notes: notes || null
          })
        },
        true
      );
      setResult(response);
      setMessage("Evaluation record saved.");
      await loadHistory();
    } catch (error) {
      setMessage(error instanceof BackendRequestError || error instanceof Error ? error.message : "Unable to create evaluation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function applyPreset(preset: "negative" | "positive") {
    if (preset === "negative") {
      setLabelSummary(JSON.stringify({ is_negative: true }, null, 2));
      if (!name) {
        setName("Negative Footage Evaluation");
      }
    } else {
      setLabelSummary(
        JSON.stringify(
          {
            true_positives: 1,
            false_positives: 0,
            false_negatives: 0,
            onset_seconds: 2.0
          },
          null,
          2
        )
      );
      if (!name) {
        setName("Labelled Model Benchmark");
      }
    }
  }

  return (
    <section className="panel" aria-labelledby="evaluation-title">
      <h2 id="evaluation-title">Evaluation records</h2>
      <p className="muted">Store comparison context for actual runs. Do not use this POC to infer unsupported performance metrics.</p>

      <form className="form-grid" onSubmit={handleSubmit}>
        <label htmlFor="evaluation-name">
          Evaluation name
          <input id="evaluation-name" onChange={(event) => setName(event.target.value)} required value={name} />
        </label>

        <label htmlFor="evaluation-run-ids">
          Processing run identifiers
          <input
            id="evaluation-run-ids"
            onChange={(event) => setRunIds(event.target.value)}
            placeholder="run-id-1, run-id-2"
            required
            value={runIds}
          />
        </label>

        <label htmlFor="evaluation-manifest">
          Labelled manifest reference (optional)
          <input
            id="evaluation-manifest"
            onChange={(event) => setManifestReference(event.target.value)}
            value={manifestReference}
          />
        </label>

        <div>
          <div className="section-heading">
            <label htmlFor="evaluation-label-summary">Label summary JSON (optional)</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="secondary" onClick={() => applyPreset("negative")} type="button">
                Preset: Negative Clip
              </button>
              <button className="secondary" onClick={() => applyPreset("positive")} type="button">
                Preset: Labelled Onset
              </button>
            </div>
          </div>
          <textarea
            aria-describedby="evaluation-label-summary-help"
            id="evaluation-label-summary"
            onChange={(event) => setLabelSummary(event.target.value)}
            placeholder='{"is_negative": true} OR {"true_positives": 1, "false_positives": 0, "false_negatives": 0, "onset_seconds": 2.0}'
            rows={4}
            value={labelSummary}
          />
          <span className="muted" id="evaluation-label-summary-help">
            {"Use `{\"is_negative\": true}` for negative clip FP testing, or supply labelled manifest metrics (`true_positives`, `onset_seconds`)."}
          </span>
        </div>

        <label htmlFor="evaluation-notes">
          Notes (optional)
          <textarea id="evaluation-notes" onChange={(event) => setNotes(event.target.value)} value={notes} />
        </label>

        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving…" : "Create evaluation record"}
        </button>
      </form>

      {message ? <p className={result ? "success-message" : "error-message"}>{message}</p> : null}
      {result ? (
        <pre aria-label="Returned source-supported evaluation metrics">{JSON.stringify(result.metrics, null, 2)}</pre>
      ) : null}

      {history.length > 0 ? (
        <div style={{ marginTop: "1.5rem" }}>
          <h3>Persisted Evaluation History</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Runs</th>
                  <th scope="col">Status</th>
                  <th scope="col">Events / FPs</th>
                  <th scope="col">Time-to-Detect</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => {
                  const m = item.metrics ?? {};
                  const fp = m.false_positive_count !== undefined && m.false_positive_count !== null ? String(m.false_positive_count) : "—";
                  const ttd = m.time_to_detect_seconds !== undefined && m.time_to_detect_seconds !== null ? `${m.time_to_detect_seconds}s` : "—";
                  return (
                    <tr key={item.id}>
                      <td>{item.name ?? item.id}</td>
                      <td>{item.run_ids?.join(", ") ?? "—"}</td>
                      <td>{String(m.status ?? "stored")}</td>
                      <td>Events: {String(m.actual_event_count ?? 0)} | FPs: {fp}</td>
                      <td>{ttd}</td>
                      <td>{new Date(item.created_at).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
