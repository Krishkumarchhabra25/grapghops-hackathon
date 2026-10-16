"""Startup tasks that run once when the FastAPI app boots.

Two responsibilities:

1. `cleanup_orphaned_runs` — when the server restarts, any in-flight
   background tasks are killed by the OS. The AgentRun nodes in FalkorDB
   still say status='running', but nothing is executing them. This function
   marks those runs as failed so the runs list reflects reality.

2. `stale_run_watchdog` — a background loop that catches runs that stall
   for other reasons (crash, unhandled exception in a spawned task, etc.).
   Any 'running' run with an `updated_at` older than 5 minutes gets marked
   as failed.

Both preserve the run's `state` JSON so the user can click Resume and
continue from the last checkpoint.
"""
from __future__ import annotations

import asyncio
import logging

from app.db import falkor
from app.models.nodes import now_ms

log = logging.getLogger('graphops.startup')

# How often the watchdog fires (in seconds)
WATCHDOG_INTERVAL = 120

# How long a run can go without a heartbeat before being marked failed
STALE_THRESHOLD_SECONDS = 300


async def cleanup_orphaned_runs(workspace_id: str) -> int:
    """
    Mark all orphaned 'running' runs as failed.

    A 'running' run at server startup is orphaned by definition — nothing
    is executing it. 'waiting_approval' runs are intentionally preserved:
    they're paused waiting for a human decision.
    """
    if not falkor.is_connected():
        return 0

    g = falkor.workspace_graph(workspace_id)
    now = now_ms()

    # Count first so we can report
    count_res = await g.query(
        "MATCH (r:AgentRun) WHERE r.status = 'running' RETURN count(r) AS c"
    )
    count = int(count_res.result_set[0][0]) if count_res.result_set else 0
    if count == 0:
        return 0

    # Mark them failed with a resumable reason
    await g.query(
        """
        MATCH (r:AgentRun)
        WHERE r.status = 'running'
        SET r.status = 'failed',
            r.ended_at = $now,
            r.updated_at = $now,
            r.failure_reason = 'Server restarted while the run was in flight. Click Resume to continue from the last checkpoint.'
        """,
        {'now': now},
    )

    log.info('Marked %d orphaned runs as failed in ws_%s', count, workspace_id)
    return count


async def mark_stale_runs_failed(
    workspace_id: str,
    threshold_seconds: int = STALE_THRESHOLD_SECONDS,
) -> int:
    """
    Mark runs as failed if they've been 'running' but haven't updated in
    `threshold_seconds`. Called periodically by the watchdog.
    """
    if not falkor.is_connected():
        return 0

    g = falkor.workspace_graph(workspace_id)
    now = now_ms()
    cutoff = now - (threshold_seconds * 1000)

    res = await g.query(
        """
        MATCH (r:AgentRun)
        WHERE r.status = 'running' AND r.updated_at < $cutoff
        SET r.status = 'failed',
            r.ended_at = $now,
            r.updated_at = $now,
            r.failure_reason = 'Run stalled (no checkpoint in ' + toString($threshold) + ' seconds). Click Resume to continue from the last checkpoint.'
        RETURN count(r) AS c
        """,
        {'cutoff': cutoff, 'now': now, 'threshold': threshold_seconds},
    )
    count = int(res.result_set[0][0]) if res.result_set else 0
    if count > 0:
        log.info('Stale-run watchdog: marked %d runs as failed in ws_%s', count, workspace_id)
    return count


async def stale_run_watchdog(
    workspace_id: str,
    interval_seconds: int = WATCHDOG_INTERVAL,
) -> None:
    """
    Background loop. Every `interval_seconds`, mark any 'running' run that
    hasn't checked in within STALE_THRESHOLD_SECONDS as failed.

    Runs forever until cancelled (which happens on app shutdown).
    """
    log.info('Stale-run watchdog started for ws_%s (interval=%ds)', workspace_id, interval_seconds)
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            await mark_stale_runs_failed(workspace_id)
        except asyncio.CancelledError:
            log.info('Stale-run watchdog cancelled for ws_%s', workspace_id)
            raise
        except Exception as e:  # noqa: BLE001
            # Never let the watchdog crash — log and retry next interval
            log.warning('Watchdog error (will retry): %s', e)