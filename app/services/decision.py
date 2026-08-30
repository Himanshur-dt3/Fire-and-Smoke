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
        label: str,
        detection: Detection | None,
    ) -> Detection | None:
        """Return a triggering detection once one class reaches an eligible streak.

        Each class maintains its own persistence streak. A missing or
        below-threshold detection resets only the streak for the class being
        considered; it must not reset the other class.
        """
        if label not in self._streaks:
            return None

        streak = self._streaks[label]

        if detection is None or detection.confidence < self.threshold:
            streak.count = 0
            streak.best_detection = None
            return None

        streak.count += 1

        if not streak.best_detection or detection.confidence > streak.best_detection.confidence:
            streak.best_detection = detection

        if streak.count != self.persistence_frames:
            return None

        cutoff = datetime.now(timezone.utc) - timedelta(seconds=self.cooldown_seconds)
        event_type = "SMOKE_DETECTED" if label == "smoke" else "FIRE_DETECTED"

        recent = db.scalar(
            select(Event).where(
                Event.camera_id == camera_id,
                Event.event_type == event_type,
                Event.triggered_at >= cutoff,
            )
        )

        return None if recent else streak.best_detection
