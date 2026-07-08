"""Order, faser (moment) och manuell planering."""
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from datetime import datetime, timedelta

from app.db import get_db
from app.models import (
    Machine, MaintenanceWindow, Operation, OperationStatus, ProductionOrder, Role, ScheduleVersion,
)
from app.schemas import OperationOut, OrderIn, OrderOut, PhaseIn, PlanResult
from app.security import get_current_user, require_roles
from app.services.diff import diff_latest, diff_versions
from app.services.manual import generate_missing, generate_operations_for_order
from app.services.scheduling import run_planning

router = APIRouter(tags=["planning"], dependencies=[Depends(get_current_user)])
planner = require_roles(Role.admin, Role.planner)


@router.get("/orders", response_model=list[OrderOut])
def list_orders(customer_id: int | None = None, db: Session = Depends(get_db)):
    q = select(ProductionOrder).order_by(ProductionOrder.due_date)
    if customer_id is not None:
        q = q.where(ProductionOrder.customer_id == customer_id)
    return db.scalars(q).all()


@router.post("/orders", response_model=OrderOut, dependencies=[Depends(planner)])
def create_order(payload: OrderIn, db: Session = Depends(get_db)):
    if db.scalar(select(ProductionOrder).where(ProductionOrder.order_no == payload.order_no)):
        raise HTTPException(status_code=409, detail="Ordernummer finns redan")
    from app.models import OrderStatus
    order = ProductionOrder(**payload.model_dump(), status=OrderStatus.released)
    db.add(order); db.commit(); db.refresh(order)
    return order


