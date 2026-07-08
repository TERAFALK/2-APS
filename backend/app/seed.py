"""Demodata för den nya arbetsgången (kunder, maskiner, momenttyper, order + faser).

Kör i containern:  docker compose exec api python -m app.seed
"""
from datetime import datetime, timedelta

from app.db import SessionLocal
from app.models import (
    Customer, Machine, MomentType, Operation, OperationStatus, OrderStatus, ProductionOrder,
)


def run() -> None:
    db = SessionLocal()
    try:
        if db.query(Machine).first():
            print("Demodata finns redan – hoppar över.")
            return

        machines = [
            Machine(name="CNC-1"), Machine(name="CNC-2"),
            Machine(name="Svarv-1"), Machine(name="Montering-1"),
        ]
        db.add_all(machines)
        db.add_all([MomentType(name=n) for n in ["Fräsning", "Svarvning", "Montering", "Kapning", "Kontroll"]])
        kund = Customer(name="Volvo CE", contact_email="inkop@volvo.example")
        db.add(kund); db.flush()

        now = datetime.utcnow()
        order = ProductionOrder(order_no="PO-5001", customer_id=kund.id, priority="high",
                                due_date=now + timedelta(days=5), status=OrderStatus.released)
        db.add(order); db.flush()

        db.add_all([
            Operation(order_id=order.id, sequence=10, name="Kapning",
                      machine_id=machines[2].id, duration_minutes=4 * 60, status=OperationStatus.planned),
            Operation(order_id=order.id, sequence=20, name="Fräsning",
                      machine_id=machines[0].id, duration_minutes=40 * 60, status=OperationStatus.planned),
            Operation(order_id=order.id, sequence=30, name="Montering",
                      machine_id=machines[3].id, duration_minutes=8 * 60, status=OperationStatus.planned),
        ])
        db.commit()
        print("Demodata skapad. Öppna Planering och dra ut faserna.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
