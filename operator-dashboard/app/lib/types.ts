export interface SessionState {
  authenticated: boolean;
  username?: string;
  csrf_token?: string;
}

export interface ModelReadiness {
  model_id: string;
  status?: string;
  code?: string;
  detail: string;
}

export interface DashboardEvent {
  id: string;
  type: "SMOKE_DETECTED" | "FIRE_DETECTED";
  status: "UNACKNOWLEDGED" | "ACKNOWLEDGED";
  camera?: string;
  camera_id?: string;
  camera_identifier?: string | null;
  confidence: number;
  triggered_at: string;
  evidence_id?: string | null;
}

export interface ProcessingRun {
  id: string;
  model_id: string;
  status: "queued" | "running" | "completed" | "failed" | "blocked";
  progress_percent: number;
  replay_mode: boolean;
  error_message?: string | null;
  failure_code?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

export interface DashboardSummary {
  active_alert_count: number;
  event_counts: Record<string, number>;
  active_alerts: DashboardEvent[];
  recent_events: DashboardEvent[];
  active_runs: ProcessingRun[];
  models: ModelReadiness[];
}

export interface EventDetail extends DashboardEvent {
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  trigger_detection?: {
    frame_number: number;
    frame_timestamp: number;
    label: string;
    confidence: number;
    bounding_box: Record<string, number> | number[];
    model_identifier: string;
  } | null;
}

export interface UploadedMedia {
  id: string;
  camera_id: string;
  camera_identifier: string;
  media_kind: "image" | "video";
  duration_seconds?: number | null;
  width: number;
  height: number;
  status: string;
}

export interface EvaluationResponse {
  id: string;
  name?: string;
  run_ids?: string[];
  manifest_reference?: string | null;
  metrics: Record<string, unknown>;
  notes?: string | null;
  created_at: string;
}

/**
 * PUBLIC_INTERFACE
 * Converts backend readiness values into the exact safe state labels rendered to operators.
 */
export function modelReadinessCode(model: ModelReadiness): string {
  const backendCode = model.code ?? model.status ?? "MODEL_NOT_READY";

  if (backendCode === "ready") {
    return "MODEL_READY";
  }
  if (backendCode === "not_configured") {
    return "MODEL_NOT_CONFIGURED";
  }
  if (backendCode === "not_ready") {
    return "MODEL_NOT_READY";
  }

  return backendCode;
}

/**
 * PUBLIC_INTERFACE
 * Identifies readiness values that permit actual server-side inference.
 */
export function isModelReady(model: ModelReadiness): boolean {
  return modelReadinessCode(model) === "MODEL_READY";
}
