"use client";

import { useEffect, useState } from "react";

import { BackendRequestError, backendRequest } from "../lib/backend";
import { ModelReadiness as ModelReadinessPanel } from "../components/ModelReadiness";
import type { ModelReadiness } from "../lib/types";

export default function ModelsPage() {
  const [models, setModels] = useState<ModelReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadModels() {
    setLoading(true);
    setMessage("");

    try {
      const response = await backendRequest<{ items?: ModelReadiness[] }>(
        "/api/models/readiness"
      );

      setModels(response.items ?? []);
    } catch (error) {
      if (error instanceof BackendRequestError && error.status === 401) {
        setMessage("Authentication is required.");
      } else {
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load model readiness."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadModels();
  }, []);

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ANALYTICS</div>
          <h1>Models</h1>
          <p>
            View the configured AI models and their current backend readiness.
          </p>
        </div>

        <button
          className="secondary"
          onClick={() => void loadModels()}
          disabled={loading}
          type="button"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {message ? <p className="error-message">{message}</p> : null}

      <ModelReadinessPanel models={models} />
    </div>
  );
}
