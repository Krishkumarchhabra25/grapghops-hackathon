"""Pydantic schemas for the Services API. Read-only, matches spec §4.1."""
from typing import Literal

from pydantic import BaseModel, Field

ServiceStatus = Literal['Healthy', 'Warning', 'Degraded']


class ServiceListItem(BaseModel):
    id: str
    name: str
    env: str
    status: ServiceStatus
    health: int | None = None
    latency_ms: float | None = None
    error_rate: float | None = None
    version: str | None = None
    repo: str | None = None
    description: str | None = None
    updated_at: int | None = None


class ServiceListResponse(BaseModel):
    services: list[ServiceListItem]
    count: int
    health_summary: dict[str, int] = Field(default_factory=dict)


class ServiceOwner(BaseModel):
    id: str
    name: str
    kind: Literal['person', 'team']


class ServiceRunbook(BaseModel):
    id: str
    title: str


class ServiceDependency(BaseModel):
    id: str
    type: str
    name: str
    version: str = ''
    kind: str = ''
    criticality: str = 'medium'


class ServiceIncident(BaseModel):
    id: str
    title: str
    severity: str
    status: str
    started_at: int | None = None
    resolved_at: int | None = None


class ServiceDeployment(BaseModel):
    id: str
    version: str
    deployed_at: int | None = None
    deployed_by: str | None = None
    status: str | None = None


class ServiceDetail(BaseModel):
    id: str
    name: str
    env: str
    status: ServiceStatus
    health: int | None = None
    latency_ms: float | None = None
    error_rate: float | None = None
    version: str | None = None
    repo: str | None = None
    description: str | None = None
    updated_at: int | None = None

    owners: list[ServiceOwner] = Field(default_factory=list)
    runbooks: list[ServiceRunbook] = Field(default_factory=list)
    dependencies: list[ServiceDependency] = Field(default_factory=list)
    recent_incidents: list[ServiceIncident] = Field(default_factory=list)
    recent_deployments: list[ServiceDeployment] = Field(default_factory=list)