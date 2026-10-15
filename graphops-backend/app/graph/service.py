"""Allow-listed query template runner. No LLM-written Cypher ever reaches FalkorDB.

Additions for Graph Explorer:
- `{HOPS}` placeholder in .cypher files is replaced with a validated integer
  clamped to 1..4. Only templates that declare the placeholder pay the cost.
- Everything else stays identical to the original runner.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from app.db import falkor

log = logging.getLogger('graphops.queries')
QUERY_DIR = Path(__file__).parent / 'queries'

# Cache of loaded templates — read once, used many times.
_TEMPLATES: dict[str, str] = {}


# ---------- Loader ----------
def _load(query_id: str) -> str:
    if query_id not in _TEMPLATES:
        path = QUERY_DIR / f'{query_id}.cypher'
        if not path.exists():
            raise ValueError(f'Unknown query template: {query_id}')
        _TEMPLATES[query_id] = path.read_text(encoding='utf-8')
    return _TEMPLATES[query_id]


# ---------- Hop interpolation ----------
def _interpolate_hops(cypher: str, hops: int | None) -> str:
    """Replace {HOPS} with a validated integer. Clamped to 1..4 per spec."""
    if '{HOPS}' not in cypher:
        return cypher
    try:
        h = int(hops) if hops is not None else 2
    except (TypeError, ValueError):
        h = 2
    h = max(1, min(4, h))
    return cypher.replace('{HOPS}', str(h))


def _coerce_params(params: dict[str, Any]) -> dict[str, Any]:
    """Clamp hop depths, coerce integers. Keep None values so FalkorDB knows
    the parameter exists — optional filters in Cypher use `$x IS NULL OR ...`,
    which requires $x to be present in the params dict even if it's null.
    """
    out: dict[str, Any] = {}
    for k, v in params.items():
        if v is None:
            # Keep the key with a None value; falkordb serializes it to null.
            out[k] = None
            continue
        if k in {'hops', 'depth', 'k'}:
            try:
                n = int(v)
            except (TypeError, ValueError):
                raise ValueError(f'{k} must be an integer')
            if k in {'hops', 'depth'}:
                n = max(1, min(4, n))
            out[k] = n
        else:
            out[k] = v
    return out

# ---------- Runner ----------
async def run_template(
    query_id: str,
    params: dict[str, Any],
    workspace_id: str,
) -> list[dict]:
    """Execute a template by ID with parameters. Returns rows as list[dict]."""
    if not query_id or not query_id.startswith('Q'):
        raise ValueError('Invalid query id')

    safe = _coerce_params(params)
    cypher = _interpolate_hops(
        _load(query_id),
        safe.get('hops') if 'hops' in safe else safe.get('depth'),
    )

    if not falkor.is_connected():
        await falkor.connect()
        if not falkor.is_connected():
            raise RuntimeError('FalkorDB not reachable')

    g = falkor.workspace_graph(workspace_id)
    log.info('Q %s ws=%s params=%s', query_id, workspace_id, safe)

    res = await g.query(cypher, safe)
    if not res.result_set:
        return []

    headers = [h[1] for h in res.header]
    return [dict(zip(headers, row)) for row in res.result_set]