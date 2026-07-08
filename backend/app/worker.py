from celery import Celery

from app.config import settings
from app.db import SessionLocal
from app.services.scheduling import run_planning

celery_app = Celery("aps", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(task_serializer="json", result_serializer="json", accept_content=["json"])


@celery_app.task(name="aps.replan")
def replan_task(reason: str = "event", horizon_days: int = 30) -> dict:
    """Kör (om)planering i bakgrunden. Anropas vid manuell körning eller händelse
    (maskinhaveri, materialbrist, akutorder, ändrat leveransdatum)."""
    db = SessionLocal()
    try:
        version = run_planning(db, reason=reason, horizon_days=horizon_days)
        return {
            "version": version.version,
            "status": version.solver_status,
            "objective": version.objective_value,
        }
    finally:
        db.close()
