"""SSE streaming for RunEvents, with Last-Event-ID replay.

Why we use BOTH FalkorDB and Redis:
- FalkorDB stores RunEvents permanently (durable, replayable on reconnect)
- Redis pub/sub is real-time-only (no history)
- Combined: replay history, then stream live, dedupe by monotonic seq.

Auth: session cookie. Browsers' EventSource API cannot send Authorization
headers, so a cookie is the only workable auth for SSE in the browser.

Reconnect protocol (SSE standard):
- Client sends `Last-Event-ID: <seq>` header on reconnect
- We reply with every event whose seq > that value
- Then we switch to live streaming
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sse_starlette.sse import EventSourceResponse

from app.agents.workflow import retry_failed_run
from app.api.deps import CurrentUser, require_min_role
from app.db import falkor
from app.db import redis as redis_db
from app.models.nodes import now_ms
from app.services.audit import write_audit_event

log = logging.getLogger('graphops.api.runs')
router = APIRouter(prefix='/api/v1/runs', tags=['runs'])

# Events that mean the run is finished — close the SSE stream after these.
TERMINAL_EVENTS = frozenset({'run.completed', 'run.failed', 'run.cancelled'})

HEARTBEAT_SECONDS = 15
QUEUE_MAX = 1000


# ---------- Helpers ----------
async def _run_exists(ws: str, run_id: str) -> bool:
    g = falkor.workspace_graph(ws)
    res = await g.query(
        'MATCH (r:AgentRun {id:$id}) RETURN r.id LIMIT 1',
        {'id': run_id},
    )
    return bool(res.result_set)


async def _fetch_history(ws: str, run_id: str, after_seq: int) -> list[dict]:
    """Load persisted RunEvents with seq > after_seq, ordered ascending."""
    g = falkor.workspace_graph(ws)
    res = await g.query(
        """
        MATCH (r:AgentRun {id:$run_id})-[:HAS_EVENT]->(e:RunEvent)
        WHERE e.seq > $after_seq
        RETURN e.seq AS seq, e.type AS type, e.ts AS ts, e.payload AS payload
        ORDER BY e.seq ASC
        """,
        {'run_id': run_id, 'after_seq': after_seq},
    )
    events = []
    for seq, typ, ts, payload in res.result_set:
        try:
            data = json.loads(payload or '{}')
        except json.JSONDecodeError:
            data = {}
        # Stamp the envelope fields so the client sees a uniform shape.
        data.update({'run_id': run_id, 'seq': seq, 'ts': ts})
        events.append({'seq': int(seq), 'type': typ, 'ts': ts, 'data': data})
    return events


def _sse(event: dict) -> dict:
    """Format a RunEvent for sse-starlette. Uses SSE `id:` for Last-Event-ID."""
    return {
        'id': str(event['seq']),
        'event': event['type'],
        'data': json.dumps(event['data']),
    }


async def _redis_reader(pubsub, queue: asyncio.Queue) -> None:
    """Forward Redis pub/sub messages into an asyncio Queue."""
    try:
        async for message in pubsub.listen():
            if message.get('type') != 'message':
                continue
            try:
                payload = json.loads(message['data'])
            except (json.JSONDecodeError, TypeError):
                log.warning('bad redis payload, skipping')
                continue
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                log.warning('SSE queue full — dropping event for run %s',
                            payload.get('run_id'))
    except asyncio.CancelledError:
        raise
    except Exception as e:  # noqa: BLE001
        log.warning('redis reader stopped: %s', e)


async def _stream(ws: str, run_id: str, after_seq: int) -> AsyncGenerator[dict, None]:
    """Yield SSE events: replay persisted history, then stream live."""
    pubsub = redis_db.get_client().pubsub()
    channel = f'run:{run_id}:events'

    # Subscribe BEFORE replay so no event is missed in the gap.
    await pubsub.subscribe(channel)

    queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_MAX)
    reader = asyncio.create_task(_redis_reader(pubsub, queue))

    last_sent = after_seq
    try:
        # ---- Phase 1: Replay persisted history ----
        history = await _fetch_history(ws, run_id, after_seq=after_seq)
        for event in history:
            last_sent = max(last_sent, event['seq'])
            yield _sse(event)
            if event['type'] in TERMINAL_EVENTS:
                return

        # ---- Phase 2: Live stream with heartbeats ----
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                yield {'comment': 'keepalive'}
                continue

            seq = int(event.get('seq', 0))
            if seq <= last_sent:
                continue  # already sent during replay

            last_sent = seq
            yield {
                'id': str(seq),
                'event': event.get('event', 'message'),
                'data': json.dumps(event),
            }

            if event.get('event') in TERMINAL_EVENTS:
                return
    finally:
        reader.cancel()
        try:
            await reader
        except (asyncio.CancelledError, Exception):
            pass
        try:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
        except Exception:
            pass


# ---------- Endpoints ----------
@router.get('/{run_id}/events')
async def stream_run_events(run_id: str, request: Request, user: CurrentUser):
    """Server-Sent Events stream of RunEvents for one investigation."""
    ws = user.workspace_id

    if not await _run_exists(ws, run_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Run not found')

    # Last-Event-ID comes from the browser on reconnect (SSE standard).
    last_event_id = request.headers.get('last-event-id', '0')
    try:
        after_seq = max(0, int(last_event_id))
    except (TypeError, ValueError):
        after_seq = 0

    return EventSourceResponse(
        _stream(ws, run_id, after_seq),
        ping=HEARTBEAT_SECONDS,
    )


@router.get('/{run_id}')
async def get_run(run_id: str, user: CurrentUser):
    """Run detail with recent RunEvents (last 200)."""
    ws = user.workspace_id
    g = falkor.workspace_graph(ws)

    res = await g.query('MATCH (r:AgentRun {id:$id}) RETURN r', {'id': run_id})
    if not res.result_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Run not found')

    props = dict(res.result_set[0][0].properties)
    props['state'] = json.loads(props.get('state') or '{}')
    props['state_version'] = int(props.get('state_version', 0))

    events_res = await g.query(
        """
        MATCH (r:AgentRun {id:$id})-[:HAS_EVENT]->(e:RunEvent)
        RETURN e.seq AS seq, e.type AS type, e.ts AS ts
        ORDER BY e.seq DESC
        LIMIT 200
        """,
        {'id': run_id},
    )
    props['events'] = [
        {'seq': int(r[0]), 'type': r[1], 'ts': r[2]} for r in events_res.result_set
    ]
    return props


@router.get('')
async def list_runs(user: CurrentUser, limit: int = 20):
    """List the most recent runs in this workspace."""
    ws = user.workspace_id
    g = falkor.workspace_graph(ws)
    res = await g.query(
        """
        MATCH (r:AgentRun)
        RETURN r.id AS run_id, r.goal AS goal, r.status AS status,
               r.owner_agent AS owner_agent, r.started_at AS started_at,
               r.ended_at AS ended_at, r.state_version AS state_version,
               r.tokens AS tokens, r.cost_usd AS cost_usd
        ORDER BY r.started_at DESC
        LIMIT $limit
        """,
        {'limit': min(100, max(1, limit))},
    )
    headers = [h[1] for h in res.header]
    return {'runs': [dict(zip(headers, row)) for row in res.result_set]}


@router.post(
    '/{run_id}/retry',
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def retry_run(run_id: str, user: CurrentUser):
    """Retry a failed or stalled run from its last checkpoint."""
    ws = user.workspace_id
    g = falkor.workspace_graph(ws)

    res = await g.query(
        'MATCH (r:AgentRun {id:$id}) RETURN r.status, r.state',
        {'id': run_id},
    )
    if not res.result_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Run not found')

    cur_status, state_json = res.result_set[0]
    if cur_status not in ('failed', 'waiting_approval', 'cancelled'):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Cannot retry a run in status "{cur_status}"',
        )

    try:
        await retry_failed_run(ws, run_id)
    except Exception as e:  # noqa: BLE001
        log.exception('retry failed')
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f'Could not retry run: {type(e).__name__}',
        )

    await write_audit_event(
        workspace_id=ws,
        actor=user.user_id,
        verb='run.retry',
        target_id=run_id,
        detail={'previous_status': cur_status},
    )
    return {'run_id': run_id, 'status': 'running'}