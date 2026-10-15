"""Auth HTTP endpoints: login, logout, me."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, Response, status

from app.api.deps import CurrentUser
from app.auth import tokens as token_service
from app.auth.service import authenticate
from app.config import get_settings
from app.models.auth import (
    LoginRequest,
    LogoutResponse,
    SessionResponse,
    UserPublic,
    WorkspacePublic,
)

log = logging.getLogger('graphops.api.auth')
router = APIRouter(prefix='/api/v1/auth', tags=['auth'])


def _set_session_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        key=s.cookie_name,
        value=token,
        max_age=s.jwt_ttl_seconds,
        httponly=True,
        secure=s.cookie_secure,
        samesite=s.cookie_samesite,
        path='/',
    )


def _clear_session_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(key=s.cookie_name, path='/')


@router.post('/login', response_model=SessionResponse)
async def login(body: LoginRequest, response: Response) -> SessionResponse:
    """Verify credentials and set the session cookie."""
    user = await authenticate(body.email, body.password)
    if user is None:
        # Single generic message — never leak whether the email exists.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid email or password',
        )

    token = token_service.create_token(
        user_id=user.user_id,
        workspace_id=user.workspace_id,
        role=user.role,
    )
    _set_session_cookie(response, token)

    log.info('login ok user_id=%s ws=%s role=%s',
             user.user_id, user.workspace_id, user.role)

    return SessionResponse(
        user=UserPublic(id=user.user_id, name=user.name, email=user.email, role=user.role),
        workspace=WorkspacePublic(id=user.workspace_id, name=user.workspace_name),
    )


@router.post('/logout', response_model=LogoutResponse)
async def logout(response: Response, _user: CurrentUser) -> LogoutResponse:
    """Clear the session cookie. The client's token becomes useless immediately."""
    _clear_session_cookie(response)
    return LogoutResponse()


@router.get('/me', response_model=SessionResponse)
async def me(request: Request, user: CurrentUser) -> SessionResponse:
    """
    Return the currently logged-in user. The name/email are not in the token,
    so we fetch them from the control graph.
    """
    # Cheap lookup — the user id is indexed.
    from app.db import falkor
    g = falkor.control_graph()
    res = await g.query(
        'MATCH (u:User {id:$id}) RETURN u.name, u.email LIMIT 1',
        {'id': user.user_id},
    )
    name = email = ''
    if res.result_set:
        name, email = res.result_set[0]

    return SessionResponse(
        user=UserPublic(id=user.user_id, name=name or '', email=email or '', role=user.role),
        workspace=WorkspacePublic(id=user.workspace_id, name=user.workspace_name),
    )