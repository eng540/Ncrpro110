from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from io import BytesIO
from sqlalchemy.orm import Session
from app import models
from datetime import datetime
from typing import Optional

def reshape_arabic(text: str) -> str:
    """إعادة تشكيل النص العربي للعرض الصحيح في PDF"""
    if not text:
        return ""
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
        reshaped = arabic_reshaper.reshape(str(text))
        return get_display(reshaped)
    except ImportError:
        # إذا لم تكن المكتبات مثبتة، أعد النص كما هو
        return str(text)

def generate_summary_pdf(db: Session, from_date: datetime = None, to_date: datetime = None) -> bytes:
    """تقرير ملخص تنفيذي PDF"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4, 
        rightMargin=2*cm, 
        leftMargin=2*cm, 
        topMargin=2*cm, 
        bottomMargin=2*cm
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # إنشاء أنماط مخصصة
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        alignment=1,
        fontSize=20,
        textColor=colors.HexColor('#1F4E78'),
        spaceAfter=20,
        fontName='Helvetica-Bold'
    )
    
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        alignment=1,
        fontSize=12,
        textColor=colors.HexColor('#7f8c8d'),
        spaceAfter=30
    )
    
    section_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#2c3e50'),
        spaceAfter=10,
        spaceBefore=15,
        fontName='Helvetica-Bold'
    )
    
    # العنوان الرئيسي
    elements.append(Paragraph("NRC Latrine Tracker", title_style))
    elements.append(Paragraph("ECHO 2525 - Al-Zohra District, Hodeidah", subtitle_style))
    elements.append(Paragraph(f"Report Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", subtitle_style))
    elements.append(Spacer(1, 20))
    
    # جلب الإحصائيات
    total = db.query(models.Latrine).count()
    completed = db.query(models.Latrine).filter(models.Latrine.status == 'completed').count()
    in_progress = db.query(models.Latrine).filter(models.Latrine.status == 'in_progress').count()
    not_started = db.query(models.Latrine).filter(models.Latrine.status == 'not_started').count()
    on_hold = db.query(models.Latrine).filter(models.Latrine.status == 'on_hold').count()
    
    accepted_items = db.query(models.BoqItem).filter(models.BoqItem.quality_pass == 'pass').count()
    rejected_items = db.query(models.BoqItem).filter(models.BoqItem.quality_pass == 'fail').count()
    pending_items = db.query(models.BoqItem).filter(models.BoqItem.quality_pass == 'pending').count()
    
    open_remarks = db.query(models.Remark).filter(models.Remark.status == 'open').count()
    closed_remarks = db.query(models.Remark).filter(models.Remark.status == 'closed').count()
    
    # حساب نسبة الإنجاز
    avg_progress = 0
    if total > 0:
        from sqlalchemy import func
        avg_result = db.query(func.avg(models.Latrine.overall_pct)).scalar()
        avg_progress = round(float(avg_result or 0), 2)
    
    # جدول الملخص التنفيذي
    elements.append(Paragraph("Executive Summary", section_style))
    
    summary_data = [
        ['Indicator', 'Value', 'Status'],
        ['Total Latrines', str(total), ''],
        ['Completed', str(completed), f'{round(completed/total*100,1)}%' if total else '0%'],
        ['In Progress', str(in_progress), f'{round(in_progress/total*100,1)}%' if total else '0%'],
        ['Not Started', str(not_started), f'{round(not_started/total*100,1)}%' if total else '0%'],
        ['On Hold', str(on_hold), f'{round(on_hold/total*100,1)}%' if total else '0%'],
        ['Overall Progress', f'{avg_progress}%', ''],
    ]
    
    summary_table = Table(summary_data, colWidths=[6*cm, 4*cm, 4*cm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E78')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f8f9fa')),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 11),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # جدول الجودة
    elements.append(Paragraph("Quality Control Summary", section_style))
    
    quality_data = [
        ['Quality Status', 'Count', 'Percentage'],
        ['Accepted (Pass)', str(accepted_items), f'{round(accepted_items/(accepted_items+rejected_items+pending_items)*100,1)}%' if (accepted_items+rejected_items+pending_items) > 0 else '0%'],
        ['Rejected (Fail)', str(rejected_items), f'{round(rejected_items/(accepted_items+rejected_items+pending_items)*100,1)}%' if (accepted_items+rejected_items+pending_items) > 0 else '0%'],
        ['Pending Inspection', str(pending_items), f'{round(pending_items/(accepted_items+rejected_items+pending_items)*100,1)}%' if (accepted_items+rejected_items+pending_items) > 0 else '0%'],
    ]
    
    quality_table = Table(quality_data, colWidths=[6*cm, 4*cm, 4*cm])
    quality_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#27ae60')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 11),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(quality_table)
    elements.append(Spacer(1, 20))
    
    # جدول الملاحظات
    elements.append(Paragraph("Remarks Summary", section_style))
    
    remarks_data = [
        ['Status', 'Count'],
        ['Open', str(open_remarks)],
        ['Closed', str(closed_remarks)],
        ['Total', str(open_remarks + closed_remarks)],
    ]
    
    remarks_table = Table(remarks_data, colWidths=[7*cm, 7*cm])
    remarks_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e74c3c')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 11),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    elements.append(remarks_table)
    
    # تذييل
    elements.append(Spacer(1, 40))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        alignment=1,
        fontSize=9,
        textColor=colors.HexColor('#95a5a6')
    )
    elements.append(Paragraph("NRC WASH & Shelter Department - Internal Use Only", footer_style))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()

def generate_ipc_excel(db: Session) -> bytes:
    """شهادة دفع مؤقتة Excel"""
    buffer = BytesIO()
    wb = Workbook()
    ws = wb.active
    ws.title = "IPC - Interim Payment"
    ws.sheet_view.rightToLeft = True
    
    # العنوان الرئيسي
    ws['A1'] = "NRC Latrine Tracker - ECHO 2525"
    ws['A1'].font = Font(size=16, bold=True, color="1F4E78")
    ws.merge_cells('A1:H1')
    ws['A1'].alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[1].height = 30
    
    ws['A2'] = "Interim Payment Certificate (IPC)"
    ws['A2'].font = Font(size=14, bold=True, color="27ae60")
    ws.merge_cells('A2:H2')
    ws['A2'].alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[2].height = 25
    
    ws['A3'] = f"Date: {datetime.now().strftime('%Y-%m-%d')}"
    ws['A3'].font = Font(size=11, italic=True)
    ws.merge_cells('A3:H3')
    ws['A3'].alignment = Alignment(horizontal='center')
    
    # الرأس
    headers = ['BoQ Code', 'Category', 'Description (AR)', 'Description (EN)', 'Unit', 'Planned Qty', 'Achieved Qty', 'Achievement %']
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=5, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF", size=11)
        cell.fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )
    
    ws.row_dimensions[5].height = 30
    
    # البيانات
    items = db.query(models.BoqItem).join(models.Latrine).all()
    row = 6
    
    # تجميع حسب الفئة
    categories = {}
    for item in items:
        cat = item.category or 'Uncategorized'
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(item)
    
    for category, cat_items in sorted(categories.items()):
        # صف الفئة
        cat_cell = ws.cell(row=row, column=1, value=category)
        cat_cell.font = Font(bold=True, size=12, color="FFFFFF")
        cat_cell.fill = PatternFill(start_color="3498db", end_color="3498db", fill_type="solid")
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=8)
        cat_cell.alignment = Alignment(horizontal='center', vertical='center')
        ws.row_dimensions[row].height = 25
        row += 1
        
        for item in cat_items:
            ws.cell(row=row, column=1, value=item.boq_code).alignment = Alignment(horizontal='center')
            ws.cell(row=row, column=2, value=item.category).alignment = Alignment(horizontal='center')
            ws.cell(row=row, column=3, value=item.description_ar).alignment = Alignment(horizontal='right', wrap_text=True)
            ws.cell(row=row, column=4, value=item.description_en).alignment = Alignment(horizontal='left', wrap_text=True)
            ws.cell(row=row, column=5, value=item.unit).alignment = Alignment(horizontal='center')
            ws.cell(row=row, column=6, value=item.planned_qty).alignment = Alignment(horizontal='center')
            ws.cell(row=row, column=7, value=item.achieved_qty).alignment = Alignment(horizontal='center')
            
            pct_cell = ws.cell(row=row, column=8, value=f"{item.achievement_pct}%")
            pct_cell.alignment = Alignment(horizontal='center')
            
            # تلوين حسب النسبة
            if item.achievement_pct >= 100:
                pct_cell.fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
                pct_cell.font = Font(color="006100")
            elif item.achievement_pct >= 50:
                pct_cell.fill = PatternFill(start_color="FFEB9C", end_color="FFEB9C", fill_type="solid")
                pct_cell.font = Font(color="9C5700")
            else:
                pct_cell.fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
                pct_cell.font = Font(color="9C0006")
            
            # حدود
            for col in range(1, 9):
                ws.cell(row=row, column=col).border = Border(
                    left=Side(style='thin'), right=Side(style='thin'),
                    top=Side(style='thin'), bottom=Side(style='thin')
                )
            
            row += 1
    
    # تنسيق الأعمدة
    ws.column_dimensions['A'].width = 12
    ws.column_dimensions['B'].width = 20
    ws.column_dimensions['C'].width = 30
    ws.column_dimensions['D'].width = 30
    ws.column_dimensions['E'].width = 10
    ws.column_dimensions['F'].width = 14
    ws.column_dimensions['G'].width = 14
    ws.column_dimensions['H'].width = 14
    
    # تجميد الصف العلوي
    ws.freeze_panes = 'A6'
    
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()

def generate_remarks_pdf(db: Session, from_date: datetime = None, to_date: datetime = None) -> bytes:
    """سجل ملاحظات الجودة PDF"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm)
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        alignment=1,
        fontSize=18,
        textColor=colors.HexColor('#1F4E78'),
        spaceAfter=20
    )
    
    section_style = ParagraphStyle(
        'SectionTitle',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=colors.HexColor('#2c3e50'),
        spaceAfter=10,
        spaceBefore=15
    )
    
    elements.append(Paragraph("Quality Control Remarks Log", title_style))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
    
    if from_date or to_date:
        date_range = f"Period: {from_date.strftime('%Y-%m-%d') if from_date else 'Start'} to {to_date.strftime('%Y-%m-%d') if to_date else 'Now'}"
        elements.append(Paragraph(date_range, styles['Normal']))
    
    elements.append(Spacer(1, 20))
    
    query = db.query(models.Remark).join(models.Latrine)
    
    if from_date:
        query = query.filter(models.Remark.date_logged >= from_date)
    if to_date:
        query = query.filter(models.Remark.date_logged <= to_date)
    
    # فصل الملاحظات المفتوحة والمغلقة
    open_remarks = query.filter(models.Remark.status == 'open').order_by(models.Remark.date_logged.desc()).all()
    closed_remarks = query.filter(models.Remark.status == 'closed').order_by(models.Remark.date_logged.desc()).all()
    
    # الملاحظات المفتوحة
    if open_remarks:
        elements.append(Paragraph(f"OPEN REMARKS ({len(open_remarks)})", section_style))
        
        for remark in open_remarks:
            data = [
                ['Latrine ID', remark.latrine.latrine_id if remark.latrine else 'N/A'],
                ['BoQ Code', remark.boq_code or 'General'],
                ['Severity', remark.severity.upper()],
                ['Date Logged', remark.date_logged.strftime('%Y-%m-%d') if remark.date_logged else 'N/A'],
                ['Description', remark.description or ''],
                ['Action Required', remark.action_required or ''],
            ]
            
            if remark.deadline:
                data.append(['Deadline', remark.deadline.strftime('%Y-%m-%d')])
            
            table = Table(data, colWidths=[4*cm, 12*cm])
            
            # تلوين حسب الخطورة
            if remark.severity == 'critical':
                bg_color = colors.HexColor('#FFC7CE')
            elif remark.severity == 'major':
                bg_color = colors.HexColor('#FFEB9C')
            else:
                bg_color = colors.HexColor('#e8f4f8')
            
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), bg_color),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ]))
            elements.append(table)
            elements.append(Spacer(1, 10))
    
    # صفحة جديدة للمغلقة
    if closed_remarks:
        elements.append(PageBreak())
        elements.append(Paragraph(f"CLOSED REMARKS ({len(closed_remarks)})", section_style))
        
        for remark in closed_remarks:
            data = [
                ['Latrine ID', remark.latrine.latrine_id if remark.latrine else 'N/A'],
                ['BoQ Code', remark.boq_code or 'General'],
                ['Severity', remark.severity.upper()],
                ['Date Logged', remark.date_logged.strftime('%Y-%m-%d') if remark.date_logged else 'N/A'],
                ['Date Closed', remark.closed_date.strftime('%Y-%m-%d') if remark.closed_date else 'N/A'],
                ['Description', remark.description or ''],
            ]
            
            table = Table(data, colWidths=[4*cm, 12*cm])
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#C6EFCE')),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ]))
            elements.append(table)
            elements.append(Spacer(1, 10))
    
    if not open_remarks and not closed_remarks:
        elements.append(Paragraph("No remarks found for the specified period.", styles['Normal']))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()