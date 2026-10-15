"""Graph Explorer endpoints.

Read-only views over the workspace graph. Backed by allow-listed query
templates — no raw Cypher from the client, ever.

Authorization: any authenticated user.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import CurrentUser, require_min_role
from app.graph.service import run_template
from app.models.graph import (
    BlastRadiusItem,
    BlastRadiusResponse,
    CommunitiesResponse,
    CommunityItem,
    CriticalityItem,
    CriticalityResponse,
    GraphEdgePublic,
    GraphNodePublic,
    PathNode,
    PathResponse,
    SubgraphResponse,
    TemplateQueryRequest,
    TemplateQueryResponse,
)

log = logging.getLogger('graphops.api.graph')
router = APIRouter(prefix='/api/v1/graph', tags=['graph'])


# Read-only templates the "template picker" is allowed to invoke.
# Anything that mutates the graph (Q11, Q11b, Q12a, Q12b, Q19, Q20) is denied.
_TEMPLATE_ALLOWLIST = frozenset({
    'Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q07b', 'Q08', 'Q09',
    'Q10', 'Q13', 'Q14', 'Q15', 'Q16', 'Q17', 'Q18',
})


def _ws(user: CurrentUser) -> str:
    return user.workspace_id


# ---------- Subgraph (Q18) ----------
@router.get('/subgraph', response_model=SubgraphResponse)
async def subgraph(
    user: CurrentUser,
    center: str = Query(..., min_length=1, max_length=100),
    hops: int = Query(2, ge=1, le=3),
) -> SubgraphResponse:
    """
    Neighborhood of a node for the Graph Explorer canvas.
    hops is clamped 1..3; higher values explode the response.
    """
    ws = _ws(user)
    rows = await run_template('Q18', {'center': center, 'hops': hops}, ws)

    if not rows:
        # Either center doesn't exist, or it has no edges. Distinguish.
        from app.db import falkor
        g = falkor.workspace_graph(ws)
        exists = await g.query('MATCH (c {id:$id}) RETURN c.id LIMIT 1', {'id': center})
        if not exists.result_set:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Node not found')
        return SubgraphResponse(center=center)

    nodes: dict[str, GraphNodePublic] = {}
    edges: dict[tuple, GraphEdgePublic] = {}

    for row in rows:
        for n in (row.get('path_nodes') or []):
            if not isinstance(n, dict) or not n.get('id'):
                continue
            nodes[n['id']] = GraphNodePublic(
                id=n['id'],
                type=n.get('type', ''),
                name=n.get('name', n['id']),
                status=n.get('status', '') or '',
            )
        for e in (row.get('path_rels') or []):
            if not isinstance(e, dict):
                continue
            src, tgt, typ = e.get('source'), e.get('target'), e.get('type')
            if not (src and tgt and typ):
                continue
            edges[(src, tgt, typ)] = GraphEdgePublic(source=src, target=tgt, type=typ)

    return SubgraphResponse(
        center=center,
        nodes=list(nodes.values()),
        edges=list(edges.values()),
        truncated=len(rows) >= 100,
    )


# ---------- Generic path (Q07b) ----------
@router.get('/path', response_model=PathResponse)
async def path(
    user: CurrentUser,
    from_id: str = Query(..., alias='from', min_length=1, max_length=100),
    to_id: str = Query(..., alias='to', min_length=1, max_length=100),
) -> PathResponse:
    """Shortest undirected path between two nodes. Max 6 hops."""
    ws = _ws(user)
    rows = await run_template('Q07b', {'from': from_id, 'to': to_id}, ws)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f'No path found between {from_id} and {to_id} (within 6 hops)',
        )

    row = rows[0]
    path_nodes = [PathNode(**n) for n in (row.get('path') or [])]
    rels = list(row.get('rels') or [])
    return PathResponse(path=path_nodes, rels=rels)


# ---------- Blast radius (Q01) ----------
@router.get('/blast-radius', response_model=BlastRadiusResponse)
async def blast_radius(
    user: CurrentUser,
    service: str = Query(..., min_length=1, max_length=100),
    depth: int = Query(3, ge=1, le=4),
) -> BlastRadiusResponse:
    """Which services depend on this one? Depth clamped 1..4."""
    ws = _ws(user)
    rows = await run_template('Q01', {'service_id': service, 'hops': depth}, ws)
    items = [
        BlastRadiusItem(
            service=r['service'],
            name=r.get('name'),
            hops=int(r.get('hops') or 0),
        )
        for r in rows
    ]
    return BlastRadiusResponse(root=service, affected=items)


# ---------- Criticality (Q08) ----------
@router.get('/criticality', response_model=CriticalityResponse)
async def criticality(user: CurrentUser) -> CriticalityResponse:
    """Top services by PageRank score."""
    ws = _ws(user)
    rows = await run_template('Q08', {}, ws)
    items = [
        CriticalityItem(service=r['service'], score=float(r['score']))
        for r in rows if r.get('service')
    ]
    return CriticalityResponse(services=items)


# ---------- Communities (Q09) ----------
@router.get('/communities', response_model=CommunitiesResponse)
async def communities(user: CurrentUser) -> CommunitiesResponse:
    """Weakly-connected components over Service/DEPENDS_ON."""
    ws = _ws(user)
    rows = await run_template('Q09', {}, ws)
    items = [
        CommunityItem(
            community=str(r.get('community', '')),
            services=[s for s in (r.get('services') or []) if s],
        )
        for r in rows
    ]
    return CommunitiesResponse(communities=items)


# ---------- Template picker (POST /graph/query) ----------
@router.post(
    '/query',
    response_model=TemplateQueryResponse,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def run_named_query(
    body: TemplateQueryRequest,
    user: CurrentUser,
) -> TemplateQueryResponse:
    """
    Run one allow-listed template by id.

    Guardrails:
    - Only read-only templates are callable (see _TEMPLATE_ALLOWLIST).
    - Params are validated by the query runner (hop clamping, etc.).
    - Raw Cypher is impossible — the client names a template, never writes one.
    """
    if body.query_id not in _TEMPLATE_ALLOWLIST:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f'Template {body.query_id} is not available through this endpoint',
        )

    ws = _ws(user)
    try:
        rows = await run_template(body.query_id, body.params, ws)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return TemplateQueryResponse(query_id=body.query_id, rows=rows, count=len(rows))