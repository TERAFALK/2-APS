"""operation machine_type_id

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-08
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = [c["name"] for c in sa.inspect(bind).get_columns("operations")]
    if "machine_type_id" not in cols:
        op.add_column("operations", sa.Column("machine_type_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_operations_machine_type", "operations", "machine_types",
            ["machine_type_id"], ["id"],
        )
    # backfilla från routing-steget
    op.execute(
        "UPDATE operations o SET machine_type_id = r.machine_type_id "
        "FROM routing_steps r WHERE o.routing_step_id = r.id AND o.machine_type_id IS NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_operations_machine_type", "operations", type_="foreignkey")
    op.drop_column("operations", "machine_type_id")
