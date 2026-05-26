from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from io import BytesIO
from sqlalchemy.orm import Session
from sqlalchemy import func
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
        return str(text)

def generate_summary_pdf(db: Session, from_date: datetime = None, to_date: datetime = None) -> bytes:
    """تقرير ملخص تنفيذي PDF (مُحدّث ليعكس الإنجاز المالي والهندسي)"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], alignment=1, fontSize=20, textColor=colors.HexColor('#1F4E78'), spaceAfter=20, fontName='Helvetica-Bold')
    subtitle_style = ParagraphStyle('CustomSubtitle', parent=styles['Normal'], alignment=1, fontSize=12, textColor=colors.HexColor('#7f8c8d'), spaceAfter=30)
    section_style = ParagraphStyle('SectionTitle', parent=styles['Heading2'], fontSize=14, textColor=colors.HexColor('#2c3e50'), spaceAfter=10, spaceBefore=15, fontName='Helvetica-Bold')
    
    elements.append(Paragraph("NRC Latrine Tracker", title_style))
    elements.append(Paragraph("Project Executive Summary & Governance Report", subtitle_style))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", subtitle_style))
    elements.append(Spacer(1, 20))
    
    # 1. إحصائيات الحمامات
    total = db.query(models.Latrine).count()
    completed = db.query(models.Latrine).filter(models.Latrine.status == 'completed').count()
    in_progress = db.query(models.Latrine).filter(models.Latrine.status == 'in_progress').count()
    not_started = db.query(models.Latrine).filter(models.Latrine.status == 'not_started').count()
    
    # 2. إحصائيات الجودة
    accepted_items = db.query(models.BoqItem).filter(models.BoqItem.quality_pass == 'pass').count()
    rejected_items = db.query(models.BoqItem).filter(models.BoqItem.quality_pass == 'fail').count()
    pending_items = db.query(models.BoqItem).filter(models.BoqItem.quality_pass == 'pending').count()
    
    # 3. إحصائيات القرارات (Governance Stats)
    decisions = db.query(models.DecisionRecord).all()
    approved_count = sum(1 for d in decisions if (d.human_decision_code or d.system_recommendation_code) in ['APPROVE', 'APPROVE_WITH_NOTE'])
    hold_count = sum(1 for d in decisions if (d.human_decision_code or d.system_recommendation_code) == 'HOLD')
    rework_count = sum(1 for d in decisions if (d.human_decision_code or d.system_recommendation_code) == 'REWORK')
    stop_count = sum(1 for d in decisions if (d.human_decision_code or d.system_recommendation_code) == 'STOP')

    # 4. حساب الإنجاز الكلي
    avg_progress = round(float(db.query(func.avg(models.Latrine.overall_pct)).scalar() or 0), 2)
    
    # --- الجدول الأول: حالة المشروع ---
    elements.append(Paragraph("1. Project Status", section_style))
    summary_data = [
        ['Indicator', 'Value', 'Percentage'],
        ['Total Latrines', str(total), '100%'],
        ['Completed', str(completed), f'{round(completed/total*100,1)}%' if total else '0%'],
        ['In Progress', str(in_progress), f'{round(in_progress/total*100,1)}%' if total else '0%'],
        ['Not Started', str(not_started), f'{round(not_started/total*100,1)}%' if total else '0%'],
        ['Overall Financial Progress', f'{avg_progress}%', 'Based on Approved Payments'],
    ]
    t1 = Table(summary_data, colWidths=[7*cm, 4*cm, 5*cm])
    t1.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E78')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
    ]))
    elements.append(t1)
    elements.append(Spacer(1, 20))

    # --- الجدول الثاني: حوكمة القرارات ---
    elements.append(Paragraph("2. Decision & Governance Engine", section_style))
    gov_data = [
        ['Decision Status', 'Item Count', 'Action Required'],
        ['Approved for Payment', str(approved_count), 'None'],
        ['On Hold (Pending/Minor Issues)', str(hold_count), 'Review & Inspect'],
        ['Rework Required (Failed Quality)', str(rework_count), 'Contractor Action'],
        ['Stopped (Critical Safety/Quality)', str(stop_count), 'Urgent PM Intervention'],
    ]
    t2 = Table(gov_data, colWidths=[7*cm, 3*cm, 6*cm])
    t2.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#8e44ad')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 1, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
    ]))
    elements.append(t2)

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()

def generate_ipc_excel(db: Session) -> bytes:
    """شهادة دفع مؤقتة Excel (IPC)"""
    buffer = BytesIO()
    wb = Workbook()
    ws = wb.active
    ws.title = "IPC - Master Aggregation"
    ws.sheet_view.rightToLeft = True
    
    ws['A1'] = "NRC Latrine Tracker - Governance IPC"
    ws['A1'].font = Font(size=16, bold=True, color="1F4E78")
    ws.merge_cells('A1:I1')
    ws['A1'].alignment = Alignment(horizontal='center', vertical='center')
    ws.row_dimensions[1].height = 30
    
    ws['A2'] = "Interim Payment Certificate (Aggregated by BoQ)"
    ws['A2'].font = Font(size=12, bold=True, color="27ae60")
    ws.merge_cells('A2:I2')
    ws['A2'].alignment = Alignment(horizontal='center', vertical='center')
    
    ws['A3'] = f"Date: {datetime.now().strftime('%Y-%m-%d')}"
    ws.merge_cells('A3:I3')
    ws['A3'].alignment = Alignment(horizontal='center')
    
    headers = [
        'BoQ Code', 'Description (AR)', 'Unit', 'Unit Price ($)', 
        'Total Planned Qty', 'Total Executed Qty', 
        'Approved Qty (Passed)', 'Payable Amount ($)', 'Blocked Amount ($)'
    ]
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=5, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="1F4E78", end_color="1F4E78", fill_type="solid")
        cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        cell.border = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
    
    ws.row_dimensions[5].height = 35
    
    dictionary = {d.boq_code: d for d in db.query(models.BoqDictionary).filter(models.BoqDictionary.is_active == True).all()}
    items = db.query(models.BoqItem).all()
    decisions = {d.boq_item_id: d for d in db.query(models.DecisionRecord).all()}
    
    aggregation = {}
    for item in items:
        code = item.boq_code
        if code not in aggregation:
            aggregation[code] = {
                'planned': 0.0, 'executed': 0.0, 'approved_qty': 0.0, 
                'payable_usd': 0.0, 'blocked_usd': 0.0
            }
        
        dict_item = dictionary.get(code)
        price = dict_item.unit_price if dict_item else 0.0
        planned = item.planned_qty or 0.0
        executed = item.achieved_qty or 0.0
        
        aggregation[code]['planned'] += planned
        aggregation[code]['executed'] += executed
        
        decision = decisions.get(item.id)
        payment_pct = 0.0
        if decision:
            payment_pct = decision.human_payment_pct if decision.human_payment_pct is not None else decision.system_payment_pct
        
        payable_qty = planned * (payment_pct / 100.0)
        aggregation[code]['approved_qty'] += payable_qty
        aggregation[code]['payable_usd'] += (payable_qty * price)
        
        if executed > payable_qty:
            aggregation[code]['blocked_usd'] += ((executed - payable_qty) * price)

    row = 6
    total_project_payable = 0.0
    total_project_blocked = 0.0

    for code in sorted(aggregation.keys()):
        data = aggregation[code]
        dict_item = dictionary.get(code)
        
        ws.cell(row=row, column=1, value=code).alignment = Alignment(horizontal='center')
        ws.cell(row=row, column=2, value=dict_item.description_ar if dict_item else '').alignment = Alignment(horizontal='right')
        ws.cell(row=row, column=3, value=dict_item.unit if dict_item else '').alignment = Alignment(horizontal='center')
        ws.cell(row=row, column=4, value=dict_item.unit_price if dict_item else 0.0).alignment = Alignment(horizontal='center')
        
        ws.cell(row=row, column=5, value=data['planned']).alignment = Alignment(horizontal='center')
        ws.cell(row=row, column=6, value=data['executed']).alignment = Alignment(horizontal='center')
        
        app_cell = ws.cell(row=row, column=7, value=round(data['approved_qty'], 2))
        app_cell.alignment = Alignment(horizontal='center')
        app_cell.font = Font(color="006100" if data['approved_qty'] == data['planned'] else "9C5700")
        
        pay_cell = ws.cell(row=row, column=8, value=round(data['payable_usd'], 2))
        pay_cell.alignment = Alignment(horizontal='center')
        pay_cell.font = Font(bold=True)
        
        block_cell = ws.cell(row=row, column=9, value=round(data['blocked_usd'], 2))
        block_cell.alignment = Alignment(horizontal='center')
        if data['blocked_usd'] > 0:
            block_cell.font = Font(color="9C0006", bold=True)
            block_cell.fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
        
        total_project_payable += data['payable_usd']
        total_project_blocked += data['blocked_usd']
        
        for col in range(1, 10):
            ws.cell(row=row, column=col).border = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
        row += 1

    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=7)
    tot_label = ws.cell(row=row, column=1, value="GRAND TOTAL (USD)")
    tot_label.font = Font(bold=True, size=12)
    tot_label.alignment = Alignment(horizontal='right')
    
    tot_pay = ws.cell(row=row, column=8, value=round(total_project_payable, 2))
    tot_pay.font = Font(bold=True, size=12, color="006100")
    tot_pay.fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
    
    tot_block = ws.cell(row=row, column=9, value=round(total_project_blocked, 2))
    tot_block.font = Font(bold=True, size=12, color="9C0006")
    if total_project_blocked > 0:
        tot_block.fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")

    ws.column_dimensions['A'].width = 12
    ws.column_dimensions['B'].width = 40
    ws.column_dimensions['C'].width = 10
    ws.column_dimensions['D'].width = 15
    ws.column_dimensions['E'].width = 18
    ws.column_dimensions['F'].width = 18
    ws.column_dimensions['G'].width = 22
    ws.column_dimensions['H'].width = 20
    ws.column_dimensions['I'].width = 20
    
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()

def generate_remarks_pdf(db: Session, from_date: datetime = None, to_date: datetime = None) -> bytes:
    """سجل ملاحظات الجودة PDF"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm)
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], alignment=1, fontSize=18, textColor=colors.HexColor('#1F4E78'), spaceAfter=20)
    section_style = ParagraphStyle('SectionTitle', parent=styles['Heading2'], fontSize=14, textColor=colors.HexColor('#2c3e50'), spaceAfter=10, spaceBefore=15)
    
    elements.append(Paragraph("Quality Control Remarks Log", title_style))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    query = db.query(models.Remark).join(models.Latrine)
    open_remarks = query.filter(models.Remark.status == 'open').order_by(models.Remark.date_logged.desc()).all()
    
    if open_remarks:
        elements.append(Paragraph(f"OPEN REMARKS ({len(open_remarks)})", section_style))
        for remark in open_remarks:
            data = [
                ['Latrine ID', remark.latrine.latrine_id if remark.latrine else 'N/A'],
                ['BoQ Code', remark.boq_code or 'General'],
                ['Severity', remark.severity.upper()],
                ['Description', remark.description or ''],
            ]
            table = Table(data, colWidths=[4*cm, 12*cm])
            bg_color = colors.HexColor('#FFC7CE') if remark.severity == 'critical' else colors.HexColor('#FFEB9C') if remark.severity == 'major' else colors.HexColor('#e8f4f8')
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), bg_color),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ]))
            elements.append(table)
            elements.append(Spacer(1, 10))
    else:
        elements.append(Paragraph("No open remarks found.", styles['Normal']))
    
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()

