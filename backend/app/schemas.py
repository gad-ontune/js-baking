from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .security import password_policy_error

Role = Literal['owner', 'manager', 'staff']


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class LoginRequest(StrictModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=1024)

    @field_validator('username')
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()


class UserCreate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    username: str = Field(min_length=1, max_length=80)
    email: str | None = Field(default=None, max_length=255)
    password: str = Field(min_length=12, max_length=1024)

    @field_validator('name')
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()

    @field_validator('username')
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator('email')
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        if value and '@' not in value:
            raise ValueError('Enter a valid email address.')
        return value.strip() or None

    @field_validator('password')
    @classmethod
    def validate_password(cls, value: str) -> str:
        error = password_policy_error(value)
        if error:
            raise ValueError(error)
        return value


class PasswordChangeRequest(StrictModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=12, max_length=1024)

    @field_validator('new_password')
    @classmethod
    def validate_new_password(cls, value: str) -> str:
        error = password_policy_error(value)
        if error:
            raise ValueError(error)
        return value


class RoleUpdate(StrictModel):
    role: Role


class StatusUpdate(StrictModel):
    active: bool


class UserResponse(StrictModel):
    id: str
    name: str
    username: str
    email: str | None
    role: Role
    active: bool
    mfa_enabled: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, extra='forbid')


class LoginResponse(StrictModel):
    user: UserResponse
    csrf_token: str
    session_expires_at: datetime


class AuditResponse(StrictModel):
    id: str
    event_type: str
    action: str
    entity: str
    entity_id: str | None
    outcome: str
    details: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, extra='forbid')
