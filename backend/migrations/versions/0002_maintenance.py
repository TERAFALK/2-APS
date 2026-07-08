"""maintenance windows

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-08

OBS: 0001 kör create_all på hela modellen, vilket redan skapar denna tabell om modellen
fanns vid den körningen. Därför är denna migration idempotent — den skapar tabellen bara
om den saknas.
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "maintenance_windows" in sa.inspect(bind).get_table_names():
        return
    op.create_table(
        "maintenance_windows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("machine_id", sa.Integer(), sa.ForeignKey("machines.id"), nullable=False),
        sa.Column("start_time", sa.DateTime(), nullable=False),
        sa.Column("end_time", sa.DateTime(), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=False, server_default="Underhåll"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    if "maintenance_windows" in sa.inspect(bind).get_table_names():
        op.drop_table("maintenance_windows")
