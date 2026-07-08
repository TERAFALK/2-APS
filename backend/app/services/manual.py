"""Manuell planering: generera moment (operationer) från routing utan att schemalägga dem,
och placera/flytta dem manuellt. Ingen optimeringsmotor inblandad."""
from __future__ import annotations

import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Operation, OperationStatus, OrderStatus, ProductionOrder, RoutingStep

PLANNABLE = (OrderStatus.released, OrderStatus.scheduled, OrderStatus.in_progress)


def generate_operations_for_order(db: Session, order: ProductionOrder) -> int:
    """Skapar Operation-rader från produktens routing. Momenten läggs i backloggen
    (ingen maskin, ingen tid) tills planeraren placerar dem manuellt. Returnerar antal skapade."""
    steps = db.scalars(
        select(RoutingStep)
        .where(RoutingStep.product_id == order.product_id)
        .order_by(RoutingStep.sequence)
    ).all()
    existing = {op.routing_step_id for op in order.operations}
    created = 0
    for step in steps:
        if step.id in existing:
            continue
        duration = int(math.ceil(step.setup_minutes + step.run_minutes_per_unit * order.quantity))
        db.add(
            Operation(
                order_id=order.id,
                routing_step_id=step.id,
                sequence=step.sequence,
                name=step.name,
                duration_minutes=max(1, duration),
                status=OperationStatus.planned,
            )
        )
        created += 1
    return created


def generate_missing(db: Session) -> int:
    """Skapar moment för alla planerbara order som saknar dem."""
    orders = db.scalars(
        select(ProductionOrder).where(ProductionOrder.status.in_(PLANNABLE))
    ).all()
    total = 0
    for order in orders:
        total += generate_operations_for_order(db, order)
    db.commit()
    return total
