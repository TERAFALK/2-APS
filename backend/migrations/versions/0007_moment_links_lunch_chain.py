"""machine<->moment types, lunch, operation moment type, order chain lock

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-13
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()

    if "machine_moment_types" not in tables:
        op.create_table(
            "machine_moment_types",
            sa.Column("machine_id", sa.Integer(), sa.ForeignKey("machines.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("moment_type_id", sa.Integer(), sa.ForeignKey("moment_types.id", ondelete="CASCADE"), primary_key=True),
        )

    mcols = {c["name"] for c in insp.get_columns("machines")}
    if "lunch_start" not in mcols:
        op.add_column("machines", sa.Column("lunch_start", sa.Time(), nullable=True))
    if "lunch_end" not in mcols:
        op.add_column("machines", sa.Column("lunch_end", sa.Time(), nullable=True))

    ocols = {c["name"] for c in insp.get_columns("operations")}
    if "moment_type_id" not in ocols:
        op.add_column("operations", sa.Column("moment_type_id", sa.Integer(), nullable=True))
        op.create_foreign_key("fk_operations_moment_type", "operations", "moment_types", ["moment_type_id"], ["id"])
    # koppla befintliga faser till momenttyp via namnet
    op.execute(
        "UPDATE operations o SET moment_type_id = mt.id FROM moment_types mt "
        "WHERE o.moment_type_id IS NULL AND o.name = mt.name"
    )

    pcols = {c["name"] for c in insp.get_columns("production_orders")}
    if "chain_locked" not in pcols:
        op.add_column("production_orders", sa.Column("chain_locked", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("production_orders", "chain_locked")
    op.drop_constraint("fk_operations_moment_type", "operations", type_="foreignkey")
    op.drop_column("operations", "moment_type_id")
    op.drop_column("machines", "lunch_end")
    op.drop_column("machines", "lunch_start")
    op.drop_table("machine_moment_types")
