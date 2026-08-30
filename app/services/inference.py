"""Real, local, environment-configured Ultralytics inference adapter."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from app.config import Settings
from app.services.normalization import normalize_label

MODEL_READY = "MODEL_READY"
MODEL_NOT_CONFIGURED = "MODEL_NOT_CONFIGURED"
MODEL_NOT_READY = "MODEL_NOT_READY"


class ModelUnavailableError(RuntimeError):
    """Raised when a selected configured model cannot safely perform real inference."""


@dataclass(frozen=True)
class Candidate:
    """One normalized real model prediction."""

    label: str
    confidence: float
    bounding_box: dict[str, float]


class InferenceService:
    """Load configured local weights and transform actual YOLO output."""

    def __init__(self, settings: Settings) -> None:
        self.registry = settings.model_registry()
        self._models: dict[str, Any] = {}

    def readiness(self, model_id: str) -> dict[str, str]:
        """Report a safe uppercase readiness code without revealing filesystem paths."""
        metadata = self.registry.get(model_id)
        if not metadata:
            return self._readiness(
                model_id,
                MODEL_NOT_CONFIGURED,
                "The selected model identifier is not configured for this POC.",
            )

        weights_path = metadata.get("weights_path")
        if not weights_path:
            return self._readiness(
                model_id,
                MODEL_NOT_CONFIGURED,
                "No local weights path has been configured.",
            )
        if not Path(str(weights_path)).is_file():
            return self._readiness(
                model_id,
                MODEL_NOT_READY,
                "Configured local weights are not available to this runtime.",
            )
        try:
            self._load(model_id)
        except Exception:
            return self._readiness(
                model_id,
                MODEL_NOT_READY,
                "Configured weights could not be loaded as a compatible YOLO model.",
            )
        return self._readiness(model_id, MODEL_READY, "Configured local model is ready.")

    def all_readiness(self) -> list[dict[str, str]]:
        """Return readiness for each supported POC model selection."""
        return [self.readiness(model_id) for model_id in sorted(self.registry)]

    @staticmethod
    def _readiness(model_id: str, code: str, detail: str) -> dict[str, str]:
        """Build the stable dashboard-facing model readiness representation."""
        return {"model_id": model_id, "code": code, "status": code, "detail": detail}

    def _load(self, model_id: str) -> Any:
        if model_id in self._models:
            return self._models[model_id]

        metadata = self.registry.get(model_id)
        if not metadata:
            raise ModelUnavailableError("The requested model identifier is not configured.")
        weights_path = metadata.get("weights_path")
        if not weights_path or not Path(str(weights_path)).is_file():
            raise ModelUnavailableError("The requested model has no available local compatible weights.")

        try:
            from ultralytics import YOLO
        except ImportError as error:
            raise ModelUnavailableError("Ultralytics is not installed in the runtime.") from error

        try:
            model = YOLO(str(weights_path))
        except Exception as error:
            raise ModelUnavailableError("Configured model weights failed to load.") from error

        self._models[model_id] = model
        return model

    def predict(self, model_id: str, image: np.ndarray) -> list[Candidate]:
        """Run genuine model inference and return only recognised normalized candidates."""
        model = self._load(model_id)
        metadata = self.registry[model_id]
        aliases = {str(key).lower(): str(value).lower() for key, value in dict(metadata["labels"]).items()}
        try:
            results = model.predict(source=image, verbose=False)
        except Exception as error:
            raise ModelUnavailableError("Real model inference failed for the supplied frame.") from error

        candidates: list[Candidate] = []
        for result in results:
            names = result.names
            for box in result.boxes or []:
                class_index = int(box.cls[0].item())
                raw_label = str(names[class_index])
                label = normalize_label(raw_label, aliases)
                if not label:
                    continue
                x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
                candidates.append(
                    Candidate(
                        label=label,
                        confidence=float(box.conf[0].item()),
                        bounding_box={"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                    )
                )
        return candidates
