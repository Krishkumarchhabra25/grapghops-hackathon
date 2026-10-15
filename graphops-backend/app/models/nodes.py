"""Pydantic models for every node label in the graph (see the spec, section 4.1).

Rules
- ids are globally unique strings with a prefix (svc-, inc-, run-, ...)
- all timestamps are epoch milliseconds (int)
- nested JSON (steps, state, params...) is stored in FalkorDB as a JSON string
"""
import json
import time
from typing import Any, ClassVar, Optional

from pydantic import BaseModel, Field

from app.models.enums import (
    ActionKind, ActionStatus, AgentRole, ApprovalStatus, DecisionStatus, DependencyKind,
    DocumentStatus, DocumentType, FindingKind, FixKind, IncidentStatus, MemoryStatus,
    MemoryType, OutcomeResult, RunStatus, ServiceStatus, Severity, UserRole, Verification,
    VerifiedBy,
)


def now_ms() -> int:
    return int(time.time() * 1000)


class GraphNode(BaseModel):
    label: ClassVar[str]
    json_fields: ClassVar[tuple[str, ...]] = ()

    id: str
    created_at: int = Field(default_factory=now_ms)
    updated_at: int = Field(default_factory=now_ms)
    # provenance for source-derived nodes (seed, github, upload ...)
    source: Optional[str] = None
    source_id: Optional[str] = None
    observed_at: Optional[int] = None

    def to_props(self) -> dict[str, Any]:
        """Flat dict safe to pass as FalkorDB node properties (None dropped, JSON fields stringified)."""
        data = self.model_dump(mode='json', exclude_none=True)
        for f in self.json_fields:
            if f in data and not isinstance(data[f], str):
                data[f] = json.dumps(data[f])
        return data

    @classmethod
    def from_props(cls, props: dict[str, Any]):
        data = dict(props)
        for f in cls.json_fields:
            if isinstance(data.get(f), str):
                try:
                    data[f] = json.loads(data[f])
                except json.JSONDecodeError:
                    pass
        return cls.model_validate(data)


# ---------------- Workspace graph (ws_<id>) ----------------
class Person(GraphNode):
    label: ClassVar[str] = 'Person'
    name: str
    email: Optional[str] = None
    role: Optional[str] = None
    team_id: Optional[str] = None


class Team(GraphNode):
    label: ClassVar[str] = 'Team'
    name: str


class Service(GraphNode):
    label: ClassVar[str] = 'Service'
    name: str
    env: str = 'Production'
    status: ServiceStatus = ServiceStatus.healthy
    health: Optional[int] = None
    latency_ms: Optional[float] = None
    error_rate: Optional[float] = None
    version: Optional[str] = None
    repo: Optional[str] = None
    description: Optional[str] = None


class Dependency(GraphNode):
    label: ClassVar[str] = 'Dependency'
    name: str
    version: Optional[str] = None
    kind: DependencyKind = DependencyKind.library


class Deployment(GraphNode):
    label: ClassVar[str] = 'Deployment'
    version: str
    deployed_at: int
    deployed_by: Optional[str] = None
    status: Optional[str] = None


class Incident(GraphNode):
    label: ClassVar[str] = 'Incident'
    title: str
    severity: Severity = Severity.medium
    status: IncidentStatus = IncidentStatus.open
    summary: Optional[str] = None
    impact: Optional[str] = None
    started_at: int = Field(default_factory=now_ms)
    resolved_at: Optional[int] = None
    root_cause: Optional[str] = None


class ErrorSignature(GraphNode):
    label: ClassVar[str] = 'ErrorSignature'
    pattern: str
    normalized_message: str
    first_seen: int = Field(default_factory=now_ms)


class Fix(GraphNode):
    label: ClassVar[str] = 'Fix'
    json_fields: ClassVar[tuple[str, ...]] = ('steps',)
    title: str
    kind: FixKind = FixKind.patch
    steps: list[str] = Field(default_factory=list)
    risk: Optional[str] = None


class Outcome(GraphNode):
    label: ClassVar[str] = 'Outcome'
    result: OutcomeResult
    evidence: Optional[str] = None
    verified_at: int = Field(default_factory=now_ms)
    verified_by: VerifiedBy = VerifiedBy.tests


