"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { backendRequest } from "../lib/backend";

type SettingsResponse = {
  allowed_media_types?: string[];
  max_upload_bytes?: number;
  sample_fps?: number;
  confidence_threshold?: number;
  persistence_frames?: number;
  event_cooldown_seconds?: number;
  replay_speed_multiplier?: number;
  dashboard_poll_interval_seconds?: number;
  model_ids?: string[];
  poc_boundary?: string;
};

type SettingItem = {
  key: string;
  label: string;
  description: string;
  value: string;
  rawValue?: string;
  category: "detection" | "processing" | "media" | "system";
};

const categoryMeta = {
  detection: {
    number: "01",
    label: "Detection intelligence",
    description: "Parameters controlling model sensitivity and event triggering."
  },
  processing: {
    number: "02",
    label: "Processing behaviour",
    description: "Runtime timing and replay controls used by the POC worker."
  },
  media: {
    number: "03",
    label: "Media policy",
    description: "Authorized input formats and upload constraints."
  },
  system: {
    number: "04",
    label: "System configuration",
    description: "Dashboard polling and configured inference models."
  }
};

function formatBytes(bytes?: number) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${Number(value.toFixed(value >= 10 ? 0 : 1))} ${units[index]}`;
}

function formatPercent(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value?: number, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value}${suffix}`;
}

