"""Pydantic schemas for the Memory API. Matches spec §9.8."""
from typing import Literal

from pydantic import BaseModel, Field

MemoryType = Literal['episodic', 'semantic', 'procedural', 'policy']
MemoryStatus = Literal['unverified', 'verified', 'pinned', 'deprecated']


class MemoryEntity(BaseModel):
    id: str
    type: str
    name: str


class MemoryFix(BaseModel):
    id: str
    title: str
    kind: str


class MemoryListItem(BaseModel):
    id: str
    type: MemoryType
    title: str
    summary: str
    confidence: float
    status: MemoryStatus
    uses: int = 0
    source: str | None = None
    updated_at: int | None = None
    created_at: int | None = None
    score: float | None = None  # present only in fulltext results


class MemoryListResponse(BaseModel):
    memories: list[MemoryListItem]


class MemoryDetail(BaseModel):
    id: str
    type: MemoryType
    title: str
    summary: str
    confidence: float
    status: MemoryStatus
    uses: int = 0
    source: str | None = None
    expires_at: int | None = None
    created_at: int | None = None
    updated_at: int | None = None
    entities: list[MemoryEntity] = Field(default_factory=list)
    fixes: list[MemoryFix] = Field(default_factory=list)


class CreateMemoryRequest(BaseModel):
    type: MemoryType
    title: str = Field(..., min_length=3, max_length=200)
    summary: str = Field(..., min_length=3, max_length=500)
    confidence: float = Field(0.5, ge=0.0, le=1.0)
    entity_ids: list[str] = Field(default_factory=list)
    fix_id: str | None = None
    status: MemoryStatus = 'unverified'


class UpdateMemoryRequest(BaseModel):
    title: str | None = Field(None, min_length=3, max_length=200)
    summary: str | None = Field(None, min_length=3, max_length=500)
    confidence: float | None = Field(None, ge=0.0, le=1.0)
    status: MemoryStatus | None = None


class LifecycleResponse(BaseModel):
    id: str
    status: MemoryStatus
    updated_at: int


class DeleteResponse(BaseModel):
    id: str
    deleted: bool = True