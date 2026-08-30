"""Focused API-only and unavailable-model contract tests."""

from __future__ import annotations

import hashlib
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select


def _password_hash(password: str) -> str:
    """Generate an isolated deterministic test hash without using production credentials."""
    salt = bytes.fromhex("11" * 32)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310000).hex()
    return f"pbkdf2_sha256$310000${salt.hex()}${derived}"


# The production ASGI module validates configuration at import time. These
# process-local test values allow this module to import before the fixture
# replaces every relevant setting with an isolated temporary configuration.
os.environ.setdefault("APP_SECRET_KEY", "test-module-import-session-secret")
os.environ.setdefault("OPERATOR_USERNAME", "test-module-import-operator")
os.environ.setdefault("OPERATOR_PASSWORD_HASH", _password_hash("test-module-import-password"))
os.environ.setdefault("SESSION_COOKIE_SECURE", "false")

from app.config import Settings
from app.main import create_app
from app.models import Camera, Detection, Event, Evidence, MediaAsset, ProcessingRun


@pytest.fixture
def client(tmp_path: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Create an isolated app with no configured model weights."""
    monkeypatch.setenv("APP_SECRET_KEY", "test-only-session-secret")
    monkeypatch.setenv("OPERATOR_USERNAME", "operator")
    monkeypatch.setenv("OPERATOR_PASSWORD_HASH", _password_hash("correct-password"))
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "false")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'poc.db'}")
    monkeypatch.setenv("STORAGE_ROOT", str(tmp_path / "storage"))
    monkeypatch.delenv("D_FIRE_WEIGHTS_PATH", raising=False)
    monkeypatch.delenv("PYRONEAR_WEIGHTS_PATH", raising=False)
    monkeypatch.delenv("MODEL_REGISTRY_JSON", raising=False)

    with TestClient(create_app(Settings.from_environment())) as test_client:
        yield test_client


def _login(client: TestClient) -> str:
    """Authenticate the configured test operator and return the renewed CSRF token."""
    csrf_response = client.get("/api/auth/csrf")
    assert csrf_response.status_code == 200
    csrf_token = csrf_response.json()["csrf_token"]

    login_response = client.post(
        "/api/auth/login",
        headers={"X-CSRF-Token": csrf_token},
        json={"username": "operator", "password": "correct-password"},
    )
    assert login_response.status_code == 200
    return login_response.json()["csrf_token"]


def test_json_authentication_requires_csrf_and_renews_session(client: TestClient) -> None:
    """The API exposes an unauthenticated state, enforces CSRF, and renews a valid session."""
    assert client.get("/api/auth/session").json()["authenticated"] is False

    csrf_token = client.get("/api/auth/csrf").json()["csrf_token"]
    assert client.post(
        "/api/auth/login",
        json={"username": "operator", "password": "correct-password"},
    ).status_code == 403

    login_response = client.post(
        "/api/auth/login",
        headers={"X-CSRF-Token": csrf_token},
        json={"username": "operator", "password": "correct-password"},
    )
    assert login_response.status_code == 200
    session = login_response.json()
    assert session["authenticated"] is True
    assert session["username"] == "operator"
    assert session["csrf_token"] != csrf_token

    assert client.post("/api/auth/logout").status_code == 403
    assert client.post(
        "/api/auth/logout",
        headers={"X-CSRF-Token": session["csrf_token"]},
    ).status_code == 204
    assert client.get("/api/auth/session").json()["authenticated"] is False


def test_unconfigured_model_creates_blocked_run_without_output(client: TestClient) -> None:
    """Unavailable selections persist a terminal attempt and never fabricate processing output."""
    csrf_token = _login(client)

    import app.main as main

    with main.app_state.session_factory() as db:
        camera = Camera(identifier="CAM-TEST", name="CAM-TEST")
        db.add(camera)
        db.flush()
        media = MediaAsset(
            camera_id=camera.id,
            original_filename="authorized.jpg",
            content_type="image/jpeg",
            media_kind="image",
            storage_key="media/not-decoded.jpg",
            size_bytes=1,
            width=1,
            height=1,
        )
        db.add(media)
        db.commit()
        media_id = media.id

    response = client.post(
        "/api/processing/runs",
        headers={"X-CSRF-Token": csrf_token},
        json={"media_id": media_id, "model_id": "dfire", "replay_mode": False},
    )

    assert response.status_code == 202
    run = response.json()
    assert run["status"] == "blocked"
    assert run["failure_code"] == "MODEL_NOT_CONFIGURED"
    assert run["progress_percent"] == 0.0

    with main.app_state.session_factory() as db:
        persisted = db.get(ProcessingRun, run["id"])
        assert persisted is not None
        assert persisted.status == "blocked"
        assert persisted.failure_code == "MODEL_NOT_CONFIGURED"
        assert db.scalar(select(func.count()).select_from(Detection).where(Detection.run_id == run["id"])) == 0
        assert db.scalar(select(func.count()).select_from(Event).where(Event.run_id == run["id"])) == 0
        assert db.scalar(select(func.count()).select_from(Evidence)) == 0


def test_model_registry_metadata_cannot_override_weight_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    """Only dedicated environment variables define model paths; registry JSON controls safe metadata."""
    monkeypatch.setenv("APP_SECRET_KEY", "test-only-session-secret")
    monkeypatch.setenv("OPERATOR_USERNAME", "operator")
    monkeypatch.setenv("OPERATOR_PASSWORD_HASH", _password_hash("correct-password"))
    monkeypatch.setenv("D_FIRE_WEIGHTS_PATH", "/configured/dfire.pt")
    monkeypatch.setenv(
        "MODEL_REGISTRY_JSON",
        (
            '{"dfire":{"weights_path":"/untrusted/path.pt","labels":{"Smoke plume":"smoke","Flame":"fire"},'
            '"license_note":"Configured label metadata"}}'
        ),
    )

    registry = Settings.from_environment().model_registry()

    assert registry["dfire"]["weights_path"] == "/configured/dfire.pt"
    assert registry["dfire"]["labels"] == {"smoke plume": "smoke", "flame": "fire"}
    assert registry["dfire"]["license_note"] == "Configured label metadata"