function formatDate(value: Date | null) {
  if (!value) return "Not refreshed yet";

  return value.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function prettyKey(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [copiedKey, setCopiedKey] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    detection: true,
    processing: true,
    media: true,
    system: true
  });

  const loadSettings = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const response = await backendRequest<SettingsResponse>("/api/settings");
      setSettings(response);
      setLastUpdated(new Date());
    } catch {
      setError("Operational settings could not be loaded from the API.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const items = useMemo<SettingItem[]>(() => {
    if (!settings) return [];

    return [
      {
        key: "confidence_threshold",
        label: "Confidence threshold",
        description: "Minimum model confidence required before a detection is accepted.",
        value: formatPercent(settings.confidence_threshold),
        rawValue: String(settings.confidence_threshold ?? ""),
        category: "detection"
      },
      {
        key: "persistence_frames",
        label: "Persistence frames",
        description: "Consecutive frames required to establish a persistent event.",
        value: formatNumber(settings.persistence_frames, " frames"),
        rawValue: String(settings.persistence_frames ?? ""),
        category: "detection"
      },
      {
        key: "sample_fps",
        label: "Sample rate",
        description: "Video sampling frequency used during media processing.",
        value: formatNumber(settings.sample_fps, " FPS"),
        rawValue: String(settings.sample_fps ?? ""),
        category: "processing"
      },
      {
        key: "event_cooldown_seconds",
        label: "Event cooldown",
        description: "Minimum cooldown period between repeated event triggers.",
        value: formatNumber(settings.event_cooldown_seconds, " sec"),
        rawValue: String(settings.event_cooldown_seconds ?? ""),
        category: "processing"
      },
      {
        key: "replay_speed_multiplier",
        label: "Replay speed",
        description: "Playback multiplier used when replaying uploaded media.",
        value: formatNumber(settings.replay_speed_multiplier, "×"),
        rawValue: String(settings.replay_speed_multiplier ?? ""),
        category: "processing"
      },
      {
        key: "max_upload_bytes",
        label: "Maximum upload size",
        description: "Maximum media payload accepted by the upload workflow.",
        value: formatBytes(settings.max_upload_bytes),
        rawValue: String(settings.max_upload_bytes ?? ""),
        category: "media"
      },
      {
        key: "allowed_media_types",
        label: "Allowed media types",
        description: "MIME types authorized for the image/video POC workflow.",
        value: (settings.allowed_media_types ?? []).join(", "),
        rawValue: (settings.allowed_media_types ?? []).join(", "),
        category: "media"
      },
      {
        key: "dashboard_poll_interval_seconds",
        label: "Dashboard refresh interval",
        description: "Interval used by the dashboard to refresh operational state.",
        value: formatNumber(settings.dashboard_poll_interval_seconds, " sec"),
        rawValue: String(settings.dashboard_poll_interval_seconds ?? ""),
        category: "system"
      },
      {
        key: "model_ids",
        label: "Configured models",
        description: "Inference models currently registered with the runtime.",
        value: (settings.model_ids ?? []).join(", "),
        rawValue: (settings.model_ids ?? []).join(", "),
        category: "system"
      }
    ];
  }, [settings]);

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) return items;

    return items.filter((item) =>
      `${item.key} ${item.label} ${item.description} ${item.value}`
        .toLowerCase()
        .includes(normalized)
    );
  }, [items, query]);

  const groupedItems = useMemo(() => {
    return {
      detection: filteredItems.filter((item) => item.category === "detection"),
      processing: filteredItems.filter((item) => item.category === "processing"),
      media: filteredItems.filter((item) => item.category === "media"),
      system: filteredItems.filter((item) => item.category === "system")
    };
  }, [filteredItems]);

  const copyValue = async (item: SettingItem) => {
    const value = item.rawValue ?? item.value;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(item.key);
      window.setTimeout(() => setCopiedKey(""), 1600);
    } catch {
      setCopiedKey("");
    }
  };

  const toggleSection = (category: keyof typeof categoryMeta) => {
    setOpenSections((current) => ({
      ...current,
      [category]: !current[category]
    }));
  };

  const modelCount = settings?.model_ids?.length ?? 0;
  const mediaCount = settings?.allowed_media_types?.length ?? 0;

  return (
    <section className="settings-page-shell" aria-labelledby="settings-title">
      <div className="settings-command-bar">
        <div className="settings-command-copy">
          <span className="settings-eyebrow">SYSTEM / CONFIGURATION</span>
          <h2 id="settings-title">Operational Settings</h2>
          <p>
            Review the sanitized runtime configuration currently served by the
            Fire &amp; Smoke API.
          </p>
        </div>

        <div className="settings-command-actions">
          <div className="settings-sync-status">
            <span className="settings-live-dot" />
            <div>
              <strong>API CONFIGURATION</strong>
              <span>Last sync: {formatDate(lastUpdated)}</span>
            </div>
          </div>

          <button
            type="button"
            className="settings-refresh-button"
            onClick={() => void loadSettings(true)}
            disabled={loading || refreshing}
          >
            <span className={refreshing ? "settings-spinner" : ""}>↻</span>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="settings-metrics">
        <div className="settings-metric-card">
          <span className="settings-metric-icon">◉</span>
          <div>
            <span className="settings-metric-label">Detection threshold</span>
            <strong>
              {formatPercent(settings?.confidence_threshold)}
            </strong>
            <small>Model acceptance threshold</small>
          </div>
        </div>

        <div className="settings-metric-card">
          <span className="settings-metric-icon">▣</span>
          <div>
            <span className="settings-metric-label">Persistence</span>
            <strong>
              {formatNumber(settings?.persistence_frames, " frames")}
            </strong>
            <small>Required consecutive frames</small>
          </div>
        </div>

        <div className="settings-metric-card">
          <span className="settings-metric-icon">◫</span>
          <div>
            <span className="settings-metric-label">Media policy</span>
            <strong>{mediaCount}</strong>
            <small>Authorized media formats</small>
          </div>
        </div>

        <div className="settings-metric-card">
          <span className="settings-metric-icon">◇</span>
          <div>
            <span className="settings-metric-label">Model registry</span>
            <strong>{modelCount}</strong>
            <small>Configured inference models</small>
          </div>
        </div>
      </div>

      <div className="settings-toolbar">
        <div className="settings-search">
          <span>⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search configuration…"
            aria-label="Search operational settings"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="settings-toolbar-meta">
          <span>{filteredItems.length} parameters</span>
          <span className="settings-readonly-badge">READ ONLY</span>
        </div>
      </div>

      {error ? (
        <div className="settings-error" role="alert">
          <div className="settings-error-icon">!</div>
          <div>
            <strong>Configuration unavailable</strong>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadSettings(true)}
            disabled={refreshing}
          >
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="settings-loading">
          <div className="settings-loading-spinner" />
          <strong>Loading operational configuration</strong>
          <span>Connecting to the authenticated API…</span>
        </div>
      ) : (
        <div className="settings-sections">
          {(Object.keys(categoryMeta) as Array<keyof typeof categoryMeta>).map(
            (category) => {
              const meta = categoryMeta[category];
              const categoryItems = groupedItems[category];
              const isOpen = openSections[category];

              if (query && categoryItems.length === 0) return null;

              return (
                <section
                  className="settings-section-card"
                  key={category}
                  aria-labelledby={`settings-${category}`}
                >
                  <button
                    type="button"
                    className="settings-section-header"
                    onClick={() => toggleSection(category)}
                    aria-expanded={isOpen}
                  >
                    <div className="settings-section-heading">
                      <span className="settings-section-number">
                        {meta.number}
                      </span>
                      <div>
                        <h3 id={`settings-${category}`}>{meta.label}</h3>
                        <p>{meta.description}</p>
                      </div>
                    </div>

                    <div className="settings-section-controls">
                      <span className="settings-section-count">
                        {categoryItems.length}
                      </span>
                      <span className="settings-chevron">
                        {isOpen ? "⌃" : "⌄"}
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="settings-section-body">
                      {categoryItems.length === 0 ? (
                        <div className="settings-empty">No matching parameters.</div>
                      ) : (
                        categoryItems.map((item) => (
                          <div className="settings-row" key={item.key}>
                            <div className="settings-row-info">
                              <span className="settings-row-key">
                                {item.key}
                              </span>
                              <strong>{item.label}</strong>
                              <p>{item.description}</p>
                            </div>

                            <div className="settings-row-value">
                              {item.key === "allowed_media_types" ? (
                                <div className="settings-chip-list">
                                  {(settings?.allowed_media_types ?? []).map(
                                    (type) => (
                                      <span
                                        className="settings-value-chip"
                                        key={type}
                                      >
                                        {type}
                                      </span>
                                    )
                                  )}
                                </div>
                              ) : item.key === "model_ids" ? (
                                <div className="settings-model-list">
                                  {(settings?.model_ids ?? []).map((model) => (
                                    <span
                                      className="settings-model-chip"
                                      key={model}
                                    >
                                      <span className="settings-model-dot" />
                                      {model}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <strong>{item.value}</strong>
                              )}

                              <button
                                type="button"
                                className="settings-copy-button"
                                onClick={() => void copyValue(item)}
                                title="Copy configuration value"
                                aria-label={`Copy ${item.label}`}
                              >
                                {copiedKey === item.key ? "✓" : "⧉"}
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </section>
              );
            }
          )}

          {query && filteredItems.length === 0 && (
            <div className="settings-no-results">
              <span>⌕</span>
              <strong>No configuration matched</strong>
              <p>Try another search term or clear the filter.</p>
              <button type="button" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}
        </div>
      )}

      {settings?.poc_boundary && (
        <div className="settings-boundary">
          <div className="settings-boundary-mark">i</div>
          <div>
            <span className="settings-boundary-label">
              AUTHORIZED POC BOUNDARY
            </span>
            <strong>{settings.poc_boundary}</strong>
            <p>
              Sensitive runtime values remain server-side and are intentionally
              excluded from this operator view.
            </p>
          </div>
        </div>
      )}

      <div className="settings-footer">
        <span>
          Configuration source: <strong>authenticated API</strong>
        </span>
        <span>
          Interface mode: <strong>sanitized / read-only</strong>
        </span>
        <span>
          Refresh: <strong>on demand</strong>
        </span>
      </div>
    </section>
  );
}
