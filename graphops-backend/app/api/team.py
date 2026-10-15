"""Team endpoints: list workspace members and person detail.

Read-only. The workspace graph holds Person nodes; the control graph holds
User nodes (with password hashes, never exposed here). Team roles come from
the Person node's `role` property.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser
from app.graph.service import run_template
from app.models.team import (
    PersonDetail,
    PersonIncidentRef,
    PersonServiceRef,
    TeamListResponse,
    TeamMember,
)

log = logging.getLogger('graphops.api.team')
router = APIRouter(prefix='/api/v1/team', tags=['team'])


def _ws(user: CurrentUser) -> str:
    return user.workspace_id


# ---------- List ----------
@router.get('', response_model=TeamListResponse)
async def list_team(
    user: CurrentUser,
    q: str | None = Query(None, max_length=200),
    role: str | None = Query(None, max_length=50),
    limit: int = Query(200, ge=1, le=500),
) -> TeamListResponse:
    """List workspace members. Aggregates team memberships and owned services."""
    ws = _ws(user)
    rows = await run_template('Q41', {'limit': limit}, ws)

    # Aggregate the un-nested rows into one TeamMember per person.
    members: dict[str, TeamMember] = {}
    for r in rows:
        pid = r.get('id')
        if not pid:
            continue
        if pid not in members:
            members[pid] = TeamMember(
                id=pid,
                name=r.get('name') or pid,
                email=r.get('email'),
                role=r.get('role'),
                team_id=r.get('team_id'),
                team_name=r.get('team_name'),
                service_count=0,
                owned_services=[],
            )
        sid = r.get('service_id')
        if sid:
            m = members[pid]
            if sid not in m.owned_services:
                m.owned_services.append(sid)
                m.service_count += 1

    # Filters (case-insensitive)
    out = list(members.values())
    if q:
        needle = q.lower()
        out = [m for m in out if f'{m.name} {m.email or ""} {m.team_name or ""}'.lower().find(needle) >= 0]
    if role and role != 'All':
        out = [m for m in out if (m.role or '').lower() == role.lower()]

    out.sort(key=lambda m: m.name.lower())

    # Stats over the *unfiltered* set (so the header shows workspace totals)
    all_members = list(members.values())
    role_counts: dict[str, int] = {}
    teams = set()
    for m in all_members:
        role_counts[m.role or 'Unknown'] = role_counts.get(m.role or 'Unknown', 0) + 1
        if m.team_id:
            teams.add(m.team_id)

    return TeamListResponse(
        members=out,
        count=len(out),
        stats={
            'total': len(all_members),
            'role_counts': role_counts,
            'teams': len(teams),
        },
    )


# ---------- Detail ----------
@router.get('/{person_id}', response_model=PersonDetail)
async def get_person(person_id: str, user: CurrentUser) -> PersonDetail:
    """Person detail with owned services and resolved incidents."""
    ws = _ws(user)
    rows = await run_template('Q42', {'id': person_id}, ws)
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Person not found')

    first = rows[0]
    services: dict[str, PersonServiceRef] = {}
    incidents: dict[str, PersonIncidentRef] = {}

    for r in rows:
        sid = r.get('service_id')
        if sid and sid not in services:
            services[sid] = PersonServiceRef(
                id=sid,
                name=r.get('service_name') or sid,
                status=r.get('service_status'),
            )
        iid = r.get('incident_id')
        if iid and iid not in incidents:
            incidents[iid] = PersonIncidentRef(
                id=iid,
                title=r.get('incident_title') or '',
                severity=r.get('incident_severity') or 'Medium',
                status=r.get('incident_status') or 'Open',
                resolved_at=r.get('incident_resolved_at'),
            )

    return PersonDetail(
        id=first['id'],
        name=first.get('name') or first['id'],
        email=first.get('email'),
        role=first.get('role'),
        team_id=first.get('team_id'),
        team_name=first.get('team_name'),
        services=list(services.values()),
        incidents=list(incidents.values()),
    )