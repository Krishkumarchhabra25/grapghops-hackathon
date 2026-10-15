"""Authentication service: verify credentials against the control graph."""
from __future__ import annotations

import logging
from dataclasses import dataclass

from app.auth import passwords
from app.db import falkor

log = logging.getLogger('graphops.auth.service')


@dataclass(frozen=True)
class AuthenticatedUser:
    """The resolved identity of a logged-in session."""
    user_id: str
    email: str
    name: str
    role: str
    workspace_id: str
    workspace_name: str


async def authenticate(email: str, password: str) -> AuthenticatedUser | None:
    """
    Look up the user in the control graph, verify the password, and resolve
    their workspace membership.

    Returns None on any failure (bad email, bad password, no workspace).
    """
    g = falkor.control_graph()
    res = await g.query(
        """
        MATCH (u:User {email: $email})
        OPTIONAL MATCH (u)-[m:MEMBER_OF_WORKSPACE]->(w:Workspace)
        RETURN u.id, u.name, u.email, u.password_hash, coalesce(m.role, u.role, 'Viewer'),
               w.id, w.name
        LIMIT 1
        """,
        {'email': email.strip().lower()},
    )

    if not res.result_set:
        # Burn time so timing attacks cannot distinguish "unknown user" from
        # "wrong password". This is subtle but matters in production.
        passwords.burn_time()
        log.info('login failed: unknown email')
        return None

    row = res.result_set[0]
    user_id, name, em, pwd_hash, role, ws_id, ws_name = row

    if not passwords.verify_password(password, pwd_hash or ''):
        log.info('login failed: bad password for user_id=%s', user_id)
        return None

    if not ws_id:
        # User exists but is not a member of any workspace.
        log.warning('login failed: no workspace for user_id=%s', user_id)
        return None

    return AuthenticatedUser(
        user_id=user_id,
        email=em or '',
        name=name or '',
        role=role or 'Viewer',
        workspace_id=ws_id,
        workspace_name=ws_name or ws_id,
    )