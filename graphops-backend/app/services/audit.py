"""Audit trail. Every privileged action gets an AuditEvent node.

Called from API routers, not the workflow — the workflow's own RunEvents
already cover internal state changes. This is specifically for *user* actions.
"""
from __future__ import annotations

import json
import logging
import uuid

from app.db import falkor
from app.models.nodes import now_ms

log = logging.getLogger('graphops.audit')


async def write_audit_event(
    workspace_id: str,
    actor: str,
    verb: str,
    target_id: str | None = None,
    detail: dict | None = None,
) -> str:
    """
    Append an immutable AuditEvent to the workspace graph.

    Failures are logged but never raised — audit logging must not break
    the user's action. This is a policy choice; if you need strict auditing,
    raise instead.
    """
    event_id = f'audit-{uuid.uuid4().hex[:10]}'
    now = now_ms()

    try:
        g = falkor.workspace_graph(workspace_id)
        await g.query(
            """
            CREATE (a:AuditEvent {
                id: $id, actor: $actor, verb: $verb,
                target_id: $target_id, ts: $now,
                detail: $detail,
                created_at: $now, updated_at: $now
            })
            """,
            {
                'id': event_id,
                'actor': actor,
                'verb': verb,
                'target_id': target_id,
                'detail': json.dumps(detail or {}),
                'now': now,
            },
        )
        log.info('audit actor=%s verb=%s target=%s', actor, verb, target_id)
    except Exception as e:  # noqa: BLE001
        log.warning('audit write failed (non-fatal): %s', e)

    return event_id