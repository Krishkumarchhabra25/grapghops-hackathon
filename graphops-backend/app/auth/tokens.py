"""JWT signing and verification. Only sub, ws, and role live in the token."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.config import get_settings

log = logging.getLogger('graphops.auth.tokens')


def create_token(user_id: str, workspace_id: str, role: str) -> str:
    """Sign a short-lived JWT with the minimum claim set."""
    s = get_settings()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        'sub': user_id,
        'ws': workspace_id,
        'role': role,
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(seconds=s.jwt_ttl_seconds)).timestamp()),
        'typ': 'session',
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any] | None:
    """Return the payload if the token is valid, else None. Never raises."""
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
    except JWTError as e:
        log.debug('jwt decode failed: %s', e)
        return None

    # Reject tokens not minted as sessions
    if payload.get('typ') != 'session':
        return None
    if not payload.get('sub') or not payload.get('ws'):
        return None
    return payload