# ==========================================
# 🌟 NEW: Site Diary Log (التقرير اليومي PDF)
# ==========================================
def generate_daily_logs_pdf(db: Session, from_date: datetime = None, to_date: datetime = None) -> bytes:
    """تقرير يوميات الموقع PDF"""
    buffer = BytesIO()
    # نستخدم العرض الأفقي (Landscape) لأن الجدول يحتوي على أعمدة كثيرة
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
    elements = []
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle('CustomTitle', parent=styles['Heading1'], alignment=1, fontSize=18, textColor=colors.HexColor('#1F4E78'), spaceAfter=10)
    subtitle_style = ParagraphStyle('CustomSubtitle', parent=styles['Normal'], alignment=1, fontSize=11, textColor=colors.HexColor('#7f8c8d'), spaceAfter=20)
    
    elements.append(Paragraph("Site Diary & Daily Operations Log", title_style))
    
    date_str = "All Records"
    if from_date and to_date:
        date_str = f"Period: {from_date.strftime('%Y-%m-%d')} to {to_date.strftime('%Y-%m-%d')}"
    elements.append(Paragraph(date_str, subtitle_style))
    
    query = db.query(models.DailyLog).order_by(models.DailyLog.date.desc())
    if from_date: query = query.filter(models.DailyLog.date >= from_date)
    if to_date: query = query.filter(models.DailyLog.date <= to_date)
    
    logs = query.all()
    
    if not logs:
        elements.append(Paragraph("No daily logs found for the selected period.", styles['Normal']))
        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    # بناء الجدول
    data = [['Date', 'Engineer', 'Weather', 'Manpower', 'Inspected', 'Accepted', 'Remarks', 'Equipment / Notes']]
    
    for log in logs:
        # دمج المعدات والملاحظات في عمود واحد لتوفير المساحة
        notes_text = ""
        if log.equipment: notes_text += f"Eq: {log.equipment}\n"
        if log.notes: notes_text += f"Note: {log.notes}"
        
        data.append([
            log.date.strftime('%Y-%m-%d'),
            log.engineer or '-',
            log.weather or '-',
            str(log.manpower or 0),
            str(log.latrines_inspected or 0),
            str(log.latrines_accepted or 0),
            str(log.remarks_issued or 0),
            notes_text or '-'
        ])

    # تحديد عرض الأعمدة (الإجمالي حوالي 26 سم للـ Landscape)
    col_widths = [2.5*cm, 3.5*cm, 2*cm, 2*cm, 2*cm, 2*cm, 2*cm, 10*cm]
    table = Table(data, colWidths=col_widths, repeatRows=1)
    
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1F4E78')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('ALIGN', (7, 1), (7, -1), 'LEFT'), # محاذاة الملاحظات لليسار
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('FONTSIZE', (0, 1), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    
    elements.append(table)
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()