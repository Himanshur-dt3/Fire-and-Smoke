"""Pydantic request and response schemas for protected POC APIs."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class RunCreateRequest(BaseModel):
    """Request to queue real processing for an uploaded asset."""

    media_id: str = Field(..., description="Identifier of a previously uploaded private media asset.")
    model_id: str = Field(..., pattern="^(dfire|pyronear)$", description="Configured model registry identifier.")
    replay_mode: bool = Field(False, description="Whether video progress should use simulated-live pacing.")


class LoginRequest(BaseModel):
    """JSON credentials used to establish an operator session."""

    username: str = Field(..., min_length=1, max_length=128, description="Configured operator username.")
    password: str = Field(..., min_length=1, max_length=1024, description="Operator password supplied only for verification.")


class AcknowledgeRequest(BaseModel):
    """Request body for an operator acknowledgement."""

    note: str | None = Field(None, max_length=1000, description="Optional operator acknowledgement note.")


class EvaluationCreateRequest(BaseModel):
    """Request to retain a comparison result grounded in supplied run data."""

    name: str = Field(..., min_length=1, max_length=256, description="Human-readable evaluation name.")
    run_ids: list[str] = Field(..., min_length=1, description="Completed processing run identifiers.")
    manifest_reference: str | None = Field(
        None, max_length=512, description="Reference to an authorised labelled manifest; not uploaded content."
    )
    labels: dict[str, object] | None = Field(
        None, description="Optional supplied label summary used only for source-supported metric calculations."
    )
    notes: str | None = Field(None, max_length=5000, description="Optional evaluation context.")
