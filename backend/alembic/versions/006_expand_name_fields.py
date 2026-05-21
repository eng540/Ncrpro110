# ==========================================
# backend/alembic/versions/006_expand_name_fields.py
# ==========================================

"""Expand beneficiary_hh and site_engineer to VARCHAR(100)

Revision ID: 006
Revises: 005
Create Date: 2026-05-21 13:55:00.000000

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    توسيع الحقول لاستيعاب الأسماء العربية الطويلة
    """

    # beneficiary_hh : 20 → 100
    op.alter_column(
        'latrines',
        'beneficiary_hh',
        existing_type=sa.VARCHAR(length=20),
        type_=sa.VARCHAR(length=100),
        existing_nullable=True
    )

    # site_engineer : 50 → 100
    op.alter_column(
        'latrines',
        'site_engineer',
        existing_type=sa.VARCHAR(length=50),
        type_=sa.VARCHAR(length=100),
        existing_nullable=True
    )


def downgrade() -> None:
    """
    الرجوع للأحجام السابقة إذا لزم الأمر
    """

    # beneficiary_hh : 100 → 20
    op.alter_column(
        'latrines',
        'beneficiary_hh',
        existing_type=sa.VARCHAR(length=100),
        type_=sa.VARCHAR(length=20),
        existing_nullable=True
    )

    # site_engineer : 100 → 50
    op.alter_column(
        'latrines',
        'site_engineer',
        existing_type=sa.VARCHAR(length=100),
        type_=sa.VARCHAR(length=50),
        existing_nullable=True
    )