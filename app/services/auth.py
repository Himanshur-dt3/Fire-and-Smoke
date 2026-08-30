"""Password verification and configured operator provisioning."""

from __future__ import annotations

import hashlib
import hmac
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import User


class AuthenticationError(ValueError):
    """Raised for invalid credential configuration or authentication attempts."""


def verify_password(password: str, encoded_hash: str) -> bool:
    """Verify a PBKDF2-SHA256 password hash without retaining plaintext credentials."""
    try:
        algorithm, iteration_text, salt_hex, expected_hex = encoded_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iteration_text),
        ).hex()
        return hmac.compare_digest(derived, expected_hex)
    except (TypeError, ValueError):
        return False


def provision_operator(db: Session, settings: Settings) -> User:
    """Create or update the configured POC operator account with its supplied hash."""
    user = db.scalar(select(User).where(User.username == settings.operator_username))
    if user:
        user.password_hash = settings.operator_password_hash
        user.is_active = True
    else:
        user = User(username=settings.operator_username, password_hash=settings.operator_password_hash)
        db.add(user)
    db.commit()
    db.refresh(user)
    return user


# PUBLIC_INTERFACE
def generate_pbkdf2_hash(password: str, iterations: int = 310000) -> str:
    """Generate a PBKDF2-SHA256 hash for secure operator configuration setup."""
    salt = os.urandom(32)
    encoded = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations).hex()
    return f"pbkdf2_sha256${iterations}${salt.hex()}${encoded}"
