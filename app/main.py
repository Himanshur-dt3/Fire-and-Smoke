"""FastAPI entrypoint for the Renewi Fire & Smoke Detection POC."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.middleware.sessions import SessionMiddleware

from app.config import Settings, SettingsError
from app.db import build_session_factory, initialize_database
from app.routers import auth, dashboard, evaluations, events, media, processing
from app.services.auth import provision_operator
from app.services.inference import InferenceService
from app.services.processing import ProcessingWorker
from app.services.storage import PrivateStorage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)


@dataclass
class AppState:
    """Runtime dependencies shared by routers and the in-process worker."""

    settings: Settings
    session_factory: object
    storage: PrivateStorage
    inference: InferenceService
    worker: ProcessingWorker


app_state: AppState


# PUBLIC_INTERFACE
def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the API-only POC application using validated runtime settings.

    Args:
        settings: Optional validated settings, primarily for isolated tests.

    Returns:
        A FastAPI application with protected JSON routes and session middleware.
    """
    configured_settings = settings or Settings.from_environment()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        """Initialize persistence and bounded processing after configuration is validated."""
        global app_state

        session_factory = build_session_factory(configured_settings)
        initialize_database(session_factory)
        storage = PrivateStorage(configured_settings)
        inference = InferenceService(configured_settings)
        worker = ProcessingWorker(configured_settings, session_factory, storage, inference)
        with session_factory() as db:
            provision_operator(db, configured_settings)

        app_state = AppState(configured_settings, session_factory, storage, inference, worker)
        worker.start()
        logger.info("Fire and smoke POC started; configured model readiness: %s", inference.all_readiness())
        try:
            yield
        finally:
            worker.stop()
            logger.info("Fire and smoke POC stopped.")

    application = FastAPI(
        title="Renewi Fire & Smoke Detection POC API",
        description=(
            "Authenticated API-only POC for private uploaded-media processing, real configured YOLO inference, "
            "evidence-backed fire/smoke events, and operator acknowledgement. No live Renewi camera integration."
        ),
        version="0.1.0",
        openapi_tags=[
            {"name": "Authentication", "description": "Operator JSON session and CSRF endpoints."},
            {"name": "Media", "description": "Private upload ingestion."},
            {"name": "Processing", "description": "Real model run lifecycle and unavailable-model attempts."},
            {"name": "Events and evidence", "description": "Operational event review and protected evidence."},
            {"name": "Dashboard", "description": "Authenticated operator dashboard state."},
            {"name": "Evaluation", "description": "Source-backed comparisons and negative-media results."},
        ],
        lifespan=lifespan,
    )
    application.add_middleware(
        SessionMiddleware,
        secret_key=configured_settings.app_secret_key,
        https_only=configured_settings.session_cookie_secure,
        same_site="lax",
    )

    application.include_router(auth.router)
    application.include_router(media.router)
    application.include_router(processing.router)
    application.include_router(events.router)
    application.include_router(dashboard.router)
    application.include_router(evaluations.router)

    @application.exception_handler(SettingsError)
    async def settings_error_handler(_, error: SettingsError) -> JSONResponse:
        """Return safe configuration errors without exposing secret values."""
        return JSONResponse(status_code=500, content={"detail": str(error)})

    # PUBLIC_INTERFACE
    @application.get("/health", tags=["Dashboard"], summary="Get basic POC service health")
    def health() -> dict:
        """Return non-sensitive service and model-readiness state for runtime checks."""
        return {
            "status": "ok",
            "service": "renewi-fire-smoke-poc",
            "models": app_state.inference.all_readiness(),
            "poc_boundary": "Not a production fire-safety system or live Renewi camera integration.",
        }

    return application


# Settings are intentionally read before SessionMiddleware is configured.
app = create_app()
