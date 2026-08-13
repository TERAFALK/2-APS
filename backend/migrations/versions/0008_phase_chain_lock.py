"""chain lock per phase instead of per order

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-13
"""
import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    ocols = {c["name"] for c in insp.get_columns("operations")}
    if "chain_locked" not in ocols:
        op.add_column("operations", sa.Column("chain_locked", sa.Boolean(), nullable=False, server_default=sa.false()))

    pcols = {c["name"] for c in insp.get_columns("production_orders")}
    if "chain_locked" in pcols:
        op.drop_column("production_orders", "chain_locked")


def downgrade() -> None:
    op.add_column("production_orders", sa.Column("chain_locked", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.drop_column("operations", "chain_locked")
