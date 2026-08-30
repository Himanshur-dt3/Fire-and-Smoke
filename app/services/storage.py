"""Private filesystem storage for originals, evidence, and runtime artifacts."""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from app.config import Settings


class StorageError(RuntimeError):
    """Raised when a private storage operation is invalid or fails."""


class PrivateStorage:
    """Store private content beneath separate, non-public roots."""

    def __init__(self, settings: Settings) -> None:
        self.root = settings.storage_root
        self.media_root = self.root / "media"
        self.evidence_root = self.root / "evidence"
        self.runtime_root = self.root / "runtime"
        for directory in (self.media_root, self.evidence_root, self.runtime_root):
            directory.mkdir(parents=True, exist_ok=True)

    def _resolve(self, category_root: Path, key: str) -> Path:
        candidate = (category_root / key).resolve()
        if category_root.resolve() not in candidate.parents:
            raise StorageError("Invalid private storage key.")
        return candidate

    def save_media(self, source_path: Path, original_filename: str) -> str:
        """Persist validated uploaded media under an opaque generated key."""
        suffix = Path(original_filename).suffix.lower()[:12]
        key = f"{uuid.uuid4()}{suffix}"
        destination = self._resolve(self.media_root, key)
        shutil.move(str(source_path), destination)
        return key

    def media_path(self, key: str) -> Path:
        """Resolve a stored media key without exposing it via a public route."""
        return self._resolve(self.media_root, key)

    def save_evidence(self, jpeg_bytes: bytes) -> str:
        """Persist annotated JPEG evidence under an opaque generated key."""
        key = f"{uuid.uuid4()}.jpg"
        destination = self._resolve(self.evidence_root, key)
        destination.write_bytes(jpeg_bytes)
        return key

    def evidence_path(self, key: str) -> Path:
        """Resolve private evidence content for an authorised response."""
        return self._resolve(self.evidence_root, key)
