"""Protected evaluation API for actual recorded runs."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user, require_csrf
from app.models import EvaluationRun, User
from app.schemas import EvaluationCreateRequest
from app.services.evaluation import EvaluationError, calculate_metrics

router = APIRouter(prefix="/api/evaluations", tags=["Evaluation"])


def _evaluation_dict(evaluation: EvaluationRun) -> dict:
    return {
        "id": evaluation.id,
        "name": evaluation.name,
        "run_ids": evaluation.run_ids,
        "manifest_reference": evaluation.manifest_reference,
        "metrics": evaluation.metrics,
        "notes": evaluation.notes,
        "created_at": evaluation.created_at,
    }


# PUBLIC_INTERFACE
@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a source-backed evaluation")
def create_evaluation(
    payload: EvaluationCreateRequest,
    _: None = Depends(require_csrf),
    db: Session = Depends(get_db),
    __: User = Depends(get_current_user),
) -> dict:
    """Persist comparison context and only calculate metrics supported by supplied labels.

    Args:
        payload: Completed run references plus optional labelled-manifest summary.
        db: Authenticated request database session.

    Returns:
        The persisted evaluation record with metrics and creation timestamp.

    Raises:
        HTTPException: If any selected run is absent, incomplete, or unsuitable for evaluation.
    """
    try:
        metrics = calculate_metrics(db, payload.run_ids, payload.labels)
    except EvaluationError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error
    evaluation = EvaluationRun(
        name=payload.name,
        run_ids=list(dict.fromkeys(payload.run_ids)),
        manifest_reference=payload.manifest_reference,
        metrics=metrics,
        notes=payload.notes,
    )
    db.add(evaluation)
    db.commit()
    db.refresh(evaluation)
    return _evaluation_dict(evaluation)


# PUBLIC_INTERFACE
@router.get("", summary="List stored evaluation records")
def list_evaluations(
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Return stored evaluation history ordered by creation date.

    Args:
        limit: Maximum number of records to return.
        db: Authenticated request database session.

    Returns:
        A list of persisted evaluation records.
    """
    evaluations = list(db.scalars(select(EvaluationRun).order_by(EvaluationRun.created_at.desc()).limit(limit)))
    return {"items": [_evaluation_dict(item) for item in evaluations]}


# PUBLIC_INTERFACE
@router.get("/{evaluation_id}", summary="Get a stored evaluation")
def get_evaluation(
    evaluation_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    """Retrieve persisted evaluation metadata and explicitly unavailable metric values.

    Args:
        evaluation_id: Persisted evaluation identifier.
        db: Authenticated request database session.

    Returns:
        The stored run references, source context, and calculated or unavailable metrics.

    Raises:
        HTTPException: If the requested evaluation record does not exist.
    """
    evaluation = db.get(EvaluationRun, evaluation_id)
    if not evaluation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evaluation was not found.")
    return _evaluation_dict(evaluation)
