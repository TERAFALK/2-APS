"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-07-08

Skapar hela kärnschemat från SQLAlchemy-modellerna. Efterföljande ändringar sker
med autogenererade, versionerade migrationer.
"""
from alembic import op

from app.db import Base
import app.models  # noqa: F401

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
