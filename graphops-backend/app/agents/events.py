"""RunEvent persistence + Redis pub/sub for the SSE stream."""
import json
import logging

from app.db import falkor
from app.db import redis as redis_db
from app.models.nodes import now_ms

log = logging.getLogger('graphops.events')


async def next_seq(workspace_id: str, run_id: str) -> int:
    """Monotonic seq per run, derived from persisted RunEvents."""
    g = falkor.workspace_graph(workspace_id)
    res = await g.query(
        'MATCH (r:AgentRun {id:$run_id})-[:HAS_EVENT]->(e:RunEvent) '
        'RETURN coalesce(max(e.seq), 0) AS max_seq',
        {'run_id': run_id},
    )
    max_seq = res.result_set[0][0] if res.result_set else 0
    return int(max_seq) + 1


async def emit(
    workspace_id: str,
    run_id: str,
    event_type: str,
    step: str,
    payload: dict,
    trace_id: str | None = None,
) -> dict:
    """Persist a RunEvent and publish it to the live SSE channel."""
    seq = await next_seq(workspace_id, run_id)
    ts = now_ms()
    event_id = f'evt-{run_id}-{seq}'

    # 1) Persist for replay
    g = falkor.workspace_graph(workspace_id)
    await g.query(
        """
        MATCH (r:AgentRun {id:$run_id})
        MERGE (e:RunEvent {id:$event_id})
        SET e.seq = $seq, e.type = $type, e.ts = $ts,
            e.payload = $payload, e.created_at = $ts, e.updated_at = $ts
        MERGE (r)-[:HAS_EVENT]->(e)
        """,
        {
            'run_id': run_id,
            'event_id': event_id,
            'seq': seq,
            'type': event_type,
            'ts': ts,
            'payload': json.dumps({'step': step, **(payload or {})}),
        },
    )

    # 2) Publish live (non-durable)
    message = json.dumps({
        'run_id': run_id,
        'seq': seq,
        'ts': ts,
        'trace_id': trace_id or '',
        'step': step,
        'event': event_type,
        'data': payload or {},
    })
    try:
        await redis_db.get_client().publish(f'run:{run_id}:events', message)
    except Exception as e:  # noqa: BLE001
        log.warning('SSE publish failed (non-fatal): %s', e)

    return {'seq': seq, 'ts': ts, 'event_id': event_id}