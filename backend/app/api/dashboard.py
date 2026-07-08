"""KPI:er för produktionsledning."""
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Operation, OrderStatus, ProductionOrder, ScheduleVersion
from app.security import get_current_user

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

    active_ver = db.scalar(select(ScheduleVersion).where(ScheduleVersion.is_active.is_(True)))
    late = 0
    if active_ver:
        # order räknas sen om sista schemalagda operation slutar efter due_date
        rows = db.execute(
            select(Operation.order_id, func.max(Operation.end_time))
            .where(Operation.version_id == active_ver.id)
            .group_by(Operation.order_id)
        ).all()
        for order_id, last_end in rows:
            order = db.get(ProductionOrder, order_id)
            if order and last_end and last_end > order.due_date:
                late += 1

    on_time = (active - late) / active * 100 if active else 100.0
    return {
        "orders_total": total,
        "orders_active": active,
        "orders_done": done,
        "orders_late": late,
        "delivery_precision_pct": round(on_time, 1),
        "active_schedule_version": active_ver.version if active_ver else None,
    }
