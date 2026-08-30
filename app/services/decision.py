"""Operational event decisioning distinct from raw model predictions."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Detection, Event


@dataclass
class _Streak:
    """In-memory consecutive qualifying state for one class during a run."""

    count: int = 0
    best_detection: Detection | None = None


class DecisionEngine:
    """Apply threshold, temporal persistence, and cooldown before alert creation."""

    def __init__(self, threshold: float, persistence_frames: int, cooldown_seconds: int) -> None:
        self.threshold = threshold
        self.persistence_frames = persistence_frames
        self.cooldown_seconds = cooldown_seconds
        self._streaks: dict[str, _Streak] = {"smoke": _Streak(), "fire": _Streak()}

    def consider(
        self,
        db: Session,
        camera_id: str,
        detection: Detection | None,
    ) -> Detection | None:
        """Return a triggering detection only once a class reaches an eligible streak."""
        label = detection.normalized_label if detection and detection.confidence >= self.threshold else None
        for class_name, streak in self._streaks.items():
            if class_name != label:
                streak.count = 0
                streak.best_detection = None

        if not label or detection is None:
            return None

        streak = self._streaks[label]
        streak.count += 1
        if not streak.best_detection or detection.confidence > streak.best_detection.confidence:
            streak.best_detection = detection
        if streak.count != self.persistence_frames:
            return None

        cutoff = datetime.now(timezone.utc) - timedelta(seconds=self.cooldown_seconds)
        recent = db.scalar(
            select(Event).where(
                Event.camera_id == camera_id,
                Event.event_type == ("SMOKE_DETECTED" if label == "smoke" else "FIRE_DETECTED"),
                Event.triggered_at >= cutoff,
            )
        )
        return None if recent else streak.best_detection
