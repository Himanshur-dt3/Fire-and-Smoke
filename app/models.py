"""SQLAlchemy persistence entities for the Renewi fire and smoke POC."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _id() -> str:
    """Create a non-guessable POC entity identifier."""
    return str(uuid.uuid4())


def _now() -> datetime:
    """Return a timezone-aware timestamp."""
    return datetime.now(timezone.utc)


class User(Base):
    """Authenticated POC operator account."""

    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    username: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    acknowledgements: Mapped[list["Event"]] = relationship(back_populates="acknowledged_by")


class Camera(Base):
    """Logical source identity used for uploads and future camera integrations."""

    __tablename__ = "cameras"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    identifier: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(256))
    location_label: Mapped[str | None] = mapped_column(String(256), nullable=True)
    source_type: Mapped[str] = mapped_column(String(32), default="upload")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    media_assets: Mapped[list["MediaAsset"]] = relationship(back_populates="camera")
    events: Mapped[list["Event"]] = relationship(back_populates="camera")


class MediaAsset(Base):
    """Privately stored uploaded image or video asset."""

    __tablename__ = "media_assets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id"), index=True)
    original_filename: Mapped[str] = mapped_column(String(512))
    content_type: Mapped[str] = mapped_column(String(128))
    media_kind: Mapped[str] = mapped_column(String(16))
    storage_key: Mapped[str] = mapped_column(String(512), unique=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    camera: Mapped[Camera] = relationship(back_populates="media_assets")
    runs: Mapped[list["ProcessingRun"]] = relationship(back_populates="media_asset")


class ProcessingRun(Base):
    """Traceable real-inference execution against one stored media asset."""

    __tablename__ = "processing_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    media_id: Mapped[str] = mapped_column(ForeignKey("media_assets.id"), index=True)
    model_identifier: Mapped[str] = mapped_column(String(64))
    configuration: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16), default="queued", index=True)
    progress_percent: Mapped[float] = mapped_column(Float, default=0.0)
    total_frames: Mapped[int | None] = mapped_column(Integer, nullable=True)
    processed_frames: Mapped[int] = mapped_column(Integer, default=0)
    replay_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    failure_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    media_asset: Mapped[MediaAsset] = relationship(back_populates="runs")
    detections: Mapped[list["Detection"]] = relationship(back_populates="run")
    events: Mapped[list["Event"]] = relationship(back_populates="run")


class Detection(Base):
    """Raw normalized prediction retained separately from operational alerts."""

    __tablename__ = "detections"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("processing_runs.id"), index=True)
    frame_number: Mapped[int] = mapped_column(Integer)
    frame_timestamp: Mapped[float] = mapped_column(Float)
    normalized_label: Mapped[str] = mapped_column(String(16), index=True)
    confidence: Mapped[float] = mapped_column(Float)
    bounding_box: Mapped[dict] = mapped_column(JSON)
    model_identifier: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    run: Mapped[ProcessingRun] = relationship(back_populates="detections")


class Event(Base):
    """Operational smoke or fire event created only after decision rules pass."""

    __tablename__ = "events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("processing_runs.id"), index=True)
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(32), default="UNACKNOWLEDGED", index=True)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    confidence: Mapped[float] = mapped_column(Float)
    trigger_detection_id: Mapped[str] = mapped_column(ForeignKey("detections.id"))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    acknowledgement_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    run: Mapped[ProcessingRun] = relationship(back_populates="events")
    camera: Mapped[Camera] = relationship(back_populates="events")
    acknowledged_by: Mapped[User | None] = relationship(back_populates="acknowledgements")
    evidence: Mapped["Evidence | None"] = relationship(back_populates="event", uselist=False)


class Evidence(Base):
    """Private annotated trigger-frame snapshot associated with one event."""

    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id"), unique=True)
    storage_key: Mapped[str] = mapped_column(String(512), unique=True)
    frame_number: Mapped[int] = mapped_column(Integer)
    frame_timestamp: Mapped[float] = mapped_column(Float)
    annotation_metadata: Mapped[dict] = mapped_column(JSON)
    content_type: Mapped[str] = mapped_column(String(128), default="image/jpeg")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    event: Mapped[Event] = relationship(back_populates="evidence")


class EvaluationRun(Base):
    """Source-backed comparison or negative-media evaluation result."""

    __tablename__ = "evaluation_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_id)
    name: Mapped[str] = mapped_column(String(256))
    run_ids: Mapped[list[str]] = mapped_column(JSON)
    manifest_reference: Mapped[str | None] = mapped_column(String(512), nullable=True)
    metrics: Mapped[dict] = mapped_column(JSON)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
