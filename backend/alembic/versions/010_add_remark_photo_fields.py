"""Add before_photo_ref and after_photo_ref to remarks

Revision ID: 010
Revises: 009
Create Date: 2026-06-03 15:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.add_column('remarks', sa.Column('before_photo_ref', sa.String(200), nullable=True))
    op.add_column('remarks', sa.Column('after_photo_ref', sa.String(200), nullable=True))

def downgrade():
    op.drop_column('remarks', 'after_photo_ref')
    op.drop_column('remarks', 'before_photo_ref')