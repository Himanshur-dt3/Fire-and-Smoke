"use client";

import { useEffect, useState } from "react";

import { BackendRequestError, backendRequest } from "../lib/backend";

/**
 * PUBLIC_INTERFACE
 * Displays only the backend-provided sanitized configuration view for operator awareness.
 */
export function SettingsPanel() {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("Loading sanitized runtime settings…");

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const response = await backendRequest<Record<string, unknown>>("/api/settings");
        if (!cancelled) {
          setSettings(response);
          setMessage("");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error instanceof BackendRequestError || error instanceof Error
              ? error.message
              : "Sanitized settings are unavailable."
          );
        }
      }
    }

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="panel" aria-labelledby="settings-title">
      <h2 id="settings-title">Operational settings</h2>
      <p className="muted">
        The API controls all runtime configuration. Secrets, password hashes, model paths, storage keys, and filesystem locations
        are never shown here.
      </p>

      {settings ? (
        <dl>
          {Object.entries(settings).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "Configured"}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="muted">{message}</p>
      )}
    </section>
  );
}
