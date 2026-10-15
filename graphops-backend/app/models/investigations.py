"""Pydantic schemas for the investigations API. Mirrors spec section 9.2."""
from typing import Literal

from pydantic import BaseModel, Field


class InvestigationOptions(BaseModel):
    include_memory: bool = True
    include_company_context: bool = True
    require_approval: bool = True


class StartInvestigationRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=300)
    incident_id: str = Field(..., min_length=3, max_length=100)
    tracks: list[Literal['connected_data', 'agent_memory', 'company_brain']] = Field(
        default_factory=lambda: ['connected_data', 'agent_memory', 'company_brain'],
    )
    options: InvestigationOptions = Field(default_factory=InvestigationOptions)


class StartInvestigationResponse(BaseModel):
    investigation_id: str
    run_id: str
    status: str
    events_url: str


class InvestigationListItem(BaseModel):
    run_id: str
    goal: str
    status: str
    owner_agent: str | None = None
    started_at: int | None = None
    ended_at: int | None = None
    incident_id: str | None = None
    incident_title: str | None = None


class InvestigationListResponse(BaseModel):
    investigations: list[InvestigationListItem]


class FindingPublic(BaseModel):
    id: str
    kind: str
    claim: str
    confidence: float | None = None
    verification: str
    evidence_refs: list[str] = Field(default_factory=list)


class InvestigationDetail(BaseModel):
    id: str
    goal: str
    status: str
    owner_agent: str | None = None
    state: dict
    state_version: int
    started_at: int | None = None
    ended_at: int | None = None
    tokens: int = 0
    cost_usd: float = 0.0
    incident_id: str | None = None
    incident_title: str | None = None
    findings: list[FindingPublic] = Field(default_factory=list)


class CancelResponse(BaseModel):
    run_id: str
    status: str