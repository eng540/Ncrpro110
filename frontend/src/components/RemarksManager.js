import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index.js';
import { pushToSyncQueue, retryFailedSync } from '../syncEngine';
import { v4 as uuidv4 } from 'uuid';

// ==========================================
// 1. Constants & Utilities
// ==========================================
const UI_COLORS = {
  severity: { minor: '#FFC000', major: '#FF6600', critical: '#C00000' },
  status: { open: '#FFEB9C', closed: '#C6EFCE', overdue: '#FFC7CE' },
  sync: { local: '#9E9E9E', pending: '#FFC107', synced: '#4CAF50', failed: '#F44336' }
};

const UI_LABELS = {
  status: { open: 'مفتوحة', closed: 'مغلقة', overdue: 'متأخرة' },
  sync: { local: 'محلي', pending: 'قيد الإرسال', synced: 'مُزامن', failed: 'فشل الإرسال' }
};

const SEVERITY_WEIGHT = { critical: 3, major: 2, minor: 1 };

// ==========================================
// 2. Sub-Components
// ==========================================

const ConfirmModal = ({ message, onConfirm, onCancel }) => {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onConfirm, onCancel]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
         onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', maxWidth: '350px', textAlign: 'center', animation: 'fadeIn 0.2s' }}>
        <p style={{ marginBottom: '20px', fontSize: '15px' }}>{message}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button onClick={onCancel} style={{ padding: '8px 16px', background: '#ecf0f1', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إلغاء</button>
          <button onClick={onConfirm} style={{ padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>تأكيد</button>
        </div>
      </div>
    </div>
  );
};

const ErrorBanner = ({ error, onDismiss }) => {
  if (!error) return null;
  const bg = error.type === 'success' ? '#d4edda' : error.type === 'warning' ? '#fff3cd' : '#f8d7da';
  const color = error.type === 'success' ? '#155724' : error.type === 'warning' ? '#856404' : '#721c24';
  const icon = error.type === 'success' ? '✅' : error.type === 'warning' ? '⚠️' : '❌';
  return (
    <div style={{ background: bg, color, padding: '12px 16px', borderRadius: '6px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}>
      <span>{icon} {error.message}</span>
      <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'inherit' }}>✖</button>
    </div>
  );
};

const LoadingSkeleton = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
    {[1,2,3].map(i => <div key={i} style={{ background: '#f0f2f5', borderRadius: '8px', height: '180px', animation: 'pulse 1.5s infinite' }} />)}
  </div>
);

const SmartRemarkForm = ({ initialData, boqCode, isSaving, onSubmit, onCancel, templates }) => {
  const [desc, setDesc] = useState(initialData?.description || (initialData?.template ? initialData.template.title : ''));
  const [suffix, setSuffix] = useState(initialData?.suffix_note || '');
  const [sev, setSev] = useState(initialData?.severity || 'minor');
  const [action, setAction] = useState(initialData?.action_required || '');
  const [dead, setDead] = useState(initialData?.deadline ? initialData.deadline.split('T')[0] : '');
  const [selectedTemplate, setSelectedTemplate] = useState(initialData?.template || null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    let filtered = templates;
    if (boqCode) filtered = filtered.filter(t => !t.boq_tags || t.boq_tags.length === 0 || t.boq_tags.includes('ALL') || t.boq_tags.includes(boqCode));
    if (desc.trim() && !selectedTemplate) {
      const q = desc.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    return filtered;
  }, [templates, boqCode, desc, selectedTemplate]);

  const handleSelectTemplate = (tpl) => {
    setSelectedTemplate(tpl);
    setDesc(tpl.title);
    setSev(tpl.default_severity || 'minor');
    setAction(tpl.default_action || '');
    setShowSuggestions(false);
    setSaveAsTemplate(false);
  };

  const handleDescChange = (e) => {
    setDesc(e.target.value);
    setSelectedTemplate(null);
    setShowSuggestions(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!desc.trim()) return;
    onSubmit({ 
      template_id: selectedTemplate ? selectedTemplate.id : null,
      description: selectedTemplate ? null : desc.trim(),
      suffix_note: selectedTemplate ? suffix.trim() : null,
      severity: sev, action_required: action.trim(), deadline: dead,
      save_as_template: saveAsTemplate && !selectedTemplate
    });
    if (!initialData) {
      setDesc(''); setSuffix(''); setAction(''); setDead(''); setSev('minor'); setSelectedTemplate(null); setSaveAsTemplate(false);
    }
  };

  const isEdit = !!initialData;
  const canShowSaveAsTemplate = !selectedTemplate && desc.trim().length > 5 && !isEdit;

  return (
    <form onSubmit={handleSubmit} style={{ background: isEdit ? 'white' : '#fff9e6', padding: '20px', borderRadius: '8px', marginBottom: isEdit ? '0' : '20px', border: isEdit ? '2px solid #3498db' : '1px solid #ffeaa7', boxShadow: isEdit ? '0 4px 15px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.05)' }}>
      {isEdit && <h3 style={{ marginTop: 0, color: '#3498db' }}>✏️ تعديل الملاحظة</h3>}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div ref={wrapperRef} style={{ flex: 2, minWidth: '250px', position: 'relative' }}>
          <input type="text" placeholder={boqCode ? `ابحث عن مشكلة في البند ${boqCode}...` : "ابحث في مكتبة المشاكل أو اكتب ملاحظة جديدة..."} value={desc} onChange={handleDescChange} onFocus={() => setShowSuggestions(true)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', background: selectedTemplate ? '#e8f8f5' : 'white' }} required disabled={isSaving} />
          {showSuggestions && filteredTemplates.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #ccc', borderRadius: '4px', zIndex: 100, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {filteredTemplates.map(tpl => (
                <div key={tpl.id} onClick={() => handleSelectTemplate(tpl)} style={{ padding: '10px', borderBottom: '1px solid #eee', cursor: 'pointer' }} onMouseOver={(e) => e.currentTarget.style.background = '#f8f9fa'} onMouseOut={(e) => e.currentTarget.style.background = 'white'}>
                  <div style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '13px' }}>{tpl.title}</div>
                  <div style={{ fontSize: '11px', color: '#7f8c8d', marginTop: '4px' }}>{tpl.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <select value={sev} onChange={(e) => setSev(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} disabled={isSaving}>
          <option value="minor">طفيفة</option><option value="major">كبيرة</option><option value="critical">حرجة</option>
        </select>
      </div>
      {selectedTemplate && (
        <div style={{ marginBottom: '10px' }}>
          <input type="text" placeholder="تفاصيل إضافية خاصة بهذه الحالة (اختياري)..." value={suffix} onChange={(e) => setSuffix(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px dashed #3498db', boxSizing: 'border-box', background: '#f4f6f6' }} disabled={isSaving} />
        </div>
      )}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="الإجراء المطلوب..." value={action} onChange={(e) => setAction(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '200px' }} disabled={isSaving} />
        <input type="date" value={dead} onChange={(e) => setDead(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} disabled={isSaving} />
        <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto', alignItems: 'center' }}>
          {canShowSaveAsTemplate && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#8e44ad', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} disabled={isSaving} /> حفظ كقالب جديد
            </label>
          )}
          {onCancel && <button type="button" onClick={onCancel} disabled={isSaving} style={{ padding: '10px 20px', background: '#ecf0f1', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إلغاء</button>}
          <button type="submit" disabled={isSaving || !desc.trim()} style={{ padding: '10px 20px', background: isSaving ? '#bdc3c7' : (isEdit ? '#3498db' : '#e67e22'), color: 'white', border: 'none', borderRadius: '4px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            {isSaving ? '⏳ جاري الحفظ...' : (isEdit ? '💾 تحديث الملاحظة' : '+ تسجيل الملاحظة')}
          </button>
        </div>
      </div>
    </form>
  );
};

const VIEW_MODES = [
  { key: 'contractor', label: '📋 تعليمات المقاول' },
  { key: 'inspection', label: '🚻 فحص الحمامات' },
  { key: 'analytics', label: '📊 تحليلات الجودة' },
  { key: 'raw', label: '📝 السجل الخام' }
];

const ViewModeTabs = ({ active, onChange }) => (
  <div style={{ display: 'flex', gap: '5px', marginBottom: '20px', background: '#f0f2f5', padding: '4px', borderRadius: '8px' }}>
    {VIEW_MODES.map(mode => (
      <button key={mode.key} onClick={() => onChange(mode.key)}
        style={{ flex: 1, padding: '10px 16px', border: 'none', borderRadius: '6px', background: active === mode.key ? '#1A3A5C' : 'transparent', color: active === mode.key ? 'white' : '#555', fontWeight: active === mode.key ? 'bold' : 'normal', cursor: 'pointer', transition: 'all 0.2s', fontSize: '13px' }}>
        {mode.label}
      </button>
    ))}
  </div>
);

const ContractorBoqCard = ({ boqCode, issues, getLatrineCode, onClose, processingIds, boqDescriptions }) => {
  const boqDesc = boqDescriptions[boqCode] || '';
  const totalRemarks = issues.reduce((sum, iss) => sum + iss.remarks.length, 0);
  const allRemarksFlat = issues.flatMap(iss => iss.remarks);
  const isProcessing = allRemarksFlat.some(r => processingIds.has(r.id));

  const sortedIssues = [...issues].sort((a, b) => {
    const sevA = a.template?.default_severity || a.remarks[0].severity;
    const sevB = b.template?.default_severity || b.remarks[0].severity;
    return (SEVERITY_WEIGHT[sevB] || 0) - (SEVERITY_WEIGHT[sevA] || 0);
  });

  return (
    <div style={{ background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1A3A5C', marginBottom: '12px', borderBottom: '2px solid #eef2ff', paddingBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>📌 بند {boqCode || 'عام'}{boqDesc ? ` - ${boqDesc}` : ''} ({totalRemarks} حالة)</span>
        <button onClick={() => onClose(allRemarksFlat)} disabled={isProcessing}
          style={{ padding: '6px 16px', background: isProcessing ? '#95a5a6' : '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
          {isProcessing ? '⏳' : '✓ إغلاق الكل'}
        </button>
      </div>
      {sortedIssues.map((issue, idx) => {
        const severity = issue.template?.default_severity || issue.remarks[0].severity;
        const title = issue.template?.title || issue.remarks[0].description;
        const action = issue.template?.default_action || issue.remarks[0].action_required;
        const latrineCodes = [...new Set(issue.remarks.map(r => getLatrineCode(r.latrine_id)))];
        return (
          <div key={idx} style={{ borderRight: `4px solid ${UI_COLORS.severity[severity]}`, paddingRight: '12px', marginBottom: '15px', background: '#fafafa', padding: '10px', borderRadius: '6px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ background: UI_COLORS.severity[severity], color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{severity}</span>
              <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{title}</span>
              <span style={{ color: '#888', fontSize: '12px' }}>({issue.remarks.length} حالة)</span>
            </div>
            <div style={{ color: '#e67e22', fontSize: '13px', marginBottom: '6px' }}>⚠ مطلوب: {action}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>📍 {latrineCodes.join(', ')}</div>
          </div>
        );
      })}
    </div>
  );
};

const InspectionCard = ({ latrineId, remarks, getLatrineCode, onClose, onEdit, onSaveAsTemplate, processingIds, statusFilter }) => {
  let filtered = remarks;
  if (statusFilter) {
    filtered = remarks.filter(r => r.status === statusFilter);
  }
  const sorted = [...filtered].sort((a, b) => (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0));
  const openCount = remarks.filter(r => r.status === 'open').length;
  return (
    <div style={{ background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#1A3A5C', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
        <span>🚻 {getLatrineCode(latrineId)}</span>
        <span style={{ fontSize: '12px', color: '#7f8c8d' }}>{openCount} مفتوحة</span>
      </div>
      {sorted.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f0f0f0', flexWrap: 'wrap' }}>
          <span style={{ background: UI_COLORS.severity[r.severity], color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>{r.severity}</span>
          <span style={{ fontSize: '12px', color: '#666', minWidth: '60px' }}>بند {r.boq_code || 'عام'}</span>
          <span style={{ flex: 1, fontSize: '13px' }}>{r.template ? `📋 ${r.template.title}` : r.description}</span>
          <span style={{ color: '#e67e22', fontSize: '11px', maxWidth: '200px' }}>{r.action_required || r.template?.default_action}</span>
          {r.status === 'open' && (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => onEdit(r)} disabled={processingIds.has(r.id)} style={{ padding: '4px 8px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>✏️</button>
              {!r.template_id && <button onClick={() => onSaveAsTemplate(r)} disabled={processingIds.has(r.id)} style={{ padding: '4px 8px', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>📋</button>}
              <button onClick={() => onClose([r])} disabled={processingIds.has(r.id)} style={{ padding: '4px 8px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>✓</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const AnalyticsPanel = ({ filteredRemarks, onFilterByBoq, onFilterByIssue }) => {
  const { topBoqs, topIssues, counters } = useMemo(() => {
    const counts = { total: 0, open: 0, closed: 0, failed: 0 };
    const boqCounts = {};
    const issueMap = {};

    filteredRemarks.forEach(r => {
      counts.total++;
      if (r.status === 'open') counts.open++;
      else if (r.status === 'closed') counts.closed++;
      if (r.sync_status === 'failed') counts.failed++;

      const boq = r.boq_code || 'عام';
      boqCounts[boq] = (boqCounts[boq] || 0) + 1;

      const issueKey = r.template_id ? `TPL_${r.template_id}` : `TXT_${r.description}`;
      if (!issueMap[issueKey]) {
        issueMap[issueKey] = { template: r.template, remarks: [] };
      }
      issueMap[issueKey].remarks.push(r);
    });

    const topBoqsList = Object.entries(boqCounts).sort((a,b) => b[1] - a[1]).slice(0,5);
    const topIssuesList = Object.values(issueMap).sort((a,b) => b.remarks.length - a.remarks.length).slice(0,5);

    return { topBoqs: topBoqsList, topIssues: topIssuesList, counters: counts };
  }, [filteredRemarks]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
      <div style={{ background: 'white', borderRadius: '8px', padding: '20px' }}>
        <h3 style={{ color: '#1A3A5C', marginBottom: '15px' }}>🔴 الأكثر تعثراً (حسب البند)</h3>
        {topBoqs.map(([boq, count]) => (
          <div key={boq} onClick={() => onFilterByBoq(boq)} title="اضغط للانتقال إلى تعليمات المقاول"
               style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', transition: 'background 0.2s' }}
               onMouseOver={(e) => e.currentTarget.style.background = '#f8f9fa'}
               onMouseOut={(e) => e.currentTarget.style.background = 'white'}>
            <span>بند {boq}</span>
            <span style={{ fontWeight: 'bold', color: '#C00000' }}>{count} ملاحظة</span>
          </div>
        ))}
        {topBoqs.length === 0 && <div style={{ color: '#7f8c8d' }}>لا توجد بيانات كافية</div>}
      </div>
      <div style={{ background: 'white', borderRadius: '8px', padding: '20px' }}>
        <h3 style={{ color: '#1A3A5C', marginBottom: '15px' }}>🔴 الأكثر تكراراً (حسب المشكلة)</h3>
        {topIssues.map((issue, idx) => (
          <div key={idx} onClick={() => onFilterByIssue(issue)} title="اضغط للانتقال إلى تعليمات المقاول"
               style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0', cursor: 'pointer', transition: 'background 0.2s' }}
               onMouseOver={(e) => e.currentTarget.style.background = '#f8f9fa'}
               onMouseOut={(e) => e.currentTarget.style.background = 'white'}>
            <span>{issue.template?.title || issue.remarks[0].description}</span>
            <span style={{ fontWeight: 'bold', color: '#C00000' }}>{issue.remarks.length} حالة</span>
          </div>
        ))}
        {topIssues.length === 0 && <div style={{ color: '#7f8c8d' }}>لا توجد بيانات كافية</div>}
      </div>
      <div style={{ background: '#1A3A5C', color: 'white', borderRadius: '8px', padding: '20px', gridColumn: '1/-1' }}>
        <h3 style={{ marginTop: 0 }}>📈 ملخص المشروع</h3>
        <div style={{ display: 'flex', gap: '20px', fontSize: '18px', flexWrap: 'wrap' }}>
          <span>🔴 {counters.open} مفتوحة</span>
          <span>🟢 {counters.closed} مغلقة</span>
          <span>⚠ {counters.failed} فشل إرسال</span>
        </div>
      </div>
    </div>
  );
};

const QuickAddRemark = ({ allLatrines, templates, onAdd }) => {
  const [selectedLatrine, setSelectedLatrine] = useState('');
  const [desc, setDesc] = useState('');
  const [sev, setSev] = useState('minor');
  const [boqCode, setBoqCode] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    let filtered = templates;
    if (boqCode) filtered = filtered.filter(t => !t.boq_tags || t.boq_tags.length === 0 || t.boq_tags.includes('ALL') || t.boq_tags.includes(boqCode));
    if (desc.trim() && !selectedTemplate) {
      const q = desc.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    return filtered;
  }, [templates, boqCode, desc, selectedTemplate]);

  const handleSelectTemplate = (tpl) => {
    setSelectedTemplate(tpl);
    setDesc(tpl.title);
    setSev(tpl.default_severity || 'minor');
    setShowSuggestions(false);
  };

  const handleDescChange = (e) => {
    setDesc(e.target.value);
    setSelectedTemplate(null);
    setShowSuggestions(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedLatrine || !desc.trim()) return;
    onAdd({
      latrine_id: parseInt(selectedLatrine),
      description: selectedTemplate ? null : desc.trim(),
      severity: sev,
      boq_code: boqCode || null,
      template_id: selectedTemplate?.id || null
    });
    setDesc(''); setSelectedLatrine(''); setBoqCode(''); setSelectedTemplate(null);
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
      <select value={selectedLatrine} onChange={e => setSelectedLatrine(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} required>
        <option value="">اختر حمام...</option>
        {allLatrines.map(l => <option key={l.id} value={l.id}>{l.latrine_id}</option>)}
      </select>
      <div ref={wrapperRef} style={{ position: 'relative', flex: 2 }}>
        <input type="text" placeholder="وصف الملاحظة" value={desc} onChange={handleDescChange} onFocus={() => setShowSuggestions(true)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} required />
        {showSuggestions && filteredTemplates.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #ccc', borderRadius: '4px', zIndex: 100, maxHeight: '150px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            {filteredTemplates.map(tpl => (
              <div key={tpl.id} onClick={() => handleSelectTemplate(tpl)} style={{ padding: '8px', borderBottom: '1px solid #eee', cursor: 'pointer' }} onMouseOver={(e) => e.currentTarget.style.background = '#f8f9fa'} onMouseOut={(e) => e.currentTarget.style.background = 'white'}>
                <div style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '12px' }}>{tpl.title}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <input type="text" placeholder="بند" value={boqCode} onChange={e => setBoqCode(e.target.value.toUpperCase())} style={{ width: '80px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
      <select value={sev} onChange={e => setSev(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
        <option value="minor">طفيفة</option><option value="major">كبيرة</option><option value="critical">حرجة</option>
      </select>
      <button type="submit" style={{ padding: '8px 16px', background: '#1A3A5C', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>+ إضافة</button>
    </form>
  );
};

// ==========================================
// 3. Main Component (الخيار ج - Reset ذكي)
// ==========================================
const RemarksManager = ({ latrineId, boqCode, initialFilter = '', onBack }) => {
  const [viewMode, setViewMode] = useState('contractor');

  // ✅ فلاتر موحدة - تُمسح ذكياً عند تغيير الواجهة
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [syncFilter, setSyncFilter] = useState('');
  const [sortBy, setSortBy] = useState('smart');
  const [groupBy, setGroupBy] = useState('none');

  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [processingIds, setProcessingIds] = useState(new Set());
  const [editingRemark, setEditingRemark] = useState(null);
  const [confirmClose, setConfirmClose] = useState(null);

  const latrine = useLiveQuery(() => latrineId ? db.latrines.get(latrineId) : null, [latrineId]);
  const allLatrines = useLiveQuery(() => !latrineId ? db.latrines.toArray() : [], [latrineId]);
  const allTemplates = useLiveQuery(() => db.remark_templates.toArray(), []);
  const templateMap = useMemo(() => {
    const map = {};
    allTemplates?.forEach(t => map[t.id] = t);
    return map;
  }, [allTemplates]);

  const boqDictionary = useLiveQuery(() => db.boq_dictionary.toArray(), []);
  const boqDescriptions = useMemo(() => {
    const map = {};
    boqDictionary?.forEach(item => { map[item.boq_code] = item.description_ar || item.description_en || ''; });
    return map;
  }, [boqDictionary]);

  const rawRemarks = useLiveQuery(async () => {
    let query;
    if (!latrineId) query = db.remarks.toArray();
    else if (boqCode) query = db.remarks.where({ latrine_id: latrineId, boq_code: boqCode }).toArray();
    else query = db.remarks.where({ latrine_id: latrineId }).toArray();
    const raw = await query;
    return raw.map(r => ({ ...r, template: templateMap[r.template_id] || null }));
  }, [latrineId, boqCode, templateMap]);

  // ✅ الخيار ج: Reset ذكي - يحتفظ فقط بالفلاتر المدعومة في الواجهة الجديدة
  const handleViewModeChange = useCallback((newMode) => {
    setViewMode(newMode);

    // الفلاتر المشتركة (searchQuery, severityFilter) تبقى دائماً

    if (newMode === 'contractor') {
      // المقاول: يعرض دائماً المفتوحة فقط، لا يحتاج statusFilter
      setStatusFilter('');
      setSyncFilter('');
      setSortBy('smart');
      setGroupBy('none');
    } else if (newMode === 'analytics') {
      // التحليلات: تدعم search, severity, status
      // لا تدعم syncFilter, sortBy, groupBy
      setSyncFilter('');
      setSortBy('smart');
      setGroupBy('none');
    } else if (newMode === 'inspection') {
      // الفحص: تدعم search, severity, status
      // لا تدعم syncFilter, sortBy, groupBy
      setSyncFilter('');
      setSortBy('smart');
      setGroupBy('none');
    }
    // raw: تدعم كل الفلاتر، لا شيء يُمسح
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      const failedCount = await db.remarks.where('sync_status').equals('failed').count();
      if (failedCount > 0) {
        setError({ type: 'warning', message: 'عاد الاتصال. جاري المزامنة...' });
        handleRetrySync();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // ✅ البيانات المفلترة (تُستخدم في كل الواجهات)
  const filteredRemarks = useMemo(() => {
    if (!rawRemarks) return [];
    let filtered = rawRemarks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.template && r.template.title.toLowerCase().includes(q)) ||
        (r.suffix_note && r.suffix_note.toLowerCase().includes(q)) ||
        (r.boq_code && r.boq_code.toLowerCase() === q)
      );
    }
    if (severityFilter) filtered = filtered.filter(r => r.severity === severityFilter);
    if (statusFilter) filtered = filtered.filter(r => r.status === statusFilter);
    if (syncFilter) filtered = filtered.filter(r => r.sync_status === syncFilter);

    if (sortBy === 'newest') filtered.sort((a, b) => new Date(b.date_logged) - new Date(a.date_logged));
    else if (sortBy === 'oldest') filtered.sort((a, b) => new Date(a.date_logged) - new Date(b.date_logged));
    else if (sortBy === 'severity') filtered.sort((a, b) => (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0));
    else {
      filtered.sort((a, b) => {
        if (a.status === 'open' && b.status !== 'open') return -1;
        if (a.status !== 'open' && b.status === 'open') return 1;
        const wA = SEVERITY_WEIGHT[a.severity] || 0, wB = SEVERITY_WEIGHT[b.severity] || 0;
        if (wA !== wB) return wB - wA;
        return new Date(b.date_logged) - new Date(a.date_logged);
      });
    }
    return filtered;
  }, [rawRemarks, searchQuery, severityFilter, statusFilter, syncFilter, sortBy]);

  // ✅ تجميعات raw
  const aggregatedGroups = useMemo(() => {
    if (!filteredRemarks) return [];
    const groupMap = {};
    filteredRemarks.forEach(r => {
      let key;
      if (groupBy === 'latrine') {
        key = allLatrines?.find(l => l.id === r.latrine_id)?.latrine_id || `حمام ${r.latrine_id}`;
      } else if (groupBy === 'boq') {
        key = r.boq_code ? `بند ${r.boq_code}` : 'عام';
      } else {
        key = r.template_id ? `TPL_${r.template_id}` : `TXT_${r.description}`;
      }
      if (!groupMap[key]) groupMap[key] = { template: r.template, remarks: [], groupName: key };
      groupMap[key].remarks.push(r);
    });
    return Object.values(groupMap).sort((a, b) => b.remarks.length - a.remarks.length);
  }, [filteredRemarks, groupBy, allLatrines]);

  // ✅ عدادات عامة (للزر الأحمر)
  const counters = useMemo(() => {
    if (!rawRemarks) return { total: 0, open: 0, closed: 0, failed: 0 };
    return rawRemarks.reduce((acc, r) => {
      acc.total++;
      if (r.status === 'open') acc.open++;
      else if (r.status === 'closed') acc.closed++;
      if (r.sync_status === 'failed') acc.failed++;
      return acc;
    }, { total: 0, open: 0, closed: 0, failed: 0 });
  }, [rawRemarks]);

  // ✅ تجميع المقاول (يستخدم filteredRemarks، لكن يُفلتر داخلياً بالمفتوحة فقط)
  const contractorBoqGroups = useMemo(() => {
    if (viewMode !== 'contractor' || !filteredRemarks) return [];
    const map = {};
    // دائماً نعرض المفتوحة فقط في وضع المقاول
    filteredRemarks.filter(r => r.status === 'open').forEach(r => {
      const boq = r.boq_code || 'عام';
      if (!map[boq]) map[boq] = [];
      const issueKey = r.template_id ? `TPL_${r.template_id}` : `TXT_${r.description}`;
      let issue = map[boq].find(i => i.key === issueKey);
      if (!issue) {
        issue = { key: issueKey, template: r.template, remarks: [] };
        map[boq].push(issue);
      }
      issue.remarks.push(r);
    });
    return Object.entries(map).sort((a, b) => {
      const countA = a[1].reduce((sum, iss) => sum + iss.remarks.length, 0);
      const countB = b[1].reduce((sum, iss) => sum + iss.remarks.length, 0);
      return countB - countA;
    });
  }, [filteredRemarks, viewMode]);

  // --- Handlers ---
  const createAndLinkTemplate = async (templateData, remarkId, localUuid) => {
    const trimmedTitle = templateData.description?.trim() || '';
    if (!trimmedTitle) throw new Error('عنوان القالب فارغ');
    const existing = await db.remark_templates.where('title').equals(trimmedTitle).first();
    if (existing) {
      await db.transaction('rw', db.remarks, async () => {
        await db.remarks.update(remarkId, {
          template_id: existing.id, description: null,
          suffix_note: templateData.suffix_note || '',
          action_required: existing.default_action, severity: existing.default_severity,
          sync_status: 'local'
        });
      });
      await pushToSyncQueue('UPDATE_REMARK', { id: remarkId, local_uuid: localUuid, template_id: existing.id, description: null, suffix_note: templateData.suffix_note, severity: existing.default_severity, action_required: existing.default_action });
      return existing.id;
    }
    const newTemplate = {
      template_code: `TPL-${uuidv4().slice(0, 8).toUpperCase()}`,
      title: trimmedTitle, description: trimmedTitle,
      default_action: templateData.action_required || '', default_severity: templateData.severity,
      boq_tags: templateData.boq_code ? [templateData.boq_code] : ['ALL'],
      is_active: true, version: 1, created_by: 'field_engineer', created_at: new Date().toISOString()
    };
    let templateId;
    await db.transaction('rw', db.remark_templates, db.remarks, async () => {
      templateId = await db.remark_templates.add(newTemplate);
      await db.remarks.update(remarkId, {
        template_id: templateId, description: null,
        suffix_note: templateData.suffix_note || '',
        action_required: newTemplate.default_action, severity: newTemplate.default_severity,
        sync_status: 'local'
      });
    });
    await pushToSyncQueue('CREATE_TEMPLATE', newTemplate);
    await pushToSyncQueue('UPDATE_REMARK', { id: remarkId, local_uuid: localUuid, template_id: templateId, description: null, suffix_note: templateData.suffix_note, severity: newTemplate.default_severity, action_required: newTemplate.default_action });
    return templateId;
  };

  // ✅ إصلاح 1: إرسال CREATE_REMARK أولاً ثم استدعاء createAndLinkTemplate
  const handleAddOrEditRemark = async (formData) => {
    setIsSaving(true); setError(null);
    try {
      if (formData.id) {
        const original = await db.remarks.get(formData.id);
        if (!original) throw new Error('الملاحظة غير موجودة');
        const updatedFields = {
          template_id: formData.template_id, description: formData.template_id ? null : formData.description,
          suffix_note: formData.template_id ? formData.suffix_note : null,
          severity: formData.severity, action_required: formData.action_required || null,
          deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
          sync_status: 'local', boq_code: original.boq_code
        };
        await db.remarks.update(formData.id, updatedFields);
        await pushToSyncQueue('UPDATE_REMARK', { id: formData.id, local_uuid: original.local_uuid, ...updatedFields });
        setEditingRemark(null);
        setError({ type: 'success', message: 'تم التحديث.' });
      } else {
        const localUuid = uuidv4();
        const newRemark = {
          local_uuid: localUuid, latrine_id: latrineId || formData.latrine_id, boq_code: formData.boq_code || boqCode || null, template_id: null,
          description: formData.description, suffix_note: formData.suffix_note,
          severity: formData.severity, action_required: formData.action_required || null,
          deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
          status: 'open', sync_status: 'local', date_logged: new Date().toISOString(), closed_date: null
        };
        const remarkId = await db.remarks.add(newRemark);

        // ✅ أرسل CREATE_REMARK أولاً في كل الأحوال (يدوي أو قالب)
        await pushToSyncQueue('CREATE_REMARK', newRemark);

        if (formData.save_as_template) {
          try {
            await createAndLinkTemplate({ description: formData.description, severity: formData.severity, action_required: formData.action_required, boq_code: newRemark.boq_code, suffix_note: formData.suffix_note }, remarkId, localUuid);
            setError({ type: 'success', message: '✅ تم الحفظ كقالب.' });
          } catch (err) { 
            console.error('فشل حفظ القالب:', err);
            setError({ type: 'warning', message: '⚠️ تم التسجيل لكن فشل حفظ القالب: ' + err.message }); 
          }
        } else {
          setError({ type: 'success', message: '✅ تم التسجيل.' });
        }
      }
    } catch (err) { 
      console.error('Add/Edit remark error:', err);
      setError({ type: 'error', message: 'فشل: ' + err.message }); 
    }
    finally { setIsSaving(false); }
  };

  const handleSaveAsTemplateFromCard = async (remark) => {
    setProcessingIds(prev => new Set(prev).add(remark.id));
    try {
      const localUuid = remark.local_uuid || remark.remark_id || uuidv4();
      await createAndLinkTemplate({ description: remark.description, severity: remark.severity, action_required: remark.action_required, boq_code: remark.boq_code, suffix_note: remark.suffix_note }, remark.id, localUuid);
      setError({ type: 'success', message: 'تم حفظ القالب.' });
    } catch (err) { setError({ type: 'error', message: 'فشل: ' + err.message }); }
    finally { setProcessingIds(prev => { const n = new Set(prev); n.delete(remark.id); return n; }); }
  };

  const handleBulkClose = async (remarksToClose) => {
    if (!confirmClose) {
      setConfirmClose(remarksToClose);
      return;
    }
    setConfirmClose(null);
    const ids = remarksToClose.map(r => r.id);
    setProcessingIds(prev => new Set([...prev, ...ids]));
    try {
      const closedDate = new Date().toISOString();
      await db.transaction('rw', db.remarks, async () => {
        for (const remark of remarksToClose) {
          await db.remarks.update(remark.id, { status: 'closed', closed_date: closedDate, sync_status: remark.sync_status === 'synced' ? 'pending' : 'local' });
        }
      });
      for (const remark of remarksToClose) {
        await pushToSyncQueue('UPDATE_REMARK', { id: remark.id, local_uuid: remark.local_uuid || remark.remark_id, status: 'closed', closed_date: closedDate });
      }
    } catch (err) { setError({ type: 'error', message: 'فشل الإغلاق: ' + err.message }); }
    finally { setProcessingIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; }); }
  };

  // ✅ إصلاح 2: دالة handleRetrySync معالجة رسالة undefined
  const handleRetrySync = async () => {
    if (!navigator.onLine) { 
      setError({ type: 'error', message: 'غير متصل.' }); 
      return; 
    }
    setIsRetrying(true);
    try { 
      const result = await retryFailedSync(); 
      if (result && result.processed !== undefined) {
        setError({ type: 'success', message: `تمت المزامنة: ${result.processed} ناجحة، ${result.failed || 0} فاشلة.` });
      } else {
        setError({ type: 'success', message: 'تمت المزامنة بنجاح.' });
      }
    }
    catch (err) { 
      console.error('Sync error:', err);
      setError({ type: 'error', message: 'فشل المزامنة: ' + (err.message || 'خطأ غير معروف') }); 
    }
    finally { setIsRetrying(false); }
  };

  const getLatrineCode = useCallback((id) => {
    if (latrineId && latrine) return latrine.latrine_id;
    const l = allLatrines?.find(x => x.id === id);
    return l ? l.latrine_id : `ID:${id}`;
  }, [latrineId, latrine, allLatrines]);

  // ✅ Drill-down من Analytics: يحمل searchQuery فقط، يمسح الباقي
  const handleFilterByBoq = useCallback((boq) => {
    setSearchQuery(boq === 'عام' ? '' : boq);
    setSeverityFilter('');
    setStatusFilter('');
    setSyncFilter('');
    setSortBy('smart');
    setGroupBy('none');
    setViewMode('contractor');
  }, []);

  const handleFilterByIssue = useCallback((issue) => {
    setSearchQuery(issue.template?.title || issue.remarks[0].description);
    setSeverityFilter('');
    setStatusFilter('');
    setSyncFilter('');
    setSortBy('smart');
    setGroupBy('none');
    setViewMode('contractor');
  }, []);

  const handleQuickAdd = async (data) => {
    setIsSaving(true);
    try {
      const localUuid = uuidv4();
      const newRemark = {
        local_uuid: localUuid, latrine_id: data.latrine_id, boq_code: data.boq_code, template_id: data.template_id,
        description: data.description, severity: data.severity, action_required: null,
        status: 'open', sync_status: 'local', date_logged: new Date().toISOString()
      };
      await db.remarks.add(newRemark);
      await pushToSyncQueue('CREATE_REMARK', newRemark);
      setError({ type: 'success', message: 'تمت الإضافة.' });
    } catch (err) { setError({ type: 'error', message: 'فشل الإضافة: ' + err.message }); }
    finally { setIsSaving(false); }
  };

  if (latrineId && !latrine) return <LoadingSkeleton />;

  return (
    <div style={{ direction: 'rtl' }}>
      {confirmClose && (
        <ConfirmModal
          message={`هل أنت متأكد من إغلاق ${confirmClose.length} ملاحظة؟`}
          onConfirm={() => handleBulkClose(confirmClose)}
          onCancel={() => setConfirmClose(null)}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2 style={{ color: '#1A3A5C', margin: 0 }}>
          {!latrineId ? 'منصة إدارة العيوب' : boqCode ? `ملاحظات البند ${boqCode} - ${latrine.latrine_id}` : `ملاحظات ${latrine.latrine_id}`}
        </h2>
        <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer' }}>← العودة</button>
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {editingRemark && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', border: '2px solid #3498db' }}>
          <SmartRemarkForm initialData={editingRemark} boqCode={boqCode || editingRemark.boq_code} isSaving={isSaving} onSubmit={handleAddOrEditRemark} onCancel={() => setEditingRemark(null)} templates={allTemplates} />
        </div>
      )}
      {!editingRemark && latrineId && (
        <SmartRemarkForm boqCode={boqCode} isSaving={isSaving} onSubmit={handleAddOrEditRemark} templates={allTemplates} />
      )}

      {!latrineId && <ViewModeTabs active={viewMode} onChange={handleViewModeChange} />}

      {!latrineId && viewMode === 'raw' && (
        <QuickAddRemark allLatrines={allLatrines} templates={allTemplates} onAdd={handleQuickAdd} />
      )}

      {/* ✅ شريط الفلاتر: يظهر فقط الفلاتر المدعومة في الواجهة الحالية */}
      <div style={{ background: 'white', padding: '10px', borderRadius: '8px', marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* البحث: مدعوم في كل الواجهات */}
        <input type="text" placeholder="🔍 بحث..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ flex: 2, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />

        {/* الشدة: مدعومة في كل الواجهات */}
        <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
          <option value="">الشدة</option><option value="critical">حرجة</option><option value="major">كبيرة</option><option value="minor">طفيفة</option>
        </select>

        {/* الحالة: مدعومة في inspection, raw, analytics */}
        {(viewMode === 'inspection' || viewMode === 'raw' || viewMode === 'analytics') && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="">الحالة</option><option value="open">مفتوحة</option><option value="closed">مغلقة</option>
          </select>
        )}

        {/* المزامنة: raw فقط */}
        {viewMode === 'raw' && (
          <select value={syncFilter} onChange={e => setSyncFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="">المزامنة</option><option value="local">محلي</option><option value="synced">مُزامن</option><option value="failed">فشل</option>
          </select>
        )}

        {/* الترتيب: raw فقط */}
        {viewMode === 'raw' && (
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '2px solid #3498db', fontWeight: 'bold' }}>
            <option value="smart">ترتيب ذكي</option>
            <option value="newest">الأحدث</option>
            <option value="oldest">الأقدم</option>
            <option value="severity">حسب الخطورة</option>
          </select>
        )}

        {/* التجميع: raw فقط */}
        {viewMode === 'raw' && (
          <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '2px solid #8e44ad', fontWeight: 'bold', color: '#2c3e50' }}>
            <option value="none">تجميع المشكلة</option>
            <option value="latrine">تجميع الحمام</option>
            <option value="boq">تجميع البند</option>
          </select>
        )}
      </div>

      {counters.failed > 0 && (
        <button onClick={handleRetrySync} disabled={isRetrying} style={{ marginBottom: '15px', padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          🔄 إعادة إرسال ({counters.failed})
        </button>
      )}

      {!rawRemarks ? <LoadingSkeleton /> : (
        <>
          {viewMode === 'contractor' && (
            <div>
              <p style={{ color: '#e67e22', fontWeight: 'bold', marginBottom: '15px' }}>⚠️ جميع الملاحظات التالية مطلوب معالجتها دون استثناء. التصنيف حسب الخطورة للإدارة فقط.</p>
              {contractorBoqGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '8px' }}>📭 لا توجد ملاحظات مفتوحة</div>
              ) : (
                contractorBoqGroups.map(([boq, issues]) => (
                  <ContractorBoqCard key={boq} boqCode={boq} issues={issues} getLatrineCode={getLatrineCode} onClose={handleBulkClose} processingIds={processingIds} boqDescriptions={boqDescriptions} />
                ))
              )}
            </div>
          )}

          {viewMode === 'inspection' && (
            <div>
              {Object.entries(filteredRemarks.reduce((acc, r) => {
                if (!acc[r.latrine_id]) acc[r.latrine_id] = [];
                acc[r.latrine_id].push(r);
                return acc;
              }, {})).map(([lid, remarks]) => (
                <InspectionCard key={lid} latrineId={parseInt(lid)} remarks={remarks} getLatrineCode={getLatrineCode} onClose={handleBulkClose} onEdit={setEditingRemark} onSaveAsTemplate={handleSaveAsTemplateFromCard} processingIds={processingIds} statusFilter={statusFilter} />
              ))}
            </div>
          )}

          {viewMode === 'analytics' && (
            <AnalyticsPanel filteredRemarks={filteredRemarks} onFilterByBoq={handleFilterByBoq} onFilterByIssue={handleFilterByIssue} />
          )}

          {viewMode === 'raw' && groupBy === 'none' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredRemarks.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'white', padding: '12px', borderRadius: '8px', borderRight: `3px solid ${UI_COLORS.severity[r.severity]}`, opacity: r.status === 'closed' ? 0.7 : 1 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 'bold' }}>{getLatrineCode(r.latrine_id)}</span>
                      <span style={{ color: '#666' }}>{r.boq_code || 'عام'}</span>
                      <span style={{ background: UI_COLORS.severity[r.severity], color: 'white', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>{r.severity}</span>
                      <span style={{ background: UI_COLORS.sync[r.sync_status || 'local'], color: 'white', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>{UI_LABELS.sync[r.sync_status || 'local']}</span>
                    </div>
                    <div>{r.template ? `📋 ${r.template.title}` : r.description}</div>
                  </div>
                  {r.status === 'open' && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => setEditingRemark(r)} disabled={processingIds.has(r.id)} style={{ padding: '4px 8px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>✏️</button>
                      {!r.template_id && <button onClick={() => handleSaveAsTemplateFromCard(r)} disabled={processingIds.has(r.id)} style={{ padding: '4px 8px', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>📋</button>}
                      <button onClick={() => handleBulkClose([r])} disabled={processingIds.has(r.id)} style={{ padding: '4px 8px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>✓</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {viewMode === 'raw' && groupBy !== 'none' && (
            <div>
              {aggregatedGroups.map((group, idx) => (
                <div key={idx} style={{ marginBottom: '30px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                  <div style={{ background: '#1F4E78', color: 'white', padding: '12px 20px', fontWeight: 'bold', fontSize: '16px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{group.groupName}</span>
                    <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{group.remarks.length} ملاحظة</span>
                  </div>
                  <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px', background: '#f8f9fa' }}>
                    {group.remarks.map(r => (
                      <div key={r.id} style={{ background: 'white', padding: '12px', borderRadius: '8px', borderRight: `3px solid ${UI_COLORS.severity[r.severity]}`, opacity: r.status === 'closed' ? 0.7 : 1 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 'bold' }}>{getLatrineCode(r.latrine_id)}</span>
                            <span style={{ color: '#666' }}>{r.boq_code || 'عام'}</span>
                            <span style={{ background: UI_COLORS.severity[r.severity], color: 'white', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>{r.severity}</span>
                            <span style={{ background: UI_COLORS.sync[r.sync_status || 'local'], color: 'white', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>{UI_LABELS.sync[r.sync_status || 'local']}</span>
                          </div>
                          <div>{r.template ? `📋 ${r.template.title}` : r.description}</div>
                        </div>
                        {r.status === 'open' && (
                          <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                            <button onClick={() => setEditingRemark(r)} disabled={processingIds.has(r.id)} style={{ padding: '4px 8px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>✏️</button>
                            {!r.template_id && <button onClick={() => handleSaveAsTemplateFromCard(r)} disabled={processingIds.has(r.id)} style={{ padding: '4px 8px', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>📋</button>}
                            <button onClick={() => handleBulkClose([r])} disabled={processingIds.has(r.id)} style={{ padding: '4px 8px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>✓</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default RemarksManager;