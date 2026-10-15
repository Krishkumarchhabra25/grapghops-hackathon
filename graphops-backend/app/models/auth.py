"""Pydantic models for the auth API. Mirrors section 9.1 of the spec."""
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class UserPublic(BaseModel):
    id: str
    name: str
    email: str
    role: str


class WorkspacePublic(BaseModel):
    id: str
    name: str


class SessionResponse(BaseModel):
    user: UserPublic
    workspace: WorkspacePublic


class LogoutResponse(BaseModel):
    status: str = 'ok'