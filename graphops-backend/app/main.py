import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import (
    approvals, audit, auth, graph, health, incidents,
    investigations, knowledge, memory, runs, services, team,
)
from app.config import get_settings
from app.db import falkor
from app.db import redis as redis_db
from app.graph.schema import ensure_all

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s: %(message)s')
log = logging.getLogger('graphops')


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    await falkor.connect()
    await redis_db.connect()
    app.state.schema = None

    try:
        app.state.schema = await ensure_all()
    except Exception as e:  # noqa: BLE001
        log.warning('schema setup skipped: %s', e)

    if not s.llm_configured:
        log.warning('XAI_API_KEY is empty: LLM calls will fail until you set it in .env')
    yield
    await redis_db.close()
    await falkor.close()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title=s.app_name, version=s.app_version, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list,
        allow_credentials=True,
        allow_methods=['*'],
        allow_headers=['*'],
        expose_headers=['X-Request-ID'],
    )

    @app.middleware('http')
    async def request_id(request: Request, call_next):
        rid = request.headers.get('x-request-id') or f'req_{uuid.uuid4().hex[:8]}'
        request.state.request_id = rid
        response = await call_next(request)
        response.headers['X-Request-ID'] = rid
        return response

    def envelope(request: Request, status: int, code: str, message: str) -> JSONResponse:
        rid = getattr(request.state, 'request_id', 'req_unknown')
        return JSONResponse(
            status_code=status,
            content={'error': {'code': code, 'message': message, 'request_id': rid}},
            headers={'X-Request-ID': rid},
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exc(request: Request, exc: StarletteHTTPException):
        codes = {401: 'unauthenticated', 403: 'permission_denied', 404: 'not_found', 409: 'conflict', 429: 'rate_limited'}
        return envelope(request, exc.status_code, codes.get(exc.status_code, 'http_error'), str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_exc(request: Request, exc: RequestValidationError):
        return envelope(request, 422, 'validation_error', 'Request validation failed')

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception('unhandled error')
        return envelope(request, 500, 'internal_error', 'Internal server error')

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(investigations.router)
    app.include_router(runs.router)
    app.include_router(approvals.router)
    app.include_router(graph.router)
    app.include_router(memory.router)
    app.include_router(knowledge.router)
    app.include_router(incidents.router)
    app.include_router(services.router)
    app.include_router(audit.router)
    app.include_router(team.router)
    return app


app = create_app()


if __name__ == '__main__':
    import uvicorn

    s = get_settings()
    uvicorn.run('app.main:app', host=s.host, port=s.port, reload=s.env == 'development')