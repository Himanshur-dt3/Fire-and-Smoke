"""Image and sampled-video frame decoding."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


class DecodeError(RuntimeError):
    """Raised when a stored media asset cannot be decoded during processing."""


@dataclass(frozen=True)
class FrameSample:
    """One decoded source frame with traceability metadata."""

    frame_number: int
    timestamp_seconds: float
    image: np.ndarray


def decode_samples(media_path: Path, media_kind: str, sample_fps: float) -> tuple[int, Iterator[FrameSample]]:
    """Return estimated sample count and an iterator yielding decoded image/video frames."""
    if media_kind == "image":
        image = cv2.imread(str(media_path))
        if image is None:
            raise DecodeError("Stored image can no longer be decoded.")
        return 1, iter((FrameSample(0, 0.0, image),))

    capture = cv2.VideoCapture(str(media_path))
    if not capture.isOpened():
        raise DecodeError("Stored video can no longer be opened.")
    source_fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
    source_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if source_fps <= 0 or source_frames <= 0:
        capture.release()
        raise DecodeError("Stored video has invalid frame metadata.")

    step = max(1, round(source_fps / sample_fps))
    estimate = max(1, (source_frames + step - 1) // step)

    def iterator() -> Iterator[FrameSample]:
        frame_number = 0
        try:
            while True:
                success, image = capture.read()
                if not success:
                    break
                if frame_number % step == 0:
                    yield FrameSample(frame_number, frame_number / source_fps, image)
                frame_number += 1
        finally:
            capture.release()

    return estimate, iterator()
