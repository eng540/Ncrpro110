"""Add BoQ Dictionary table for dynamic SaaS platform

Revision ID: 005
Revises: 004
Create Date: 2026-05-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # إنشاء جدول قاموس البنود الديناميكي
    op.create_table(
        'boq_dictionary',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('boq_code', sa.String(length=10), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=True),
        sa.Column('description_ar', sa.Text(), nullable=True),
        sa.Column('description_en', sa.Text(), nullable=True),
        sa.Column('unit', sa.String(length=10), nullable=True),
        sa.Column('default_qty', sa.Float(), nullable=True),
        sa.Column('unit_price', sa.Float(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('boq_code')
    )
    op.create_index(op.f('ix_boq_dictionary_id'), 'boq_dictionary', ['id'], unique=False)
    op.create_index(op.f('ix_boq_dictionary_boq_code'), 'boq_dictionary', ['boq_code'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_boq_dictionary_boq_code'), table_name='boq_dictionary')
    op.drop_index(op.f('ix_boq_dictionary_id'), table_name='boq_dictionary')
    op.drop_table('boq_dictionary')
