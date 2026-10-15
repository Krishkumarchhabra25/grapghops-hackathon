"""Redis connection. Used later for demo LLM cache and SSE fan-out. Not a source of truth."""
import time

import redis.asyncio as aioredis

from app.config import get_settings

_client: aioredis.Redis | None = None


async def connect() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    return _client


def get_client() -> aioredis.Redis:
    if _client is None:
        raise RuntimeError('Redis client not initialised')
    return _client


async def ping() -> dict:
    t = time.perf_counter()
    try:
        await get_client().ping()
        return {'ok': True, 'latency_ms': round((time.perf_counter() - t) * 1000, 1)}
    except Exception as e:  # noqa: BLE001
        return {'ok': False, 'error': f'{type(e).__name__}: {e}'[:200]}


async def close() -> None:
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        finally:
            _client = None
