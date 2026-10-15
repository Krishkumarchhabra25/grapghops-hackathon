"""Pydantic schemas for the Incidents API. Matches spec §4.1 / §8."""
from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal['Critical', 'High', 'Medium', 'Low']
IncidentStatus = Literal['Open', 'Investigating', 'Monitoring', 'Resolved']


class IncidentListItem(BaseModel):
    id: str
    title: str
    severity: Severity
    status: IncidentStatus
    summary: str | None = None
    impact: str | None = None
    started_at: int | None = None
    resolved_at: int | None = None
    root_cause: str | None = None
    updated_at: int | None = None
    services: list[str] = Field(default_factory=list)


class IncidentListResponse(BaseModel):
    incidents: list[IncidentListItem]
    count: int


class RelatedIncident(BaseModel):
    incident: str
    title: str
    status: str
    signature: str | None = None
    fixes: list[str] = Field(default_factory=list)


class IncidentFinding(BaseModel):
    id: str
    kind: str
    claim: str
    confidence: float | None = None
    verification: str


class IncidentDetail(BaseModel):
    id: str
    title: str
    severity: Severity
    status: IncidentStatus
    summary: str | None = None
    impact: str | None = None
    started_at: int | None = None
    resolved_at: int | None = None
    root_cause: str | None = None
    updated_at: int | None = None
    services: list[str] = Field(default_factory=list)
    related: list[RelatedIncident] = Field(default_factory=list)
    findings: list[IncidentFinding] = Field(default_factory=list)
    run_ids: list[str] = Field(default_factory=list)


class CreateIncidentRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    severity: Severity = 'Medium'
    status: IncidentStatus = 'Open'
    summary: str | None = Field(None, max_length=2000)
    impact: str | None = Field(None, max_length=1000)
    service_ids: list[str] = Field(default_factory=list)
    started_at: int | None = None


class CreateIncidentResponse(BaseModel):
    id: str
    title: str
    status: IncidentStatus


class UpdateIncidentRequest(BaseModel):
    title: str | None = Field(None, min_length=3, max_length=200)
    severity: Severity | None = None
    status: IncidentStatus | None = None
    summary: str | None = Field(None, max_length=2000)
    impact: str | None = Field(None, max_length=1000)
    root_cause: str | None = Field(None, max_length=1000)
    resolved_by: str | None = Field(None, description='Person id (usr-…) who resolved it')