"""FastAPI dependencies: extract and validate the current user."""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.auth import tokens as token_service
from app.auth.service import AuthenticatedUser
from app.config import get_settings

log = logging.getLogger('graphops.api.deps')

# Role hierarchy: each role implies all permissions of roles to its left.
_ROLE_RANK = {
    'Viewer': 10,
    'Engineer': 20,
    'Admin': 30,
    'Owner': 40,
}


def _extract_token(request: Request) -> str | None:
    """Read the session token from the cookie or the Authorization header."""
    s = get_settings()

    # 1) HTTP-only cookie (browser)
    token = request.cookies.get(s.cookie_name)
    if token:
        return token

    # 2) Bearer token (CLI, tests, server-to-server)
    auth = request.headers.get('authorization', '')
    if auth.lower().startswith('bearer '):
        return auth[7:].strip()

    return None


async def get_current_user(request: Request) -> AuthenticatedUser:
    """Resolve the caller from their session token. Raises 401 if invalid."""
    token = _extract_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Not authenticated',
        )

    payload = token_service.decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid or expired session',
        )

    # Only sub + ws + role are in the token. That's all we need.
    user_id = payload['sub']
    ws_id = payload['ws']
    role = payload.get('role', 'Viewer')

    # Stash on request.state so middleware and other deps can access it.
    request.state.user_id = user_id
    request.state.workspace_id = ws_id
    request.state.role = role

    return AuthenticatedUser(
        user_id=user_id,
        email='',            # not in token; load from graph if needed
        name='',
        role=role,
        workspace_id=ws_id,
        workspace_name=ws_id,
    )


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]


def require_min_role(min_role: str):
    """
    Use as a dependency:
        @router.post('/admin-only', dependencies=[Depends(require_min_role('Admin'))])
    """
    required_rank = _ROLE_RANK.get(min_role, 999)

    async def _check(user: CurrentUser) -> None:
        if _ROLE_RANK.get(user.role, 0) < required_rank:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f'Requires {min_role} role or higher',
            )

    return _check