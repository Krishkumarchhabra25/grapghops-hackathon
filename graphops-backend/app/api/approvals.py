"""Approvals HTTP endpoints.

Human-in-the-loop: the workflow pauses at step 7 and waits for a decision.
Approving resumes execution from step 9. Rejecting terminates the run.

Authorization:
- list / detail: any authenticated user
- approve / reject: Engineer or higher

Race safety:
- The Cypher UPDATE uses `WHERE a.status = 'pending'` so two concurrent
  decisions on the same approval cannot both succeed.
- We verify the WHERE clause actually matched before resuming the workflow.
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.agents.workflow import resume_run
from app.api.deps import CurrentUser, require_min_role
from app.db import falkor
from app.models.approvals import (
    ActionPublic,
    ApprovalDecisionRequest,
    ApprovalDetail,
    ApprovalListItem,
    ApprovalListResponse,
    DecisionResponse,
    FixPublic,
    RejectRequest,
)
from app.models.nodes import now_ms
from app.services.audit import write_audit_event

log = logging.getLogger('graphops.api.approvals')
router = APIRouter(prefix='/api/v1/approvals', tags=['approvals'])


# ---------- Helpers ----------
def _ws(user: CurrentUser) -> str:
    return user.workspace_id


def _parse_json(s: str | None) -> dict:
    if not s:
        return {}
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return {}


async def _load_approval_full(ws: str, approval_id: str) -> dict | None:
    """One query to load Approval + Action + Fix + evidence + run context."""
    g = falkor.workspace_graph(ws)
    res = await g.query(
        """
        MATCH (a:Approval {id:$id})
        OPTIONAL MATCH (act:Action)-[:REQUIRES]->(a)
        OPTIONAL MATCH (r:AgentRun)-[:PROPOSES]->(act)
        OPTIONAL MATCH (act)-[:FOR_FIX]->(f:Fix)
        OPTIONAL MATCH (r)-[:FOR_INCIDENT]->(i:Incident)
        OPTIONAL MATCH (r)-[:PRODUCED]->(fnd:Finding)
        OPTIONAL MATCH (r)-[:PRODUCED]->(m:Memory)
        RETURN a, act, r, f, i.id AS incident_id,
               collect(DISTINCT fnd.id) AS finding_ids,
               collect(DISTINCT m.id) AS memory_ids
        """,
        {'id': approval_id},
    )
    if not res.result_set:
        return None

    row = res.result_set[0]
    approval_node = row[0]
    action_node = row[1]
    run_node = row[2]
    fix_node = row[3]
    incident_id = row[4]
    finding_ids = [x for x in (row[5] or []) if x]
    memory_ids = [x for x in (row[6] or []) if x]

    return {
        'approval': dict(approval_node.properties) if approval_node else {},
        'action': dict(action_node.properties) if action_node else None,
        'run': dict(run_node.properties) if run_node else None,
        'fix': dict(fix_node.properties) if fix_node else None,
        'incident_id': incident_id,
        'finding_ids': finding_ids,
        'memory_ids': memory_ids,
    }


def _to_action_public(action_props: dict | None) -> ActionPublic | None:
    if not action_props:
        return None
    params = _parse_json(action_props.get('params'))
    return ActionPublic(
        id=action_props.get('id', ''),
        kind=action_props.get('kind', ''),
        params=params,
        status=action_props.get('status', 'proposed'),
        risk=params.get('risk'),
        rollback_plan=params.get('rollback_plan'),
        verification=params.get('verification'),
        idempotency_key=action_props.get('idempotency_key'),
    )


def _to_fix_public(fix_props: dict | None) -> FixPublic | None:
    if not fix_props:
        return None
    steps_raw = fix_props.get('steps')
    steps = _parse_json(steps_raw) if isinstance(steps_raw, str) else (steps_raw or [])
    if not isinstance(steps, list):
        steps = []
    return FixPublic(
        id=fix_props.get('id', ''),
        title=fix_props.get('title', ''),
        kind=fix_props.get('kind', 'patch'),
        steps=[str(s) for s in steps],
        risk=fix_props.get('risk'),
    )


# ---------- Endpoints ----------
@router.get('', response_model=ApprovalListResponse)
async def list_approvals(
    user: CurrentUser,
    status_filter: str | None = Query(None, alias='status'),
    limit: int = Query(20, ge=1, le=100),
) -> ApprovalListResponse:
    """List approvals for this workspace, most recent first."""
    ws = _ws(user)
    g = falkor.workspace_graph(ws)

    where_status = 'WHERE a.status = $status' if status_filter else ''
    params: dict = {'limit': limit}
    if status_filter:
        params['status'] = status_filter

    res = await g.query(
        f"""
        MATCH (a:Approval)
        {where_status}
        OPTIONAL MATCH (act:Action)-[:REQUIRES]->(a)
        OPTIONAL MATCH (r:AgentRun)-[:PROPOSES]->(act)
        OPTIONAL MATCH (act)-[:FOR_FIX]->(f:Fix)
        RETURN a.id, a.status, a.requested_at, a.decided_at, a.decided_by,
               r.id AS run_id, act.kind AS action_kind,
               f.id AS fix_id, f.title AS fix_title
        ORDER BY a.requested_at DESC
        LIMIT $limit
        """,
        params,
    )

    items = [
        ApprovalListItem(
            id=row[0], status=row[1], requested_at=row[2],
            decided_at=row[3], decided_by=row[4], run_id=row[5] or '',
            action_kind=row[6], fix_id=row[7], fix_title=row[8],
        )
        for row in res.result_set
    ]
    return ApprovalListResponse(approvals=items)


@router.get('/{approval_id}', response_model=ApprovalDetail)
async def get_approval(approval_id: str, user: CurrentUser) -> ApprovalDetail:
    """Full detail with the proposed action, fix, and evidence."""
    ws = _ws(user)
    data = await _load_approval_full(ws, approval_id)
    if data is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Approval not found')

    a = data['approval']
    return ApprovalDetail(
        id=a.get('id', ''),
        status=a.get('status', 'pending'),
        run_id=(data['run'] or {}).get('id', ''),
        requested_at=a.get('requested_at'),
        decided_at=a.get('decided_at'),
        decided_by=a.get('decided_by'),
        reason=a.get('reason'),
        action=_to_action_public(data['action']),
        fix=_to_fix_public(data['fix']),
        evidence_finding_ids=data['finding_ids'],
        memory_ids=data['memory_ids'],
        incident_id=data['incident_id'],
    )


async def _decide(
    ws: str,
    user: CurrentUser,
    approval_id: str,
    decision: str,
    reason: str | None,
) -> DecisionResponse:
    """
    Shared logic for approve/reject. Uses WHERE status='pending' as a CAS
    guard so two concurrent decisions cannot both succeed.
    """
    now = now_ms()
    g = falkor.workspace_graph(ws)

    # --- 1) Compare-and-set on the Approval node ---
    res = await g.query(
        """
        MATCH (a:Approval {id:$id})
        WHERE a.status = 'pending'
        SET a.status = $decision,
            a.decided_at = $now,
            a.decided_by = $user,
            a.reason = $reason,
            a.updated_at = $now
        RETURN a.id
        """,
        {
            'id': approval_id,
            'decision': decision,
            'now': now,
            'user': user.user_id,
            'reason': reason or '',
        },
    )
    if not res.result_set:
        # Either the approval does not exist, or it was already decided.
        check = await g.query(
            'MATCH (a:Approval {id:$id}) RETURN a.status',
            {'id': approval_id},
        )
        if not check.result_set:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Approval not found')
        cur = check.result_set[0][0]
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'Approval already decided (status={cur})',
        )

    # --- 2) Load the linked run so we can resume or fail it ---
    ctx = await g.query(
        """
        MATCH (a:Approval {id:$id})<-[:REQUIRES]-(act:Action)<-[:PROPOSES]-(r:AgentRun)
        RETURN r.id AS run_id, act.id AS action_id
        """,
        {'id': approval_id},
    )
    if not ctx.result_set:
        log.error('Approval %s has no linked run — orphan node', approval_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='Approval is orphaned (no linked run)',
        )
    run_id, action_id = ctx.result_set[0]
    new_run_status = 'running'

    if decision == 'approved':
        # Leave Action status alone — step 9 will flip it to 'executed'.
        try:
            await resume_run(ws, run_id)
        except Exception as e:  # noqa: BLE001
            log.exception('resume_run failed for %s', run_id)
            # Roll the approval back so the user can retry.
            await g.query(
                "MATCH (a:Approval {id:$id}) SET a.status='pending', a.updated_at=$now",
                {'id': approval_id, 'now': now_ms()},
            )
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f'Could not resume run: {type(e).__name__}',
            )
    else:
        # Reject: fail the run and mark the action as failed.
        await g.query(
            """
            MATCH (r:AgentRun {id:$run_id})
            SET r.status = 'failed', r.ended_at = $now, r.updated_at = $now
            """,
            {'run_id': run_id, 'now': now},
        )
        await g.query(
            """
            MATCH (a:Action {id:$action_id})
            SET a.status = 'failed', a.updated_at = $now
            """,
            {'action_id': action_id, 'now': now},
        )
        new_run_status = 'failed'

    # --- 3) Audit trail ---
    await write_audit_event(
        workspace_id=ws,
        actor=user.user_id,
        verb=f'approval.{decision}',
        target_id=approval_id,
        detail={'run_id': run_id, 'action_id': action_id, 'reason': reason or ''},
    )

    return DecisionResponse(
        id=approval_id,
        status=decision,
        decided_by=user.user_id,
        decided_at=now,
        run_status=new_run_status,
    )


@router.post(
    '/{approval_id}/approve',
    response_model=DecisionResponse,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def approve(
    approval_id: str,
    body: ApprovalDecisionRequest,
    user: CurrentUser,
) -> DecisionResponse:
    """Approve the proposed action. Resumes the workflow from step 9."""
    return await _decide(user.workspace_id, user, approval_id, 'approved', body.reason)


@router.post(
    '/{approval_id}/reject',
    response_model=DecisionResponse,
    dependencies=[Depends(require_min_role('Engineer'))],
)
async def reject(
    approval_id: str,
    body: RejectRequest,
    user: CurrentUser,
) -> DecisionResponse:
    """Reject the proposed action. Marks the run as failed."""
    return await _decide(user.workspace_id, user, approval_id, 'rejected', body.reason)