class Document(GraphNode):
    label: ClassVar[str] = 'Document'
    title: str
    type: DocumentType = DocumentType.runbook
    body: str = ''
    source_url: Optional[str] = None
    content_hash: Optional[str] = None
    visibility: str = 'workspace'  # 'workspace' or 'team:<id>'
    status: DocumentStatus = DocumentStatus.synced


class Decision(GraphNode):
    label: ClassVar[str] = 'Decision'
    title: str
    rationale: Optional[str] = None
    decided_at: Optional[int] = None
    status: DecisionStatus = DecisionStatus.active


class Agent(GraphNode):
    label: ClassVar[str] = 'Agent'
    name: str
    role: AgentRole
    model: Optional[str] = None


class AgentRun(GraphNode):
    label: ClassVar[str] = 'AgentRun'
    json_fields: ClassVar[tuple[str, ...]] = ('state',)
    goal: str
    status: RunStatus = RunStatus.queued
    state: dict[str, Any] = Field(default_factory=dict)  # checkpoint
    state_version: int = 0  # compare-and-set counter for handoffs
    owner_agent: Optional[str] = None
    started_at: Optional[int] = None
    ended_at: Optional[int] = None
    tokens: int = 0
    cost_usd: float = 0.0
    trace_id: Optional[str] = None


class RunEvent(GraphNode):
    label: ClassVar[str] = 'RunEvent'
    json_fields: ClassVar[tuple[str, ...]] = ('payload',)
    seq: int
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    ts: int = Field(default_factory=now_ms)


class Finding(GraphNode):
    label: ClassVar[str] = 'Finding'
    json_fields: ClassVar[tuple[str, ...]] = ('evidence_refs',)
    kind: FindingKind
    claim: str
    confidence: Optional[float] = None
    verification: Verification = Verification.retrieved
    evidence_refs: list[str] = Field(default_factory=list)


class Memory(GraphNode):
    label: ClassVar[str] = 'Memory'
    type: MemoryType
    title: str
    summary: str
    confidence: float = 0.5
    status: MemoryStatus = MemoryStatus.unverified
    uses: int = 0
    expires_at: Optional[int] = None
    embedding: Optional[list[float]] = None  # only when the vector index is enabled


class Approval(GraphNode):
    label: ClassVar[str] = 'Approval'
    status: ApprovalStatus = ApprovalStatus.pending
    requested_at: int = Field(default_factory=now_ms)
    decided_at: Optional[int] = None
    decided_by: Optional[str] = None
    reason: Optional[str] = None


class Action(GraphNode):
    label: ClassVar[str] = 'Action'
    json_fields: ClassVar[tuple[str, ...]] = ('params',)
    kind: ActionKind
    params: dict[str, Any] = Field(default_factory=dict)
    status: ActionStatus = ActionStatus.proposed
    idempotency_key: Optional[str] = None
    executed_at: Optional[int] = None


class AuditEvent(GraphNode):
    label: ClassVar[str] = 'AuditEvent'
    json_fields: ClassVar[tuple[str, ...]] = ('detail',)
    actor: str
    verb: str
    target_id: Optional[str] = None
    ts: int = Field(default_factory=now_ms)
    detail: dict[str, Any] = Field(default_factory=dict)


# ---------------- Control graph ----------------
class Workspace(GraphNode):
    label: ClassVar[str] = 'Workspace'
    name: str
    graph_name: str


class User(GraphNode):
    label: ClassVar[str] = 'User'
    name: str
    email: str
    password_hash: str
    role: UserRole = UserRole.engineer


WORKSPACE_NODE_MODELS: list[type[GraphNode]] = [
    Person, Team, Service, Dependency, Deployment, Incident, ErrorSignature, Fix, Outcome,
    Document, Decision, Agent, AgentRun, RunEvent, Finding, Memory, Approval, Action, AuditEvent,
]
CONTROL_NODE_MODELS: list[type[GraphNode]] = [Workspace, User]
NODE_MODELS: dict[str, type[GraphNode]] = {
    m.label: m for m in WORKSPACE_NODE_MODELS + CONTROL_NODE_MODELS
}
