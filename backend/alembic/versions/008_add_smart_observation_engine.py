"""Add Smart Observation Engine (V3.0.0) - Production Safe

Revision ID: 008
Revises: 007
Create Date: 2026-05-23
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


# =========================
# Helpers (SAFE CHECKS)
# =========================
def table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    return table_name in inspector.get_table_names()


def column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    return column_name in [c["name"] for c in inspector.get_columns(table_name)]


def index_exists(index_name: str, table_name: str) -> bool:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    return any(ix["name"] == index_name for ix in inspector.get_indexes(table_name))


def constraint_exists(table_name: str, constraint_name: str) -> bool:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    return any(c["name"] == constraint_name for c in inspector.get_check_constraints(table_name))


# =========================
# UPGRADE
# =========================
def upgrade() -> None:

    # =========================
    # ENUM SAFE CREATE
    # =========================
    media_type_enum = postgresql.ENUM(
        'image', 'pdf', 'video',
        name='media_type_enum',
        create_type=False
    )
    media_type_enum.create(op.get_bind(), checkfirst=True)

    # =========================
    # TABLE: remark_templates
    # =========================
    if not table_exists("remark_templates"):
        op.create_table(
            'remark_templates',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('template_code', sa.String(20), nullable=False),
            sa.Column('title', sa.String(200), nullable=False),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('default_action', sa.Text(), nullable=True),
            sa.Column('default_severity', sa.String(20), nullable=True),
            sa.Column('boq_tags', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column('reference_media_url', sa.String(500), nullable=True),
            sa.Column('media_type', media_type_enum, nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=True),
            sa.Column('version', sa.Integer(), nullable=True),
            sa.Column('created_by', sa.String(100), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('archived_at', sa.DateTime(), nullable=True),
        )

    # =========================
    # INDEXES SAFE
    # =========================
    if not index_exists("ix_remark_templates_template_code", "remark_templates"):
        op.create_index(
            "ix_remark_templates_template_code",
            "remark_templates",
            ["template_code"],
            unique=True
        )

    if not index_exists("ix_remark_templates_created_by", "remark_templates"):
        op.create_index(
            "ix_remark_templates_created_by",
            "remark_templates",
            ["created_by"],
            unique=False
        )

    if not index_exists("ix_remark_templates_boq_tags", "remark_templates"):
        op.create_index(
            "ix_remark_templates_boq_tags",
            "remark_templates",
            ["boq_tags"],
            unique=False,
            postgresql_using="gin"
        )

    # =========================
    # ALTER TABLE remarks (SAFE)
    # =========================
    if not column_exists("remarks", "template_id"):
        op.add_column("remarks", sa.Column("template_id", sa.Integer(), nullable=True))

    if not column_exists("remarks", "suffix_note"):
        op.add_column("remarks", sa.Column("suffix_note", sa.Text(), nullable=True))

    if not column_exists("remarks", "evidence_photo_ref"):
        op.add_column("remarks", sa.Column("evidence_photo_ref", sa.String(100), nullable=True))

    # FK SAFE (Postgres doesn't support IF NOT EXISTS directly → try/ignore)
    try:
        op.create_foreign_key(
            "fk_remarks_template_id",
            "remarks",
            "remark_templates",
            ["template_id"],
            ["id"],
            ondelete="SET NULL"
        )
    except Exception:
        pass  # already exists

    # =========================
    # DATA CLEANUP SAFE
    # =========================
    op.execute("""
        UPDATE remarks
        SET description = 'ملاحظة قديمة غير موصوفة'
        WHERE description IS NULL AND template_id IS NULL
    """)

    # =========================
    # CHECK CONSTRAINT SAFE
    # =========================
    if not constraint_exists("remarks", "ck_remark_mode_strict"):
        op.create_check_constraint(
            "ck_remark_mode_strict",
            "remarks",
            "((template_id IS NULL AND description IS NOT NULL) OR (template_id IS NOT NULL AND description IS NULL))"
        )


# =========================
# DOWNGRADE (SAFE TOO)
# =========================
def downgrade() -> None:

    # constraint
    try:
        op.drop_constraint("ck_remark_mode_strict", "remarks", type_="check")
    except Exception:
        pass

    # FK
    try:
        op.drop_constraint("fk_remarks_template_id", "remarks", type_="foreignkey")
    except Exception:
        pass

    # columns safe drop
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    existing_cols = [c["name"] for c in inspector.get_columns("remarks")]

    if "evidence_photo_ref" in existing_cols:
        op.drop_column("remarks", "evidence_photo_ref")

    if "suffix_note" in existing_cols:
        op.drop_column("remarks", "suffix_note")

    if "template_id" in existing_cols:
        op.drop_column("remarks", "template_id")

    # table drop safe
    if table_exists("remark_templates"):
        op.drop_table("remark_templates")

    # enum safe drop
    media_type_enum = postgresql.ENUM(
        'image', 'pdf', 'video',
        name='media_type_enum',
        create_type=False
    )
    media_type_enum.drop(op.get_bind(), checkfirst=True)