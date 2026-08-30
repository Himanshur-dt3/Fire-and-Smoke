# Phase-2 Pilot Handoff

## Delivered POC outcome

The delivered POC is a two-container application. A publicly reachable Next.js operator dashboard proxies same-origin browser requests to an internal FastAPI API-only service. The FastAPI service owns session and CSRF enforcement, private uploaded-media and evidence storage, SQLite POC persistence, real local Ultralytics/YOLO inference when compatible weights are configured, decisioning, event generation, acknowledgement, and evaluation records.

The dashboard is the sole browser interface in the Compose topology. The FastAPI service is not published to the host and retains the `fire-smoke-runtime` volume privately. Optional externally supplied model files are mounted read-only into the FastAPI service and are not copied into either image.

## Verified no-model behavior

The POC can start and support non-inference workflows without configured weights, provided secure runtime credentials are supplied. It reports `MODEL_NOT_CONFIGURED` when no local model path is configured and `MODEL_NOT_READY` when a configured path is unavailable or incompatible. A selected unavailable model creates a persisted terminal `blocked` processing attempt and does not decode media or create fabricated detections, events, or evidence.

Focused API validation passed on 2026-08-29 with isolated credentials and no configured weights. `python -m pytest tests/test_api_contract.py -q` reported `3 passed in 2.83s`, covering JSON authentication and CSRF enforcement, the blocked-run contract, and protection against model-path changes through model-registry metadata. This evidence does not demonstrate a real model run, dashboard browser flow, or composed container runtime.

## Deferred runtime validation

Docker and Node.js 20 were unavailable in the implementation environment. The available Node.js version was 18.20.8, dashboard dependencies were not installed, and a non-interactive package-install attempt stalled and was terminated. As a result, the following checks remain deferred rather than passed:

- Building the `operator-dashboard` production image and inspecting its contents.
- Building and starting the Compose stack with temporary runtime-only credentials and blank model paths.
- Testing dashboard login, cookie forwarding, CSRF enforcement, upload, blocked-run status, history, protected evidence, and sanitized settings through the same-origin proxy.
- Running the dashboard's declared `npm run test` and `npm run build` commands in a Node.js 20 environment.

The safe next validation environment has Docker and Node.js 20 available. It should use a non-committed `.env` with temporary valid values, blank weight paths, and `SESSION_COOKIE_SECURE=false` only for local HTTP validation. It should then run `docker compose up --build` and verify the protected dashboard workflow before retiring any legacy interface assets.

## Required external model and data assets

Real inference is intentionally configured but not validated because no compatible model assets are in the repository. Before a real model run, project owners must provide compatible licensed D-Fire and/or Pyronear weights, verified class-label mappings, and an approved host location mounted read-only through `MODEL_WEIGHTS_DIR`. The environment must set `D_FIRE_WEIGHTS_PATH` and/or `PYRONEAR_WEIGHTS_PATH` to the corresponding container path. `MODEL_REGISTRY_JSON` may provide label aliases and licence notes, but it cannot replace the dedicated model-path settings.

Before making site-specific model claims, Renewi safety and data owners must also provide authorised positive footage or images, hard-negative media for steam, dust, exhaust, glare, mist, and low-light conditions, and labelled manifests with onset timestamps where relevant. The POC must calculate precision, recall, false-positive metrics, or time-to-detect only where those supplied labels support the calculation.

## Required Phase-2 decisions

Before a site pilot or any production claim, the project must obtain footage-access authority and define privacy, retention, deletion, viewer permissions, operator response procedures, incident escalation, and security controls. It must validate site-specific model performance, false alarms, latency, weather and lighting effects, and night or low-light behaviour against authorised representative data.

The project must resolve commercial licensing for Ultralytics (AGPL-3.0 vs commercial license), every selected model (D-Fire MIT, Pyronear Apache 2.0), weights, datasets, and any fine-tuned derivative. It must define target identity, deployment, persistence, backup, recovery, monitoring, and service ownership contracts. RTSP, VMS, or NVR integration must remain out of scope until network, cybersecurity, and operations approvals exist.

### Phase 2 Scope & Roadmap
1. **Live Camera Stream Integration**: RTSP / ONVIF stream ingest into real-time processing pipelines.
2. **Site & Edge Deployment**: On-premise deployment at Renewi recycling facilities (e.g. edge AI hardware or local processing servers).
3. **Fine-Tuning on Renewi Facility Footage**: Training and fine-tuning models using site-specific Renewi waste stream footage (steam, dust, machinery exhaust, glare).
4. **Night & Low-Light Testing**: Evaluating model accuracy under thermal/IR and low-light environmental conditions.
5. **Pilot Hardening & VMS Integration**: Integration with existing site VMS/NVR alerting workflows and operator notification systems.

SQLite and the in-process worker are suitable only for this bounded upload/replay POC. A pilot requiring restart-safe or multi-camera handling must use durable processing, managed persistence, appropriate backup and recovery controls, and an approved operational support model.

## Evidence to retain during evaluation

For each authorised real model run, retain the processing-run identifier, model identifier, immutable decision snapshot, source-media authority, genuine raw detections, created event identifiers, protected evidence identifiers, and any labelled-manifest reference. Record unavailable metrics when labels are absent. Do not treat the absence of model weights, authorised media, Docker validation, or Node.js 20 validation as successful production evidence.
