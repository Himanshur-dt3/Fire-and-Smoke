"""Event history, acknowledgement, and protected evidence routes."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user, require_csrf
from app.models import Camera, Detection, Event, Evidence, User
from app.schemas import AcknowledgeRequest

router = APIRouter(prefix="/api", tags=["Events and evidence"])


def _event_dict(event: Event) -> dict:
    return {
        "id": event.id,
        "type": event.event_type,
        "status": event.status,
        "camera_id": event.camera_id,
        "camera_identifier": event.camera.identifier if event.camera else None,
        "run_id": event.run_id,
        "triggered_at": event.triggered_at,
        "confidence": event.confidence,
        "acknowledged_at": event.acknowledged_at,
        "acknowledged_by": event.acknowledged_by.username if event.acknowledged_by else None,
        "evidence_id": event.evidence.id if event.evidence else None,
    }


# PUBLIC_INTERFACE
@router.get("/events", summary="List persisted operational events")
def list_events(
    event_type: str | None = Query(None, pattern="^(SMOKE_DETECTED|FIRE_DETECTED)$"),
    camera_id: str | None = None,
    event_status: str | None = Query(None, alias="status", pattern="^(UNACKNOWLEDGED|ACKNOWLEDGED)$"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """List authenticated event history with optional event-type, camera, and state filters.

    Args:
        event_type: Optional persisted smoke or fire event type.
        camera_id: Optional logical camera record identifier.
        event_status: Optional acknowledgement state.
        limit: Maximum number of newest events to return.
        db: Authenticated request database session.

    Returns:
        A JSON object containing matching persisted event summaries.
    """
    query = select(Event).order_by(Event.triggered_at.desc()).limit(limit)
    if event_type:
        query = query.where(Event.event_type == event_type)
    if camera_id:
        query = query.where(Event.camera_id == camera_id)
    if event_status:
        query = query.where(Event.status == event_status)
    events = list(db.scalars(query))
    return {"items": [_event_dict(event) for event in events]}


# PUBLIC_INTERFACE
@router.get("/events/{event_id}", summary="Get event details and evidence metadata")
def get_event(
    event_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Return a persisted event with its trigger detection and private evidence metadata.

    Args:
        event_id: Persisted event identifier.
        db: Authenticated request database session.

    Returns:
        A JSON event record with trigger-detection and protected-evidence metadata.

    Raises:
        HTTPException: If the persisted event does not exist.
    """
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event was not found.")
    detection = db.get(Detection, event.trigger_detection_id)
    payload = _event_dict(event)
    payload["trigger_detection"] = (
        {
            "frame_number": detection.frame_number,
            "frame_timestamp": detection.frame_timestamp,
            "label": detection.normalized_label,
            "confidence": detection.confidence,
            "bounding_box": detection.bounding_box,
            "model_identifier": detection.model_identifier,
        }
        if detection
        else None
    )
    return payload


# PUBLIC_INTERFACE

@router.delete("/events/{event_id}", summary="Delete a persisted operational event")
def delete_event(
    event_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Delete one persisted event and its associated evidence record.

    The raw Detection record is intentionally retained because detections
    are stored separately from operational events.
    """
    event = db.get(Event, event_id)

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event was not found.",
        )

    evidence = event.evidence

    if evidence:
        db.delete(evidence)

    db.delete(event)
    db.commit()

    return {
        "deleted": True,
        "event_id": event_id,
    }

@router.post("/events/{event_id}/acknowledge", summary="Acknowledge an operational event")
def acknowledge_event(
    event_id: str,
    payload: AcknowledgeRequest,
    _: None = Depends(require_csrf),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Transition an unacknowledged event while retaining the active operator and timestamp.

    Args:
        event_id: Persisted event identifier.
        payload: Optional acknowledgement note supplied by the active operator.
        db: Authenticated request database session.
        user: Authenticated operator recording the acknowledgement.

    Returns:
        The updated persisted event summary.

    Raises:
        HTTPException: If the event is absent or has already been acknowledged.
    """
    event = db.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event was not found.")
    if event.status != "UNACKNOWLEDGED":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This event is already acknowledged.")
    event.status = "ACKNOWLEDGED"
    event.acknowledged_at = datetime.now(timezone.utc)
    event.acknowledged_by_id = user.id
    event.acknowledgement_note = payload.note
    db.commit()
    db.refresh(event)
    return _event_dict(event)


# PUBLIC_INTERFACE
@router.get("/evidence/{evidence_id}/content", summary="Stream one protected annotated evidence image")
def evidence_content(
    evidence_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> FileResponse:
    """Return private evidence bytes only after authenticated metadata lookup.

    Args:
        evidence_id: Persisted evidence identifier.
        db: Authenticated request database session.

    Returns:
        The annotated evidence image bytes with the persisted content type.

    Raises:
        HTTPException: If the evidence record or its private content is unavailable.
    """
    from app.main import app_state

    evidence = db.get(Evidence, evidence_id)
    if not evidence:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence was not found.")
    path = app_state.storage.evidence_path(evidence.storage_key)
    if not path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence content is unavailable.")
    return FileResponse(path, media_type=evidence.content_type, filename=f"evidence-{evidence.id}.jpg")

