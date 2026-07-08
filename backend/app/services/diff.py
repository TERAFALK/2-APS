"""Jämför två schemaversioner och beskriver skillnaderna (för om-planeringsvyn)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Operation, ScheduleVersion


def _ops_by_key(db: Session, version_id: int) -> dict[int, Operation]:
    ops = db.scalars(select(Operation).where(Operation.version_id == version_id)).all()
    # nyckel = (order_id, sequence) identifierar samma logiska operation mellan versioner
    return {(op.order_id, op.sequence): op for op in ops}  # type: ignore[return-value]


def diff_versions(db: Session, base_id: int, new_id: int) -> dict:
    base = _ops_by_key(db, base_id)
    new = _ops_by_key(db, new_id)

    changes = []
    for key, n in new.items():
        b = base.get(key)
        if b is None:
            changes.append({"op": n.name, "order_id": n.order_id, "type": "tillagd"})
            continue
        moved = b.start_time != n.start_time
        remachined = b.machine_id != n.machine_id
        if moved or remachined:
            changes.append({
                "op": n.name,
                "order_id": n.order_id,
                "type": "flyttad",
                "from_start": b.start_time.isoformat() if b.start_time else None,
                "to_start": n.start_time.isoformat() if n.start_time else None,
                "from_machine": b.machine_id,
                "to_machine": n.machine_id,
                "shift_minutes": (
                    int((n.start_time - b.start_time).total_seconds() // 60)
                    if b.start_time and n.start_time else None
                ),
            })
    removed = [
        {"op": b.name, "order_id": b.order_id, "type": "borttagen"}
        for key, b in base.items() if key not in new
    ]
    return {
        "base_version": base_id,
        "new_version": new_id,
        "total_changes": len(changes) + len(removed),
        "changes": changes + removed,
    }


def diff_latest(db: Session) -> dict | None:
    """Jämför aktiv version mot närmast föregående."""
    versions = db.scalars(
        select(ScheduleVersion).order_by(ScheduleVersion.version.desc()).limit(2)
    ).all()
    if len(versions) < 2:
        return None
    new, base = versions[0], versions[1]
    return diff_versions(db, base.id, new.id)
