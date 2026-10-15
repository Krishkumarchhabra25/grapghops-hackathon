"""Pydantic schemas for the Knowledge / Ask API. Matches spec §9.9."""
from typing import Literal

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)


class Citation(BaseModel):
    ref: str                            # "c1", "c2", ...
    kind: Literal['document', 'graph']
    id: str
    title: str | None = None
    updated_at: int | None = None
    source_url: str | None = None
    query_id: str | None = None         # present for kind='graph'


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    filtered_count: int = 0
    retrieved_count: int = 0


class DocumentListItem(BaseModel):
    id: str
    title: str
    type: str
    source_url: str | None = None
    visibility: str
    status: str
    content_hash: str | None = None
    updated_at: int | None = None
    created_at: int | None = None


class DocumentListResponse(BaseModel):
    documents: list[DocumentListItem]
    count: int


class DocumentEntity(BaseModel):
    id: str
    name: str


class DocumentAuthor(BaseModel):
    id: str
    name: str


class DocumentDecision(BaseModel):
    id: str
    title: str


class DocumentDetail(BaseModel):
    id: str
    title: str
    type: str
    body: str
    source_url: str | None = None
    visibility: str
    status: str
    content_hash: str | None = None
    updated_at: int | None = None
    created_at: int | None = None
    services: list[DocumentEntity] = Field(default_factory=list)
    authors: list[DocumentAuthor] = Field(default_factory=list)
    decisions: list[DocumentDecision] = Field(default_factory=list)


class SearchHit(BaseModel):
    id: str
    title: str
    type: str
    source_url: str | None = None
    updated_at: int | None = None
    status: str
    score: float
    services: list[str] = Field(default_factory=list)
    owners: list[str] = Field(default_factory=list)


class SearchResponse(BaseModel):
    query: str
    hits: list[SearchHit]
    count: int
    filtered_count: int = 0