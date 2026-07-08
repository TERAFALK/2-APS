"""Kärndatamodell för APS-systemet.

Relationer:
  Customer 1─* ProductionOrder *─1 Product
  Product 1─* RoutingStep (operationsmall)  ·  Product 1─* BomLine
  RoutingStep *─1 MachineType  ·  Machine *─1 MachineType
  ProductionOrder 1─* Operation (schemalagd instans av en RoutingStep)
  Schedule 1─* ScheduleVersion  ·  Operation *─1 ScheduleVersion
"""
from __future__ import annotations

import enum
from datetime import datetime, time

from sqlalchemy import (
    Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text, Time, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Role(str, enum.Enum):
    admin = "admin"
    planner = "planner"
    manager = "manager"
    operator = "operator"


class OrderStatus(str, enum.Enum):
    draft = "draft"
    released = "released"
    scheduled = "scheduled"
    in_progress = "in_progress"
    done = "done"
    cancelled = "cancelled"


class OperationStatus(str, enum.Enum):
    planned = "planned"
    locked = "locked"      # manuellt låst position i schemat
    running = "running"
    done = "done"


# ---------------------------------------------------------------- Users / RBAC
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(255), default="")
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.operator)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------- Master data
class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    contact_email: Mapped[str] = mapped_column(String(255), default="")
    contact_phone: Mapped[str] = mapped_column(String(64), default="")
    orders: Mapped[list[ProductionOrder]] = relationship(back_populates="customer")


class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    article_no: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    version: Mapped[str] = mapped_column(String(32), default="1")
    description: Mapped[str] = mapped_column(Text, default="")
    routing: Mapped[list[RoutingStep]] = relationship(
        back_populates="product", order_by="RoutingStep.sequence", cascade="all, delete-orphan"
    )
    bom: Mapped[list[BomLine]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class BomLine(Base):
    __tablename__ = "bom_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    component_article_no: Mapped[str] = mapped_column(String(64))
    quantity_per: Mapped[float] = mapped_column(Float, default=1.0)
    product: Mapped[Product] = relationship(back_populates="bom")


class MachineType(Base):
    __tablename__ = "machine_types"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    machines: Mapped[list[Machine]] = relationship(back_populates="machine_type")


class MomentType(Base):
    """Fördefinierad momenttyp som väljs i dropdown när en fas läggs till på en order."""
    __tablename__ = "moment_types"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)


class Machine(Base):
    __tablename__ = "machines"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    machine_type_id: Mapped[int | None] = mapped_column(ForeignKey("machine_types.id"), nullable=True)
    # Enkel arbetstidsmodell för MVP (utökas med kalender/undantag i Fas 2)
    shift_start: Mapped[time] = mapped_column(Time, default=time(7, 0))
    shift_end: Mapped[time] = mapped_column(Time, default=time(16, 0))
    available: Mapped[bool] = mapped_column(Boolean, default=True)
    machine_type: Mapped[MachineType] = relationship(back_populates="machines")


class MaintenanceWindow(Base):
    """Planerat underhåll då en maskin inte är tillgänglig."""
    __tablename__ = "maintenance_windows"
    id: Mapped[int] = mapped_column(primary_key=True)
    machine_id: Mapped[int] = mapped_column(ForeignKey("machines.id"))
    start_time: Mapped[datetime] = mapped_column(DateTime)
    end_time: Mapped[datetime] = mapped_column(DateTime)
    reason: Mapped[str] = mapped_column(String(255), default="Underhåll")
    machine: Mapped[Machine] = relationship()


class Skill(Base):
    __tablename__ = "skills"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    shift_start: Mapped[time] = mapped_column(Time, default=time(7, 0))
    shift_end: Mapped[time] = mapped_column(Time, default=time(16, 0))
    # kompetenser lagras som kommaseparerade skill-namn för MVP
    skills_csv: Mapped[str] = mapped_column(String(512), default="")


class RoutingStep(Base):
    """Operationsmall: produktens produktionsflöde, ett steg."""
    __tablename__ = "routing_steps"
    __table_args__ = (UniqueConstraint("product_id", "sequence"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    sequence: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(255))
    machine_type_id: Mapped[int] = mapped_column(ForeignKey("machine_types.id"))
    # tider i minuter per styck / per ställ
    run_minutes_per_unit: Mapped[float] = mapped_column(Float, default=1.0)
    setup_minutes: Mapped[float] = mapped_column(Float, default=0.0)
    required_skill: Mapped[str] = mapped_column(String(128), default="")
    product: Mapped[Product] = relationship(back_populates="routing")


# ---------------------------------------------------------------- Orders / plan
class ProductionOrder(Base):
    __tablename__ = "production_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_no: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    priority: Mapped[int] = mapped_column(Integer, default=100)  # lägre = viktigare
    due_date: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.draft)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    customer: Mapped[Customer | None] = relationship(back_populates="orders")
    product: Mapped[Product | None] = relationship()
    operations: Mapped[list[Operation]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class Schedule(Base):
    __tablename__ = "schedules"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), default="Produktionsschema")
    versions: Mapped[list[ScheduleVersion]] = relationship(back_populates="schedule")


class ScheduleVersion(Base):
    __tablename__ = "schedule_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    schedule_id: Mapped[int] = mapped_column(ForeignKey("schedules.id"))
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    objective_value: Mapped[float] = mapped_column(Float, default=0.0)
    solver_status: Mapped[str] = mapped_column(String(32), default="")
    reason: Mapped[str] = mapped_column(String(255), default="manual")  # manuell/omplanering
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    schedule: Mapped[Schedule] = relationship(back_populates="versions")
    operations: Mapped[list[Operation]] = relationship(back_populates="version")


class Operation(Base):
    """Schemalagd instans av en RoutingStep för en specifik order."""
    __tablename__ = "operations"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("production_orders.id"))
    version_id: Mapped[int | None] = mapped_column(
        ForeignKey("schedule_versions.id"), nullable=True
    )
    routing_step_id: Mapped[int | None] = mapped_column(ForeignKey("routing_steps.id"), nullable=True)
    sequence: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(255))
    # vilken maskintyp momentet kräver (kopieras från routing-steget) → styr var det får placeras
    machine_type_id: Mapped[int | None] = mapped_column(ForeignKey("machine_types.id"), nullable=True)
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("machines.id"), nullable=True)
    start_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[OperationStatus] = mapped_column(
        Enum(OperationStatus), default=OperationStatus.planned
    )

    order: Mapped[ProductionOrder] = relationship(back_populates="operations")
    version: Mapped[ScheduleVersion | None] = relationship(back_populates="operations")
    machine: Mapped[Machine | None] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_email: Mapped[str] = mapped_column(String(255), default="")
    action: Mapped[str] = mapped_column(String(128))
    detail: Mapped[str] = mapped_column(Text, default="")
