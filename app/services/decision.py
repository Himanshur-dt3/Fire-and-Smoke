"""Confidence, persistence, and cooldown decision logic."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Detection, Event


@dataclass
class _Streak:
    """Consecutive qualifying detections for one class during a run."""

    count: int = 0
    best_detection: Detection | None = None


class DecisionEngine:
    """Apply confidence threshold, temporal persistence, and cooldown."""

    def __init__(
        self,
        threshold: float,
        persistence_frames: int,
        cooldown_seconds: int,
    ) -> None:
        self.threshold = threshold
        self.persistence_frames = max(1, persistence_frames)
        self.cooldown_seconds = max(0, cooldown_seconds)
        self._streaks: dict[str, _Streak] = {
            "smoke": _Streak(),
            "fire": _Streak(),
        }

    def consider(
        self,
        db: Session,
        camera_id: str | None,
        label: str,
        detection: Detection | None,
    ) -> Detection | None:
        """Return a real detection when the configured decision rules pass."""

        if label not in self._streaks:
            return None

        streak = self._streaks[label]

        if detection is None or detection.confidence < self.threshold:
            streak.count = 0
            streak.best_detection = None
            return None

        streak.count += 1

        if (
            streak.best_detection is None
            or detection.confidence > streak.best_detection.confidence
        ):
            streak.best_detection = detection

        if streak.count < self.persistence_frames:
            return None

        event_type = (
            "SMOKE_DETECTED"
            if label == "smoke"
            else "FIRE_DETECTED"
        )

        cutoff = datetime.now(timezone.utc) - timedelta(
            seconds=self.cooldown_seconds
        )

        recent_query = select(Event).where(
            Event.event_type == event_type,
            Event.triggered_at >= cutoff,
        )

        if camera_id is not None:
            recent_query = recent_query.where(Event.camera_id == camera_id)

        recent = db.scalar(recent_query.limit(1))

        trigger = streak.best_detection

        # Reset the streak after a decision has been emitted.
        streak.count = 0
        streak.best_detection = None

        if recent:
            return None

        return trigger
