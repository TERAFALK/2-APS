"""maintenance windows

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-08
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "maintenance_windows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("machine_id", sa.Integer(), sa.ForeignKey("machines.id"), nullable=False),
        sa.Column("start_time", sa.DateTime(), nullable=False),
        sa.Column("end_time", sa.DateTime(), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=False, server_default="Underhåll"),
    )


def downgrade() -> None:
    op.drop_table("maintenance_windows")
