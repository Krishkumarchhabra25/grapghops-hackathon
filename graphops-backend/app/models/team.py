"""Pydantic schemas for the Team API."""
from pydantic import BaseModel, Field


class TeamMember(BaseModel):
    id: str
    name: str
    email: str | None = None
    role: str | None = None
    team_id: str | None = None
    team_name: str | None = None
    service_count: int = 0
    owned_services: list[str] = Field(default_factory=list)


class TeamListResponse(BaseModel):
    members: list[TeamMember]
    count: int
    stats: dict = Field(default_factory=dict)


class PersonServiceRef(BaseModel):
    id: str
    name: str
    status: str | None = None


class PersonIncidentRef(BaseModel):
    id: str
    title: str
    severity: str
    status: str
    resolved_at: int | None = None


class PersonDetail(BaseModel):
    id: str
    name: str
    email: str | None = None
    role: str | None = None
    team_id: str | None = None
    team_name: str | None = None
    services: list[PersonServiceRef] = Field(default_factory=list)
    incidents: list[PersonIncidentRef] = Field(default_factory=list)