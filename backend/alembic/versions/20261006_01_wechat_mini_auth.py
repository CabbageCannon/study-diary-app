"""Add WeChat Mini Program identity links.

Revision ID: 20261006_01
Revises: 20260924_01
"""

from alembic import op
import sqlalchemy as sa


revision = "20261006_01"
down_revision = "20260924_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "wechat_mini_identities" in inspector.get_table_names():
        return
    op.create_table(
        "wechat_mini_identities",
        sa.Column("openid", sa.String(128), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=False, unique=True),
        sa.Column("unionid", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_wechat_mini_identities_user_id", "wechat_mini_identities", ["user_id"])
    op.create_index("ix_wechat_mini_identities_unionid", "wechat_mini_identities", ["unionid"])


def downgrade() -> None:
    op.drop_table("wechat_mini_identities")
