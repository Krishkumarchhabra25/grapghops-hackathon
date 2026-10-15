"""Grok (xAI) client. xAI exposes an OpenAI-compatible API, so the OpenAI SDK is used with a custom base_url.

Only setup lives here: client factory, model tiers, a cheap account check and one `chat()` wrapper.
Agent prompts and the demo cache come later.
"""
import time
from typing import Any, Literal

from openai import AsyncOpenAI

from app.config import get_settings

Tier = Literal['reasoning', 'fast']

_client: AsyncOpenAI | None = None


def model_for(tier: Tier) -> str:
    s = get_settings()
    return s.llm_model_reasoning if tier == 'reasoning' else s.llm_model_fast


def get_client() -> AsyncOpenAI:
    global _client
    s = get_settings()
    if not s.llm_configured:
        raise RuntimeError('XAI_API_KEY is not set')
    if _client is None:
        _client = AsyncOpenAI(api_key=s.xai_api_key, base_url=s.llm_base_url, timeout=s.llm_timeout_seconds)
    return _client


async def chat(messages: list[dict[str, Any]], tier: Tier = 'reasoning', response_format: dict | None = None, **kw) -> Any:
    """One chat completion. Pass response_format for structured JSON output."""
    s = get_settings()
    params: dict[str, Any] = {'model': model_for(tier), 'messages': messages, 'max_tokens': s.llm_max_output_tokens}
    if response_format:
        params['response_format'] = response_format
    params.update(kw)
    return await get_client().chat.completions.create(**params)


async def check_models() -> dict:
    """Lists models for this API key (no tokens used) and checks the two configured ids exist."""
    s = get_settings()
    if not s.llm_configured:
        return {'ok': False, 'error': 'XAI_API_KEY is not set'}
    t = time.perf_counter()
    try:
        page = await get_client().models.list()
        ids = sorted(m.id for m in page.data)
        wanted = {'reasoning': s.llm_model_reasoning, 'fast': s.llm_model_fast}
        missing = {k: v for k, v in wanted.items() if v not in ids}
        return {
            'ok': not missing,
            'latency_ms': round((time.perf_counter() - t) * 1000, 1),
            'error': f'model id not found for your key: {missing}' if missing else None,
            'detail': {'configured': wanted, 'available': ids},
        }
    except Exception as e:  # noqa: BLE001
        return {'ok': False, 'error': f'{type(e).__name__}: {e}'[:200]}
