"""KPI:er för produktionsledning."""
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Operation, OrderStatus, ProductionOrder
from app.security import get_current_user
from app.services.analytics import bottlenecks, current_load, machine_utilization

router = APIRouter(prefix="/dashboard", tags=["dashboard"],
                   dependencies=[Depends(get_current_user)])


@router.get("/kpi")
def kpi(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    total = db.scalar(select(func.count()).select_from(ProductionOrder)) or 0
    done = db.scalar(
        select(func.count()).where(ProductionOrder.status == OrderStatus.done)
    ) or 0
    active = db.scalar(
        select(func.count()).where(
            ProductionOrder.status.in_(
                [OrderStatus.released, OrderStatus.scheduled, OrderStatus.in_progress]
            )
        )
    ) or 0

    # order räknas sen om dess sista schemalagda moment slutar efter leveransdatum
    late = 0
    scheduled = 0
    rows = db.execute(
        select(Operation.order_id, func.max(Operation.end_time))
        .where(Operation.start_time.is_not(None))
        .group_by(Operation.order_id)
    ).all()
    for order_id, last_end in rows:
        order = db.get(ProductionOrder, order_id)
        if order and last_end:
            scheduled += 1
            if last_end > order.due_date:
                late += 1

    on_time = (scheduled - late) / scheduled * 100 if scheduled else 100.0
    return {
        "orders_total": total,
        "orders_active": active,
        "orders_done": done,
        "orders_late": late,
        "delivery_precision_pct": round(on_time, 1),
        "orders_scheduled": scheduled,
    }


@router.get("/utilization")
def utilization(db: Session = Depends(get_db)):
    return machine_utilization(db)


@router.get("/load")
def load(db: Session = Depends(get_db)):
    return current_load(db)


@router.get("/bottlenecks")
def get_bottlenecks(threshold: float = 85.0, db: Session = Depends(get_db)):
    return bottlenecks(db, threshold_pct=threshold)
