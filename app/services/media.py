"""Upload validation and metadata extraction for image and video media."""

from __future__ import annotations

import tempfile
from pathlib import Path

import cv2
from fastapi import UploadFile

from app.config import Settings


class MediaValidationError(ValueError):
    """Raised when submitted media is unsupported, oversized, or not decodable."""


def media_kind(content_type: str) -> str:
    """Map allowed content types to supported POC media kinds."""
    if content_type.startswith("image/"):
        return "image"
    if content_type.startswith("video/"):
        return "video"
    raise MediaValidationError("Only supported image and video media can be uploaded.")


def normalize_content_type(content_type: str, filename: str) -> str:
    """Normalize browser-provided MIME types to the application's canonical types."""
    content_type = (content_type or "").strip().lower()
    suffix = Path(filename).suffix.lower()

    # Browsers do not always agree on the MIME type they report for AVI files.
    # Treat known AVI MIME variants, and an octet-stream AVI, as the canonical
    # video/x-msvideo type. The extension is used only for this known AVI case.
    if suffix == ".avi" and content_type in {
        "",
        "video/avi",
        "application/avi",
        "application/x-avi",
        "application/octet-stream",
        "binary/octet-stream",
    }:
        return "video/x-msvideo"

    return content_type


async def stage_upload(upload: UploadFile, settings: Settings) -> tuple[Path, int, str, str]:
    """Validate and stream an upload to a temporary private staging file."""
    filename = upload.filename or "upload"
    content_type = normalize_content_type(upload.content_type or "", filename)

    if content_type not in settings.allowed_media_types:
        raise MediaValidationError("This media content type is not allowed.")

    kind = media_kind(content_type)
    total = 0
    suffix = Path(filename).suffix.lower()

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=suffix,
        dir=settings.storage_root,
    ) as temporary:
        while chunk := await upload.read(1024 * 1024):
            total += len(chunk)

            if total > settings.max_upload_bytes:
                temporary.close()
                Path(temporary.name).unlink(missing_ok=True)
                raise MediaValidationError(
                    "The uploaded file exceeds the configured size limit."
                )

            temporary.write(chunk)

        staged_path = Path(temporary.name)

    if total == 0:
        staged_path.unlink(missing_ok=True)
        raise MediaValidationError("An empty media file cannot be processed.")

    return staged_path, total, content_type, kind


def inspect_media(path: Path, kind: str) -> tuple[float | None, int | None, int | None]:
    """Confirm decodability and extract non-sensitive media metadata."""
    if kind == "image":
        image = cv2.imread(str(path))

        if image is None or image.size == 0:
            raise MediaValidationError("The uploaded image cannot be decoded.")

        height, width = image.shape[:2]
        return None, width, height

    capture = cv2.VideoCapture(str(path))

    try:
        if not capture.isOpened():
            raise MediaValidationError("The uploaded video cannot be decoded.")

        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

        success, _ = capture.read()

        if not success or width <= 0 or height <= 0:
            raise MediaValidationError(
                "The uploaded video contains no readable frames."
            )

        return (
            frame_count / fps if fps > 0 else None,
            width,
            height,
        )
    finally:
        capture.release()
