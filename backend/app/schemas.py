from __future__ import annotations

from datetime import datetime, time

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models import OperationStatus, OrderStatus, Role


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- auth ---
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(ORMBase):
    id: int
    email: EmailStr
    full_name: str
    role: Role
    is_active: bool


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = ""
    password: str
    role: Role = Role.operator


# --- master data ---
class CustomerIn(BaseModel):
    name: str
    contact_email: str = ""
    contact_phone: str = ""


class CustomerOut(ORMBase, CustomerIn):
    id: int


class RoutingStepIn(BaseModel):
    sequence: int
    name: str
    machine_type_id: int
    run_minutes_per_unit: float = 1.0
    setup_minutes: float = 0.0
    required_skill: str = ""


class RoutingStepOut(ORMBase, RoutingStepIn):
    id: int


class ProductIn(BaseModel):
    article_no: str
    name: str
    version: str = "1"
    description: str = ""


class ProductOut(ORMBase, ProductIn):
    id: int
    routing: list[RoutingStepOut] = []


class MachineTypeIn(BaseModel):
    name: str


class MachineTypeOut(ORMBase, MachineTypeIn):
    id: int


class MachineIn(BaseModel):
    name: str
    machine_type_id: int
    shift_start: time = time(7, 0)
    shift_end: time = time(16, 0)
    available: bool = True


class MachineOut(ORMBase, MachineIn):
    id: int


# --- orders / plan ---
class OrderIn(BaseModel):
    order_no: str
    product_id: int
    customer_id: int | None = None
    quantity: int = 1
    priority: int = 100
    due_date: datetime


class OrderOut(ORMBase):
    id: int
    order_no: str
    product_id: int
    customer_id: int | None
    quantity: int
    priority: int
    due_date: datetime
    status: OrderStatus


class OperationOut(ORMBase):
    id: int
    order_id: int
    name: str
    sequence: int
    machine_type_id: int | None
    machine_id: int | None
    start_time: datetime | None
    end_time: datetime | None
    duration_minutes: int
    status: OperationStatus


class PlanResult(BaseModel):
    version: int
    solver_status: str
    objective_value: float
    operations: list[OperationOut] = []
