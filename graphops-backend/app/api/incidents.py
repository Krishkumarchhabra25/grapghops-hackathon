"""Incident HTTP endpoints: list, create, detail, update.

Read is open to any authenticated user. Write requires Engineer+.

Design:
- New incidents are given a sequential id (inc-2482, inc-2483, …) so the
  demo shows realistic IDs and doesn't collide with seeded data.
- The detail view composes three sources: the incident node, its AFFECTED
  services, related incidents by signature (Q03), and any AgentRuns whose
  findings touch this incident.
- PATCH is partial — any field may be omitted. Setting status to 'Resolved'
  auto-populates resolved_at; setting it back clears it.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import CurrentUser, require_min_role
from app.db import falkor
from app.graph.service import run_template
from app.models.incidents import (
    CreateIncidentRequest,
    CreateIncidentResponse,
    IncidentDetail,
    IncidentFinding,
    IncidentListItem,
    IncidentListResponse,
    RelatedIncident,
    UpdateIncidentRequest,
)
from app.models.nodes import now_ms
from app.services.audit import write_audit_event

log = logging.getLogger('graphops.api.incidents')
router = APIRouter(prefix='/api/v1/incidents', tags=['incidents'])


def _ws(user: CurrentUser) -> str:
    return user.workspace_id


# ---------- Helpers ----------
async def _next_incident_id(ws: str) -> str:
    """Generate the next inc-NNNN id from the max existing numeric suffix."""
    g = falkor.workspace_graph(ws)
    res = await g.query(
        """
        MATCH (i:Incident)
        WHERE i.id STARTS WITH 'inc-'
        WITH toInteger(substring(i.id, 4)) AS n
        WHERE n IS NOT NULL
        RETURN coalesce(max(n), 2400) AS max_n
        """
    )
    max_n = res.result_set[0][0] if res.result_set else 2400
    return f'inc-{int(max_n) + 1}'


async def _load_incident(ws: str, incident_id: str) -> dict | None:
    g = falkor.workspace_graph(ws)
    res = await g.query(
        """
        MATCH (i:Incident {id:$id})
        OPTIONAL MATCH (i)-[:AFFECTED]->(s:Service)
        RETURN i, collect(DISTINCT s.id) AS services
        """,
        {'id': incident_id},
    )
    if not res.result_set:
        return None
    props = dict(res.result_set[0][0].properties)
    props['services'] = [s for s in (res.result_set[0][1] or []) if s]
    return props


# ---------- List ----------
@router.get('', response_model=IncidentListResponse)
async def list_incidents(
    user: CurrentUser,
    status_filter: str | None = Query(None, alias='status'),
    severity_filter: str | None = Query(None, alias='severity'),
    q: str | None = Query(None, min_length=1, max_length=200),
    limit: int = Query(50, ge=1, le=200),
) -> IncidentListResponse:
    """List incidents, most recent first. All filters are optional."""
    ws = _ws(user)
    rows = await run_template('Q30', {
        'status': status_filter,
        'severity': severity_filter,
        'q': q,
        'limit': limit,
    }, ws)

    items = [
        IncidentListItem(
            id=r['id'],
            title=r['title'] or '',
            severity=r['severity'] or 'Medium',
            status=r['status'] or 'Open',
            summary=r.get('summary'),
            impact=r.get('impact'),
            started_at=r.get('started_at'),
            resolved_at=r.get('resolved_at'),
            root_cause=r.get('root_cause'),
            updated_at=r.get('updated_at'),
            services=[s for s in (r.get('services') or []) if s],
        )
        for r in rows
    ]
    return IncidentListResponse(incidents=items, count=len(items))


# ---------- Detail ----------
@router.get('/{incident_id}', response_model=IncidentDetail)
async def get_incident(incident_id: str, user: CurrentUser) -> IncidentDetail:
    """Incident detail with related incidents (Q03), findings, and run links."""
    ws = _ws(user)
    props = await _load_incident(ws, incident_id)
    if props is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Incident not found')

    # Related incidents by shared error signature (Q03)
    related_rows = await run_template('Q03', {'incident_id': incident_id}, ws)
    related = [
        RelatedIncident(
            incident=r['incident'],
            title=r.get('title') or '',
            status=r.get('status') or 'unknown',
            signature=r.get('signature'),
            fixes=[f for f in (r.get('fixes') or []) if f],
        )
        for r in related_rows
    ]

    # Findings from any AgentRun targeting this incident
    g = falkor.workspace_graph(ws)
    findings_res = await g.query(
        """
        MATCH (r:AgentRun)-[:FOR_INCIDENT]->(i:Incident {id:$id})
        OPTIONAL MATCH (r)-[:PRODUCED]->(f:Finding)
        RETURN collect(DISTINCT r.id) AS run_ids,
               collect(DISTINCT {
                   id: f.id, kind: f.kind, claim: f.claim,
                   confidence: f.confidence, verification: f.verification
               }) AS findings
        """,
        {'id': incident_id},
    )

    run_ids: list[str] = []
    findings: list[IncidentFinding] = []
    if findings_res.result_set:
        run_ids = [x for x in (findings_res.result_set[0][0] or []) if x]
        raw_findings = findings_res.result_set[0][1] or []
        for rf in raw_findings:
            if not isinstance(rf, dict) or not rf.get('id'):
                continue
            try:
                conf = float(rf.get('confidence')) if rf.get('confidence') is not None else None
            except (TypeError, ValueError):
                conf = None
            findings.append(IncidentFinding(
                id=rf['id'],
                kind=rf.get('kind') or 'fact',
                claim=rf.get('claim') or '',
                confidence=conf,
                verification=rf.get('verification') or 'retrieved',
            ))

    return IncidentDetail(
        id=props['id'],
        title=props.get('title', ''),
        severity=props.get('severity', 'Medium'),
        status=props.get('status', 'Open'),
        summary=props.get('summary'),
        impact=props.get('impact'),
        started_at=props.get('started_at'),
        resolved_at=props.get('resolved_at'),
        root_cause=props.get('root_cause'),
        updated_at=props.get('updated_at'),
        services=props['services'],
        related=related,
        findings=findings,
        run_ids=run_ids,
    )


# ---------- Create ----------
@router.post(
    '',
    response_model=CreateIncidentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def create_incident(
    body: CreateIncidentRequest,
    user: CurrentUser,
) -> CreateIncidentResponse:
    """
    Create an incident and link it to affected services.

    Two queries: CREATE the node, then MERGE the AFFECTED edges. If a
    service_id doesn't exist, the edge is silently skipped — the request
    is not rejected for that reason.
    """
    ws = _ws(user)
    incident_id = await _next_incident_id(ws)
    now = now_ms()
    started_at = body.started_at if body.started_at is not None else now

    await run_template('Q31', {
        'id': incident_id,
        'title': body.title,
        'severity': body.severity,
        'status': body.status,
        'summary': body.summary or '',
        'impact': body.impact or '',
        'started_at': started_at,
        'now': now,
    }, ws)

    # Link affected services (skip IDs that don't exist)
    if body.service_ids:
        g = falkor.workspace_graph(ws)
        await g.query(
            """
            MATCH (i:Incident {id:$id})
            UNWIND $service_ids AS sid
            MATCH (s:Service {id: sid})
            MERGE (i)-[:AFFECTED]->(s)
            """,
            {'id': incident_id, 'service_ids': body.service_ids},
        )

    await write_audit_event(
        workspace_id=ws,
        actor=user.user_id,
        verb='incident.create',
        target_id=incident_id,
        detail={
            'title': body.title,
            'severity': body.severity,
            'status': body.status,
            'service_ids': body.service_ids,
        },
    )

    return CreateIncidentResponse(id=incident_id, title=body.title, status=body.status)


# ---------- Update ----------
@router.patch(
    '/{incident_id}',
    response_model=IncidentDetail,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def update_incident(
    incident_id: str,
    body: UpdateIncidentRequest,
    user: CurrentUser,
) -> IncidentDetail:
    """
    Partial update. Any field may be omitted.

    Setting status to 'Resolved' auto-populates resolved_at. If resolved_by
    is provided, links the Person via the RESOLVED edge.
    """
    ws = _ws(user)
    existing = await _load_incident(ws, incident_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Incident not found')

    await run_template('Q32', {
        'id': incident_id,
        'title': body.title,
        'severity': body.severity,
        'status': body.status,
        'summary': body.summary,
        'impact': body.impact,
        'root_cause': body.root_cause,
        'now': now_ms(),
    }, ws)

    # Link the resolver only when status actually became Resolved.
    if body.status == 'Resolved' and body.resolved_by:
        await run_template('Q33', {
            'incident_id': incident_id,
            'person_id': body.resolved_by,
        }, ws)

    await write_audit_event(
        workspace_id=ws,
        actor=user.user_id,
        verb='incident.update',
        target_id=incident_id,
        detail={
            'title': body.title,
            'severity': body.severity,
            'status': body.status,
            'root_cause': body.root_cause,
            'resolved_by': body.resolved_by,
            'previous_status': existing.get('status'),
        },
    )

    return await get_incident(incident_id, user)