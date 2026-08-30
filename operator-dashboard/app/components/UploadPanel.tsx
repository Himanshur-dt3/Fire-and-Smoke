"use client";

import { FormEvent, useMemo, useState } from "react";

import { BackendRequestError, backendRequest } from "../lib/backend";
import { isModelReady, type ModelReadiness, type ProcessingRun, type UploadedMedia } from "../lib/types";

interface UploadPanelProps {
  models: ModelReadiness[];
  onRunCreated: (run: ProcessingRun) => void;
}

/**
 * PUBLIC_INTERFACE
 * Uploads authorized media and requests a traceable backend processing attempt through the proxy.
 */
export function UploadPanel({ models, onRunCreated }: UploadPanelProps) {
  const defaultModel = useMemo(() => models[0]?.model_id ?? "dfire", [models]);
  const [cameraIdentifier, setCameraIdentifier] = useState("");
  const [modelId, setModelId] = useState(defaultModel);
  const [replayMode, setReplayMode] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState("No media queued.");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedFile) {
      setMessage("Choose an authorized image or video before uploading.");
      return;
    }

    setIsSubmitting(true);
    setMessage("Uploading private media…");

    try {
      const formData = new FormData();
      formData.append("camera_identifier", cameraIdentifier);
      formData.append("file", selectedFile);

      const media = await backendRequest<UploadedMedia>(
        "/api/media/upload",
        {
          method: "POST",
          body: formData
        },
        true
      );

      setMessage("Creating a traceable processing attempt…");
      const run = await backendRequest<ProcessingRun>(
        "/api/processing/runs",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            media_id: media.id,
            model_id: modelId,
            replay_mode: replayMode
          })
        },
        true
      );

      onRunCreated(run);
      setMessage(
        run.status === "blocked"
          ? `Run ${run.id} was retained as blocked: ${run.failure_code ?? "MODEL_NOT_READY"}. No inference output was created.`
          : `Run ${run.id} was created. Its persisted processing state is shown below.`
      );
    } catch (error) {
      setMessage(error instanceof BackendRequestError || error instanceof Error ? error.message : "Unable to queue media.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="upload-title">
      <h2 id="upload-title">Upload authorized media</h2>
      <form className="form-grid" onSubmit={handleSubmit}>
        <label htmlFor="camera-identifier">
          Logical camera identifier
          <input
            id="camera-identifier"
            maxLength={128}
            onChange={(event) => setCameraIdentifier(event.target.value)}
            placeholder="CAM-01"
            required
            value={cameraIdentifier}
          />
        </label>

        <label htmlFor="media-file">
          Image or video
          <input
            accept="image/jpeg,image/png,video/mp4,video/quicktime,video/x-msvideo"
            id="media-file"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            required
            type="file"
          />
        </label>

        <label htmlFor="model-id">
          Configured model
          <select id="model-id" onChange={(event) => setModelId(event.target.value)} value={modelId}>
            {models.length > 0 ? (
              models.map((model) => (
                <option key={model.model_id} value={model.model_id}>
                  {model.model_id} {isModelReady(model) ? "(ready)" : `(${model.status ?? model.code ?? "unavailable"})`}
                </option>
              ))
            ) : (
              <>
                <option value="dfire">D-Fire</option>
                <option value="pyronear">Pyronear</option>
              </>
            )}
          </select>
        </label>

        <label className="inline-field" htmlFor="replay-mode">
          <input
            checked={replayMode}
            id="replay-mode"
            onChange={(event) => setReplayMode(event.target.checked)}
            type="checkbox"
          />
          Replay video with simulated-live pacing
        </label>

        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Submitting…" : "Upload and request real inference"}
        </button>
      </form>

      <p aria-live="polite" className="muted">
        {message}
      </p>
    </section>
  );
}
