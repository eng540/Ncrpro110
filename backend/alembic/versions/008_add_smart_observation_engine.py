"""Add Smart Observation Engine (V3.0.0)

Revision ID: 008
Revises: 007
Create Date: 2026-05-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 🌟 التصحيح 1: تعريف الـ Enum مرة واحدة وإنشاؤه بأمان
    media_type_enum = postgresql.ENUM('image', 'pdf', 'video', name='media_type_enum', create_type=False)
    media_type_enum.create(op.get_bind(), checkfirst=True)

    # 1. إنشاء جدول مكتبة القوالب (Remark Templates)
    op.create_table(
        'remark_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('template_code', sa.String(length=20), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('default_action', sa.Text(), nullable=True),
        sa.Column('default_severity', sa.String(length=20), nullable=True),
        sa.Column('boq_tags', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('reference_media_url', sa.String(length=500), nullable=True),
        sa.Column('media_type', media_type_enum, nullable=True), # 🌟 استخدام الـ Enum المعرف أعلاه
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('version', sa.Integer(), nullable=True),
        sa.Column('created_by', sa.String(length=100), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('archived_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_remark_templates_created_by'), 'remark_templates', ['created_by'], unique=False)
    op.create_index(op.f('ix_remark_templates_id'), 'remark_templates', ['id'], unique=False)
    op.create_index(op.f('ix_remark_templates_template_code'), 'remark_templates', ['template_code'], unique=True)
    
    # 🌟 التصحيح 2: إضافة GIN Index بشكل صحيح لـ JSONB
    op.create_index('ix_remark_templates_boq_tags', 'remark_templates', ['boq_tags'], unique=False, postgresql_using='gin')

    # 2. تعديل جدول الملاحظات الحالي (Remarks)
    op.add_column('remarks', sa.Column('template_id', sa.Integer(), nullable=True))
    op.add_column('remarks', sa.Column('suffix_note', sa.Text(), nullable=True))
    op.add_column('remarks', sa.Column('evidence_photo_ref', sa.String(length=100), nullable=True))
    
    op.create_foreign_key('fk_remarks_template_id', 'remarks', 'remark_templates', ['template_id'], ['id'], ondelete='SET NULL')
    
    # 🌟 التصحيح 3: تنظيف البيانات القديمة قبل تطبيق القيد الصارم (Data Sanitization)
    # هذا يضمن أن أي ملاحظة قديمة ليس لها وصف ستأخذ نصاً افتراضياً بدلاً من التسبب في انهيار الهجرة
    op.execute("""
        UPDATE remarks 
        SET description = 'ملاحظة قديمة غير موصوفة' 
        WHERE description IS NULL AND template_id IS NULL
    """)

    # تطبيق القيد الصارم
    op.create_check_constraint(
        'ck_remark_mode_strict',
        'remarks',
        "((template_id IS NULL) AND (description IS NOT NULL)) OR ((template_id IS NOT NULL) AND (description IS NULL))"
    )


def downgrade() -> None:
    # 1. إزالة القيود والحقول من جدول الملاحظات
    op.drop_constraint('ck_remark_mode_strict', 'remarks', type_='check')
    op.drop_constraint('fk_remarks_template_id', 'remarks', type_='foreignkey')
    op.drop_column('remarks', 'evidence_photo_ref')
    op.drop_column('remarks', 'suffix_note')
    op.drop_column('remarks', 'template_id')

    # 2. حذف جدول القوالب
    op.drop_index('ix_remark_templates_boq_tags', table_name='remark_templates', postgresql_using='gin')
    op.drop_index(op.f('ix_remark_templates_template_code'), table_name='remark_templates')
    op.drop_index(op.f('ix_remark_templates_id'), table_name='remark_templates')
    op.drop_index(op.f('ix_remark_templates_created_by'), table_name='remark_templates')
    op.drop_table('remark_templates')

    # 🌟 التصحيح 4: حذف الـ Enum بأمان
    media_type_enum = postgresql.ENUM('image', 'pdf', 'video', name='media_type_enum', create_type=False)
    media_type_enum.drop(op.get_bind(), checkfirst=True)