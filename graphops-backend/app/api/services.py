"""Services HTTP endpoints: list and detail.

Read-only per spec §8. Any authenticated user may access.

Detail composes five sources:
- Q35: the node + owners/teams/runbooks
- Q36: outbound dependencies (upstream)
- Q37: recent incidents (this service was affected)
- Q38: recent deployments (changed this or bumped its deps)

Blast radius (Q01 — who depends on this service) is exposed through the
Graph Explorer's /graph/blast-radius endpoint, not duplicated here.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import CurrentUser
from app.graph.service import run_template
from app.models.services import (
    ServiceDependency,
    ServiceDeployment,
    ServiceDetail,
    ServiceIncident,
    ServiceListItem,
    ServiceListResponse,
    ServiceOwner,
    ServiceRunbook,
)

log = logging.getLogger('graphops.api.services')
router = APIRouter(prefix='/api/v1/services', tags=['services'])


def _ws(user: CurrentUser) -> str:
    return user.workspace_id


# ---------- List ----------
@router.get('', response_model=ServiceListResponse)
async def list_services(
    user: CurrentUser,
    env: str | None = Query(None, max_length=50),
    status_filter: str | None = Query(None, alias='status'),
    q: str | None = Query(None, min_length=1, max_length=200),
    limit: int = Query(100, ge=1, le=500),
) -> ServiceListResponse:
    """List services in the workspace. All filters are optional."""
    ws = _ws(user)
    rows = await run_template('Q34', {
        'env': env,
        'status': status_filter,
        'q': q,
        'limit': limit,
    }, ws)

    items = [
        ServiceListItem(
            id=r['id'],
            name=r['name'] or r['id'],
            env=r.get('env') or 'Production',
            status=r.get('status') or 'Healthy',
            health=r.get('health'),
            latency_ms=_to_float(r.get('latency_ms')),
            error_rate=_to_float(r.get('error_rate')),
            version=r.get('version'),
            repo=r.get('repo'),
            description=r.get('description'),
            updated_at=r.get('updated_at'),
        )
        for r in rows
    ]

    # Health summary computed in Python — cheap and consistent with the list.
    summary: dict[str, int] = {'Healthy': 0, 'Warning': 0, 'Degraded': 0}
    for s in items:
        summary[s.status] = summary.get(s.status, 0) + 1

    return ServiceListResponse(services=items, count=len(items), health_summary=summary)


def _to_float(v) -> float | None:
    """FalkorDB returns numeric props as int or float; normalize to float."""
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ---------- Detail ----------
@router.get('/{service_id}', response_model=ServiceDetail)
async def get_service(service_id: str, user: CurrentUser) -> ServiceDetail:
    """
    Service detail with owners, runbooks, dependencies, incidents, deployments.

    Runs the 4 supporting queries concurrently — they're independent reads.
    """
    ws = _ws(user)

    # First, the node itself. If this 404s, no point in firing the other queries.
    detail_rows = await run_template('Q35', {'id': service_id}, ws)
    if not detail_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Service not found')

    row = detail_rows[0]

    # Supporting queries in parallel
    deps_rows, incidents_rows, deployments_rows = await asyncio.gather(
        run_template('Q36', {'id': service_id}, ws),
        run_template('Q37', {'id': service_id}, ws),
        run_template('Q38', {'id': service_id}, ws),
    )

    # --- Owners (people + teams merged, with kind discriminator) ---
    owners: list[ServiceOwner] = []
    for o in (row.get('owners') or []):
        if isinstance(o, dict) and o.get('id'):
            owners.append(ServiceOwner(id=o['id'], name=o.get('name') or o['id'], kind='person'))
    for t in (row.get('teams') or []):
        if isinstance(t, dict) and t.get('id'):
            owners.append(ServiceOwner(id=t['id'], name=t.get('name') or t['id'], kind='team'))

    runbooks = [
        ServiceRunbook(id=r['id'], title=r.get('title') or '')
        for r in (row.get('runbooks') or [])
        if isinstance(r, dict) and r.get('id')
    ]

    dependencies = [
        ServiceDependency(
            id=d['id'],
            type=d.get('type') or 'Dependency',
            name=d.get('name') or d['id'],
            version=d.get('version') or '',
            kind=d.get('kind') or '',
            criticality=d.get('criticality') or 'medium',
        )
        for d in deps_rows
        if d.get('id')
    ]

    incidents = [
        ServiceIncident(
            id=i['id'],
            title=i.get('title') or '',
            severity=i.get('severity') or 'Medium',
            status=i.get('status') or 'Open',
            started_at=i.get('started_at'),
            resolved_at=i.get('resolved_at'),
        )
        for i in incidents_rows
        if i.get('id')
    ]

    deployments = [
        ServiceDeployment(
            id=d['id'],
            version=d.get('version') or '',
            deployed_at=d.get('deployed_at'),
            deployed_by=d.get('deployed_by'),
            status=d.get('status'),
        )
        for d in deployments_rows
        if d.get('id')
    ]

    return ServiceDetail(
        id=row['id'],
        name=row['name'] or row['id'],
        env=row.get('env') or 'Production',
        status=row.get('status') or 'Healthy',
        health=row.get('health'),
        latency_ms=_to_float(row.get('latency_ms')),
        error_rate=_to_float(row.get('error_rate')),
        version=row.get('version'),
        repo=row.get('repo'),
        description=row.get('description'),
        updated_at=row.get('updated_at'),
        owners=owners,
        runbooks=runbooks,
        dependencies=dependencies,
        recent_incidents=incidents,
        recent_deployments=deployments,
    )