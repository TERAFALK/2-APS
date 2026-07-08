"""operation overtime flag

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-08
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("operations")}
    if "overtime" not in cols:
        op.add_column("operations", sa.Column("overtime", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("operations", "overtime")
