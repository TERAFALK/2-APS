import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.api import auth, dashboard, masterdata, planning
from app.config import settings
from app.db import SessionLocal
from app.models import Role, User
from app.security import hash_password

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("aps")

app = FastAPI(title="Vänertekno APS", version="0.1.0", root_path="")

app.include_router(auth.router, prefix="/api")
app.include_router(masterdata.router, prefix="/api")
app.include_router(planning.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def seed_admin():
    """Skapa första admin-användaren om ingen finns."""
    db = SessionLocal()
    try:
        exists = db.scalar(select(User).limit(1))
        if not exists:
            db.add(
                User(
                    email=settings.first_admin_email,
                    full_name="Administratör",
                    role=Role.admin,
                    hashed_password=hash_password(settings.first_admin_password),
                )
            )
            db.commit()
            log.info("Skapade första admin: %s", settings.first_admin_email)
    finally:
        db.close()


# --- Realtidsuppdateringar (enkel broadcast; utökas med Redis pub/sub i Fas 2) ---
_clients: set[WebSocket] = set()


@app.websocket("/ws/updates")
async def ws_updates(ws: WebSocket):
    await ws.accept()
    _clients.add(ws)
    try:
        while True:
            await ws.receive_text()  # keepalive / ping
    except WebSocketDisconnect:
        _clients.discard(ws)


async def broadcast(message: dict):
    for ws in list(_clients):
        try:
            await ws.send_json(message)
        except Exception:
            _clients.discard(ws)
