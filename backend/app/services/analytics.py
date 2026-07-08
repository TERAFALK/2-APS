"""Produktionsanalys: maskinutnyttjande och flaskhalsar utifrån aktivt schema."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Machine, Operation, ScheduleVersion


def machine_utilization(db: Session) -> list[dict]:
    active = db.scalar(select(ScheduleVersion).where(ScheduleVersion.is_active.is_(True)))
    machines = db.scalars(select(Machine)).all()
    if not active:
        return [{"machine": m.name, "machine_id": m.id, "busy_minutes": 0,
                 "utilization_pct": 0.0, "operations": 0} for m in machines]

    ops = db.scalars(select(Operation).where(Operation.version_id == active.id)).all()

    # planeringsfönster = tidigaste start → senaste slut
    starts = [o.start_time for o in ops if o.start_time]
    ends = [o.end_time for o in ops if o.end_time]
    if not starts or not ends:
        window = 1
    else:
        window = max(1, int((max(ends) - min(starts)).total_seconds() // 60))

    result = []
    for m in machines:
        m_ops = [o for o in ops if o.machine_id == m.id]
        busy = sum(o.duration_minutes for o in m_ops)
        result.append({
            "machine": m.name,
            "machine_id": m.id,
            "busy_minutes": busy,
            "utilization_pct": round(busy / window * 100, 1),
            "operations": len(m_ops),
        })
    result.sort(key=lambda x: x["utilization_pct"], reverse=True)
    return result


def bottlenecks(db: Session, threshold_pct: float = 85.0) -> list[dict]:
    """Maskiner vars utnyttjande överstiger tröskeln pekas ut som flaskhalsar."""
    return [u for u in machine_utilization(db) if u["utilization_pct"] >= threshold_pct]
