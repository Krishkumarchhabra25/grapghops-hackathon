"""Investigation endpoints: start, list, get, cancel.

Rules:
- Workspace is resolved from the JWT, never from the request.
- POST and cancel require Engineer or higher.
- GET endpoints are available to any authenticated user.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.agents.workflow import start_investigation
from app.api.deps import CurrentUser, require_min_role
from app.db import falkor
from app.models.investigations import (
    CancelResponse,
    FindingPublic,
    InvestigationDetail,
    InvestigationListItem,
    InvestigationListResponse,
    StartInvestigationRequest,
    StartInvestigationResponse,
)
from app.models.nodes import now_ms
from app.services.audit import write_audit_event

log = logging.getLogger('graphops.api.investigations')
router = APIRouter(prefix='/api/v1', tags=['investigations'])


# ---------- Helpers ----------
def _ws(user: CurrentUser) -> str:
    """The workspace is always taken from the authenticated session."""
    return user.workspace_id


async def _incident_exists(ws: str, incident_id: str) -> bool:
    g = falkor.workspace_graph(ws)
    res = await g.query(
        'MATCH (i:Incident {id:$id}) RETURN i.id LIMIT 1',
        {'id': incident_id},
    )
    return bool(res.result_set)


# ---------- Endpoints ----------
@router.post(
    '/investigations',
    response_model=StartInvestigationResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def create_investigation(
    body: StartInvestigationRequest,
    user: CurrentUser,
) -> StartInvestigationResponse:
    """Start a new investigation run. Returns immediately; the run executes async."""
    ws = _ws(user)

    if not await _incident_exists(ws, body.incident_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'Incident {body.incident_id} not found',
        )

    try:
        run_id = await start_investigation(ws, body.incident_id, body.title)
    except Exception as e:  # noqa: BLE001
        log.exception('start_investigation failed')
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f'Could not start investigation: {type(e).__name__}',
        )

    await write_audit_event(
        workspace_id=ws,
        actor=user.user_id,
        verb='investigation.start',
        target_id=run_id,
        detail={'incident_id': body.incident_id, 'title': body.title, 'tracks': body.tracks},
    )

    return StartInvestigationResponse(
        investigation_id=run_id.replace('run-', 'inv-'),
        run_id=run_id,
        status='running',
        events_url=f'/api/v1/runs/{run_id}/events',
    )


@router.get('/investigations', response_model=InvestigationListResponse)
async def list_investigations(
    user: CurrentUser,
    limit: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias='status'),
) -> InvestigationListResponse:
    """List investigations for the current workspace, most recent first."""
    ws = _ws(user)
    g = falkor.workspace_graph(ws)

    where_status = 'AND r.status = $status' if status_filter else ''
    params: dict = {'limit': limit}
    if status_filter:
        params['status'] = status_filter

    res = await g.query(
        f"""
        MATCH (r:AgentRun)
        OPTIONAL MATCH (r)-[:FOR_INCIDENT]->(i:Incident)
        WHERE 1=1 {where_status}
        RETURN r.id AS run_id, r.goal AS goal, r.status AS status,
               r.owner_agent AS owner_agent, r.started_at AS started_at,
               r.ended_at AS ended_at,
               i.id AS incident_id, i.title AS incident_title
        ORDER BY r.started_at DESC
        LIMIT $limit
        """,
        params,
    )

    items = [
        InvestigationListItem(
            run_id=row[0], goal=row[1] or '', status=row[2] or 'queued',
            owner_agent=row[3], started_at=row[4], ended_at=row[5],
            incident_id=row[6], incident_title=row[7],
        )
        for row in res.result_set
    ]
    return InvestigationListResponse(investigations=items)


@router.get('/investigations/{run_id}', response_model=InvestigationDetail)
async def get_investigation(run_id: str, user: CurrentUser) -> InvestigationDetail:
    """Full detail for one investigation, including all findings."""
    ws = _ws(user)
    g = falkor.workspace_graph(ws)

    res = await g.query(
        """
        MATCH (r:AgentRun {id:$id})
        OPTIONAL MATCH (r)-[:FOR_INCIDENT]->(i:Incident)
        RETURN r, i.id AS incident_id, i.title AS incident_title
        """,
        {'id': run_id},
    )
    if not res.result_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Investigation not found')

    row = res.result_set[0]
    props = dict(row[0].properties)
    incident_id, incident_title = row[1], row[2]

    findings_res = await g.query(
        """
        MATCH (r:AgentRun {id:$id})-[:PRODUCED]->(f:Finding)
        RETURN f.id AS id, f.kind AS kind, f.claim AS claim,
               f.confidence AS confidence, f.verification AS verification,
               f.evidence_refs AS evidence_refs
        ORDER BY f.created_at
        """,
        {'id': run_id},
    )

    findings = [
        FindingPublic(
            id=fr[0], kind=fr[1], claim=fr[2] or '',
            confidence=fr[3], verification=fr[4] or 'retrieved',
            evidence_refs=json.loads(fr[5] or '[]'),
        )
        for fr in findings_res.result_set
    ]

    return InvestigationDetail(
        id=props['id'],
        goal=props.get('goal', ''),
        status=props.get('status', 'queued'),
        owner_agent=props.get('owner_agent'),
        state=json.loads(props.get('state') or '{}'),
        state_version=int(props.get('state_version', 0)),
        started_at=props.get('started_at'),
        ended_at=props.get('ended_at'),
        tokens=int(props.get('tokens', 0) or 0),
        cost_usd=float(props.get('cost_usd', 0.0) or 0.0),
        incident_id=incident_id,
        incident_title=incident_title,
        findings=findings,
    )


@router.post(
    '/investigations/{run_id}/cancel',
    response_model=CancelResponse,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def cancel_investigation(run_id: str, user: CurrentUser) -> CancelResponse:
    """Mark a run as cancelled. Steps are checked for cancellation before each step."""
    ws = _ws(user)
    g = falkor.workspace_graph(ws)

    # Only cancel if the run is still active
    res = await g.query(
        'MATCH (r:AgentRun {id:$id}) RETURN r.status',
        {'id': run_id},
    )
    if not res.result_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Investigation not found')

    current = res.result_set[0][0]
    if current in ('succeeded', 'failed', 'cancelled'):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Cannot cancel a run in status "{current}"',
        )

    now = now_ms()
    await g.query(
        """
        MATCH (r:AgentRun {id:$id})
        SET r.status = 'cancelled', r.ended_at = $now, r.updated_at = $now
        """,
        {'id': run_id, 'now': now},
    )

    await write_audit_event(
        workspace_id=ws,
        actor=user.user_id,
        verb='investigation.cancel',
        target_id=run_id,
        detail={'previous_status': current},
    )

    return CancelResponse(run_id=run_id, status='cancelled')