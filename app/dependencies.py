"""Authentication and CSRF dependencies for browser and JSON endpoints."""

from __future__ import annotations

import secrets

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User


# PUBLIC_INTERFACE
def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Return the authenticated active user, or reject unauthenticated requests."""
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required.")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication is required.")
    return user


# PUBLIC_INTERFACE
def require_csrf(request: Request) -> None:
    """Validate the token accompanying a browser state-changing request."""
    expected = request.session.get("csrf_token")
    received = request.headers.get("X-CSRF-Token") or request.query_params.get("csrf_token")
    if not expected or not received or not secrets.compare_digest(expected, received):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token.")


# PUBLIC_INTERFACE
def csrf_token(request: Request) -> str:
    """Return a session-bound CSRF token, creating one when needed."""
    token = request.session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        request.session["csrf_token"] = token
    return token
