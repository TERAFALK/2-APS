"""customer fields, order priority as text, delayed op status

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-08
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    ccols = {c["name"] for c in insp.get_columns("customers")}
    for col in ("org_no", "customer_no", "address", "notes"):
        if col not in ccols:
            op.add_column("customers", sa.Column(col, sa.String(255), nullable=False, server_default=""))

    pcol = {c["name"]: c for c in insp.get_columns("production_orders")}["priority"]
    if "INT" in str(pcol["type"]).upper():
        op.alter_column(
            "production_orders", "priority",
            type_=sa.String(16), server_default="medium",
            postgresql_using="'medium'",
        )

    # lägg till 'delayed' i operationstatus-enumen om den saknas
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE operationstatus ADD VALUE IF NOT EXISTS 'delayed'")


def downgrade() -> None:
    for col in ("org_no", "customer_no", "address", "notes"):
        op.drop_column("customers", col)
