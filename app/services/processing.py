"""Bounded in-process POC worker for uploaded-media processing."""

from __future__ import annotations

import queue
import threading
import time
from datetime import datetime, timezone

from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.models import Detection, Event, MediaAsset, ProcessingRun
from app.services.decision import DecisionEngine
from app.services.evidence import create_evidence
from app.services.inference import InferenceService, MODEL_READY
from app.services.storage import PrivateStorage
from app.services.video import decode_samples


class ProcessingWorker:
    """Single-threaded POC worker; intentionally not a durable production job system."""

    def __init__(
        self,
        settings: Settings,
        session_factory: sessionmaker[Session],
        storage: PrivateStorage,
        inference: InferenceService,
    ) -> None:
        self.settings = settings
        self.session_factory = session_factory
        self.storage = storage
        self.inference = inference
        self._queue: queue.Queue[str | None] = queue.Queue()
        self._thread = threading.Thread(target=self._consume, name="poc-processing-worker", daemon=True)
        self._started = False

    def start(self) -> None:
        """Start the bounded worker once application persistence is available."""
        if not self._started:
            self._thread.start()
            self._started = True

    def stop(self) -> None:
        """Request worker shutdown without abandoning current work."""
        if self._started:
            self._queue.put(None)
            self._thread.join(timeout=10)
            self._started = False

    def enqueue(self, run_id: str) -> None:
        """Queue a newly persisted processing run."""
        self._queue.put(run_id)

    def _consume(self) -> None:
        while True:
            run_id = self._queue.get()
            if run_id is None:
                return
            self._process(run_id)

    def _process(self, run_id: str) -> None:
        db = self.session_factory()
        try:
            run = db.get(ProcessingRun, run_id)
            if not run:
                return
            media = db.get(MediaAsset, run.media_id)
            if not media:
                raise RuntimeError("Referenced media no longer exists.")
            readiness = self.inference.readiness(run.model_identifier)
            if readiness["code"] != MODEL_READY:
                run.status = "blocked"
                run.failure_code = readiness["code"]
                run.error_message = readiness["detail"]
                run.progress_percent = 0.0
                run.completed_at = datetime.now(timezone.utc)
                db.commit()
                return

            run.status = "running"
            run.started_at = datetime.now(timezone.utc)
            db.commit()

            config = run.configuration
            total, samples = decode_samples(
                self.storage.media_path(media.storage_key),
                media.media_kind,
                float(config["sample_fps"]),
            )
            run.total_frames = total
            db.commit()

            engine = DecisionEngine(
                float(config["confidence_threshold"]),
                int(config["persistence_frames"]),
                int(config["event_cooldown_seconds"]),
            )
            for index, sample in enumerate(samples, start=1):
                predictions = self.inference.predict(run.model_identifier, sample.image)
                best_by_label = {}
                for prediction in predictions:
                    detection = Detection(
                        run_id=run.id,
                        frame_number=sample.frame_number,
                        frame_timestamp=sample.timestamp_seconds,
                        normalized_label=prediction.label,
                        confidence=prediction.confidence,
                        bounding_box=prediction.bounding_box,
                        model_identifier=run.model_identifier,
                    )
                    db.add(detection)
                    db.flush()
                    if (
                        prediction.label not in best_by_label
                        or detection.confidence > best_by_label[prediction.label].confidence
                    ):
                        best_by_label[prediction.label] = detection

                for label in ("smoke", "fire"):
                    trigger = engine.consider(db, media.camera_id, label, best_by_label.get(label))
                    if not trigger:
                        continue
                    event = Event(
                        run_id=run.id,
                        camera_id=media.camera_id,
                        event_type="SMOKE_DETECTED" if trigger.normalized_label == "smoke" else "FIRE_DETECTED",
                        confidence=trigger.confidence,
                        trigger_detection_id=trigger.id,
                    )
                    db.add(event)
                    db.flush()
                    evidence = create_evidence(self.storage, event, trigger, sample.image)
                    db.add(evidence)

                run.processed_frames = index
                run.progress_percent = min(99.0, index / max(total, 1) * 100)
                db.commit()

                if run.replay_mode:
                    time.sleep(max(0, 1 / float(config["sample_fps"]) / float(config["replay_speed_multiplier"])))

            run.status = "completed"
            run.progress_percent = 100.0
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
        except Exception as error:
            db.rollback()
            failed_run = db.get(ProcessingRun, run_id)
            if failed_run:
                failed_run.status = "failed"
                failed_run.error_message = str(error)[:500]
                failed_run.completed_at = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()
