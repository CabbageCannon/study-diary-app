"""Persist desktop-pet show commands and acknowledgements.

Revision ID: 20260804_01
Revises: 20260803_04
"""

from alembic import context, op
import sqlalchemy as sa


revision = "20260804_01"
down_revision = "20260803_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if not context.is_offline_mode() and sa.inspect(op.get_bind()).has_table("desktop_pet_control"):
        return
    op.create_table(
        "desktop_pet_control",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("show_request_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("show_acknowledged_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("show_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("desktop_last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("desktop_pet_control")
