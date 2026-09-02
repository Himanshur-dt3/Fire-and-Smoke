"""Protected real-inference processing run routes."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user, require_csrf
from app.models import Detection, Event, MediaAsset, ProcessingRun, User
from app.schemas import RunCreateRequest
from app.services.inference import MODEL_READY

router = APIRouter(prefix="/api/processing", tags=["Processing"])


def _run_dict(run: ProcessingRun) -> dict:
    """Return the dashboard-safe processing attempt representation."""
    return {
        "id": run.id,
        "status": run.status,
        "progress_percent": run.progress_percent,
        "processed_frames": run.processed_frames,
        "total_frames": run.total_frames,
        "model_id": run.model_identifier,
        "replay_mode": run.replay_mode,
        "configuration": run.configuration,
        "failure_code": run.failure_code,
        "error_message": run.error_message,
        "created_at": run.created_at,
        "completed_at": run.completed_at,
    }


# PUBLIC_INTERFACE
@router.post("/runs", status_code=status.HTTP_202_ACCEPTED, summary="Create a real model processing attempt")
def create_run(
    payload: RunCreateRequest,
    _: None = Depends(require_csrf),
    db: Session = Depends(get_db),
    __: User = Depends(get_current_user),
) -> dict:
    """Persist a queued or terminal blocked processing attempt for uploaded media.

    Args:
        payload: Uploaded media ID, selected model ID, and optional replay mode.
        db: Authenticated request database session.

    Returns:
        The persisted processing run, including a safe unavailable-model code when blocked.

    Raises:
        HTTPException: If the requested private media asset does not exist.
    """
    from app.main import app_state

    media = db.get(MediaAsset, payload.media_id)
    if not media:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media asset was not found.")

    settings = app_state.settings
    readiness = app_state.inference.readiness(payload.model_id)
    run = ProcessingRun(
        media_id=media.id,
        model_identifier=payload.model_id,
        replay_mode=payload.replay_mode,
        configuration={
            "sample_fps": settings.sample_fps,
            "confidence_threshold": settings.confidence_threshold,
            "persistence_frames": settings.persistence_frames,
            "event_cooldown_seconds": settings.event_cooldown_seconds,
            "replay_speed_multiplier": settings.replay_speed_multiplier,
        },
    )
    if readiness["code"] != MODEL_READY:
        run.status = "blocked"
        run.failure_code = readiness["code"]
        run.error_message = readiness["detail"]
        run.progress_percent = 0.0
        run.completed_at = datetime.now(timezone.utc)

    db.add(run)
    db.commit()
    db.refresh(run)

    if run.status == "queued":
        app_state.worker.enqueue(run.id)
    return _run_dict(run)


# PUBLIC_INTERFACE
@router.get("/runs/{run_id}/results", summary="Get persisted inference results for a processing run")
def get_run_results(
    run_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Return persisted detections and events for one completed processing run."""
    run = db.get(ProcessingRun, run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing run was not found.")

    detections = list(
        db.scalars(
            select(Detection)
            .where(Detection.run_id == run_id)
            .order_by(Detection.confidence.desc())
            .limit(50)
        )
    )

    events = list(
        db.scalars(
            select(Event)
            .where(Event.run_id == run_id)
            .order_by(Event.triggered_at.desc())
        )
    )

    return {
        "run_id": run.id,
        "status": run.status,
        "detection_count": db.query(Detection).filter(Detection.run_id == run_id).count(),
        "event_count": len(events),
        "detections": [
            {
                "id": detection.id,
                "label": detection.normalized_label,
                "confidence": detection.confidence,
                "frame_number": detection.frame_number,
                "frame_timestamp": detection.frame_timestamp,
                "bounding_box": detection.bounding_box,
            }
            for detection in detections
        ],
        "events": [
            {
                "id": event.id,
                "type": event.event_type,
                "confidence": event.confidence,
                "status": event.status,
            }
            for event in events
        ],
    }


# PUBLIC_INTERFACE
@router.get("/runs/{run_id}", summary="Get processing run state")
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Return authenticated progress and safe terminal state for one processing attempt.

    Args:
        run_id: Persisted processing run identifier.
        db: Authenticated request database session.

    Returns:
        Persisted processing run details.

    Raises:
        HTTPException: If the processing run is absent.
    """
    run = db.get(ProcessingRun, run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processing run was not found.")
    return _run_dict(run)


# PUBLIC_INTERFACE
@router.get("/runs", summary="List processing attempts")
def list_runs(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """List authenticated processing runs.

    Args:
        limit: Maximum number of newest runs to return.
        db: Authenticated request database session.

    Returns:
        A JSON object containing processing run summaries.
    """
    runs = list(db.scalars(select(ProcessingRun).order_by(ProcessingRun.created_at.desc()).limit(limit)))
    return {"items": [_run_dict(run) for run in runs]}

