"""Evaluation helpers that never estimate unsupported metrics."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Event, ProcessingRun


class EvaluationError(ValueError):
    """Raised when an evaluation is not grounded in completed runs."""


def calculate_metrics(db: Session, run_ids: list[str], labels: dict[str, object] | None) -> dict[str, object]:
    """Calculate only metrics that supplied labels explicitly support."""
    runs = list(db.scalars(select(ProcessingRun).where(ProcessingRun.id.in_(run_ids))))
    if len(runs) != len(set(run_ids)) or any(run.status != "completed" for run in runs):
        raise EvaluationError("Every selected run must exist and be completed.")

    events = list(db.scalars(select(Event).where(Event.run_id.in_(run_ids))))
    metrics: dict[str, object] = {
        "processed_run_count": len(runs),
        "actual_event_count": len(events),
        "precision": None,
        "recall": None,
        "false_positive_count": None,
        "time_to_detect_seconds": None,
        "status": "unavailable_without_label_manifest",
    }
    if not labels:
        return metrics

    true_positives = labels.get("true_positives")
    false_positives = labels.get("false_positives")
    false_negatives = labels.get("false_negatives")
    if all(isinstance(value, int) and value >= 0 for value in (true_positives, false_positives, false_negatives)):
        predicted = true_positives + false_positives
        actual = true_positives + false_negatives
        metrics.update(
            {
                "precision": true_positives / predicted if predicted else None,
                "recall": true_positives / actual if actual else None,
                "false_positive_count": false_positives,
                "status": "calculated_from_supplied_labels",
            }
        )
    onset = labels.get("onset_seconds")
    event_seconds = labels.get("event_seconds")
    if isinstance(onset, (int, float)) and isinstance(event_seconds, (int, float)) and event_seconds >= onset:
        metrics["time_to_detect_seconds"] = event_seconds - onset
    return metrics
