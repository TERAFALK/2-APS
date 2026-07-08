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


def current_load(db: Session) -> list[dict]:
    """Beläggningsgrad denna vecka per maskin: planerade timmar / tillgänglig arbetstid.
    Låter produktionsledningen se hur mycket kapacitet som är kvar för akutjobb."""
    from datetime import datetime, timedelta

    now = datetime.utcnow()
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(days=7)

    machines = db.scalars(select(Machine)).all()
    ops = db.scalars(
        select(Operation).where(
            Operation.start_time.is_not(None),
            Operation.start_time >= week_start,
            Operation.start_time < week_end,
        )
    ).all()

    result = []
    for m in machines:
        # tillgänglig arbetstid mån–fre utifrån skift
        shift_min = (m.shift_end.hour * 60 + m.shift_end.minute) - (m.shift_start.hour * 60 + m.shift_start.minute)
        capacity = max(1, shift_min * 5)
        busy = sum(o.duration_minutes for o in ops if o.machine_id == m.id)
        result.append({
            "machine": m.name,
            "machine_id": m.id,
            "load_pct": round(busy / capacity * 100, 1),
            "busy_h": round(busy / 60, 1),
            "capacity_h": round(capacity / 60, 1),
            "free_h": round(max(0, capacity - busy) / 60, 1),
        })
    result.sort(key=lambda x: x["load_pct"], reverse=True)
    return result
