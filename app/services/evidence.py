"""Annotated private evidence generation for eligible operational events."""

from __future__ import annotations

import cv2
import numpy as np

from app.models import Detection, Evidence, Event
from app.services.storage import PrivateStorage


class EvidenceError(RuntimeError):
    """Raised when required event evidence cannot be generated or retained."""


def create_evidence(
    storage: PrivateStorage,
    event: Event,
    detection: Detection,
    image: np.ndarray,
) -> Evidence:
    """Draw the real selected prediction and create its private evidence record."""
    box = detection.bounding_box
    x1, y1, x2, y2 = (int(box[key]) for key in ("x1", "y1", "x2", "y2"))
    annotated = image.copy()
    color = (0, 165, 255) if detection.normalized_label == "smoke" else (0, 0, 255)
    cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
    label = f"{detection.normalized_label.upper()} {detection.confidence:.2f}"
    cv2.putText(annotated, label, (x1, max(24, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.65, color, 2)
    success, encoded = cv2.imencode(".jpg", annotated)
    if not success:
        raise EvidenceError("The event evidence frame could not be encoded.")
    key = storage.save_evidence(bytes(encoded))
    return Evidence(
        event_id=event.id,
        storage_key=key,
        frame_number=detection.frame_number,
        frame_timestamp=detection.frame_timestamp,
        annotation_metadata={
            "label": detection.normalized_label,
            "confidence": detection.confidence,
            "bounding_box": detection.bounding_box,
            "event_type": event.event_type,
        },
    )
