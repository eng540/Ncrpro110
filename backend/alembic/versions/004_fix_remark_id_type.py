"""Fix remark_id type to UUID-compatible length

Revision ID: 004
Revises: 003
Create Date: 2026-05-19 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ترقية remark_id من 20 إلى 36 لدعم UUID
    op.alter_column(
        'remarks',
        'remark_id',
        type_=sa.String(36),
        existing_type=sa.String(20),
        existing_nullable=True
    )


def downgrade() -> None:
    # الرجوع إلى الحالة السابقة (إن لزم)
    op.alter_column(
        'remarks',
        'remark_id',
        type_=sa.String(20),
        existing_type=sa.String(36),
        existing_nullable=True
    )