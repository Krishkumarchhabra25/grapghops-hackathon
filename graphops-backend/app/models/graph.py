"""Pydantic schemas for the Graph Explorer endpoints. Matches spec §9.7."""
from pydantic import BaseModel, Field


class GraphNodePublic(BaseModel):
    id: str
    type: str          # the graph label, e.g. "Service"
    name: str          # display name
    status: str = ''   # optional; used for coloring


class GraphEdgePublic(BaseModel):
    source: str
    target: str
    type: str


class SubgraphResponse(BaseModel):
    center: str
    nodes: list[GraphNodePublic] = Field(default_factory=list)
    edges: list[GraphEdgePublic] = Field(default_factory=list)
    truncated: bool = False


class PathNode(BaseModel):
    label: str
    id: str


class PathResponse(BaseModel):
    path: list[PathNode]
    rels: list[str]


class BlastRadiusItem(BaseModel):
    service: str
    name: str | None = None
    hops: int


class BlastRadiusResponse(BaseModel):
    root: str
    affected: list[BlastRadiusItem]


class CriticalityItem(BaseModel):
    service: str
    score: float


class CriticalityResponse(BaseModel):
    services: list[CriticalityItem]


class CommunityItem(BaseModel):
    community: str
    services: list[str]


class CommunitiesResponse(BaseModel):
    communities: list[CommunityItem]


class TemplateQueryRequest(BaseModel):
    query_id: str = Field(..., pattern=r'^Q\d{2}[a-z]?$')
    params: dict = Field(default_factory=dict)


class TemplateQueryResponse(BaseModel):
    query_id: str
    rows: list[dict]
    count: int