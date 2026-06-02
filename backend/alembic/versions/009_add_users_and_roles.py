"""Add Users, Roles, and Audit Log tables

Revision ID: 009
Revises: 008
Create Date: 2026-06-02

AUTH-PATCH: إضافة جداول المصادقة والصلاحيات وسجل العمليات
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create roles table
    op.create_table(
        'roles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('permissions', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_roles_id'), 'roles', ['id'], unique=False)

    # 2. Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=50), nullable=False),
        sa.Column('email', sa.String(length=100), nullable=True),
        sa.Column('full_name', sa.String(length=100), nullable=True),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('role_id', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.Column('last_login', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username'),
        sa.UniqueConstraint('email'),
        sa.ForeignKeyConstraint(['role_id'], ['roles.id'])
    )
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # 3. Add assigned_engineer_id to latrines
    op.add_column('latrines', sa.Column('assigned_engineer_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_latrines_assigned_engineer', 'latrines', 'users', ['assigned_engineer_id'], ['id'])

    # 4. Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=True),
        sa.Column('entity_id', sa.Integer(), nullable=True),
        sa.Column('old_values', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('new_values', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'])
    )
    op.create_index(op.f('ix_audit_logs_id'), 'audit_logs', ['id'], unique=False)
    op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)
    op.create_index(op.f('ix_audit_logs_timestamp'), 'audit_logs', ['timestamp'], unique=False)

    # 5. Seed default roles
    op.execute("""
        INSERT INTO roles (name, permissions, description) VALUES
        ('admin', '["*"]', 'مدير المشروع - كل الصلاحيات'),
        ('engineer', '["latrines:read", "latrines:write", "boq_items:read", "boq_items:write", "remarks:read", "remarks:write", "daily_logs:read", "daily_logs:write"]', 'مهندس ميداني'),
        ('viewer', '["latrines:read", "boq_items:read", "remarks:read", "daily_logs:read", "reports:read"]', 'مشرف / مانح - قراءة فقط')
    """)

    # 6. Placeholder admin – real password will be set via environment variable
    #    This row will be replaced/updated by seed_default_admin() in lifespan
    op.execute("""
        INSERT INTO users (username, email, full_name, hashed_password, role_id, is_active, created_at)
        VALUES ('admin_placeholder', 'admin@nrc.org', 'Placeholder', '$2b$12$PLACEHOLDERx', 
                (SELECT id FROM roles WHERE name = 'admin'), false, NOW())
    """)


def downgrade() -> None:
    op.drop_index(op.f('ix_audit_logs_timestamp'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_user_id'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_id'), table_name='audit_logs')
    op.drop_table('audit_logs')

    op.drop_constraint('fk_latrines_assigned_engineer', 'latrines', type_='foreignkey')
    op.drop_column('latrines', 'assigned_engineer_id')

    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_table('users')

    op.drop_index(op.f('ix_roles_id'), table_name='roles')
    op.drop_table('roles')