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


def _overtime_min(start, dur_min: int, m: Machine) -> float:
    """Minuter av en sammanhängande bokning som ligger utanför maskinens skift (övertid)."""
    from datetime import timedelta
    end = start + timedelta(minutes=dur_min)
    work = 0.0
    cur = start
    guard = 0
    while cur < end and guard < 400:
        guard += 1
        if cur.weekday() < 5:
            s = cur.replace(hour=m.shift_start.hour, minute=m.shift_start.minute, second=0, microsecond=0)
            e = cur.replace(hour=m.shift_end.hour, minute=m.shift_end.minute, second=0, microsecond=0)
            a = max(cur, s); b = min(end, e)
            if b > a:
                work += (b - a).total_seconds() / 60
        cur = (cur + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(0.0, dur_min - work)


def current_load(db: Session) -> list[dict]:
    """Beläggningsgrad denna vecka per maskin + övertidstimmar."""
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
        shift_min = (m.shift_end.hour * 60 + m.shift_end.minute) - (m.shift_start.hour * 60 + m.shift_start.minute)
        if m.lunch_start and m.lunch_end:
            shift_min -= max(0, (m.lunch_end.hour * 60 + m.lunch_end.minute) - (m.lunch_start.hour * 60 + m.lunch_start.minute))
        capacity = max(1, shift_min * 5)
        m_ops = [o for o in ops if o.machine_id == m.id]
        busy = sum(o.duration_minutes for o in m_ops)
        overtime = sum(_overtime_min(o.start_time, o.duration_minutes, m) for o in m_ops)
        result.append({
            "machine": m.name,
            "machine_id": m.id,
            "load_pct": round(busy / capacity * 100, 1),
            "busy_h": round(busy / 60, 1),
            "capacity_h": round(capacity / 60, 1),
            "free_h": round(max(0, capacity - busy) / 60, 1),
            "overtime_h": round(overtime / 60, 1),
        })
    result.sort(key=lambda x: x["load_pct"], reverse=True)
    return result
