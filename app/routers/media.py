"""Protected private-media ingestion route."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user, require_csrf
from app.models import Camera, MediaAsset, User
from app.services.media import MediaValidationError, inspect_media, stage_upload

router = APIRouter(prefix="/api/media", tags=["Media"])


# PUBLIC_INTERFACE
@router.post("/upload", status_code=status.HTTP_201_CREATED, summary="Upload private image or video media")
async def upload_media(
    camera_identifier: str = Form(..., min_length=1, max_length=128),
    file: UploadFile = File(...),
    _: None = Depends(require_csrf),
    db: Session = Depends(get_db),
    __: User = Depends(get_current_user),
) -> dict:
    """Validate, inspect, and privately retain one source image or video for a processing run.

    Args:
        camera_identifier: Stable logical identifier associated with the authorised source.
        file: Uploaded supported image or video file.
        db: Authenticated request database session.

    Returns:
        Private-media metadata needed to create a traceable processing attempt.

    Raises:
        HTTPException: If the media type, size, or decodability validation fails.
    """
    from app.main import app_state

    staged_path: Path | None = None
    try:
        staged_path, size, content_type, kind = await stage_upload(file, app_state.settings)
        duration, width, height = inspect_media(staged_path, kind)
        camera = db.scalar(select(Camera).where(Camera.identifier == camera_identifier.strip()))
        if not camera:
            camera = Camera(identifier=camera_identifier.strip(), name=camera_identifier.strip())
            db.add(camera)
            db.flush()
        storage_key = app_state.storage.save_media(staged_path, file.filename or "upload")
        staged_path = None
        media = MediaAsset(
            camera_id=camera.id,
            original_filename=Path(file.filename or "upload").name,
            content_type=content_type,
            media_kind=kind,
            storage_key=storage_key,
            size_bytes=size,
            duration_seconds=duration,
            width=width,
            height=height,
        )
        db.add(media)
        db.commit()
        db.refresh(media)
        return {
            "id": media.id,
            "camera_id": camera.id,
            "camera_identifier": camera.identifier,
            "media_kind": media.media_kind,
            "duration_seconds": media.duration_seconds,
            "width": media.width,
            "height": media.height,
            "status": "stored_privately",
        }
    except MediaValidationError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    finally:
        if staged_path:
            staged_path.unlink(missing_ok=True)
