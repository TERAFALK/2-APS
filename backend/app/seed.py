"""Fyller databasen med demodata för att prova planeringen.

Kör i containern:  docker compose exec api python -m app.seed
"""
from datetime import datetime, timedelta

from app.db import SessionLocal
from app.models import (
    Customer, Machine, MachineType, OrderStatus, Product, ProductionOrder, RoutingStep,
)


def run() -> None:
    db = SessionLocal()
    try:
        if db.query(Product).first():
            print("Demodata finns redan – hoppar över.")
            return

        cnc = MachineType(name="CNC-fräs")
        svarv = MachineType(name="Svarv")
        montering = MachineType(name="Montering")
        db.add_all([cnc, svarv, montering]); db.flush()

        db.add_all([
            Machine(name="CNC-1", machine_type_id=cnc.id),
            Machine(name="CNC-2", machine_type_id=cnc.id),
            Machine(name="Svarv-1", machine_type_id=svarv.id),
            Machine(name="Montering-1", machine_type_id=montering.id),
        ])

        kund = Customer(name="Volvo CE", contact_email="inkop@volvo.example")
        db.add(kund); db.flush()

        p1 = Product(article_no="ART-1001", name="Hydraulblock")
        p2 = Product(article_no="ART-1002", name="Axeltapp")
        db.add_all([p1, p2]); db.flush()

        db.add_all([
            RoutingStep(product_id=p1.id, sequence=10, name="Fräsning", machine_type_id=cnc.id,
                        run_minutes_per_unit=12, setup_minutes=30),
            RoutingStep(product_id=p1.id, sequence=20, name="Montering", machine_type_id=montering.id,
                        run_minutes_per_unit=8, setup_minutes=15),
            RoutingStep(product_id=p2.id, sequence=10, name="Svarvning", machine_type_id=svarv.id,
                        run_minutes_per_unit=6, setup_minutes=20),
            RoutingStep(product_id=p2.id, sequence=20, name="Fräsning", machine_type_id=cnc.id,
                        run_minutes_per_unit=10, setup_minutes=25),
        ])

        now = datetime.utcnow()
        db.add_all([
            ProductionOrder(order_no="PO-5001", customer_id=kund.id, product_id=p1.id,
                            quantity=20, priority=10, due_date=now + timedelta(days=3),
                            status=OrderStatus.released),
            ProductionOrder(order_no="PO-5002", customer_id=kund.id, product_id=p2.id,
                            quantity=40, priority=50, due_date=now + timedelta(days=5),
                            status=OrderStatus.released),
            ProductionOrder(order_no="PO-5003", product_id=p1.id,
                            quantity=15, priority=100, due_date=now + timedelta(days=2),
                            status=OrderStatus.released),
        ])
        db.commit()
        print("Demodata skapad. Logga in och kör planering i Gantt-vyn.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
