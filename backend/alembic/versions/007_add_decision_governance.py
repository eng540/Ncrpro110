"""Add Decision Governance Layer

Revision ID: 007
Revises: 006
Create Date: 2026-05-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. إنشاء جدول سياسات المشروع
    op.create_table(
        'policy_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=True),
        sa.Column('rules_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_policy_profiles_id'), 'policy_profiles', ['id'], unique=False)

    # 2. إضافة حقل policy_id لجدول الحمامات
    op.add_column('latrines', sa.Column('policy_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_latrines_policy_id', 'latrines', 'policy_profiles', ['policy_id'], ['id'])

    # 3. إنشاء جدول سجل القرارات
    op.create_table(
        'decision_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('boq_item_id', sa.Integer(), nullable=False),
        sa.Column('execution_pct', sa.Float(), nullable=True),
        sa.Column('quality_status', sa.String(length=20), nullable=True),
        sa.Column('highest_remark_severity', sa.String(length=20), nullable=True),
        sa.Column('system_recommendation_code', sa.String(length=50), nullable=True),
        sa.Column('system_recommendation_note', sa.Text(), nullable=True),
        sa.Column('system_payment_pct', sa.Float(), nullable=True),
        sa.Column('human_decision_code', sa.String(length=50), nullable=True),
        sa.Column('human_payment_pct', sa.Float(), nullable=True),
        sa.Column('override_reason', sa.Text(), nullable=True),
        sa.Column('approved_by', sa.String(length=100), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('final_state', sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(['boq_item_id'], ['boq_items.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('boq_item_id')
    )
    op.create_index(op.f('ix_decision_records_id'), 'decision_records', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_decision_records_id'), table_name='decision_records')
    op.drop_table('decision_records')
    
    op.drop_constraint('fk_latrines_policy_id', 'latrines', type_='foreignkey')
    op.drop_column('latrines', 'policy_id')
    
    op.drop_index(op.f('ix_policy_profiles_id'), table_name='policy_profiles')
    op.drop_table('policy_profiles')