"""Produktionsanalys: maskinutnyttjande och flaskhalsar utifrån schemalagda moment."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Machine, Operation


def _scheduled_ops(db: Session) -> list[Operation]:
    """Alla moment som placerats på tidslinjen (har starttid)."""
    return db.scalars(select(Operation).where(Operation.start_time.is_not(None))).all()


def machine_utilization(db: Session) -> list[dict]:
    machines = db.scalars(select(Machine)).all()
    ops = _scheduled_ops(db)

    starts = [o.start_time for o in ops if o.start_time]
    ends = [o.end_time for o in ops if o.end_time]
    window = 1
    if starts and ends:
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
    return [u for u in machine_utilization(db) if u["utilization_pct"] >= threshold_pct]
