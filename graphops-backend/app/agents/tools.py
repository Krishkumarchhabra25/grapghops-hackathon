"""One function per query template. These are the ONLY graph tools the agent has.

Every tool is thin — it maps its arguments to a query template's params and
returns the rows. Business logic lives in the workflow, not here.
"""
from __future__ import annotations

import hashlib
import re

from app.graph.service import run_template
from app.models.nodes import now_ms

HOP_LIMIT = 4
ENTITY_PREFIXES = ('svc-', 'dep-', 'inc-', 'doc-', 'dec-', 'team-', 'usr-')


# ============ Track 01: Investigate and Act ============

async def blast_radius(ws: str, service_id: str, depth: int = 3) -> list[dict]:
    """Q01 — Services that depend on this one (up to 3 hops)."""
    return await run_template('Q01', {'service_id': service_id, 'depth': depth}, ws)


async def affected_services(ws: str, incident_id: str) -> list[dict]:
    """Q02 — Services directly affected by an incident, plus downstream."""
    return await run_template('Q02', {'incident_id': incident_id}, ws)


async def related_incidents(ws: str, incident_id: str) -> list[dict]:
    """Q03 — Incidents sharing the same error signature."""
    return await run_template('Q03', {'incident_id': incident_id}, ws)


async def historical_fixes(ws: str, incident_id: str) -> list[dict]:
    """Q04 — Fixes that worked before, ranked by proven successes."""
    return await run_template('Q04', {'incident_id': incident_id}, ws)


async def deployment_suspects(
    ws: str,
    incident_id: str,
    since_ms: int,
) -> list[dict]:
    """Q05 — Recent deployments on the affected service or its dependencies."""
    return await run_template(
        'Q05',
        {'incident_id': incident_id, 'since': since_ms},
        ws,
    )


async def owner_and_runbooks(ws: str, service_id: str) -> list[dict]:
    """Q06 — Who owns a service and which runbooks describe it."""
    return await run_template('Q06', {'service_id': service_id}, ws)


async def evidence_path(
    ws: str,
    deployment_id: str,
    incident_id: str,
) -> dict | None:
    """Q07 — Directed path from a suspect deployment to the incident.

    Returns the first row or None if no path within 6 hops.
    """
    rows = await run_template(
        'Q07',
        {'deployment_id': deployment_id, 'incident_id': incident_id},
        ws,
    )
    return rows[0] if rows else None


async def generic_path(ws: str, from_id: str, to_id: str) -> dict | None:
    """Q07b — Undirected shortest path between any two nodes (max 6 hops).

    Used by the Graph Explorer's path panel. Distinct from Q07 which is
    fixed to deployment→incident.
    """
    rows = await run_template('Q07b', {'from': from_id, 'to': to_id}, ws)
    return rows[0] if rows else None


async def service_criticality(ws: str) -> list[dict]:
    """Q08 — Top services by PageRank score."""
    return await run_template('Q08', {}, ws)


async def service_communities(ws: str) -> list[dict]:
    """Q09 — Weakly-connected components over Service/DEPENDS_ON."""
    return await run_template('Q09', {}, ws)


# ============ Track 02: Memory and Coordination ============

async def recall_memory(ws: str, entity_ids: list[str], k: int = 5) -> list[dict]:
    """Q10 — Memories about the given entities, verified first, then by confidence."""
    return await run_template(
        'Q10',
        {'entity_ids': entity_ids, 'now': now_ms(), 'k': k},
        ws,
    )


# ============ Track 03: Company Brain ============

async def who_knows(ws: str, service_id: str) -> list[dict]:
    """Q13 — People connected to a service by ownership or work."""
    return await run_template('Q13', {'service_id': service_id}, ws)


async def docs_for_service(
    ws: str,
    service_id: str,
    allowed: list[str],
) -> list[dict]:
    """Q14 — Documents describing a service, filtered by visibility."""
    return await run_template(
        'Q14',
        {'service_id': service_id, 'allowed': allowed},
        ws,
    )


async def decision_trace(ws: str, decision_id: str) -> list[dict]:
    """Q15 — A decision back to its source documents and superseding decisions."""
    return await run_template('Q15', {'decision_id': decision_id}, ws)


async def ask_retrieval(ws: str, text: str, allowed: list[str]) -> list[dict]:
    """Q16 — Full-text match + graph expansion, filtered by permission."""
    return await run_template('Q16', {'text': text, 'allowed': allowed}, ws)


async def stale_docs(ws: str, older_than_ms: int) -> list[dict]:
    """Q17 — Documents needing review or older than a threshold."""
    return await run_template('Q17', {'older_than': older_than_ms}, ws)


# ============ Shared ============

async def subgraph(ws: str, center: str, hops: int = 2) -> dict:
    """Q18 — Neighborhood of a node for the Graph Explorer.

    Q18 returns rows where each row is one path:
      {path_nodes: [{id, type, name, status}], path_rels: [{source, target, type}]}

    Many paths share nodes. We dedupe nodes by `id` and edges by
    (source, target, type), returning the shape the frontend expects.
    """
    rows = await run_template('Q18', {'center': center, 'hops': hops}, ws)

    nodes: dict[str, dict] = {}
    edges: dict[tuple, dict] = {}

    for row in rows:
        for n in (row.get('path_nodes') or []):
            if isinstance(n, dict) and n.get('id'):
                nodes[n['id']] = {
                    'id': n['id'],
                    'type': n.get('type', ''),
                    'name': n.get('name', n['id']),
                    'status': n.get('status', '') or '',
                }
        for e in (row.get('path_rels') or []):
            if not isinstance(e, dict):
                continue
            src, tgt, typ = e.get('source'), e.get('target'), e.get('type')
            if not (src and tgt and typ):
                continue
            edges[(src, tgt, typ)] = {
                'source': src,
                'target': tgt,
                'type': typ,
            }

    return {
        'center': center,
        'nodes': list(nodes.values()),
        'edges': list(edges.values()),
        'truncated': len(rows) >= 100,
    }


# ============ Signature helpers ============

_NORMALIZE_RE = re.compile(r'[0-9a-f]{8,}|\d+', re.IGNORECASE)


def make_signature_id(normalized_message: str) -> str:
    """Deterministic id for an error signature.

    Identical (normalized) messages always produce the same id, so the same
    failure in a later incident merges onto the same ErrorSignature node.
    """
    digest = hashlib.sha1(normalized_message.encode('utf-8')).hexdigest()[:10]
    return f'sig-{digest}'


def normalize_error(message: str) -> str:
    """Lowercase + replace hex/digit runs with <n>, capped at 200 chars.

    Two failure messages with different request ids or timestamps normalize
    to the same string, so their hashes match.
    """
    return _NORMALIZE_RE.sub('<n>', message.lower()).strip()[:200]