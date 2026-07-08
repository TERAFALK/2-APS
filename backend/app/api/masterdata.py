"""CRUD för grunddata: kunder, produkter (+routing), maskintyper, maskiner."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Customer, Machine, MachineType, Product, Role, RoutingStep,
)
from app.schemas import (
    CustomerIn, CustomerOut, MachineIn, MachineOut, MachineTypeIn, MachineTypeOut,
    ProductIn, ProductOut, RoutingStepIn, RoutingStepOut,
)
from app.security import get_current_user, require_roles

router = APIRouter(tags=["masterdata"], dependencies=[Depends(get_current_user)])
planner = require_roles(Role.admin, Role.planner)


# --- customers ---
@router.get("/customers", response_model=list[CustomerOut])
def list_customers(db: Session = Depends(get_db)):
    return db.scalars(select(Customer)).all()


@router.post("/customers", response_model=CustomerOut, dependencies=[Depends(planner)])
def create_customer(payload: CustomerIn, db: Session = Depends(get_db)):
    c = Customer(**payload.model_dump())
    db.add(c); db.commit(); db.refresh(c)
    return c


# --- products + routing ---
@router.get("/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    return db.scalars(select(Product)).all()


@router.post("/products", response_model=ProductOut, dependencies=[Depends(planner)])
def create_product(payload: ProductIn, db: Session = Depends(get_db)):
    if db.scalar(select(Product).where(Product.article_no == payload.article_no)):
        raise HTTPException(status_code=409, detail="Artikelnummer finns redan")
    p = Product(**payload.model_dump())
    db.add(p); db.commit(); db.refresh(p)
    return p


@router.post(
    "/products/{product_id}/routing",
    response_model=RoutingStepOut,
    dependencies=[Depends(planner)],
)
def add_routing_step(product_id: int, payload: RoutingStepIn, db: Session = Depends(get_db)):
    if not db.get(Product, product_id):
        raise HTTPException(status_code=404, detail="Produkt saknas")
    step = RoutingStep(product_id=product_id, **payload.model_dump())
    db.add(step); db.commit(); db.refresh(step)
    return step


# --- machine types ---
@router.get("/machine-types", response_model=list[MachineTypeOut])
def list_machine_types(db: Session = Depends(get_db)):
    return db.scalars(select(MachineType)).all()


@router.post("/machine-types", response_model=MachineTypeOut, dependencies=[Depends(planner)])
def create_machine_type(payload: MachineTypeIn, db: Session = Depends(get_db)):
    mt = MachineType(**payload.model_dump())
    db.add(mt); db.commit(); db.refresh(mt)
    return mt


# --- machines ---
@router.get("/machines", response_model=list[MachineOut])
def list_machines(db: Session = Depends(get_db)):
    return db.scalars(select(Machine)).all()


@router.post("/machines", response_model=MachineOut, dependencies=[Depends(planner)])
def create_machine(payload: MachineIn, db: Session = Depends(get_db)):
    m = Machine(**payload.model_dump())
    db.add(m); db.commit(); db.refresh(m)
    return m
