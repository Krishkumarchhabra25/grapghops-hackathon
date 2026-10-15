"""FalkorDB connection. One graph per workspace (ws_<id>) plus a small control graph."""
import logging
import time

from falkordb.asyncio import FalkorDB

from app.config import get_settings

log = logging.getLogger('graphops.falkor')
_client: FalkorDB | None = None


def workspace_graph_name(workspace_id: str) -> str:
    return f'ws_{workspace_id}'


def _build() -> FalkorDB:
    s = get_settings()
    return FalkorDB(
        host=s.falkordb_host,
        port=s.falkordb_port,
        username=s.falkordb_username or None,
        password=s.falkordb_password or None,
    )


async def connect() -> FalkorDB | None:
    """Try to connect. Never raises: the API must start even if FalkorDB is down.
    The client constructor connects eagerly, so a failed attempt leaves _client unset and is retried later."""
    global _client
    if _client is None:
        try:
            _client = _build()
        except Exception as e:  # noqa: BLE001
            log.warning('FalkorDB not reachable yet: %s', e)
    return _client


def is_connected() -> bool:
    return _client is not None


def get_client() -> FalkorDB:
    if _client is None:
        raise RuntimeError('FalkorDB client not initialised')
    return _client


def control_graph():
    return get_client().select_graph(get_settings().control_graph)


def workspace_graph(workspace_id: str):
    return get_client().select_graph(workspace_graph_name(workspace_id))


async def ping() -> dict:
    t = time.perf_counter()
    try:
        if _client is None:
            await connect()
        await get_client().connection.ping()
        return {'ok': True, 'latency_ms': round((time.perf_counter() - t) * 1000, 1)}
    except Exception as e:  # noqa: BLE001
        return {'ok': False, 'error': f'{type(e).__name__}: {e}'[:200]}


async def close() -> None:
    global _client
    if _client is not None:
        try:
            await _client.connection.aclose()
        finally:
            _client = None
