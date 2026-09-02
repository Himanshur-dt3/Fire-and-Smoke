"""Bounded in-process POC worker for uploaded-media processing."""

from __future__ import annotations

import logging
import queue
import threading
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.models import Detection, Event, MediaAsset, ProcessingRun
from app.services.decision import DecisionEngine
from app.services.evidence import create_evidence
from app.services.inference import InferenceService, MODEL_READY
from app.services.storage import PrivateStorage
from app.services.video import decode_samples

logger = logging.getLogger(__name__)


class ProcessingWorker:
    """Single-threaded POC worker with DB recovery for queued runs."""

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

        self._thread = threading.Thread(
            target=self._consume,
            name="poc-processing-worker",
            daemon=True,
        )

        self._started = False
        self._stop_event = threading.Event()

    def start(self) -> None:
        """Start the worker once."""
        if self._started:
            return

        self._stop_event.clear()
        self._thread.start()
        self._started = True

        logger.info("Processing worker started")

    def stop(self) -> None:
        """Stop the worker."""
        if not self._started:
            return

        self._stop_event.set()
        self._queue.put(None)
        self._thread.join(timeout=10)

        self._started = False

        logger.info("Processing worker stopped")

    def enqueue(self, run_id: str) -> None:
        """Wake the worker for a newly created processing run."""
        logger.info("Enqueued processing run %s", run_id)
        self._queue.put(run_id)

    def _next_queued_run_id(self) -> str | None:
        """
        Recover persisted queued runs.

        This is the important fix: processing no longer depends
        exclusively on the in-memory queue.
        """
        db = self.session_factory()

        try:
            run = db.scalar(
                select(ProcessingRun)
                .where(ProcessingRun.status == "queued")
                .order_by(ProcessingRun.created_at.asc())
                .limit(1)
            )

            return run.id if run else None

        finally:
            db.close()

    def _consume(self) -> None:
        """
        Consume newly queued jobs and continuously recover
        persisted queued jobs.
        """
        while not self._stop_event.is_set():

            run_id: str | None = None

            try:
                run_id = self._queue.get(timeout=1.0)

            except queue.Empty:
                run_id = self._next_queued_run_id()

            if run_id is None:
                continue

            try:
                self._process(run_id)

            except Exception:
                logger.exception(
                    "Unhandled processing worker error for run %s",
                    run_id,
                )

    def _process(self, run_id: str) -> None:
        db = self.session_factory()

        try:
            run = db.get(ProcessingRun, run_id)

            if not run:
                logger.warning(
                    "Queued run %s no longer exists",
                    run_id,
                )
                return

            if run.status != "queued":
                logger.info(
                    "Skipping run %s because status is %s",
                    run_id,
                    run.status,
                )
                return

            media = db.get(MediaAsset, run.media_id)

            if not media:
                raise RuntimeError(
                    "Referenced media no longer exists."
                )

            readiness = self.inference.readiness(
                run.model_identifier
            )

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

            logger.info(
                "Started processing run %s with model %s",
                run_id,
                run.model_identifier,
            )

            config = run.configuration

            total, samples = decode_samples(
                self.storage.media_path(
                    media.storage_key
                ),
                media.media_kind,
                float(config["sample_fps"]),
            )

            run.total_frames = total

            db.commit()

            model_metadata = self.settings.model_registry().get(
                run.model_identifier,
                {},
            )

            confidence_threshold = float(
                model_metadata.get(
                    "confidence_threshold",
                    config["confidence_threshold"],
                )
            )

            persistence_frames = int(
                model_metadata.get(
                    "persistence_frames",
                    config["persistence_frames"],
                )
            )

            engine = DecisionEngine(
                confidence_threshold,
                persistence_frames,
                int(config["event_cooldown_seconds"]),
            )

            for index, sample in enumerate(
                samples,
                start=1,
            ):

                predictions = self.inference.predict(
                    run.model_identifier,
                    sample.image,
                )

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
                        or detection.confidence
                        > best_by_label[
                            prediction.label
                        ].confidence
                    ):
                        best_by_label[
                            prediction.label
                        ] = detection

                for label in ("smoke", "fire"):

                    trigger = engine.consider(
                        db,
                        media.camera_id,
                        label,
                        best_by_label.get(label),
                    )

                    if not trigger:
                        continue

                    event = Event(
                        run_id=run.id,
                        camera_id=media.camera_id,
                        event_type=(
                            "SMOKE_DETECTED"
                            if trigger.normalized_label
                            == "smoke"
                            else "FIRE_DETECTED"
                        ),
                        confidence=trigger.confidence,
                        trigger_detection_id=trigger.id,
                    )

                    db.add(event)
                    db.flush()

                    evidence = create_evidence(
                        self.storage,
                        event,
                        trigger,
                        sample.image,
                    )

                    db.add(evidence)

                run.processed_frames = index

                run.progress_percent = min(
                    99.0,
                    index / max(total, 1) * 100,
                )

                db.commit()

                if run.replay_mode:

                    time.sleep(
                        max(
                            0,
                            1
                            / float(config["sample_fps"])
                            / float(
                                config[
                                    "replay_speed_multiplier"
                                ]
                            ),
                        )
                    )

            run.status = "completed"
            run.progress_percent = 100.0
            run.completed_at = datetime.now(timezone.utc)

            db.commit()

            logger.info(
                "Completed processing run %s",
                run_id,
            )

        except Exception as error:

            db.rollback()

            failed_run = db.get(
                ProcessingRun,
                run_id,
            )

            if failed_run:

                failed_run.status = "failed"

                failed_run.error_message = str(error)[
                    :500
                ]

                failed_run.completed_at = datetime.now(
                    timezone.utc
                )

                db.commit()

            logger.exception(
                "Processing run %s failed",
                run_id,
            )

        finally:
            db.close()
