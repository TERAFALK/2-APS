"""Order, operationer och planering (APS-motorn)."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from datetime import datetime

from app.db import get_db
from app.models import (
    MaintenanceWindow, Operation, OperationStatus, ProductionOrder, Role, ScheduleVersion,
)
from app.schemas import OperationOut, OrderIn, OrderOut, PlanResult
from app.security import get_current_user, require_roles
from app.services.diff import diff_latest, diff_versions
from app.services.scheduling import run_planning

router = APIRouter(tags=["planning"], dependencies=[Depends(get_current_user)])
planner = require_roles(Role.admin, Role.planner)


@router.get("/orders", response_model=list[OrderOut])
def list_orders(db: Session = Depends(get_db)):
    return db.scalars(select(ProductionOrder).order_by(ProductionOrder.priority)).all()


@router.post("/orders", response_model=OrderOut, dependencies=[Depends(planner)])
def create_order(payload: OrderIn, db: Session = Depends(get_db)):
    if db.scalar(select(ProductionOrder).where(ProductionOrder.order_no == payload.order_no)):
        raise HTTPException(status_code=409, detail="Ordernummer finns redan")
    from app.models import OrderStatus
    order = ProductionOrder(**payload.model_dump(), status=OrderStatus.released)
    db.add(order); db.commit(); db.refresh(order)
    return order


@router.get("/operations", response_model=list[OperationOut])
def list_operations(db: Session = Depends(get_db)):
    """Aktuellt schema (operationer i aktiv version)."""
    active = db.scalar(select(ScheduleVersion).where(ScheduleVersion.is_active.is_(True)))
    q = select(Operation)
    if active:
        q = q.where(Operation.version_id == active.id)
    return db.scalars(q.order_by(Operation.start_time)).all()


@router.post("/plan/run", response_model=PlanResult, dependencies=[Depends(planner)])
def run_plan(horizon_days: int = 30, db: Session = Depends(get_db)):
    """Kör planeringsmotorn synkront och returnerar nytt schema."""
    version = run_planning(db, reason="manual", horizon_days=horizon_days)
    ops = db.scalars(
        select(Operation).where(Operation.version_id == version.id).order_by(Operation.start_time)
    ).all()
    return PlanResult(
        version=version.version,
        solver_status=version.solver_status,
        objective_value=version.objective_value,
        operations=ops,
    )


@router.post("/plan/replan", dependencies=[Depends(planner)])
def replan_async(reason: str = "event", horizon_days: int = 30):
    """Trigga om-planering i bakgrunden (t.ex. vid maskinhaveri/akutorder)."""
    from app.worker import replan_task
    task = replan_task.delay(reason=reason, horizon_days=horizon_days)
    return {"task_id": task.id, "queued": True}


@router.get("/plan/diff")
def plan_diff(base: int | None = None, new: int | None = None, db: Session = Depends(get_db)):
    """Skillnad mellan två schemaversioner. Utan parametrar: aktiv vs föregående."""
    if base and new:
        return diff_versions(db, base, new)
    result = diff_latest(db)
    if result is None:
        return {"total_changes": 0, "changes": [], "message": "Endast en version finns."}
    return result


@router.post("/maintenance", dependencies=[Depends(planner)])
def add_maintenance(
    machine_id: int, start: datetime, end: datetime, reason: str = "Underhåll",
    db: Session = Depends(get_db),
):
    """Registrera underhållsfönster. Kör om planeringen för att ta hänsyn till det."""
    mw = MaintenanceWindow(machine_id=machine_id, start_time=start, end_time=end, reason=reason)
    db.add(mw); db.commit(); db.refresh(mw)
    return {"id": mw.id, "machine_id": machine_id, "start": start, "end": end}


@router.post(
    "/operations/{op_id}/lock",
    response_model=OperationOut,
    dependencies=[Depends(planner)],
)
def lock_operation(op_id: int, db: Session = Depends(get_db)):
    """Lås en operations position så nästa planering håller den fix (drag-släpp/manuell styrning)."""
    op = db.get(Operation, op_id)
    if not op:
        raise HTTPException(status_code=404, detail="Operation saknas")
    op.status = OperationStatus.locked
    db.commit(); db.refresh(op)
    return op
