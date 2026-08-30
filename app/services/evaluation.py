"""Evaluation helpers that never estimate unsupported metrics."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Event, ProcessingRun


class EvaluationError(ValueError):
    """Raised when an evaluation is not grounded in completed runs."""


def calculate_metrics(db: Session, run_ids: list[str], labels: dict[str, object] | None) -> dict[str, object]:
    """Calculate only metrics that supplied labels or ground-truth flags explicitly support."""
    runs = list(db.scalars(select(ProcessingRun).where(ProcessingRun.id.in_(run_ids))))
    if len(runs) != len(set(run_ids)) or any(run.status != "completed" for run in runs):
        raise EvaluationError("Every selected run must exist and be completed.")

    events = list(db.scalars(select(Event).where(Event.run_id.in_(run_ids))))

    runs_info = [
        {
            "id": run.id,
            "model_id": run.model_identifier,
            "sample_fps": run.configuration.get("sample_fps"),
            "confidence_threshold": run.configuration.get("confidence_threshold"),
            "persistence_frames": run.configuration.get("persistence_frames"),
            "replay_mode": run.replay_mode,
            "event_count": len([e for e in events if e.run_id == run.id]),
        }
        for run in runs
    ]

    metrics: dict[str, object] = {
        "processed_run_count": len(runs),
        "actual_event_count": len(events),
        "precision": None,
        "recall": None,
        "false_positive_count": None,
        "false_positive_rate_per_run": None,
        "time_to_detect_seconds": None,
        "runs": runs_info,
        "status": "unavailable_without_label_manifest",
    }
    if not labels:
        return metrics

    # Negative footage evaluation
    is_negative = (
        labels.get("is_negative") is True
        or labels.get("evaluation_type") == "NEGATIVE"
        or labels.get("ground_truth") == "negative"
    )
    if is_negative:
        # In ground-truth negative footage, any operational event is a false positive
        metrics.update(
            {
                "false_positive_count": len(events),
                "false_positive_rate_per_run": round(len(events) / max(len(runs), 1), 2),
                "precision": 1.0 if len(events) == 0 else 0.0,
                "status": "ground_truth_negative_evaluation",
            }
        )

    # Positive ground-truth labels evaluation
    true_positives = labels.get("true_positives")
    false_positives = labels.get("false_positives")
    false_negatives = labels.get("false_negatives")
    if all(isinstance(value, int) and value >= 0 for value in (true_positives, false_positives, false_negatives)):
        predicted = true_positives + false_positives
        actual = true_positives + false_negatives
        metrics.update(
            {
                "precision": round(true_positives / predicted, 4) if predicted else None,
                "recall": round(true_positives / actual, 4) if actual else None,
                "false_positive_count": false_positives,
                "false_positive_rate_per_run": round(false_positives / max(len(runs), 1), 2),
                "status": "calculated_from_supplied_labels",
            }
        )

    # Time-to-detect calculation
    onset = labels.get("onset_seconds")
    event_sec = labels.get("event_seconds")
    if isinstance(onset, (int, float)) and onset >= 0:
        if isinstance(event_sec, (int, float)) and event_sec >= onset:
            metrics["time_to_detect_seconds"] = round(float(event_sec) - float(onset), 2)
        elif events:
            # Find earliest trigger detection frame timestamp from the events
            earliest_event = min(events, key=lambda e: e.triggered_at)
            if earliest_event.trigger_detection:
                frame_ts = earliest_event.trigger_detection.frame_timestamp
                if isinstance(frame_ts, (int, float)) and frame_ts >= onset:
                    metrics["time_to_detect_seconds"] = round(float(frame_ts) - float(onset), 2)

    return metrics
