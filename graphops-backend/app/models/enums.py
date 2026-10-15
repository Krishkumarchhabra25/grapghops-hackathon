from enum import Enum


class Severity(str, Enum):
    critical = 'Critical'
    high = 'High'
    medium = 'Medium'
    low = 'Low'


class IncidentStatus(str, Enum):
    open = 'Open'
    investigating = 'Investigating'
    monitoring = 'Monitoring'
    resolved = 'Resolved'


class ServiceStatus(str, Enum):
    healthy = 'Healthy'
    warning = 'Warning'
    degraded = 'Degraded'


class DependencyKind(str, Enum):
    library = 'library'
    database = 'database'
    queue = 'queue'
    external_api = 'external-api'


class FixKind(str, Enum):
    rollback = 'rollback'
    config = 'config'
    patch = 'patch'


class OutcomeResult(str, Enum):
    success = 'success'
    failure = 'failure'
    partial = 'partial'


class VerifiedBy(str, Enum):
    tests = 'tests'
    operator = 'operator'


class DocumentType(str, Enum):
    runbook = 'Runbook'
    rfc = 'RFC'
    architecture = 'Architecture'
    slo = 'SLO'


class DocumentStatus(str, Enum):
    synced = 'Synced'
    needs_review = 'Needs review'


class DecisionStatus(str, Enum):
    active = 'active'
    superseded = 'superseded'


class AgentRole(str, Enum):
    investigator = 'investigator'
    memory_analyst = 'memory_analyst'
    graph_researcher = 'graph_researcher'
    resolver = 'resolver'


class RunStatus(str, Enum):
    queued = 'queued'
    running = 'running'
    waiting_approval = 'waiting_approval'
    succeeded = 'succeeded'
    failed = 'failed'
    cancelled = 'cancelled'


class FindingKind(str, Enum):
    fact = 'fact'
    hypothesis = 'hypothesis'


class Verification(str, Enum):
    retrieved = 'retrieved'
    unverified_hypothesis = 'unverified_hypothesis'
    verified = 'verified'


class MemoryType(str, Enum):
    episodic = 'episodic'
    semantic = 'semantic'
    procedural = 'procedural'
    policy = 'policy'


class MemoryStatus(str, Enum):
    unverified = 'unverified'
    verified = 'verified'
    pinned = 'pinned'
    deprecated = 'deprecated'


class ApprovalStatus(str, Enum):
    pending = 'pending'
    approved = 'approved'
    rejected = 'rejected'
    expired = 'expired'


class ActionKind(str, Enum):
    rollback_dependency = 'rollback_dependency'
    scale_consumers = 'scale_consumers'
    reset_connection_pool = 'reset_connection_pool'


class ActionStatus(str, Enum):
    proposed = 'proposed'
    executed = 'executed'
    failed = 'failed'
    rolled_back = 'rolled_back'


class UserRole(str, Enum):
    owner = 'Owner'
    admin = 'Admin'
    engineer = 'Engineer'
    viewer = 'Viewer'
