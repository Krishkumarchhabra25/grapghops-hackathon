"""Pydantic schemas for the approvals API."""
from typing import Literal

from pydantic import BaseModel, Field


class ApprovalDecisionRequest(BaseModel):
    """Optional reason on approve; required on reject."""
    reason: str | None = Field(default=None, max_length=500)


class RejectRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class ActionPublic(BaseModel):
    id: str
    kind: str
    params: dict = Field(default_factory=dict)
    status: str
    risk: str | None = None
    rollback_plan: str | None = None
    verification: str | None = None
    idempotency_key: str | None = None


class FixPublic(BaseModel):
    id: str
    title: str
    kind: str
    steps: list[str] = Field(default_factory=list)
    risk: str | None = None


class ApprovalListItem(BaseModel):
    id: str
    status: str
    run_id: str
    requested_at: int | None = None
    decided_at: int | None = None
    decided_by: str | None = None
    action_kind: str | None = None
    fix_id: str | None = None
    fix_title: str | None = None


class ApprovalListResponse(BaseModel):
    approvals: list[ApprovalListItem]


class ApprovalDetail(BaseModel):
    id: str
    status: Literal['pending', 'approved', 'rejected', 'expired']
    run_id: str
    requested_at: int | None = None
    decided_at: int | None = None
    decided_by: str | None = None
    reason: str | None = None

    action: ActionPublic | None = None
    fix: FixPublic | None = None

    evidence_finding_ids: list[str] = Field(default_factory=list)
    memory_ids: list[str] = Field(default_factory=list)
    incident_id: str | None = None


class DecisionResponse(BaseModel):
    id: str
    status: str
    decided_by: str | None = None
    decided_at: int | None = None
    run_status: str