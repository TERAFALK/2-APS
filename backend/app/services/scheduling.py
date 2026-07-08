"""Kopplar databasen till APS-motorn: bygger problem, kör solver, sparar ny ScheduleVersion."""
from __future__ import annotations

import math
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.aps.engine import OpInput, OrderInput, ProblemInput, solve
from app.models import (
    Machine, MaintenanceWindow, Operation, OperationStatus, OrderStatus, ProductionOrder,
    RoutingStep, Schedule, ScheduleVersion,
)

PLANNABLE = (OrderStatus.released, OrderStatus.scheduled, OrderStatus.in_progress)


def _minute(dt: datetime, horizon_start: datetime) -> int:
    return int((dt - horizon_start).total_seconds() // 60)


def build_downtime(
    db: Session, machines: list[Machine], horizon_start: datetime, horizon_days: int
) -> dict[int, list[tuple[int, int]]]:
    """Bygger otillgänglighetsfönster per maskin: tid utanför skift varje dygn + underhåll."""
    downtime: dict[int, list[tuple[int, int]]] = {}
    for m in machines:
        windows: list[tuple[int, int]] = []
        for day in range(horizon_days):
            day_start = (horizon_start + timedelta(days=day)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            shift_start = day_start + timedelta(
                hours=m.shift_start.hour, minutes=m.shift_start.minute
            )
            shift_end = day_start + timedelta(hours=m.shift_end.hour, minutes=m.shift_end.minute)
            # icke-arbetstid: från dygnets start till skiftstart, och från skiftslut till nästa dygn
            windows.append((_minute(day_start, horizon_start), _minute(shift_start, horizon_start)))
            next_day = day_start + timedelta(days=1)
            windows.append((_minute(shift_end, horizon_start), _minute(next_day, horizon_start)))
        downtime[m.id] = windows

    for mw in db.scalars(select(MaintenanceWindow)).all():
        downtime.setdefault(mw.machine_id, []).append(
            (_minute(mw.start_time, horizon_start), _minute(mw.end_time, horizon_start))
        )
    return downtime


def _get_or_create_schedule(db: Session) -> Schedule:
    sched = db.scalar(select(Schedule).limit(1))
    if sched is None:
        sched = Schedule(name="Produktionsschema")
        db.add(sched)
        db.flush()
    return sched


def build_problem(db: Session, horizon_start: datetime, horizon_days: int) -> tuple[ProblemInput, dict]:
    """Skapar/uppdaterar Operation-rader från routing och bygger ProblemInput.

    Returnerar (problem, op_index) där op_index mappar op_id -> Operation-objekt.
    """
    horizon_minutes = horizon_days * 24 * 60
    orders = db.scalars(
        select(ProductionOrder).where(ProductionOrder.status.in_(PLANNABLE))
    ).all()

    machines = db.scalars(select(Machine).where(Machine.available.is_(True))).all()
    machines_by_type: dict[int, list[int]] = {}
    for m in machines:
        machines_by_type.setdefault(m.machine_type_id, []).append(m.id)

    op_inputs: list[OpInput] = []
    order_inputs: list[OrderInput] = []
    op_index: dict[int, Operation] = {}

    for order in orders:
        steps = db.scalars(
            select(RoutingStep)
            .where(RoutingStep.product_id == order.product_id)
            .order_by(RoutingStep.sequence)
        ).all()
        if not steps:
            continue

        due_min = max(0, int((order.due_date - horizon_start).total_seconds() // 60))
        order_inputs.append(
            OrderInput(order_id=order.id, due=due_min, priority=order.priority)
        )

        # säkerställ att Operation-rader finns för ordern
        existing = {op.routing_step_id: op for op in order.operations}
        for step in steps:
            duration = int(math.ceil(step.setup_minutes + step.run_minutes_per_unit * order.quantity))
            op = existing.get(step.id)
            if op is None:
                op = Operation(
                    order_id=order.id,
                    routing_step_id=step.id,
                    sequence=step.sequence,
                    name=step.name,
                    duration_minutes=duration,
                    status=OperationStatus.planned,
                )
                db.add(op)
                db.flush()
            else:
                op.duration_minutes = duration

            eligible = machines_by_type.get(step.machine_type_id, [])
            if not eligible:
                continue

            locked_machine = op.machine_id if op.status == OperationStatus.locked else None
            locked_start = None
            if op.status == OperationStatus.locked and op.start_time:
                locked_start = max(0, int((op.start_time - horizon_start).total_seconds() // 60))

            op_index[op.id] = op
            op_inputs.append(
                OpInput(
                    op_id=op.id,
                    order_id=order.id,
                    seq=step.sequence,
                    product_id=order.product_id,
                    duration=max(1, duration),
                    eligible_machines=eligible,
                    locked_machine=locked_machine,
                    locked_start=locked_start,
                )
            )

    problem = ProblemInput(
        orders=order_inputs,
        operations=op_inputs,
        machines=[m.id for m in machines],
        horizon=max(horizon_minutes, 1),
        downtime=build_downtime(db, machines, horizon_start, horizon_days),
    )
    return problem, op_index


def run_planning(db: Session, reason: str = "manual", horizon_days: int = 30) -> ScheduleVersion:
    horizon_start = datetime.utcnow().replace(second=0, microsecond=0)
    problem, op_index = build_problem(db, horizon_start, horizon_days)

    solution = solve(problem)

    schedule = _get_or_create_schedule(db)
    last = db.scalar(
        select(ScheduleVersion)
        .where(ScheduleVersion.schedule_id == schedule.id)
        .order_by(ScheduleVersion.version.desc())
    )
    version = ScheduleVersion(
        schedule_id=schedule.id,
        version=(last.version + 1) if last else 1,
        objective_value=solution.objective,
        solver_status=solution.status,
        reason=reason,
        is_active=True,
    )
    # avaktivera tidigare aktiv version
    if last:
        for v in schedule.versions:
            v.is_active = False
    db.add(version)
    db.flush()

    for so in solution.scheduled:
        op = op_index.get(so.op_id)
        if op is None:
            continue
        op.version_id = version.id
        op.machine_id = so.machine_id
        op.start_time = horizon_start + timedelta(minutes=so.start)
        op.end_time = horizon_start + timedelta(minutes=so.end)
        if op.status == OperationStatus.planned:
            # markera ordern som schemalagd
            if op.order.status == OrderStatus.released:
                op.order.status = OrderStatus.scheduled

    db.commit()
    db.refresh(version)
    return version
