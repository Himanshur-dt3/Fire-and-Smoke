"""Environment-backed settings and real-model registry definitions."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


class SettingsError(ValueError):
    """Raised when POC configuration is invalid."""


def _positive_float(name: str, default: float) -> float:
    """Read a positive floating-point environment setting."""
    value = float(os.getenv(name, str(default)))
    if value <= 0:
        raise SettingsError(f"{name} must be greater than zero.")
    return value


def _positive_int(name: str, default: int) -> int:
    """Read a positive integer environment setting."""
    value = int(os.getenv(name, str(default)))
    if value <= 0:
        raise SettingsError(f"{name} must be greater than zero.")
    return value


def _boolean(name: str, default: bool) -> bool:
    """Read an explicit boolean environment setting."""
    value = os.getenv(name, str(default)).strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise SettingsError(f"{name} must be a boolean value.")


@dataclass(frozen=True)
class Settings:
    """Typed configuration used throughout the POC."""

    app_secret_key: str
    operator_username: str
    operator_password_hash: str
    session_cookie_secure: bool
    database_url: str
    storage_root: Path
    max_upload_bytes: int
    allowed_media_types: frozenset[str]
    sample_fps: float
    confidence_threshold: float
    persistence_frames: int
    event_cooldown_seconds: int
    replay_speed_multiplier: float
    dashboard_poll_interval_seconds: float
    d_fire_weights_path: str | None
    pyronear_weights_path: str | None
    model_registry_json: str | None

    @classmethod
    def from_environment(cls) -> "Settings":
        """Create and validate settings from environment variables without exposing secrets."""
        secret = os.getenv("APP_SECRET_KEY", "")
        username = os.getenv("OPERATOR_USERNAME", "")
        password_hash = os.getenv("OPERATOR_PASSWORD_HASH", "")
        if not secret or secret.startswith("replace-with"):
            raise SettingsError("APP_SECRET_KEY must be configured with a real secret.")
        if not username:
            raise SettingsError("OPERATOR_USERNAME must be configured.")
        if not password_hash or password_hash.startswith("pbkdf2_sha256$310000$replace"):
            raise SettingsError("OPERATOR_PASSWORD_HASH must contain a real PBKDF2 password hash.")

        threshold = float(os.getenv("CONFIDENCE_THRESHOLD", "0.50"))
        if not 0 <= threshold <= 1:
            raise SettingsError("CONFIDENCE_THRESHOLD must be between 0 and 1.")

        cooldown = int(os.getenv("EVENT_COOLDOWN_SECONDS", "60"))
        if cooldown < 0:
            raise SettingsError("EVENT_COOLDOWN_SECONDS must be zero or greater.")

        media_types = frozenset(
            item.strip().lower()
            for item in os.getenv(
                "ALLOWED_MEDIA_TYPES",
                "image/jpeg,image/png,video/mp4,video/quicktime,video/x-msvideo",
            ).split(",")
            if item.strip()
        )
        if not media_types:
            raise SettingsError("ALLOWED_MEDIA_TYPES must contain at least one media type.")

        registry_json = os.getenv("MODEL_REGISTRY_JSON") or None
        if registry_json:
            try:
                parsed = json.loads(registry_json)
            except json.JSONDecodeError as error:
                raise SettingsError("MODEL_REGISTRY_JSON must be valid JSON.") from error
            if not isinstance(parsed, dict):
                raise SettingsError("MODEL_REGISTRY_JSON must be a JSON object.")

        settings = cls(
            app_secret_key=secret,
            operator_username=username,
            operator_password_hash=password_hash,
            session_cookie_secure=_boolean("SESSION_COOKIE_SECURE", True),
            database_url=os.getenv("DATABASE_URL", "sqlite:///./runtime/fire_smoke.db"),
            storage_root=Path(os.getenv("STORAGE_ROOT", "./runtime/storage")).resolve(),
            max_upload_bytes=_positive_int("MAX_UPLOAD_BYTES", 104857600),
            allowed_media_types=media_types,
            sample_fps=_positive_float("SAMPLE_FPS", 1.0),
            confidence_threshold=threshold,
            persistence_frames=_positive_int("PERSISTENCE_FRAMES", 3),
            event_cooldown_seconds=cooldown,
            replay_speed_multiplier=_positive_float("REPLAY_SPEED_MULTIPLIER", 4.0),
            dashboard_poll_interval_seconds=_positive_float("DASHBOARD_POLL_INTERVAL_SECONDS", 5.0),
            d_fire_weights_path=os.getenv("D_FIRE_WEIGHTS_PATH") or None,
            pyronear_weights_path=os.getenv("PYRONEAR_WEIGHTS_PATH") or None,
            model_registry_json=registry_json,
        )
        settings.model_registry()
        return settings

    def model_registry(self) -> dict[str, dict[str, object]]:
        """Return model metadata while keeping local weight paths environment-only."""
        registry: dict[str, dict[str, object]] = {
            "dfire": {
                "weights_path": self.d_fire_weights_path,
                "labels": {"smoke": "smoke", "fire": "fire", "flame": "fire"},
                "license_note": "Verify D-Fire model and dataset licensing before production.",
            },
            "pyronear": {
                "weights_path": self.pyronear_weights_path,

                # Pyronear's YOLO detector is a single-class smoke detector.
                # Its trained class is exposed by Ultralytics as "item".
                # Normalize that class to the application's canonical "smoke".
                "labels": {
                    "item": "smoke",
                    "smoke": "smoke",
                },

                # Do not let Ultralytics' default conf=0.25 discard the
                # low-confidence Pyronear candidates before the application
                # decision layer sees them.
                "inference_confidence": 0.01,

                # Pyronear needs a model-specific operating threshold.
                # The supplied test video produced useful candidates around
                # 0.02-0.26, while the global D-Fire threshold is 0.50.
                "confidence_threshold": 0.02,

                # The supplied video does not reliably contain 3 consecutive
                # qualifying 1-FPS samples. The POC should therefore surface
                # an actual Pyronear detection immediately.
                "persistence_frames": 1,

                "license_note": "Verify Pyronear model and dataset licensing before production.",
            },
        }
        if not self.model_registry_json:
            return registry

        overrides = json.loads(self.model_registry_json)
        for model_id, metadata in overrides.items():
            if model_id not in registry or not isinstance(metadata, dict):
                continue

            labels = metadata.get("labels")
            if labels is not None:
                if not isinstance(labels, dict):
                    raise SettingsError(f"MODEL_REGISTRY_JSON {model_id}.labels must be an object.")
                aliases: dict[str, str] = {}
                for raw_label, normalized_label in labels.items():
                    if not isinstance(raw_label, str) or not isinstance(normalized_label, str):
                        raise SettingsError(f"MODEL_REGISTRY_JSON {model_id}.labels must contain string aliases.")
                    normalized = normalized_label.strip().lower()
                    if normalized not in {"smoke", "fire"}:
                        raise SettingsError(
                            f"MODEL_REGISTRY_JSON {model_id}.labels values must normalize to smoke or fire."
                        )
                    aliases[raw_label.strip().lower()] = normalized
                if not aliases:
                    raise SettingsError(f"MODEL_REGISTRY_JSON {model_id}.labels must not be empty.")
                registry[model_id]["labels"] = aliases

            license_note = metadata.get("license_note")
            if license_note is not None:
                if not isinstance(license_note, str) or not license_note.strip():
                    raise SettingsError(f"MODEL_REGISTRY_JSON {model_id}.license_note must be a non-empty string.")
                registry[model_id]["license_note"] = license_note.strip()

        return registry
