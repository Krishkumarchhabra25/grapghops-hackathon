"""Audit log endpoints: list with filters, detail, and a verbs list for UIs.

Read-only. AuditEvents are written by the modules that perform privileged
actions (auth, investigations, approvals, memory, incidents). This router
only reads them back.

Authorization: any authenticated user. The audit trail is observationally
useful for everyone in a workspace and contains no secrets (the `detail`
payloads are intentionally sanitized by the writers).
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser
from app.graph.service import run_template
from app.models.audit import (
    AuditEventPublic,
    AuditListResponse,
    AuditVerbsResponse,
)

log = logging.getLogger('graphops.api.audit')
router = APIRouter(prefix='/api/v1/audit', tags=['audit'])


def _ws(user: CurrentUser) -> str:
    return user.workspace_id


def _parse_detail(raw) -> dict:
    """AuditEvent.detail is stored as a JSON string. Tolerate malformed values."""
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {'value': data}
    except (json.JSONDecodeError, TypeError):
        return {'raw': str(raw)[:500]}


def _to_public(row: dict) -> AuditEventPublic:
    return AuditEventPublic(
        id=row.get('id') or '',
        actor=row.get('actor') or 'unknown',
        verb=row.get('verb') or 'unknown',
        target_id=row.get('target_id'),
        ts=int(row.get('ts') or 0),
        detail=_parse_detail(row.get('detail')),
    )


# ---------- List ----------
@router.get('', response_model=AuditListResponse)
async def list_audit_events(
    user: CurrentUser,
    actor: str | None = Query(None, max_length=100),
    verb: str | None = Query(None, max_length=100),
    target_id: str | None = Query(None, max_length=100),
    since: int | None = Query(None, ge=0, description='Epoch ms — only events at or after'),
    until: int | None = Query(None, ge=0, description='Epoch ms — only events at or before'),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0, le=10_000),
) -> AuditListResponse:
    """
    List audit events for the current workspace, most recent first.

    All filters are optional and composable:
    - `actor=usr-1` — everything done by Krish
    - `verb=approval.approve` — every approval decision
    - `target_id=run-xxx` — every event about a specific run
    - `since=...&until=...` — a time window
    """
    ws = _ws(user)
    rows = await run_template('Q39', {
        'actor': actor,
        'verb': verb,
        'target_id': target_id,
        'since': since,
        'until': until,
        'limit': limit,
        'offset': offset,
    }, ws)

    events = [_to_public(r) for r in rows]
    return AuditListResponse(
        events=events,
        count=len(events),
        limit=limit,
        offset=offset,
    )


# ---------- Verbs (for UI filter dropdowns) ----------
@router.get('/verbs', response_model=AuditVerbsResponse)
async def list_verbs(user: CurrentUser) -> AuditVerbsResponse:
    """Distinct verbs in the workspace, alphabetically sorted."""
    ws = _ws(user)
    rows = await run_template('Q40', {}, ws)
    verbs = sorted({r['verb'] for r in rows if r.get('verb')})
    return AuditVerbsResponse(verbs=verbs)


# ---------- Detail ----------
@router.get('/{event_id}', response_model=AuditEventPublic)
async def get_audit_event(event_id: str, user: CurrentUser) -> AuditEventPublic:
    """Load one audit event by id."""
    ws = _ws(user)
    rows = await run_template('Q39', {
        'actor': None,
        'verb': None,
        'target_id': None,
        'since': None,
        'until': None,
        'limit': 500,
        'offset': 0,
    }, ws)

    # Q39 has no direct lookup by id; filter in Python.
    # The workspace has thousands of events at most, so this is fine.
    for r in rows:
        if r.get('id') == event_id:
            return _to_public(r)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Audit event not found')