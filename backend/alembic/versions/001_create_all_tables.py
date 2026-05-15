"""Initial migration - Create all tables for NRC Latrine Tracker

Revision ID: 001
Revises: 
Create Date: 2026-05-15 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create ENUM types first (PostgreSQL native)
    latrine_status = postgresql.ENUM('not_started', 'in_progress', 'completed', 'on_hold', 'rejected', name='latrine_status', create_type=True)
    latrine_status.create(op.get_bind(), checkfirst=True)

    boq_status = postgresql.ENUM('not_started', 'in_progress', 'completed', 'pending_inspection', 'accepted', 'rejected', 'rework_required', name='boq_status', create_type=True)
    boq_status.create(op.get_bind(), checkfirst=True)

    quality_pass = postgresql.ENUM('pass', 'fail', 'pending', name='quality_pass', create_type=True)
    quality_pass.create(op.get_bind(), checkfirst=True)

    remark_severity = postgresql.ENUM('minor', 'major', 'critical', name='remark_severity', create_type=True)
    remark_severity.create(op.get_bind(), checkfirst=True)

    remark_status = postgresql.ENUM('open', 'closed', 'overdue', name='remark_status', create_type=True)
    remark_status.create(op.get_bind(), checkfirst=True)

    # 1. Create latrines table (Master Registry)
    op.create_table(
        'latrines',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('latrine_id', sa.String(length=20), nullable=False),
        sa.Column('block_no', sa.String(length=10), nullable=True),
        sa.Column('gps_coordinates', sa.String(length=50), nullable=True),
        sa.Column('beneficiary_hh', sa.String(length=20), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('overall_pct', sa.Float(), nullable=True),
        sa.Column('start_date', sa.DateTime(), nullable=True),
        sa.Column('expected_completion', sa.DateTime(), nullable=True),
        sa.Column('site_engineer', sa.String(length=50), nullable=True),
        sa.Column('last_update', sa.DateTime(), nullable=True),
        sa.Column('remarks_count', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('latrine_id')
    )
    op.create_index(op.f('ix_latrines_id'), 'latrines', ['id'], unique=False)
    op.create_index(op.f('ix_latrines_latrine_id'), 'latrines', ['latrine_id'], unique=True)
    op.create_index(op.f('ix_latrines_status'), 'latrines', ['status'], unique=False)

    # 2. Create boq_items table
    op.create_table(
        'boq_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('latrine_id', sa.Integer(), nullable=False),
        sa.Column('boq_code', sa.String(length=10), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=True),
        sa.Column('description_ar', sa.Text(), nullable=True),
        sa.Column('description_en', sa.Text(), nullable=True),
        sa.Column('unit', sa.String(length=10), nullable=True),
        sa.Column('planned_qty', sa.Float(), nullable=True),
        sa.Column('achieved_qty', sa.Float(), nullable=True),
        sa.Column('achievement_pct', sa.Float(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('inspection_date', sa.DateTime(), nullable=True),
        sa.Column('inspector', sa.String(length=50), nullable=True),
        sa.Column('quality_pass', sa.String(length=10), nullable=True),
        sa.ForeignKeyConstraint(['latrine_id'], ['latrines.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_boq_items_id'), 'boq_items', ['id'], unique=False)
    op.create_index(op.f('ix_boq_items_latrine_id'), 'boq_items', ['latrine_id'], unique=False)

    # 3. Create remarks table
    op.create_table(
        'remarks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('remark_id', sa.String(length=20), nullable=True),
        sa.Column('latrine_id', sa.Integer(), nullable=False),
        sa.Column('boq_code', sa.String(length=10), nullable=True),
        sa.Column('date_logged', sa.DateTime(), nullable=True),
        sa.Column('type', sa.String(length=50), nullable=True),
        sa.Column('severity', sa.String(length=20), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('action_required', sa.Text(), nullable=True),
        sa.Column('deadline', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('closed_date', sa.DateTime(), nullable=True),
        sa.Column('photo_ref', sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(['latrine_id'], ['latrines.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('remark_id')
    )
    op.create_index(op.f('ix_remarks_id'), 'remarks', ['id'], unique=False)
    op.create_index(op.f('ix_remarks_latrine_id'), 'remarks', ['latrine_id'], unique=False)
    op.create_index(op.f('ix_remarks_status'), 'remarks', ['status'], unique=False)

    # 4. Create daily_logs table
    op.create_table(
        'daily_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('date', sa.DateTime(), nullable=True),
        sa.Column('engineer', sa.String(length=50), nullable=True),
        sa.Column('latrines_inspected', sa.Integer(), nullable=True),
        sa.Column('latrines_accepted', sa.Integer(), nullable=True),
        sa.Column('remarks_issued', sa.Integer(), nullable=True),
        sa.Column('weather', sa.String(length=20), nullable=True),
        sa.Column('manpower', sa.Integer(), nullable=True),
        sa.Column('equipment', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_daily_logs_id'), 'daily_logs', ['id'], unique=False)


def downgrade() -> None:
    # Drop in reverse order (respect foreign keys)
    op.drop_index(op.f('ix_daily_logs_id'), table_name='daily_logs')
    op.drop_table('daily_logs')

    op.drop_index(op.f('ix_remarks_status'), table_name='remarks')
    op.drop_index(op.f('ix_remarks_latrine_id'), table_name='remarks')
    op.drop_index(op.f('ix_remarks_id'), table_name='remarks')
    op.drop_table('remarks')

    op.drop_index(op.f('ix_boq_items_latrine_id'), table_name='boq_items')
    op.drop_index(op.f('ix_boq_items_id'), table_name='boq_items')
    op.drop_table('boq_items')

    op.drop_index(op.f('ix_latrines_status'), table_name='latrines')
    op.drop_index(op.f('ix_latrines_latrine_id'), table_name='latrines')
    op.drop_index(op.f('ix_latrines_id'), table_name='latrines')
    op.drop_table('latrines')

    # Drop ENUM types
    postgresql.ENUM(name='remark_status').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='remark_severity').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='quality_pass').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='boq_status').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='latrine_status').drop(op.get_bind(), checkfirst=True)
