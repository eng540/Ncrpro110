"""Add remark_id index for local_uuid tracking

Revision ID: 003
Revises: 002
Create Date: 2026-05-18 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # إضافة فهرس على remark_id للبحث السريع بـ local_uuid
    op.create_index(op.f('ix_remarks_remark_id'), 'remarks', ['remark_id'], unique=False)
    
    # إضافة عمود last_update لـ daily_logs إذا لم يكن موجوداً
    op.add_column('daily_logs', sa.Column('last_update', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_index(op.f('ix_remarks_remark_id'), table_name='remarks')
    op.drop_column('daily_logs', 'last_update')