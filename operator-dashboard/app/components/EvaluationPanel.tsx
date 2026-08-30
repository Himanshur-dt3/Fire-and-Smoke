"use client";

import { FormEvent, useState } from "react";

import { BackendRequestError, backendRequest } from "../lib/backend";
import type { EvaluationResponse } from "../lib/types";

/**
 * PUBLIC_INTERFACE
 * Creates a backend evaluation record from real run identifiers and displays only returned source-supported metrics.
 */
export function EvaluationPanel() {
  const [name, setName] = useState("");
  const [runIds, setRunIds] = useState("");
  const [manifestReference, setManifestReference] = useState("");
  const [labelSummary, setLabelSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setMessage("Evaluation record saved. Metrics remain unavailable unless supported by supplied labels.");
    } catch (error) {
      setMessage(error instanceof BackendRequestError || error instanceof Error ? error.message : "Unable to create evaluation.");
    } finally {
      setIsSubmitting(false);
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

        <label htmlFor="evaluation-label-summary">
          Label summary JSON (optional)
          <textarea
            aria-describedby="evaluation-label-summary-help"
            id="evaluation-label-summary"
            onChange={(event) => setLabelSummary(event.target.value)}
            placeholder='{"true_positives": 0, "false_positives": 0, "false_negatives": 0, "onset_seconds": 0, "event_seconds": 0}'
            value={labelSummary}
          />
          <span className="muted" id="evaluation-label-summary-help">
            Supply only values derived from an authorised labelled manifest. Leave empty when labels are unavailable.
          </span>
        </label>

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
    </section>
  );
}
