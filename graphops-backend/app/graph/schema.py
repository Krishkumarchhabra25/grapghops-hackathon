"""Graph schema setup: indexes, unique constraints, full-text and optional vector index.

Everything here is idempotent. Running it twice reports 'exists' for what is already there.
Syntax was checked against a real FalkorDB module (v4.18-line) on Oct 15, 2026.

Not supported by FalkorDB (do not use in queries): algo.CDLP, undirected shortestPath,
shortestPath inside MATCH. Use algo.WCC / algo.betweenness and directed shortestPath in RETURN/WITH.
"""
import logging
from dataclasses import dataclass, field

from app.config import get_settings
from app.db import falkor
from app.models.nodes import CONTROL_NODE_MODELS, WORKSPACE_NODE_MODELS

log = logging.getLogger('graphops.schema')

# Labels that get an index on id plus a UNIQUE constraint on id.
WORKSPACE_ID_LABELS = [m.label for m in WORKSPACE_NODE_MODELS]
CONTROL_ID_LABELS = [m.label for m in CONTROL_NODE_MODELS]

# Extra range indexes for common filters (label, property).
EXTRA_INDEXES = [
    ('Incident', 'status'),
    ('Incident', 'started_at'),
    ('Deployment', 'deployed_at'),
    ('Memory', 'status'),
    ('AgentRun', 'status'),
    ('Document', 'visibility'),
    ('RunEvent', 'seq'),
]

# Full-text indexes (label -> properties).
FULLTEXT = {
    'Document': ['title', 'body'],
    'Memory': ['title', 'summary'],
}


@dataclass
class SchemaReport:
    graph: str
    created: list[str] = field(default_factory=list)
    existed: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.failed

    def as_dict(self) -> dict:
        return {
            'graph': self.graph,
            'ok': self.ok,
            'created': len(self.created),
            'existed': len(self.existed),
            'failed': self.failed,
        }


def _already(msg: str) -> bool:
    m = msg.lower()
    return 'already' in m or 'exists' in m


async def _run(report: SchemaReport, name: str, coro) -> None:
    try:
        await coro
        report.created.append(name)
    except Exception as e:  # noqa: BLE001
        if _already(str(e)):
            report.existed.append(name)
        else:
            report.failed.append(f'{name}: {str(e)[:150]}')
            log.warning('schema step failed: %s: %s', name, e)


async def _ensure_graph(graph, id_labels: list[str], extras: bool, fulltext: bool, vector: bool) -> SchemaReport:
    report = SchemaReport(graph=graph.name)
    conn = falkor.get_client().connection

    for label in id_labels:
        await _run(report, f'index {label}.id', graph.query(f'CREATE INDEX FOR (n:{label}) ON (n.id)'))
    # unique constraints need the index above to exist first
    for label in id_labels:
        await _run(
            report,
            f'unique {label}.id',
            conn.execute_command('GRAPH.CONSTRAINT', 'CREATE', graph.name, 'UNIQUE', 'NODE', label, 'PROPERTIES', '1', 'id'),
        )
    if extras:
        for label, prop in EXTRA_INDEXES:
            await _run(report, f'index {label}.{prop}', graph.query(f'CREATE INDEX FOR (n:{label}) ON (n.{prop})'))
    if fulltext:
        for label, props in FULLTEXT.items():
            args = ', '.join(f"'{p}'" for p in props)
            await _run(report, f'fulltext {label}', graph.query(f"CALL db.idx.fulltext.createNodeIndex('{label}', {args})"))
    if vector:
        dim = get_settings().embedding_dim
        await _run(
            report,
            'vector Memory.embedding',
            graph.query(
                'CREATE VECTOR INDEX FOR (m:Memory) ON (m.embedding) '
                f"OPTIONS {{dimension: {dim}, similarityFunction: 'cosine'}}"
            ),
        )
    return report


async def ensure_workspace_schema(workspace_id: str) -> SchemaReport:
    graph = falkor.workspace_graph(workspace_id)
    return await _ensure_graph(
        graph, WORKSPACE_ID_LABELS, extras=True, fulltext=True, vector=get_settings().enable_vector_index
    )


async def ensure_control_schema() -> SchemaReport:
    return await _ensure_graph(
        falkor.control_graph(), CONTROL_ID_LABELS, extras=False, fulltext=False, vector=False
    )


async def ensure_all() -> list[dict]:
    """Control graph + default workspace graph. Raises if FalkorDB is unreachable."""
    if not falkor.is_connected():
        await falkor.connect()
    if not falkor.is_connected():
        raise RuntimeError('FalkorDB is not reachable')
    reports = [await ensure_control_schema(), await ensure_workspace_schema(get_settings().default_workspace_id)]
    for r in reports:
        log.info('schema %s: created=%d existed=%d failed=%d', r.graph, len(r.created), len(r.existed), len(r.failed))
    return [r.as_dict() for r in reports]
