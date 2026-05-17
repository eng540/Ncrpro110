"""add_last_update_tracking

Revision ID: 002
Revises: 001
Create Date: 2026-05-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002'
down_revision = '001'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # إضافة حقل last_update لجدول boq_items
    op.add_column('boq_items', sa.Column('last_update', sa.DateTime(), nullable=True))
    
    # إضافة حقل last_update لجدول remarks
    op.add_column('remarks', sa.Column('last_update', sa.DateTime(), nullable=True))

def downgrade() -> None:
    # مسح الحقول في حالة التراجع (Rollback)
    op.drop_column('remarks', 'last_update')
    op.drop_column('boq_items', 'last_update')