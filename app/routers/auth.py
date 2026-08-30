"""JSON session authentication routes for the API-only POC."""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import csrf_token, get_current_user, require_csrf
from app.models import User
from app.schemas import LoginRequest
from app.services.auth import verify_password

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


# PUBLIC_INTERFACE
@router.get("/csrf", summary="Get a session-bound CSRF token")
def get_csrf_token(request: Request) -> dict[str, str]:
    """Create or return the CSRF token required by JSON state-changing requests.

    Args:
        request: Browser request carrying the signed session cookie.

    Returns:
        A JSON object containing the session-bound CSRF token.
    """
    return {"csrf_token": csrf_token(request)}


# PUBLIC_INTERFACE
@router.post("/login", summary="Authenticate an operator with JSON credentials")
def login(
    payload: LoginRequest,
    request: Request,
    _: None = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> dict[str, str | bool]:
    """Verify operator credentials and create a renewed signed session.

    Args:
        payload: JSON username and password credentials.
        request: Browser request carrying the pre-login CSRF session.
        db: Database session used to look up the configured operator.

    Returns:
        Authenticated session state with a renewed CSRF token.

    Raises:
        HTTPException: If credentials do not match an active configured operator.
    """
    user = db.query(User).filter(User.username == payload.username).one_or_none()
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password.")

    request.session.clear()
    request.session["user_id"] = user.id
    token = secrets.token_urlsafe(32)
    request.session["csrf_token"] = token
    return {"authenticated": True, "username": user.username, "csrf_token": token}


# PUBLIC_INTERFACE
@router.get("/session", summary="Get the current operator session state")
def session_status(request: Request, db: Session = Depends(get_db)) -> dict[str, str | bool | None]:
    """Return safe session state without exposing protected data to unauthenticated callers.

    Args:
        request: Browser request containing an optional signed session.
        db: Database session used to validate the session user.

    Returns:
        Authentication state and, only for an active user, username and CSRF token.
    """
    user_id = request.session.get("user_id")
    if not user_id:
        return {"authenticated": False, "username": None, "csrf_token": None}

    user = db.get(User, user_id)
    if not user or not user.is_active:
        request.session.clear()
        return {"authenticated": False, "username": None, "csrf_token": None}

    return {"authenticated": True, "username": user.username, "csrf_token": csrf_token(request)}


# PUBLIC_INTERFACE
@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="End the current operator session")
def logout(
    request: Request,
    _: None = Depends(require_csrf),
    __: User = Depends(get_current_user),
) -> Response:
    """Clear the authenticated session after validating the session CSRF token.

    Args:
        request: Authenticated request carrying the CSRF token.

    Returns:
        An empty successful response after the session is cleared.
    """
    request.session.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
