"""Investigation workflow — Steps 1..12 from the PDF spec.

Design:
- One AgentRun per investigation.
- State is checkpointed after every step via Q19 (compare-and-set).
- Step 8 (approval) pauses the run; resume is triggered from the API.
- Cancellation is checked before every step.
- 90s per-step timeout.
- Background tasks are held in a module-level registry so the garbage
  collector does not silently kill them before they finish.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid

from app.agents import events, llm as llm_helpers
from app.agents.tools import (
    blast_radius, deployment_suspects, docs_for_service, evidence_path,
    historical_fixes, make_signature_id, normalize_error, owner_and_runbooks,
    recall_memory, related_incidents, service_criticality, who_knows,
)
from app.db import falkor
from app.graph.service import run_template
from app.models.nodes import now_ms

log = logging.getLogger('graphops.workflow')

STEP_TIMEOUT = 90.0

# ---------- Background task registry ----------
# asyncio.create_task() alone is unsafe: the Task can be garbage-collected
# before it completes because nothing holds a strong reference to it.
_BACKGROUND_TASKS: set[asyncio.Task] = set()


def _spawn(coro) -> asyncio.Task:
    """Schedule a coroutine as a background task with a strong reference."""
    task = asyncio.create_task(coro)
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)
    return task


# ---------- State helpers ----------
async def _load_run(ws: str, run_id: str) -> dict | None:
    g = falkor.workspace_graph(ws)
    res = await g.query('MATCH (r:AgentRun {id:$id}) RETURN r', {'id': run_id})
    if not res.result_set:
        return None
    props = res.result_set[0][0].properties
    state = json.loads(props.get('state') or '{}')
    return {'props': props, 'state': state}


async def _claim(ws: str, run_id: str, expected_version: int, new_state: dict,
                 status: str, agent: str) -> bool:
    """Q19 — compare-and-set. Returns True if we won the claim."""
    rows = await run_template('Q19', {
        'run_id': run_id,
        'expected_version': expected_version,
        'agent': agent,
        'new_state_json': json.dumps(new_state),
        'status': status,
        'now': now_ms(),
    }, ws)
    return len(rows) > 0


async def _is_cancelled(ws: str, run_id: str) -> bool:
    run = await _load_run(ws, run_id)
    return run is not None and run['props'].get('status') == 'cancelled'


async def _persist_finding(ws: str, run_id: str, finding: dict) -> str:
    fid = f"find-{uuid.uuid4().hex[:8]}"
    g = falkor.workspace_graph(ws)
    await g.query(
        """
        MATCH (r:AgentRun {id:$run_id})
        CREATE (f:Finding {
            id: $id, kind: $kind, claim: $claim, confidence: $confidence,
            verification: $verification, evidence_refs: $evidence_refs,
            created_at: $now, updated_at: $now
        })
        MERGE (r)-[:PRODUCED]->(f)
        """,
        {
            'run_id': run_id, 'id': fid, 'kind': finding['kind'],
            'claim': (finding.get('claim') or '')[:1000],
            'confidence': finding.get('confidence', 0.0),
            'verification': finding.get('verification', 'retrieved'),
            'evidence_refs': json.dumps(finding.get('evidence_refs', [])),
            'now': now_ms(),
        },
    )
    return fid


async def _persist_memory(ws: str, run_id: str, mem: dict) -> str:
    mid = f"mem-{uuid.uuid4().hex[:8]}"
    await run_template('Q11', {
        'memory_id': mid, 'type': mem['type'],
        'title': mem['title'][:200], 'summary': mem['summary'][:500],
        'confidence': mem.get('confidence', 0.5),
        'run_id': run_id, 'entity_ids': mem.get('entity_ids', []), 'now': now_ms(),
    }, ws)
    if mem.get('fix_id'):
        await run_template('Q11b', {'memory_id': mid, 'fix_id': mem['fix_id']}, ws)
    return mid


# ============================================================
# Steps
# ============================================================

async def step_1_intake(ws: str, run_id: str, state: dict) -> None:
    incident_id = state['incident_id']
    g = falkor.workspace_graph(ws)
    res = await g.query('MATCH (i:Incident {id:$id}) RETURN i', {'id': incident_id})
    if not res.result_set:
        raise RuntimeError(f'Incident {incident_id} not found')
    inc = res.result_set[0][0].properties
    state['incident_title'] = inc.get('title')
    state['incident_started_at'] = int(inc.get('started_at') or now_ms())

    res = await g.query(
        'MATCH (i:Incident {id:$id})-[:AFFECTED]->(s:Service) RETURN s.id AS id',
        {'id': incident_id},
    )
    state['service_ids'] = [r[0] for r in res.result_set]
    if not state['service_ids']:
        raise RuntimeError('Incident has no AFFECTED service')

    await events.emit(ws, run_id, 'run.started', 'intake', {
        'incident_id': incident_id,
        'service_ids': state['service_ids'],
    })


async def step_2_signature(ws: str, run_id: str, state: dict) -> None:
    incident_id = state['incident_id']
    g = falkor.workspace_graph(ws)
    res = await g.query(
        'MATCH (i:Incident {id:$id}) RETURN i.summary AS s, i.title AS t',
        {'id': incident_id},
    )
    summary = res.result_set[0][0] or res.result_set[0][1] or 'unknown error'

    normalized = normalize_error(summary)
    sig_id = make_signature_id(normalized)
    await run_template('Q20', {
        'incident_id': incident_id, 'sig_id': sig_id,
        'pattern': summary[:200], 'normalized': normalized, 'now': now_ms(),
    }, ws)
    state['signature_id'] = sig_id
    await events.emit(ws, run_id, 'tool.completed', 'signature', {
        'query_id': 'Q20', 'signature_id': sig_id,
    })


async def step_3_company_context(ws: str, run_id: str, state: dict) -> None:
    """Run Q06 (owners+runbooks), Q13 (who knows), Q14 (docs)."""
    service_id = state['service_ids'][0]

    # Resolve the acting user's team once so Q14 can include team-scoped docs.
    acting_user = state.get('actor_id') or 'usr-1'
    g = falkor.workspace_graph(ws)
    team_res = await g.query(
        'MATCH (p:Person {id:$id}) RETURN p.team_id AS team_id LIMIT 1',
        {'id': acting_user},
    )
    team_ids = []
    if team_res.result_set and team_res.result_set[0][0]:
        team_ids.append(team_res.result_set[0][0])
    state['team_ids'] = team_ids

    allowed = ['workspace'] + [f'team:{t}' for t in team_ids]

    owner = await owner_and_runbooks(ws, service_id)
    who = await who_knows(ws, service_id)
    docs = await docs_for_service(ws, service_id, allowed=allowed)

    owners_list = (owner[0].get('owners') if owner else None) or ['unknown']
    claim = (f"Service {service_id} owned by {', '.join(owners_list)}; "
             f"{len(docs)} runbooks apply; {len(who)} experts known")
    fid = await _persist_finding(ws, run_id, {
        'kind': 'fact', 'claim': claim, 'verification': 'retrieved',
        'evidence_refs': [service_id] + [d['id'] for d in docs],
    })
    state.setdefault('finding_ids', []).append(fid)
    state['company_context'] = {'owner': owner, 'who': who, 'docs': docs}
    await events.emit(ws, run_id, 'tool.completed', 'company_context', {'finding_id': fid})


async def step_4_graph_investigate(ws: str, run_id: str, state: dict) -> None:
    """Run Q03, Q05, Q01, Q08, then Q07 on the top suspect deployment."""
    incident_id = state['incident_id']
    service_id = state['service_ids'][0]
    since = state['incident_started_at'] - 24 * 3600 * 1000

    related = await related_incidents(ws, incident_id)
    deploys = await deployment_suspects(ws, incident_id, since)
    blast = await blast_radius(ws, service_id)
    criticality = await service_criticality(ws)

    state['related_incidents'] = related
    state['deployments'] = deploys

    for inc in (related or [])[:3]:
        inc_id = inc.get('incident')
        inc_title = inc.get('title') or 'Untitled'
        inc_status = inc.get('status') or 'unknown'
        fixes = list(inc.get('fixes') or [])
        if not inc_id:
            continue
        fid = await _persist_finding(ws, run_id, {
            'kind': 'fact',
            'claim': f"Related incident {inc_id}: {inc_title} ({inc_status})",
            'verification': 'retrieved',
            'evidence_refs': [inc_id] + fixes,
        })
        state.setdefault('finding_ids', []).append(fid)

    if deploys:
        top = deploys[0]
        top_deploy = top.get('deployment')
        if top_deploy:
            path = await evidence_path(ws, top_deploy, incident_id)
            state['evidence_path'] = path
            if path:
                fid = await _persist_finding(ws, run_id, {
                    'kind': 'fact',
                    'claim': f"Evidence path from {top_deploy} to {incident_id}",
                    'verification': 'retrieved',
                    'evidence_refs': [n['id'] for n in path.get('path', []) if n.get('id')],
                })
                state.setdefault('finding_ids', []).append(fid)
                await events.emit(ws, run_id, 'graph.path_found', 'graph_investigate', {
                    'query_id': 'Q07',
                    'path': path.get('path', []),
                    'rels': path.get('rels', []),
                })

    state['blast_radius'] = blast
    state['criticality'] = criticality
    await events.emit(ws, run_id, 'tool.completed', 'graph_investigate', {
        'deployments': len(deploys), 'related': len(related),
    })


async def step_5_memory_recall(ws: str, run_id: str, state: dict) -> None:
    incident_id = state['incident_id']
    service_id = state['service_ids'][0]
    deployment_ids = [d['deployment'] for d in state.get('deployments', []) if d.get('deployment')][:3]
    entity_ids = [incident_id, service_id] + deployment_ids

    memories = await recall_memory(ws, entity_ids, k=5)
    fixes = await historical_fixes(ws, incident_id)

    state['memories'] = memories
    state['historical_fixes'] = fixes

    await events.emit(ws, run_id, 'memory.retrieved', 'memory_recall', {
        'memory_ids': [m['id'] for m in memories],
        'fix_ids': [f['fix'] for f in fixes],
    })


async def step_6_hypothesize(ws: str, run_id: str, state: dict) -> None:
    g = falkor.workspace_graph(ws)
    res = await g.query('MATCH (i:Incident {id:$id}) RETURN i', {'id': state['incident_id']})
    incident = dict(res.result_set[0][0].properties) if res.result_set else {}

    findings_res = await g.query(
        'MATCH (r:AgentRun {id:$run_id})-[:PRODUCED]->(f:Finding) '
        'RETURN f.id AS id, f.claim AS claim, f.verification AS verification, f.evidence_refs AS evidence_refs',
        {'run_id': run_id},
    )
    findings = [
        {'id': r[0], 'claim': r[1], 'verification': r[2],
         'evidence_refs': json.loads(r[3] or '[]')}
        for r in findings_res.result_set
    ]

    result = await llm_helpers.hypothesize(
        incident=incident,
        findings=findings,
        memories=state.get('memories', []),
        deployments=state.get('deployments', []),
        evidence_path=state.get('evidence_path'),
    )

    for h in (result.get('hypotheses') or []):
        claim = str(h.get('claim', ''))[:1000]
        if not claim:
            continue
        try:
            conf = float(h.get('confidence', 0.0))
        except (TypeError, ValueError):
            conf = 0.0

        fid = await _persist_finding(ws, run_id, {
            'kind': 'hypothesis',
            'claim': claim,
            'confidence': conf,
            'verification': 'unverified_hypothesis',
            'evidence_refs': list(h.get('supporting_finding_ids') or []) + list(h.get('supporting_memory_ids') or []),
        })
        state.setdefault('finding_ids', []).append(fid)
        await events.emit(ws, run_id, 'finding.created', 'hypothesize', {
            'finding_id': fid, 'claim': claim, 'confidence': conf,
            'missing_evidence': list(h.get('missing_evidence') or []),
        })

    state['recommended_fix_id'] = result.get('recommended_fix_id')


async def step_7_propose_action(ws: str, run_id: str, state: dict) -> None:
    """
    Propose the fix, create an Approval, and pause.

    Enriched Action params: we load the Fix node first so the approval UI has
    real risk / rollback_plan / verification values instead of blanks.
    """
    fix_id = state.get('recommended_fix_id') or (state.get('historical_fixes') or [{}])[0].get('fix')
    if not fix_id:
        raise RuntimeError('No fix available to propose')

    g = falkor.workspace_graph(ws)

    # Load the Fix node so we can enrich the Action params.
    fix_res = await g.query(
        'MATCH (f:Fix {id:$id}) RETURN f.title AS title, f.kind AS kind, '
        'f.risk AS risk, f.steps AS steps',
        {'id': fix_id},
    )
    fix_title, fix_kind, fix_risk = '', 'patch', 'medium'
    fix_steps: list = []
    if fix_res.result_set:
        row = fix_res.result_set[0]
        fix_title = row[0] or ''
        fix_kind = row[1] or 'patch'
        fix_risk = row[2] or 'medium'
        raw_steps = row[3]
        try:
            fix_steps = json.loads(raw_steps) if isinstance(raw_steps, str) else (raw_steps or [])
        except json.JSONDecodeError:
            fix_steps = []
        if not isinstance(fix_steps, list):
            fix_steps = []

    service_id = state['service_ids'][0]
    action_id = f'act-{uuid.uuid4().hex[:8]}'
    approval_id = f'appr-{uuid.uuid4().hex[:8]}'
    now = now_ms()

    action_params = {
        'service': service_id,
        'fix_id': fix_id,
        'fix_title': fix_title,
        'fix_kind': fix_kind,
        'risk': fix_risk,
        'rollback_plan': (fix_steps[-1] if fix_steps else 'Re-apply previous version if the fix fails'),
        'verification': (fix_steps[-1] if fix_steps else 'Run contract tests'),
    }

    await g.query(
        """
        MATCH (r:AgentRun {id:$run_id}), (f:Fix {id:$fix_id})
        CREATE (a:Action {
            id:$action_id, kind:'rollback_dependency',
            params:$params, status:'proposed',
            idempotency_key:$idem, created_at:$now, updated_at:$now
        })
        CREATE (ap:Approval {
            id:$approval_id, status:'pending',
            requested_at:$now, created_at:$now, updated_at:$now
        })
        MERGE (r)-[:PROPOSES]->(a)
        MERGE (a)-[:FOR_FIX]->(f)
        MERGE (a)-[:REQUIRES]->(ap)
        """,
        {
            'run_id': run_id, 'fix_id': fix_id,
            'action_id': action_id, 'approval_id': approval_id,
            'params': json.dumps(action_params),
            'idem': f'{run_id}:{fix_id}',
            'now': now,
        },
    )

    state['action_id'] = action_id
    state['approval_id'] = approval_id
    state['fix_id'] = fix_id
    state['waiting_for'] = 'approval'

    await events.emit(ws, run_id, 'action.proposed', 'propose_action', {
        'action_id': action_id, 'fix_id': fix_id, 'risk': fix_risk,
    })
    await events.emit(ws, run_id, 'approval.required', 'propose_action', {
        'approval_id': approval_id,
    })


async def step_9_execute(ws: str, run_id: str, state: dict) -> None:
    """Simulated execution of the approved action."""
    action_id = state['action_id']
    g = falkor.workspace_graph(ws)
    await g.query(
        "MATCH (a:Action {id:$id}) SET a.status='executed', a.executed_at=$now, a.updated_at=$now",
        {'id': action_id, 'now': now_ms()},
    )
    await events.emit(ws, run_id, 'action.executed', 'execute', {'action_id': action_id})


async def step_10_verify(ws: str, run_id: str, state: dict) -> None:
    """Deterministic simulator: the historical fix is considered successful."""
    outcome_id = f'out-{uuid.uuid4().hex[:8]}'
    await run_template('Q12a', {
        'fix_id': state['fix_id'], 'incident_id': state['incident_id'],
        'run_id': run_id, 'outcome_id': outcome_id,
        'result': 'success',
        'evidence': 'Simulated contract tests passed. Error rate returned to baseline.',
        'verified_by': 'tests', 'now': now_ms(),
    }, ws)
    state['outcome_id'] = outcome_id
    await events.emit(ws, run_id, 'verification.completed', 'verify', {'outcome_id': outcome_id})


async def step_11_learn(ws: str, run_id: str, state: dict) -> None:
    service_id = state['service_ids'][0]
    mem_ids = []

    mem_ids.append(await _persist_memory(ws, run_id, {
        'type': 'episodic',
        'title': f"Fix applied for {state['incident_id']}",
        'summary': f"Rolled back to fix {state['fix_id']}; outcome success.",
        'confidence': 0.7,
        'entity_ids': [state['incident_id'], service_id, state['fix_id']],
        'fix_id': state['fix_id'],
    }))

    mem_ids.append(await _persist_memory(ws, run_id, {
        'type': 'procedural',
        'title': f"Rollback procedure for {service_id}",
        'summary': "Confirm signature, rollback dependency, run contract tests, monitor error rate.",
        'confidence': 0.6,
        'entity_ids': [service_id],
        'fix_id': state['fix_id'],
    }))

    await run_template('Q12b', {
        'fix_id': state['fix_id'], 'result': 'success', 'now': now_ms(),
    }, ws)

    state['memory_ids'] = mem_ids
    await events.emit(ws, run_id, 'memory.written', 'learn', {'memory_ids': mem_ids})


async def step_12_finish(ws: str, run_id: str, state: dict) -> None:
    g = falkor.workspace_graph(ws)
    await g.query(
        "MATCH (r:AgentRun {id:$id}) SET r.status='succeeded', r.ended_at=$now, r.updated_at=$now",
        {'id': run_id, 'now': now_ms()},
    )
    await events.emit(ws, run_id, 'run.completed', 'finish', {
        'findings': len(state.get('finding_ids', [])),
        'memories': len(state.get('memory_ids', [])),
    })


# ============================================================
# Orchestrator
# ============================================================

STEPS = {
    1: ('investigator', step_1_intake),
    2: ('investigator', step_2_signature),
    3: ('graph_researcher', step_3_company_context),
    4: ('graph_researcher', step_4_graph_investigate),
    5: ('memory_analyst', step_5_memory_recall),
    6: ('investigator', step_6_hypothesize),
    7: ('resolver', step_7_propose_action),
    9: ('resolver', step_9_execute),
    10: ('resolver', step_10_verify),
    11: ('memory_analyst', step_11_learn),
    12: ('investigator', step_12_finish),
}


async def _run_from(ws: str, run_id: str, start_step: int) -> None:
    """Execute steps from start_step onward, honouring checkpoints and cancels."""
    run = await _load_run(ws, run_id)
    if run is None:
        raise RuntimeError(f'Run {run_id} not found')
    state = run['state']
    version = int(run['props'].get('state_version', 0))

    for step_num in sorted(STEPS):
        if step_num < start_step:
            continue
        if await _is_cancelled(ws, run_id):
            log.info('Run %s cancelled at step %s', run_id, step_num)
            return

        agent, fn = STEPS[step_num]
        state['current_step'] = step_num

        try:
            await asyncio.wait_for(fn(ws, run_id, state), timeout=STEP_TIMEOUT)
        except asyncio.TimeoutError:
            log.error('Step %s timed out', step_num)
            await _fail(ws, run_id, f'Step {step_num} timed out')
            return
        except Exception as e:  # noqa: BLE001
            log.exception('Step %s failed', step_num)
            await _fail(ws, run_id, f'Step {step_num} failed: {type(e).__name__}: {e}')
            return

        # Step 12 writes the terminal 'succeeded' status and must NOT be
        # overwritten by the checkpoint claim, which would flip the run
        # back to 'running' indefinitely.
        if step_num == 12:
            log.info('Run %s completed successfully', run_id)
            return

        # Handoff: check state (may be paused for approval).
        status = 'waiting_approval' if state.get('waiting_for') == 'approval' else 'running'
        if not await _claim(ws, run_id, version, state, status, agent):
            log.warning('Claim lost for run %s at step %s — re-reading', run_id, step_num)
            run = await _load_run(ws, run_id)
            if run is None:
                return
            state = run['state']
            version = int(run['props'].get('state_version', 0))
            continue

        version += 1
        if status == 'waiting_approval':
            log.info('Run %s paused for approval', run_id)
            return


async def _fail(ws: str, run_id: str, message: str) -> None:
    g = falkor.workspace_graph(ws)
    await g.query(
        "MATCH (r:AgentRun {id:$id}) SET r.status='failed', r.ended_at=$now, r.updated_at=$now",
        {'id': run_id, 'now': now_ms()},
    )
    await events.emit(ws, run_id, 'run.failed', 'error', {'message': message})


async def start_investigation(ws: str, incident_id: str, goal: str,
                              actor_id: str | None = None) -> str:
    """Create an AgentRun and kick off steps 1..7 (pauses at approval)."""
    run_id = f'run-{uuid.uuid4().hex[:8]}'
    now = now_ms()

    g = falkor.workspace_graph(ws)
    await g.query(
        """
        MATCH (i:Incident {id:$incident_id})
        CREATE (r:AgentRun {
            id:$run_id, goal:$goal, status:'running',
            state:'{}', state_version:0,
            started_at:$now, created_at:$now, updated_at:$now,
            tokens:0, cost_usd:0.0
        })
        MERGE (r)-[:FOR_INCIDENT]->(i)
        """,
        {'run_id': run_id, 'incident_id': incident_id, 'goal': goal[:300], 'now': now},
    )

    state = {'incident_id': incident_id, 'current_step': 0}
    if actor_id:
        state['actor_id'] = actor_id

    initial = await _load_run(ws, run_id)
    if initial is None:
        raise RuntimeError('AgentRun creation failed')

    await _claim(ws, run_id, 0, state, 'running', 'investigator')

    _spawn(_run_from(ws, run_id, start_step=1))
    return run_id


async def resume_run(ws: str, run_id: str, start_step: int | None = None) -> None:
    """
    Public entry point to resume a paused or failed run.

    Persists the cleared `waiting_for` flag to FalkorDB BEFORE spawning the
    background task. Without this write, `_run_from` re-reads the old state
    from the DB and immediately returns after the first step, thinking the
    run is still waiting for approval.

    If start_step is None, resume from the step after the current checkpoint.
    """
    run = await _load_run(ws, run_id)
    if run is None:
        raise RuntimeError(f'Run {run_id} not found')

    state = run['state']
    state.pop('waiting_for', None)

    if start_step is None:
        start_step = int(state.get('current_step', 0)) + 1

    # Persist the updated state so the spawned task sees a fresh copy.
    g = falkor.workspace_graph(ws)
    await g.query(
        """
        MATCH (r:AgentRun {id:$id})
        SET r.state = $state,
            r.status = 'running',
            r.ended_at = null,
            r.updated_at = $now
        """,
        {'id': run_id, 'state': json.dumps(state), 'now': now_ms()},
    )

    _spawn(_run_from(ws, run_id, start_step=start_step))


async def resume_after_approval(ws: str, run_id: str) -> None:
    """Legacy alias. Prefer resume_run()."""
    await resume_run(ws, run_id)


async def retry_failed_run(ws: str, run_id: str) -> None:
    """
    Reset a failed/cancelled/paused run and resume from the next step.

    Writes the refreshed state back to the graph so the retry is observable
    and the run's status flips to 'running' before the background task starts.
    """
    run = await _load_run(ws, run_id)
    if run is None:
        raise RuntimeError(f'Run {run_id} not found')

    state = run['state']
    state.pop('waiting_for', None)
    next_step = int(state.get('current_step', 0)) + 1

    g = falkor.workspace_graph(ws)
    await g.query(
        """
        MATCH (r:AgentRun {id:$id})
        SET r.status = 'running', r.ended_at = null,
            r.state = $state, r.updated_at = $now
        """,
        {'id': run_id, 'state': json.dumps(state), 'now': now_ms()},
    )
    _spawn(_run_from(ws, run_id, start_step=next_step))