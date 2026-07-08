"""pivot to order phases: moment types, nullable product/routing/machine-type

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-08
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def _cols(bind, table):
    return {c["name"]: c for c in sa.inspect(bind).get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if "moment_types" not in tables:
        op.create_table(
            "moment_types",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(length=128), nullable=False, unique=True),
        )

    # gör kopplingar till artiklar/routing/maskintyp valfria (workflow bygger nu på faser)
    if _cols(bind, "production_orders")["product_id"]["nullable"] is False:
        op.alter_column("production_orders", "product_id", existing_type=sa.Integer(), nullable=True)
    if _cols(bind, "operations")["routing_step_id"]["nullable"] is False:
        op.alter_column("operations", "routing_step_id", existing_type=sa.Integer(), nullable=True)
    if _cols(bind, "machines")["machine_type_id"]["nullable"] is False:
        op.alter_column("machines", "machine_type_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.drop_table("moment_types")
