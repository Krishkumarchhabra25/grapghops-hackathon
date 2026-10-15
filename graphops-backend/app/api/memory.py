"""Memory HTTP endpoints.

Read is open to any authenticated user. Write/lifecycle requires Engineer+.

Lifecycle ops (verify, pin, deprecate, delete) are single-node statements,
per the spec (§6 "Memory lifecycle statements"). They're written inline
because they have no reusable structure — each is one SET or DETACH DELETE
followed by an AuditEvent write.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import CurrentUser, require_min_role
from app.db import falkor
from app.graph.service import run_template
from app.models.memory import (
    CreateMemoryRequest,
    DeleteResponse,
    LifecycleResponse,
    MemoryDetail,
    MemoryEntity,
    MemoryFix,
    MemoryListItem,
    MemoryListResponse,
    UpdateMemoryRequest,
)
from app.models.nodes import now_ms
from app.services.audit import write_audit_event

log = logging.getLogger('graphops.api.memory')
router = APIRouter(prefix='/api/v1/memory', tags=['memory'])


def _ws(user: CurrentUser) -> str:
    return user.workspace_id


async def _memory_exists(ws: str, memory_id: str) -> dict | None:
    """Load the current row for a memory or None if it doesn't exist."""
    g = falkor.workspace_graph(ws)
    res = await g.query(
        """
        MATCH (m:Memory {id:$id})
        RETURN m.id AS id, m.type AS type, m.title AS title, m.summary AS summary,
               m.confidence AS confidence, m.status AS status, m.uses AS uses,
               m.source AS source, m.expires_at AS expires_at,
               m.created_at AS created_at, m.updated_at AS updated_at
        """,
        {'id': memory_id},
    )
    if not res.result_set:
        return None
    headers = [h[1] for h in res.header]
    return dict(zip(headers, res.result_set[0]))


async def _link_entities(ws: str, memory_id: str, entity_ids: list[str]) -> None:
    """Link a memory to existing nodes. Silently skips IDs that don't exist."""
    if not entity_ids:
        return
    g = falkor.workspace_graph(ws)
    await g.query(
        """
        MATCH (m:Memory {id:$mid})
        UNWIND $eids AS eid
        MATCH (e {id: eid})
        MERGE (m)-[:ABOUT]->(e)
        """,
        {'mid': memory_id, 'eids': entity_ids},
    )


async def _link_fix(ws: str, memory_id: str, fix_id: str) -> None:
    """Link a memory to a fix. Silently skips if the fix doesn't exist."""
    if not fix_id:
        return
    g = falkor.workspace_graph(ws)
    await g.query(
        """
        MATCH (m:Memory {id:$mid}), (f:Fix {id:$fid})
        MERGE (m)-[:SUPPORTS_FIX]->(f)
        """,
        {'mid': memory_id, 'fid': fix_id},
    )


# ---------- List ----------
@router.get('', response_model=MemoryListResponse)
async def list_memories(
    user: CurrentUser,
    type_filter: str | None = Query(None, alias='type'),
    status_filter: str | None = Query(None, alias='status'),
    q: str | None = Query(None, min_length=1, max_length=200),
    limit: int = Query(50, ge=1, le=200),
) -> MemoryListResponse:
    """List memories. Uses fulltext index when `q` is provided."""
    ws = _ws(user)
    params: dict = {
        'type': type_filter,
        'status': status_filter,
        'limit': limit,
    }

    if q:
        params['q'] = q
        rows = await run_template('Q21b', params, ws)
    else:
        rows = await run_template('Q21', params, ws)

    items = [
        MemoryListItem(
            id=r['id'],
            type=r['type'],
            title=r['title'] or '',
            summary=r['summary'] or '',
            confidence=float(r.get('confidence') or 0.0),
            status=r['status'] or 'unverified',
            uses=int(r.get('uses') or 0),
            source=r.get('source'),
            updated_at=r.get('updated_at'),
            created_at=r.get('created_at'),
            score=float(r['score']) if r.get('score') is not None else None,
        )
        for r in rows
    ]
    return MemoryListResponse(memories=items)


# ---------- Detail ----------
@router.get('/{memory_id}', response_model=MemoryDetail)
async def get_memory(memory_id: str, user: CurrentUser) -> MemoryDetail:
    ws = _ws(user)
    rows = await run_template('Q22', {'id': memory_id}, ws)
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Memory not found')

    # Q22 returns a cartesian product (entities × fixes). Dedupe in Python.
    first = rows[0]
    entities: dict[str, MemoryEntity] = {}
    fixes: dict[str, MemoryFix] = {}
    for r in rows:
        eid = r.get('entity_id')
        if eid and eid not in entities:
            entities[eid] = MemoryEntity(
                id=eid,
                type=r.get('entity_type') or '',
                name=r.get('entity_name') or eid,
            )
        fid = r.get('fix_id')
        if fid and fid not in fixes:
            fixes[fid] = MemoryFix(
                id=fid,
                title=r.get('fix_title') or '',
                kind=r.get('fix_kind') or '',
            )

    return MemoryDetail(
        id=first['id'],
        type=first['type'],
        title=first['title'] or '',
        summary=first['summary'] or '',
        confidence=float(first.get('confidence') or 0.0),
        status=first['status'] or 'unverified',
        uses=int(first.get('uses') or 0),
        source=first.get('source'),
        expires_at=first.get('expires_at'),
        created_at=first.get('created_at'),
        updated_at=first.get('updated_at'),
        entities=list(entities.values()),
        fixes=list(fixes.values()),
    )


