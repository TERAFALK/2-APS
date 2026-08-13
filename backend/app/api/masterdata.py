"""CRUD för grunddata: kunder, produkter (+routing), maskintyper, maskiner."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Customer, Machine, MachineType, MomentType, Operation, Product, Role, RoutingStep,
)
from app.schemas import (
    CustomerIn, CustomerOut, MachineIn, MachineOut, MachineTypeIn, MachineTypeOut,
    MomentTypeIn, MomentTypeOut, ProductIn, ProductOut, RoutingStepIn, RoutingStepOut,
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
def _apply_machine(db: Session, m: Machine, payload: MachineIn) -> None:
    data = payload.model_dump()
    ids = data.pop("moment_type_ids", []) or []
    for k, v in data.items():
        setattr(m, k, v)
    m.moment_types = list(db.scalars(select(MomentType).where(MomentType.id.in_(ids))).all()) if ids else []


@router.get("/machines", response_model=list[MachineOut])
def list_machines(db: Session = Depends(get_db)):
    return db.scalars(select(Machine).order_by(Machine.name)).all()


@router.post("/machines", response_model=MachineOut, dependencies=[Depends(planner)])
def create_machine(payload: MachineIn, db: Session = Depends(get_db)):
    m = Machine(name=payload.name)
    _apply_machine(db, m, payload)
    db.add(m); db.commit(); db.refresh(m)
    return m


# ---------------------------------------------------------------- moment types
@router.get("/moment-types", response_model=list[MomentTypeOut])
def list_moment_types(db: Session = Depends(get_db)):
    return db.scalars(select(MomentType).order_by(MomentType.name)).all()


@router.post("/moment-types", response_model=MomentTypeOut, dependencies=[Depends(planner)])
def create_moment_type(payload: MomentTypeIn, db: Session = Depends(get_db)):
    if db.scalar(select(MomentType).where(MomentType.name == payload.name)):
        raise HTTPException(status_code=409, detail="Momenttypen finns redan")
    mt = MomentType(name=payload.name)
    db.add(mt); db.commit(); db.refresh(mt)
    return mt


# ---------------------------------------------------------------- edit / delete
def _get_or_404(db: Session, model, id_: int, label: str):
    obj = db.get(model, id_)
    if not obj:
        raise HTTPException(status_code=404, detail=f"{label} saknas")
    return obj


def _delete(db: Session, obj):
    try:
        db.delete(obj); db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Objektet används och kan inte tas bort")


# customers
@router.put("/customers/{cid}", response_model=CustomerOut, dependencies=[Depends(planner)])
def update_customer(cid: int, payload: CustomerIn, db: Session = Depends(get_db)):
    c = _get_or_404(db, Customer, cid, "Kund")
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    db.commit(); db.refresh(c)
    return c


@router.delete("/customers/{cid}", status_code=204, dependencies=[Depends(planner)])
def delete_customer(cid: int, db: Session = Depends(get_db)):
    _delete(db, _get_or_404(db, Customer, cid, "Kund"))


# moment types
@router.put("/moment-types/{tid}", response_model=MomentTypeOut, dependencies=[Depends(planner)])
def update_moment_type(tid: int, payload: MomentTypeIn, db: Session = Depends(get_db)):
    mt = _get_or_404(db, MomentType, tid, "Momenttyp")
    mt.name = payload.name
    db.commit(); db.refresh(mt)
    return mt


@router.delete("/moment-types/{tid}", status_code=204, dependencies=[Depends(planner)])
def delete_moment_type(tid: int, db: Session = Depends(get_db)):
    _delete(db, _get_or_404(db, MomentType, tid, "Momenttyp"))


# machine types
@router.put("/machine-types/{tid}", response_model=MachineTypeOut, dependencies=[Depends(planner)])
def update_machine_type(tid: int, payload: MachineTypeIn, db: Session = Depends(get_db)):
    mt = _get_or_404(db, MachineType, tid, "Maskintyp")
    mt.name = payload.name
    db.commit(); db.refresh(mt)
    return mt


@router.delete("/machine-types/{tid}", status_code=204, dependencies=[Depends(planner)])
def delete_machine_type(tid: int, db: Session = Depends(get_db)):
    _delete(db, _get_or_404(db, MachineType, tid, "Maskintyp"))


# machines
@router.put("/machines/{mid}", response_model=MachineOut, dependencies=[Depends(planner)])
def update_machine(mid: int, payload: MachineIn, db: Session = Depends(get_db)):
    m = _get_or_404(db, Machine, mid, "Maskin")
    _apply_machine(db, m, payload)
    db.commit(); db.refresh(m)
    return m


@router.delete("/machines/{mid}", status_code=204, dependencies=[Depends(planner)])
def delete_machine(mid: int, db: Session = Depends(get_db)):
    m = _get_or_404(db, Machine, mid, "Maskin")
    # lägg tillbaka ev. schemalagda moment i backloggen så FK inte blockerar
    for op in db.scalars(select(Operation).where(Operation.machine_id == mid)).all():
        op.machine_id = None
        op.start_time = None
        op.end_time = None
    db.flush()
    _delete(db, m)


# products
@router.put("/products/{pid}", response_model=ProductOut, dependencies=[Depends(planner)])
def update_product(pid: int, payload: ProductIn, db: Session = Depends(get_db)):
    p = _get_or_404(db, Product, pid, "Produkt")
    dup = db.scalar(select(Product).where(Product.article_no == payload.article_no, Product.id != pid))
    if dup:
        raise HTTPException(status_code=409, detail="Artikelnummer finns redan")
    for k, v in payload.model_dump().items():
        setattr(p, k, v)
    db.commit(); db.refresh(p)
    return p


@router.delete("/products/{pid}", status_code=204, dependencies=[Depends(planner)])
def delete_product(pid: int, db: Session = Depends(get_db)):
    _delete(db, _get_or_404(db, Product, pid, "Produkt"))


# routing steps
@router.put("/products/{pid}/routing/{sid}", response_model=RoutingStepOut, dependencies=[Depends(planner)])
def update_routing_step(pid: int, sid: int, payload: RoutingStepIn, db: Session = Depends(get_db)):
    step = _get_or_404(db, RoutingStep, sid, "Operation")
    if step.product_id != pid:
        raise HTTPException(status_code=404, detail="Operation saknas")
    for k, v in payload.model_dump().items():
        setattr(step, k, v)
    db.commit(); db.refresh(step)
    return step


@router.delete("/products/{pid}/routing/{sid}", status_code=204, dependencies=[Depends(planner)])
def delete_routing_step(pid: int, sid: int, db: Session = Depends(get_db)):
    step = _get_or_404(db, RoutingStep, sid, "Operation")
    _delete(db, step)
