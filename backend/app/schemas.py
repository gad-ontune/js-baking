from datetime import date, datetime
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


# ---------------------------------------------------------------------------
# Business records
# ---------------------------------------------------------------------------

def validate_date(value: str) -> str:
    """Accept a YYYY-MM-DD date or a full ISO timestamp, returning it unchanged.

    Keeping the original value preserves the time component that financial
    reports and movement history rely on.
    """
    text = str(value)
    try:
        date.fromisoformat(text[:10])
    except (TypeError, ValueError) as exc:
        raise ValueError('Enter a valid date.') from exc
    return text


class InventoryCreate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    code: str | None = Field(default=None, max_length=40)
    category: str = Field(min_length=1, max_length=80)
    unit: str = Field(min_length=1, max_length=30)
    description: str = Field(default='', max_length=500)
    quantity: float = Field(default=0, ge=0, le=1_000_000)
    minQuantity: float = Field(default=0, ge=0, le=1_000_000)
    purchaseCost: float = Field(default=0, ge=0, le=100_000_000)
    sellingPrice: float | None = Field(default=None, ge=0, le=100_000_000)
    expiryDate: str = Field(default='', max_length=10)

    @field_validator('name', 'code', 'category', 'unit')
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @field_validator('expiryDate')
    @classmethod
    def check_expiry(cls, value: str) -> str:
        return validate_date(value) if value else ''


class InventoryUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    code: str | None = Field(default=None, max_length=40)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    unit: str | None = Field(default=None, min_length=1, max_length=30)
    description: str | None = Field(default=None, max_length=500)
    minQuantity: float | None = Field(default=None, ge=0, le=1_000_000)
    purchaseCost: float | None = Field(default=None, ge=0, le=100_000_000)
    sellingPrice: float | None = Field(default=None, ge=0, le=100_000_000)
    expiryDate: str | None = Field(default=None, max_length=10)
    archived: bool | None = None

    @field_validator('expiryDate')
    @classmethod
    def check_expiry(cls, value: str | None) -> str | None:
        return validate_date(value) if value else value


class MovementCreate(StrictModel):
    type: Literal['Purchase', 'Sale', 'Adjustment', 'Wastage', 'Opening Stock', 'Other']
    quantity: float = Field(gt=0, le=1_000_000)
    reason: str = Field(default='', max_length=300)
    reference: str = Field(default='', max_length=60)


class SupplierCreate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    businessName: str = Field(default='', max_length=120)
    phone: str = Field(default='', max_length=40)
    email: str = Field(default='', max_length=255)
    location: str = Field(default='', max_length=160)
    description: str = Field(default='', max_length=500)

    @field_validator('email')
    @classmethod
    def check_email(cls, value: str) -> str:
        if value and '@' not in value:
            raise ValueError('Enter a valid email address.')
        return value.strip()


class SupplierUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    businessName: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    email: str | None = Field(default=None, max_length=255)
    location: str | None = Field(default=None, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    status: Literal['Active', 'Inactive'] | None = None


class ProductCreate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    sku: str = Field(default='', max_length=40)
    category: str = Field(min_length=1, max_length=80)
    description: str = Field(default='', max_length=500)
    cost: float = Field(ge=0, le=100_000_000)
    price: float = Field(ge=0, le=100_000_000)
    trackedItemId: str | None = Field(default=None, max_length=48)


class ProductUpdate(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    cost: float | None = Field(default=None, ge=0, le=100_000_000)
    price: float | None = Field(default=None, ge=0, le=100_000_000)
    trackedItemId: str | None = Field(default=None, max_length=48)
    archived: bool | None = None


class PurchaseItemInput(StrictModel):
    itemId: str = Field(min_length=1, max_length=48)
    quantity: float = Field(gt=0, le=1_000_000)
    unitCost: float = Field(ge=0, le=100_000_000)


class PurchaseCreate(StrictModel):
    supplierId: str = Field(min_length=1, max_length=48)
    date: str
    items: list[PurchaseItemInput] = Field(min_length=1, max_length=100)
    discount: float = Field(default=0, ge=0, le=100_000_000)
    charges: float = Field(default=0, ge=0, le=100_000_000)
    paidAmount: float = Field(default=0, ge=0, le=100_000_000)
    paymentMethod: str = Field(default='Cash', min_length=1, max_length=40)
    notes: str = Field(default='', max_length=1000)

    @field_validator('date')
    @classmethod
    def check_date(cls, value: str) -> str:
        return validate_date(value)


class PaymentCreate(StrictModel):
    amount: float = Field(gt=0, le=100_000_000)
    date: str | None = Field(default=None, max_length=40)
    method: str = Field(default='Cash', min_length=1, max_length=40)

    @field_validator('date')
    @classmethod
    def check_date(cls, value: str | None) -> str | None:
        return validate_date(value) if value else value


class PurchaseUpdate(StrictModel):
    notes: str = Field(max_length=1000)


class SaleItemInput(StrictModel):
    # `productId` is optional so the writable product field can introduce a
    # brand-new product at sale time. The server resolves or creates it.
    productId: str | None = Field(default=None, max_length=48)
    productName: str = Field(default='', max_length=120)
    quantity: float = Field(gt=0, le=1_000_000)
    unitPrice: float = Field(gt=0, le=100_000_000)


class SaleCreate(StrictModel):
    date: str
    items: list[SaleItemInput] = Field(min_length=1, max_length=100)
    discount: float = Field(default=0, ge=0, le=100_000_000)
    paymentMethod: str = Field(default='Cash', min_length=1, max_length=40)
    notes: str = Field(default='', max_length=1000)

    @field_validator('date')
    @classmethod
    def check_date(cls, value: str) -> str:
        return validate_date(value)


class ExpenseCreate(StrictModel):
    category: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=300)
    amount: float = Field(gt=0, le=100_000_000)
    date: str
    paymentMethod: str = Field(default='Cash', min_length=1, max_length=40)
    notes: str = Field(default='', max_length=1000)

    @field_validator('date')
    @classmethod
    def check_date(cls, value: str) -> str:
        return validate_date(value)


class ExpenseUpdate(StrictModel):
    category: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, min_length=1, max_length=300)
    amount: float | None = Field(default=None, gt=0, le=100_000_000)
    date: str | None = Field(default=None, max_length=10)
    paymentMethod: str | None = Field(default=None, min_length=1, max_length=40)
    notes: str | None = Field(default=None, max_length=1000)

    @field_validator('date')
    @classmethod
    def check_date(cls, value: str | None) -> str | None:
        return validate_date(value) if value else value


class ProductionCreate(StrictModel):
    productName: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=80)
    quantity: float = Field(gt=0, le=1_000_000)
    date: str
    description: str = Field(default='', max_length=500)
    notes: str = Field(default='', max_length=1000)

    @field_validator('date')
    @classmethod
    def check_date(cls, value: str) -> str:
        return validate_date(value)


class ProductionUpdate(StrictModel):
    quantity: float | None = Field(default=None, gt=0, le=1_000_000)
    description: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)


class ReverseRequest(StrictModel):
    reason: str = Field(min_length=1, max_length=300)

    @field_validator('reason')
    @classmethod
    def clean_reason(cls, value: str) -> str:
        return value.strip()


class BusinessRecordResponse(StrictModel):
    id: str
    kind: str
    payload: dict
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, extra='forbid')
