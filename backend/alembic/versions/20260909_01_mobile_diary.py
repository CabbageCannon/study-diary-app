"""add mobile diary fields

Revision ID: 20260909_01
Revises: 20260908_02
Create Date: 2026-09-09
"""

from alembic import context, op
import sqlalchemy as sa


revision = "20260909_01"
down_revision = "20260908_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = None if context.is_offline_mode() else sa.inspect(op.get_bind())
    existing = set() if inspector is None else {column["name"] for column in inspector.get_columns("diaries")}
    columns = {
        "category": sa.Column("category", sa.String(length=20), nullable=False, server_default="learning"),
        "status": sa.Column("status", sa.String(length=20), nullable=False, server_default="published"),
        "images": sa.Column("images", sa.Text(), nullable=False, server_default="[]"),
        "weather": sa.Column("weather", sa.String(length=80), nullable=True),
        "location": sa.Column("location", sa.String(length=120), nullable=True),
        "is_pinned": sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
    }
    for name, column in columns.items():
        if name not in existing:
            op.add_column("diaries", column)
    if inspector is None or "ix_diaries_category" not in {index["name"] for index in inspector.get_indexes("diaries")}:
        op.create_index("ix_diaries_category", "diaries", ["category"])
    if inspector is None or "ix_diaries_status" not in {index["name"] for index in inspector.get_indexes("diaries")}:
        op.create_index("ix_diaries_status", "diaries", ["status"])
    if inspector is None or "ix_diaries_is_pinned" not in {index["name"] for index in inspector.get_indexes("diaries")}:
        op.create_index("ix_diaries_is_pinned", "diaries", ["is_pinned"])


def downgrade() -> None:
    op.drop_index("ix_diaries_is_pinned", table_name="diaries")
    op.drop_index("ix_diaries_status", table_name="diaries")
    op.drop_index("ix_diaries_category", table_name="diaries")
    for name in ("is_pinned", "location", "weather", "images", "status", "category"):
        op.drop_column("diaries", name)
