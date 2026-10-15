from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.db import falkor
from app.db import redis as redis_db
from app.graph.schema import ensure_all
from app.llm import client as llm
from app.models.common import CheckResult, LiveResponse, ReadyResponse
from app.models.nodes import now_ms

router = APIRouter(prefix='/api/v1/health', tags=['health'])


@router.get('/live', response_model=LiveResponse)
async def live() -> LiveResponse:
    """Process is up. Never touches a database."""
    s = get_settings()
    return LiveResponse(service=s.app_name, version=s.app_version, env=s.env, time_ms=now_ms())


@router.get('/ready', response_model=ReadyResponse)
async def ready(request: Request, deep: bool = False):
    """
    FalkorDB is required: if it is down the status is 'down' (HTTP 503).
    Redis, schema and the LLM key are optional: if any fails the status is 'degraded' (HTTP 200).
    ?deep=true also lists models on your xAI account (no tokens used) and checks the configured ids.
    """
    s = get_settings()
    checks: dict[str, CheckResult] = {}

    checks['falkordb'] = CheckResult(**await falkor.ping())
    checks['redis'] = CheckResult(**await redis_db.ping())

    schema = getattr(request.app.state, 'schema', None)
    if schema is None and checks['falkordb'].ok:
        try:  # FalkorDB came up after startup: run schema setup now
            schema = request.app.state.schema = await ensure_all()
        except Exception:  # noqa: BLE001
            schema = None
    if schema is None:
        checks['schema'] = CheckResult(ok=False, error='schema setup has not run (is FalkorDB reachable?)')
    else:
        failed = [r for r in schema if not r['ok']]
        checks['schema'] = CheckResult(ok=not failed, detail={'graphs': schema}, error='some schema steps failed' if failed else None)

    if deep:
        checks['llm'] = CheckResult(**await llm.check_models())
    else:
        checks['llm'] = CheckResult(
            ok=s.llm_configured,
            error=None if s.llm_configured else 'XAI_API_KEY is not set',
            detail={'models': {'reasoning': s.llm_model_reasoning, 'fast': s.llm_model_fast}, 'base_url': s.llm_base_url},
        )

    if not checks['falkordb'].ok:
        status = 'down'
    elif all(c.ok for c in checks.values()):
        status = 'ok'
    else:
        status = 'degraded'

    body = ReadyResponse(status=status, service=s.app_name, version=s.app_version, checks=checks)
    return JSONResponse(status_code=503 if status == 'down' else 200, content=body.model_dump(mode='json'))
