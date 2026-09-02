"""Authenticated JSON dashboard state routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import Event, ProcessingRun, User

router = APIRouter(tags=["Dashboard"])


# PUBLIC_INTERFACE
@router.get("/api/dashboard/summary", summary="Get dashboard operational summary")
def dashboard_summary(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Return persisted alerts, active processing, and safe model-readiness state.

    Args:
        db: Authenticated request database session.

    Returns:
        Aggregate operational state containing only persisted records and safe readiness detail.
    """
    from app.main import app_state

    active = list(
        db.scalars(
            select(Event).where(Event.status == "UNACKNOWLEDGED").order_by(Event.triggered_at.desc()).limit(10)
        )
    )
    recent = list(db.scalars(select(Event).order_by(Event.triggered_at.desc()).limit(25)))
    runs = list(
        db.scalars(
            select(ProcessingRun)
            .where(ProcessingRun.status.in_(("queued", "running")))
            .order_by(ProcessingRun.created_at.desc())
            .limit(10)
        )
    )
    event_counts = dict(db.execute(select(Event.event_type, func.count()).group_by(Event.event_type)).all())
    return {
        "active_alert_count": len(active),
        "event_counts": event_counts,
        "active_alerts": [
            {
                "id": event.id,
                "type": event.event_type,
                "camera": event.camera.identifier,
                "confidence": event.confidence,
                "triggered_at": event.triggered_at,
                "evidence_id": event.evidence.id if event.evidence else None,
            }
            for event in active
        ],
        "recent_events": [
            {
                "id": event.id,
                "type": event.event_type,
                "status": event.status,
                "camera": event.camera.identifier,
                "confidence": event.confidence,
                "triggered_at": event.triggered_at,
                "evidence_id": event.evidence.id if event.evidence else None,
            }
            for event in recent
        ],
        "active_runs": [
            {
                "id": run.id,
                "model_id": run.model_identifier,
                "status": run.status,
                "progress_percent": run.progress_percent,
                "replay_mode": run.replay_mode,
                "failure_code": run.failure_code,
                "error_message": run.error_message,
                "created_at": run.created_at,
                "completed_at": run.completed_at,
            }
            for run in runs
        ],
        "models": app_state.inference.all_readiness(),
    }


# PUBLIC_INTERFACE
@router.get("/api/settings", summary="Get sanitized operational settings")
def sanitized_settings(_: User = Depends(get_current_user)) -> dict:
    """Return operational settings suitable for the dashboard without private paths or secrets.

    Returns:
        Numeric operational configuration and media policy only; no secrets, hashes, paths, or storage keys.
    """
    from app.main import app_state

    settings = app_state.settings
    return {
        "allowed_media_types": sorted(settings.allowed_media_types),
        "max_upload_bytes": settings.max_upload_bytes,
        "sample_fps": settings.sample_fps,
        "confidence_threshold": settings.confidence_threshold,
        "persistence_frames": settings.persistence_frames,
        "event_cooldown_seconds": settings.event_cooldown_seconds,
        "replay_speed_multiplier": settings.replay_speed_multiplier,
        "dashboard_poll_interval_seconds": settings.dashboard_poll_interval_seconds,
        "model_ids": sorted(app_state.inference.registry),
        "poc_boundary": "Authorized image/video upload and replay POC only; not a production fire-safety system.",
    }


# PUBLIC_INTERFACE
@router.get("/api/models/readiness", summary="Get model readiness state")
def model_readiness(_: User = Depends(get_current_user)) -> dict:
    """Return configured model readiness list for the operator dashboard.

    Returns:
        List of configured model identifiers and their readiness states.
    """
    from app.main import app_state

    return {"items": app_state.inference.all_readiness()}

