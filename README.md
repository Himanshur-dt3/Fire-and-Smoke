# Renewi Fire & Smoke Detection POC

The Renewi Fire & Smoke Detection proof of concept is a two-container application for authenticated processing of authorised image and video uploads. The publicly reachable Next.js operator dashboard provides the browser experience, while an internal FastAPI service owns operator sessions, private media and evidence storage, SQLite POC persistence, processing runs, real local Ultralytics/YOLO inference when configured, decisioning, events, and evaluations.

## POC boundary

This application is not a production fire alarm, a replacement for existing safety systems, or a live Renewi camera integration. It accepts authorised image and video uploads and can replay recorded video through the processing workflow. It does not connect to RTSP, VMS, NVR, or live CCTV feeds, and it does not establish Renewi-specific accuracy, false-alarm, low-light, retention-compliance, licence-clearance, or response-time claims.

### Model & Framework Licensing Summary
- **D-Fire Weights/Model**: Licensed under MIT License.
- **Pyronear YOLOv11s Weights/Model**: Licensed under Apache License 2.0.
- **Ultralytics YOLO Engine**: Open-source dual-licensed under AGPL-3.0. Enterprise commercial licensing must be acquired before proprietary production deployment.
- **Dataset Licensing**: License terms of training datasets must be explicitly verified and cleared prior to production use.

The application deliberately does not fabricate model output. When compatible model weights are unavailable (such as Pyronear currently reporting `MODEL_NOT_CONFIGURED`), it continues to provide authenticated operational workflows while recording an explicit unavailable-model state rather than creating substitute detections, events, or evidence.

## Runtime architecture

The Compose runtime defines two services:

| Service | Exposure and responsibility |
| --- | --- |
| `operator-dashboard` | The only published service. It serves the Next.js operator dashboard on port `3000` by default and proxies browser requests through the same-origin `/backend` route. |
| `fire-smoke-api` | A FastAPI API-only service exposed only to the internal `private-api` network. It owns authenticated JSON APIs, session and CSRF enforcement, private persistence, media processing, inference, events, evidence, and evaluations. |

The dashboard receives `BACKEND_INTERNAL_URL=http://fire-smoke-api:8000` only as a server-side runtime variable. Browser code uses relative `/backend/api/...` paths and does not receive the internal FastAPI hostname, backend secret, password hash, storage location, or model paths.

A named `fire-smoke-runtime` volume is mounted only into `fire-smoke-api` at `/app/runtime`. It contains the POC SQLite database and private uploaded-media and evidence storage. The optional host model directory is mounted only into `fire-smoke-api` at `/models` and is read-only.

## Secure configuration

Copy `.env.example` to a non-committed runtime environment file and replace every example credential before starting the stack. `APP_SECRET_KEY`, `OPERATOR_USERNAME`, `OPERATOR_PASSWORD_HASH`, and `SESSION_COOKIE_SECURE` are required by Compose. `OPERATOR_PASSWORD_HASH` must be a real PBKDF2 hash rather than a plaintext password or the example value.

`SESSION_COOKIE_SECURE=true` is required behind HTTPS. It may be set to `false` only for a local HTTP development runtime. The dashboard does not need a separate secret; its optional `operator-dashboard/.env.example` documents the server-only backend address for non-Compose development.

```bash
cd Fire-and-Smoke
cp .env.example .env
# Replace the example secret and password hash in .env.
docker compose up --build
```

The dashboard is expected at `http://localhost:3000` unless `DASHBOARD_PORT` changes it. The FastAPI port is intentionally not published by Compose. Its `/health` endpoint is available within the private container network and reports non-sensitive service and model-readiness information.

## Model configuration and unavailable-model operation

The real inference adapter loads local Ultralytics/YOLO weights only after a selected configured file is available. It never downloads, generates, mocks, or substitutes model weights. Set one or both of the following container paths only after compatible weights have been supplied through the read-only `MODEL_WEIGHTS_DIR` mount:

| Variable | Purpose |
| --- | --- |
| `D_FIRE_WEIGHTS_PATH` | Optional path to compatible D-Fire weights, such as `/models/dfire.pt`. |
| `PYRONEAR_WEIGHTS_PATH` | Optional path to compatible Pyronear weights. |
| `MODEL_REGISTRY_JSON` | Optional JSON for label aliases and licence notes only. It cannot override either weight path. |

The dashboard and API return one of these stable readiness codes without exposing filesystem paths:

| Code | Meaning and operational result |
| --- | --- |
| `MODEL_READY` | The configured local weights exist and loaded as a compatible YOLO model. A processing run can use real inference. |
| `MODEL_NOT_CONFIGURED` | The selected model has no configured local weight path. A processing request persists a terminal `blocked` run and creates no detections, events, or evidence. |
| `MODEL_NOT_READY` | A configured path is unavailable or the weights cannot load as a compatible YOLO model. A processing request persists a terminal `blocked` run and creates no detections, events, or evidence. |

Without weights, an authenticated operator can still sign in, inspect model readiness and sanitized settings, upload authorised media, create a traceable blocked processing attempt, view historical events, inspect previously retained evidence, and acknowledge existing alerts. Actual inference requires compatible weights and verified labels; objective accuracy, false-positive, or time-to-detect evaluation also requires authorised labelled and hard-negative media.

## Operator workflow and protection

The dashboard obtains a session-bound CSRF token from `GET /backend/api/auth/csrf` before login and other state-changing requests. Login, logout, uploads, processing-run creation, and event acknowledgement remain protected by the FastAPI service even though the dashboard proxies the requests.

Uploaded source media and annotated evidence remain private. Evidence bytes are served only from the authenticated evidence endpoint after persisted-record lookup. The API exposes sanitized operational settings, but it does not expose `APP_SECRET_KEY`, password hashes, local model paths, storage keys, or filesystem locations.

## Validation status

The focused FastAPI API-only and unavailable-model contract validation passed on 2026-08-29. Running `python -m pytest tests/test_api_contract.py -q` with isolated runtime settings produced `3 passed in 2.83s`. The evidence covers JSON session and CSRF enforcement, a persisted `blocked` `MODEL_NOT_CONFIGURED` run with zero detections, events, and evidence, and prevention of model-path override through `MODEL_REGISTRY_JSON`.

Docker, Compose, dashboard package, dashboard test, dashboard production-build, browser-flow, and image-content validation are deferred. The execution environment did not provide Docker or Node.js 20; it provided Node.js 18.20.8, dashboard dependencies were not installed, and a non-interactive package-install attempt stalled and was stopped. This documentation does not claim that `docker compose up --build`, `npm run test`, `npm run build`, or a browser workflow has passed.

Real-inference validation is also deferred until the project provides compatible licensed D-Fire and/or Pyronear weights, verified class-label mappings, an approved read-only mount location, and authorised media. Labelled positive and hard-negative media with suitable ground truth are additionally required before recording precision, recall, false-positive, or time-to-detect results.

## Extension and Phase-2 gate

Before a site pilot or production consideration, replace the POC's in-process worker and SQLite persistence with durable services appropriate to the target recovery and throughput requirements. Obtain approvals for footage privacy, access, retention, deletion, model and framework licensing, network integration, incident response, and any RTSP, VMS, or NVR connection.

Do not retire or bypass current safety systems on the basis of this POC. The Phase-2 handoff in [`docs/phase-2-pilot.md`](docs/phase-2-pilot.md) records the required operational, governance, model, and site-validation gates.
