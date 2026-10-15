"""API-level models shared by every endpoint."""
from typing import Any, Literal, Optional

from pydantic import BaseModel


class ErrorBody(BaseModel):
    code: str
    message: str
    request_id: str


class ErrorEnvelope(BaseModel):
    error: ErrorBody


class CheckResult(BaseModel):
    ok: bool
    latency_ms: Optional[float] = None
    error: Optional[str] = None
    detail: Optional[dict[str, Any]] = None


class LiveResponse(BaseModel):
    status: Literal['ok'] = 'ok'
    service: str
    version: str
    env: str
    time_ms: int


class ReadyResponse(BaseModel):
    status: Literal['ok', 'degraded', 'down']
    service: str
    version: str
    checks: dict[str, CheckResult]