@router.delete("/orders/{order_id}", status_code=204, dependencies=[Depends(planner)])
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.get(ProductionOrder, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order saknas")
    db.delete(order); db.commit()


# ---------------------------------------------------------------- faser (moment)
@router.post("/orders/{order_id}/phases", response_model=OperationOut, dependencies=[Depends(planner)])
def add_phase(order_id: int, payload: PhaseIn, db: Session = Depends(get_db)):
    """Lägg till en fas på en order: momenttyp (namn), maskin och uppskattade timmar."""
    if not db.get(ProductionOrder, order_id):
        raise HTTPException(status_code=404, detail="Order saknas")
    last = db.scalar(select(func.max(Operation.sequence)).where(Operation.order_id == order_id))
    op = Operation(
        order_id=order_id,
        sequence=(last or 0) + 10,
        name=payload.name,
        machine_id=payload.machine_id,
        duration_minutes=max(1, round(payload.hours * 60)),
        status=OperationStatus.planned,
    )
    db.add(op); db.commit(); db.refresh(op)
    return op


@router.put("/operations/{op_id}", response_model=OperationOut, dependencies=[Depends(planner)])
def update_phase(op_id: int, payload: PhaseIn, db: Session = Depends(get_db)):
    op = db.get(Operation, op_id)
    if not op:
        raise HTTPException(status_code=404, detail="Fas saknas")
    op.name = payload.name
    op.machine_id = payload.machine_id
    op.duration_minutes = max(1, round(payload.hours * 60))
    if op.start_time:
        op.end_time = op.start_time + timedelta(minutes=op.duration_minutes)
    db.commit(); db.refresh(op)
    return op


@router.delete("/operations/{op_id}", status_code=204, dependencies=[Depends(planner)])
def delete_phase(op_id: int, db: Session = Depends(get_db)):
    op = db.get(Operation, op_id)
    if not op:
        raise HTTPException(status_code=404, detail="Fas saknas")
    db.delete(op); db.commit()


@router.patch("/operations/{op_id}/status", response_model=OperationOut, dependencies=[Depends(planner)])
def set_phase_status(op_id: int, status: str, db: Session = Depends(get_db)):
    """Markera en fas som klar/försenad/pågår/återställ (planned)."""
    allowed = {"planned", "running", "done", "delayed"}
    if status not in allowed:
        raise HTTPException(status_code=422, detail="Ogiltig status")
    op = db.get(Operation, op_id)
    if not op:
        raise HTTPException(status_code=404, detail="Fas saknas")
    op.status = OperationStatus(status)
    db.commit(); db.refresh(op)
    return op


@router.put("/orders/{oid}", response_model=OrderOut, dependencies=[Depends(planner)])
def update_order(oid: int, payload: OrderIn, db: Session = Depends(get_db)):
    order = db.get(ProductionOrder, oid)
    if not order:
        raise HTTPException(status_code=404, detail="Order saknas")
    dup = db.scalar(
        select(ProductionOrder).where(ProductionOrder.order_no == payload.order_no, ProductionOrder.id != oid)
    )
    if dup:
        raise HTTPException(status_code=409, detail="Ordernummer finns redan")
    regenerate = payload.product_id != order.product_id or payload.quantity != order.quantity
    for k, v in payload.model_dump().items():
        setattr(order, k, v)
    if regenerate:
        for op in list(order.operations):
            db.delete(op)
        db.flush()
        generate_operations_for_order(db, order)
    db.commit(); db.refresh(order)
    return order


@router.delete("/orders/{oid}", status_code=204, dependencies=[Depends(planner)])
def delete_order(oid: int, db: Session = Depends(get_db)):
    order = db.get(ProductionOrder, oid)
    if not order:
        raise HTTPException(status_code=404, detail="Order saknas")
    db.delete(order); db.commit()  # moment kaskaderas bort


@router.get("/operations", response_model=list[OperationOut])
def list_operations(db: Session = Depends(get_db)):
    """Alla moment — både schemalagda (start_time satt) och backlog (utan tid)."""
    return db.scalars(select(Operation).order_by(Operation.sequence)).all()


@router.post("/operations/generate-missing", dependencies=[Depends(planner)])
def generate_ops(db: Session = Depends(get_db)):
    """Skapa moment från routing för alla order som saknar dem (fyller backloggen)."""
    created = generate_missing(db)
    return {"created": created}


@router.patch("/operations/{op_id}/manual", response_model=OperationOut, dependencies=[Depends(planner)])
def schedule_manual(
    op_id: int,
    start: datetime | None = None,
    machine_id: int | None = None,
    unschedule: bool = False,
    db: Session = Depends(get_db),
):
    """Manuell placering av ett moment: sätt starttid + maskin (ingen motor), eller lägg
    tillbaka i backloggen med unschedule=true."""
    op = db.get(Operation, op_id)
    if not op:
        raise HTTPException(status_code=404, detail="Moment saknas")
    if unschedule:
        op.start_time = None
        op.end_time = None
        op.machine_id = None
        op.status = OperationStatus.planned
    else:
        if start is None:
            raise HTTPException(status_code=422, detail="start krävs")
        if machine_id is not None and op.machine_type_id is not None:
            machine = db.get(Machine, machine_id)
            if machine and machine.machine_type_id != op.machine_type_id:
                raise HTTPException(status_code=422, detail="Momentet kräver en annan maskintyp")
        op.start_time = start
        op.end_time = start + timedelta(minutes=op.duration_minutes)
        if machine_id is not None:
            op.machine_id = machine_id
        op.status = OperationStatus.planned
    db.commit(); db.refresh(op)
    return op


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


@router.patch("/operations/{op_id}/schedule", dependencies=[Depends(planner)])
def reschedule_operation(
    op_id: int,
    start: datetime,
    machine_id: int | None = None,
    replan: bool = True,
    db: Session = Depends(get_db),
):
    """Flytta en operation (drag-släpp): sätt ny starttid/maskin, lås den och planera om
    resten av schemat runt låsningen. Motorn respekterar locked_start + locked_machine."""
    op = db.get(Operation, op_id)
    if not op:
        raise HTTPException(status_code=404, detail="Operation saknas")
    op.start_time = start
    op.end_time = start + timedelta(minutes=op.duration_minutes)
    if machine_id is not None:
        op.machine_id = machine_id
    op.status = OperationStatus.locked
    db.commit()

    if replan:
        version = run_planning(db, reason="manuell flytt")
        return {"moved_op": op_id, "version": version.version, "solver_status": version.solver_status}
    db.refresh(op)
    return {"moved_op": op_id, "version": None}
