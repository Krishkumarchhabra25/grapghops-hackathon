"""Pydantic schemas for the Audit API."""
from pydantic import BaseModel, Field


class AuditEventPublic(BaseModel):
    id: str
    actor: str
    verb: str
    target_id: str | None = None
    ts: int
    detail: dict = Field(default_factory=dict)


class AuditListResponse(BaseModel):
    events: list[AuditEventPublic]
    count: int
    limit: int
    offset: int


class AuditVerbsResponse(BaseModel):
    verbs: list[str]