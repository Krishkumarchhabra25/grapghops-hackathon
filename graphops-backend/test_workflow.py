"""Test harness for the investigation workflow. Shows live progress."""
import asyncio
import json
import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
    stream=sys.stdout,
)

from app.db import falkor
from app.db import redis as redis_db
from app.agents.workflow import start_investigation, _BACKGROUND_TASKS


async def poll_run(ws: str, run_id: str, seconds: int = 150) -> None:
    g = falkor.workspace_graph(ws)
    last_print = 0
    last_status = last_step = None

    for i in range(seconds):
        await asyncio.sleep(1)
        try:
            res = await g.query(
                "MATCH (r:AgentRun {id:$id}) "
                "RETURN r.status AS status, r.state AS state, r.state_version AS version",
                {'id': run_id},
            )
            if not res.result_set:
                print(f'[{i+1:03d}s] run not found yet')
                continue
            status, state_json, version = res.result_set[0]
            state = json.loads(state_json or '{}')
            step = state.get('current_step', '?')

            # Print on change OR every 5 seconds as a heartbeat
            if (status != last_status or step != last_step or (i - last_print) >= 5):
                print(f'[{i+1:03d}s] status={status} step={step} version={version}')
                last_print = i
                last_status, last_step = status, step

            if status in ('succeeded', 'failed', 'cancelled', 'waiting_approval'):
                f = await g.query(
                    "MATCH (r:AgentRun {id:$id})-[:PRODUCED]->(f:Finding) RETURN count(f)",
                    {'id': run_id},
                )
                ev = await g.query(
                    "MATCH (r:AgentRun {id:$id})-[:HAS_EVENT]->(e:RunEvent) RETURN count(e)",
                    {'id': run_id},
                )
                ap = await g.query(
                    "MATCH (r:AgentRun {id:$id})-[:PROPOSES]->(:Action)-[:REQUIRES]->(a:Approval) "
                    "RETURN a.id, a.status",
                    {'id': run_id},
                )
                print(f'\n         ✓ FINAL STATE: {status}')
                print(f'         findings={f.result_set[0][0]} events={ev.result_set[0][0]}')
                if ap.result_set:
                    print(f'         approval={ap.result_set[0][0]} status={ap.result_set[0][1]}')
                return
        except Exception as e:  # noqa: BLE001
            print(f'[{i+1:03d}s] poll error: {e}')


async def main():
    print('→ Connecting...')
    await falkor.connect()
    await redis_db.connect()

    print('→ Starting investigation on inc-2481...')
    run_id = await start_investigation('acme', 'inc-2481', 'Investigate checkout error spike')
    print(f'→ Started run: {run_id}\n')
    print('→ Polling (max 150s). Step 6 (LLM call) will take 30-90s...\n')

    await poll_run('acme', run_id, seconds=150)

    if _BACKGROUND_TASKS:
        print(f'\n→ Waiting for {len(_BACKGROUND_TASKS)} background task(s) to finish...')
        await asyncio.wait(_BACKGROUND_TASKS, timeout=30)

    await redis_db.close()
    await falkor.close()
    print('\n→ Done.')


if __name__ == '__main__':
    asyncio.run(main())