# ---------- Create (manual) ----------
@router.post(
    '',
    response_model=MemoryDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def create_memory(body: CreateMemoryRequest, user: CurrentUser) -> MemoryDetail:
    """Create a memory manually. Links entities and (optionally) a fix."""
    ws = _ws(user)
    now = now_ms()
    memory_id = f'mem-{__import__("uuid").uuid4().hex[:8]}'

    await run_template('Q11m', {
        'memory_id': memory_id,
        'type': body.type,
        'title': body.title,
        'summary': body.summary,
        'confidence': body.confidence,
        'status': body.status,
        'source': 'manual',
        'now': now,
    }, ws)

    await _link_entities(ws, memory_id, body.entity_ids)
    if body.fix_id:
        await _link_fix(ws, memory_id, body.fix_id)

    await write_audit_event(
        workspace_id=ws,
        actor=user.user_id,
        verb='memory.create',
        target_id=memory_id,
        detail={
            'type': body.type,
            'title': body.title,
            'entity_ids': body.entity_ids,
            'fix_id': body.fix_id,
        },
    )

    return await get_memory(memory_id, user)


# ---------- Patch ----------
@router.patch(
    '/{memory_id}',
    response_model=MemoryDetail,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def patch_memory(
    memory_id: str,
    body: UpdateMemoryRequest,
    user: CurrentUser,
) -> MemoryDetail:
    """Partial update. Loads existing values, merges, then writes."""
    ws = _ws(user)
    existing = await _memory_exists(ws, memory_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Memory not found')

    merged_title = body.title if body.title is not None else existing['title']
    merged_summary = body.summary if body.summary is not None else existing['summary']
    merged_confidence = body.confidence if body.confidence is not None else float(existing.get('confidence') or 0.0)
    merged_status = body.status if body.status is not None else existing['status']

    await run_template('Q25', {
        'id': memory_id,
        'title': merged_title,
        'summary': merged_summary,
        'confidence': merged_confidence,
        'status': merged_status,
        'now': now_ms(),
    }, ws)

    await write_audit_event(
        workspace_id=ws,
        actor=user.user_id,
        verb='memory.update',
        target_id=memory_id,
        detail={
            'title': body.title,
            'summary': body.summary,
            'confidence': body.confidence,
            'status': body.status,
        },
    )

    return await get_memory(memory_id, user)


# ---------- Delete ----------
@router.delete(
    '/{memory_id}',
    response_model=DeleteResponse,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def delete_memory(memory_id: str, user: CurrentUser) -> DeleteResponse:
    """Permanently remove a memory and all its relationships."""
    ws = _ws(user)
    existing = await _memory_exists(ws, memory_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Memory not found')

    await write_audit_event(
        workspace_id=ws,
        actor=user.user_id,
        verb='memory.delete',
        target_id=memory_id,
        detail={'title': existing.get('title'), 'type': existing.get('type')},
    )

    g = falkor.workspace_graph(ws)
    await g.query(
        'MATCH (m:Memory {id:$id}) DETACH DELETE m',
        {'id': memory_id},
    )

    return DeleteResponse(id=memory_id)


# ---------- Lifecycle: verify / pin / deprecate ----------
async def _lifecycle(
    ws: str,
    user: CurrentUser,
    memory_id: str,
    new_status: str,
    verb: str,
) -> LifecycleResponse:
    existing = await _memory_exists(ws, memory_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Memory not found')

    now = now_ms()
    g = falkor.workspace_graph(ws)
    await g.query(
        'MATCH (m:Memory {id:$id}) SET m.status = $status, m.updated_at = $now',
        {'id': memory_id, 'status': new_status, 'now': now},
    )

    await write_audit_event(
        workspace_id=ws,
        actor=user.user_id,
        verb=verb,
        target_id=memory_id,
        detail={'previous_status': existing.get('status'), 'new_status': new_status},
    )

    return LifecycleResponse(id=memory_id, status=new_status, updated_at=now)


@router.post(
    '/{memory_id}/verify',
    response_model=LifecycleResponse,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def verify_memory(memory_id: str, user: CurrentUser) -> LifecycleResponse:
    """Mark a memory as verified. Only humans can do this — never the LLM."""
    return await _lifecycle(user.workspace_id, user, memory_id, 'verified', 'memory.verify')


@router.post(
    '/{memory_id}/pin',
    response_model=LifecycleResponse,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def pin_memory(memory_id: str, user: CurrentUser) -> LifecycleResponse:
    """Pin a memory — it will always be recalled in future investigations."""
    return await _lifecycle(user.workspace_id, user, memory_id, 'pinned', 'memory.pin')


@router.post(
    '/{memory_id}/deprecate',
    response_model=LifecycleResponse,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def deprecate_memory(memory_id: str, user: CurrentUser) -> LifecycleResponse:
    """Deprecate a memory. It stays in the graph for the audit trail but isn't recalled."""
    return await _lifecycle(user.workspace_id, user, memory_id, 'deprecated', 'memory.deprecate')