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

const formatDate = (isoString) => {
  if (!isoString) return 'N/A';
  return new Date(isoString).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ==========================================
// 2. Sub-Components
// ==========================================

// --- Error Banner ---
const ErrorBanner = ({ error, onDismiss }) => {
  if (!error) return null;
  const bg = error.type === 'success' ? '#d4edda' : error.type === 'warning' ? '#fff3cd' : '#f8d7da';
  const color = error.type === 'success' ? '#155724' : error.type === 'warning' ? '#856404' : '#721c24';
  const icon = error.type === 'success' ? '✅' : error.type === 'warning' ? '⚠️' : '❌';
  return (
    <div style={{ background: bg, color, padding: '12px 16px', borderRadius: '6px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
      <span>{icon} {error.message}</span>
      <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'inherit' }}>✖</button>
    </div>
  );
};

const LoadingSkeleton = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
    {[1, 2, 3].map(i => (
      <div key={i} style={{ background: '#f0f2f5', borderRadius: '8px', height: '180px', animation: 'pulse 1.5s infinite' }}>
        <style>{`@keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }`}</style>
      </div>
    ))}
  </div>
);

// --- Smart Remark Form (إضافة، تعديل، حفظ كقالب) ---
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
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    let filtered = templates;
    if (boqCode) {
      filtered = filtered.filter(t => !t.boq_tags || t.boq_tags.length === 0 || t.boq_tags.includes('ALL') || t.boq_tags.includes(boqCode));
    }
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
      severity: sev, 
      action_required: action.trim(), 
      deadline: dead,
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
          <input 
            type="text" 
            placeholder={boqCode ? `ابحث عن مشكلة في البند ${boqCode}...` : "ابحث في مكتبة المشاكل أو اكتب ملاحظة جديدة..."}
            value={desc} 
            onChange={handleDescChange}
            onFocus={() => setShowSuggestions(true)}
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', background: selectedTemplate ? '#e8f8f5' : 'white' }}
            required 
            disabled={isSaving}
          />
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
              <input type="checkbox" checked={saveAsTemplate} onChange={(e) => setSaveAsTemplate(e.target.checked)} disabled={isSaving} />
              حفظ كقالب جديد
            </label>
          )}
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={isSaving} style={{ padding: '10px 20px', background: '#ecf0f1', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إلغاء</button>
          )}
          <button type="submit" disabled={isSaving || !desc.trim()} style={{ padding: '10px 20px', background: isSaving ? '#bdc3c7' : (isEdit ? '#3498db' : '#e67e22'), color: 'white', border: 'none', borderRadius: '4px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            {isSaving ? '⏳ جاري الحفظ...' : (isEdit ? '💾 تحديث الملاحظة' : '+ تسجيل الملاحظة')}
          </button>
        </div>
      </div>
    </form>
  );
};

// --- View Mode Tabs ---
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
        style={{
          flex: 1, padding: '10px 16px', border: 'none', borderRadius: '6px',
          background: active === mode.key ? '#1A3A5C' : 'transparent',
          color: active === mode.key ? 'white' : '#555',
          fontWeight: active === mode.key ? 'bold' : 'normal',
          cursor: 'pointer', transition: 'all 0.2s', fontSize: '13px'
        }}>
        {mode.label}
      </button>
    ))}
  </div>
);

// --- Contractor Action Card ---
const ContractorActionCard = ({ issue, getLatrineCode, onClose, processingIds }) => {
  const severity = issue.template?.default_severity || issue.remarks[0].severity;
  const title = issue.template?.title || issue.remarks[0].description;
  const action = issue.template?.default_action || issue.remarks[0].action_required;
  const boqCode = issue.remarks[0].boq_code;
  const latrineCodes = [...new Set(issue.remarks.map(r => getLatrineCode(r.latrine_id)))];
  const isProcessing = issue.remarks.some(r => processingIds.has(r.id));
  
  return (
    <div style={{ background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '10px', borderRight: `4px solid ${UI_COLORS.severity[severity]}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 'bold', color: '#1A3A5C' }}>📌 بند {boqCode || 'عام'}</span>
            <span style={{ background: UI_COLORS.severity[severity], color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{severity}</span>
            <span style={{ background: '#f0f2f5', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{issue.remarks.length} حالات</span>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>{title}</div>
          <div style={{ color: '#e67e22', fontSize: '13px', marginBottom: '8px' }}>⚠ مطلوب: {action}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            📍 {latrineCodes.join(', ')}
          </div>
        </div>
        <button onClick={() => onClose(issue.remarks)} disabled={isProcessing}
          style={{ padding: '6px 16px', background: isProcessing ? '#95a5a6' : '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
          {isProcessing ? '⏳' : '✓ إغلاق الكل'}
        </button>
      </div>
    </div>
  );
};

// --- Inspection Card (فحص الحمام) ---
const InspectionCard = ({ latrineId, remarks, getLatrineCode, onClose, onEdit, onSaveAsTemplate, processingIds }) => {
  const sorted = [...remarks].sort((a, b) => (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0));
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

// --- Analytics Panel ---
const AnalyticsPanel = ({ aggregatedGroups, counters }) => {
  const topBoqs = useMemo(() => {
    const counts = {};
    aggregatedGroups.forEach(g => g.remarks.forEach(r => {
      counts[r.boq_code || 'عام'] = (counts[r.boq_code || 'عام'] || 0) + 1;
    }));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [aggregatedGroups]);

  const topIssues = aggregatedGroups.slice(0, 5);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
      <div style={{ background: 'white', borderRadius: '8px', padding: '20px' }}>
        <h3 style={{ color: '#1A3A5C', marginBottom: '15px' }}>🔴 الأكثر تعثراً (حسب البند)</h3>
        {topBoqs.map(([boq, count]) => (
          <div key={boq} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span>بند {boq}</span>
            <span style={{ fontWeight: 'bold', color: '#C00000' }}>{count} ملاحظة</span>
          </div>
        ))}
        {topBoqs.length === 0 && <div style={{ color: '#7f8c8d' }}>لا توجد بيانات كافية</div>}
      </div>
      <div style={{ background: 'white', borderRadius: '8px', padding: '20px' }}>
        <h3 style={{ color: '#1A3A5C', marginBottom: '15px' }}>🔴 الأكثر تكراراً (حسب المشكلة)</h3>
        {topIssues.map((issue, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
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

// ==========================================
// 3. Main Component
// ==========================================
const RemarksManager = ({ latrineId, boqCode, initialFilter = '', onBack }) => {
  const [viewMode, setViewMode] = useState('contractor');
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [syncFilter, setSyncFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [processingIds, setProcessingIds] = useState(new Set());
  const [editingRemark, setEditingRemark] = useState(null);

  const latrine = useLiveQuery(() => latrineId ? db.latrines.get(latrineId) : null, [latrineId]);
  const allLatrines = useLiveQuery(() => !latrineId ? db.latrines.toArray() : [], [latrineId]);
  const templates = useLiveQuery(() => db.remark_templates.toArray(), []);

  const rawRemarks = useLiveQuery(async () => {
    let query;
    if (!latrineId) query = db.remarks.toArray();
    else if (boqCode) query = db.remarks.where({ latrine_id: latrineId, boq_code: boqCode }).toArray();
    else query = db.remarks.where({ latrine_id: latrineId }).toArray();
    const raw = await query;
    return Promise.all(raw.map(async r => ({
      ...r,
      template: r.template_id ? await db.remark_templates.get(r.template_id) : null
    })));
  }, [latrineId, boqCode]);

  // Auto-retry on reconnect
  useEffect(() => {
    const handleOnline = async () => {
      if (await db.remarks.where('sync_status').equals('failed').count() > 0) {
        setError({ type: 'warning', message: 'عاد الاتصال. جاري المزامنة...' });
        handleRetrySync();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // --- Data Processing ---
  const { filteredRemarks, counters, aggregatedGroups } = useMemo(() => {
    if (!rawRemarks) return { filteredRemarks: [], counters: { total: 0, open: 0, closed: 0, failed: 0 }, aggregatedGroups: [] };
    let filtered = rawRemarks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.template && r.template.title.toLowerCase().includes(q)) ||
        (r.suffix_note && r.suffix_note.toLowerCase().includes(q))
      );
    }
    if (statusFilter) filtered = filtered.filter(r => r.status === statusFilter);
    if (severityFilter) filtered = filtered.filter(r => r.severity === severityFilter);
    if (syncFilter) filtered = filtered.filter(r => r.sync_status === syncFilter);

    const counts = rawRemarks.reduce((acc, r) => {
      acc.total++; if (r.status === 'open') acc.open++; if (r.status === 'closed') acc.closed++; if (r.sync_status === 'failed') acc.failed++;
      return acc;
    }, { total: 0, open: 0, closed: 0, failed: 0 });

    const groupMap = {};
    filtered.forEach(r => {
      const key = r.template_id ? `TPL_${r.template_id}` : `TXT_${r.description}`;
      if (!groupMap[key]) groupMap[key] = { template: r.template, remarks: [] };
      groupMap[key].remarks.push(r);
    });
    const groups = Object.values(groupMap).sort((a, b) => b.remarks.length - a.remarks.length);

    return { filteredRemarks: filtered, counters, aggregatedGroups: groups };
  }, [rawRemarks, statusFilter, severityFilter, syncFilter, searchQuery]);

  // --- Handlers ---
  const createAndLinkTemplate = async (templateData, remarkId) => {
    const existing = await db.remark_templates.where('title').equals(templateData.description).first();
    if (existing) {
      await db.remarks.update(remarkId, {
        template_id: existing.id, description: null,
        suffix_note: templateData.suffix_note || '',
        action_required: existing.default_action, severity: existing.default_severity,
        sync_status: 'local'
      });
      return existing.id;
    }
    const newTemplate = {
      template_code: `TPL-${uuidv4().slice(0, 8).toUpperCase()}`,
      title: templateData.description, description: templateData.description,
      default_action: templateData.action_required || '', default_severity: templateData.severity,
      boq_tags: templateData.boq_code ? [templateData.boq_code] : ['ALL'],
      is_active: true, version: 1, created_by: 'field_engineer', created_at: new Date().toISOString()
    };
    const templateId = await db.remark_templates.add(newTemplate);
    await db.remarks.update(remarkId, {
      template_id: templateId, description: null,
      suffix_note: templateData.suffix_note || '',
      action_required: newTemplate.default_action, severity: newTemplate.default_severity,
      sync_status: 'local'
    });
    try {
      await pushToSyncQueue('CREATE_TEMPLATE', newTemplate);
      await pushToSyncQueue('UPDATE_REMARK', { id: remarkId, template_id: templateId, description: null, suffix_note: templateData.suffix_note, severity: newTemplate.default_severity, action_required: newTemplate.default_action });
    } catch (e) {}
    return templateId;
  };

  const handleAddOrEditRemark = async (formData) => {
    setIsSaving(true); setError(null);
    try {
      if (formData.id) {
        const original = await db.remarks.get(formData.id);
        const updatedFields = {
          template_id: formData.template_id, description: formData.template_id ? null : formData.description,
          suffix_note: formData.template_id ? formData.suffix_note : null,
          severity: formData.severity, action_required: formData.action_required || null,
          deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
          sync_status: 'local', boq_code: original.boq_code
        };
        await db.remarks.update(formData.id, updatedFields);
        await pushToSyncQueue('UPDATE_REMARK', { id: formData.id, local_uuid: formData.local_uuid, ...updatedFields });
        setEditingRemark(null);
        setError({ type: 'success', message: 'تم التحديث.' });
      } else {
        const localUuid = uuidv4();
        const newRemark = {
          local_uuid: localUuid, latrine_id: latrineId, boq_code: boqCode || null, template_id: null,
          description: formData.description, suffix_note: formData.suffix_note,
          severity: formData.severity, action_required: formData.action_required || null,
          deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
          status: 'open', sync_status: 'local', date_logged: new Date().toISOString(), closed_date: null
        };
        const remarkId = await db.remarks.add(newRemark);
        if (formData.save_as_template) {
          try {
            await createAndLinkTemplate({ description: formData.description, severity: formData.severity, action_required: formData.action_required, boq_code: boqCode, suffix_note: formData.suffix_note }, remarkId);
            setError({ type: 'success', message: '✅ تم الحفظ كقالب.' });
          } catch { setError({ type: 'warning', message: '⚠️ تم الحفظ لكن فشل القالب.' }); }
        } else {
          await pushToSyncQueue('CREATE_REMARK', newRemark);
          setError({ type: 'success', message: '✅ تم التسجيل.' });
        }
      }
    } catch (err) { setError({ type: 'error', message: 'فشل: ' + err.message }); }
    finally { setIsSaving(false); }
  };

  const handleSaveAsTemplateFromCard = async (remark) => {
    setProcessingIds(prev => new Set(prev).add(remark.id));
    try {
      await createAndLinkTemplate({ description: remark.description, severity: remark.severity, action_required: remark.action_required, boq_code: remark.boq_code, suffix_note: remark.suffix_note }, remark.id);
      setError({ type: 'success', message: 'تم حفظ القالب.' });
    } catch { setError({ type: 'error', message: 'فشل.' }); }
    finally { setProcessingIds(prev => { const n = new Set(prev); n.delete(remark.id); return n; }); }
  };

  const handleBulkClose = async (remarksToClose) => {
    const ids = remarksToClose.map(r => r.id);
    setProcessingIds(prev => new Set([...prev, ...ids]));
    try {
      const closedDate = new Date().toISOString();
      await db.transaction('rw', db.remarks, db.sync_queue, async () => {
        for (const remark of remarksToClose) {
          await db.remarks.update(remark.id, { status: 'closed', closed_date: closedDate, sync_status: remark.sync_status === 'synced' ? 'pending' : 'local' });
          await pushToSyncQueue('UPDATE_REMARK', { id: remark.id, local_uuid: remark.local_uuid, status: 'closed', closed_date: closedDate });
        }
      });
    } catch { setError({ type: 'error', message: 'فشل الإغلاق.' }); }
    finally { setProcessingIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; }); }
  };

  const handleRetrySync = async () => {
    if (!navigator.onLine) { setError({ type: 'error', message: 'غير متصل.' }); return; }
    setIsRetrying(true);
    try { await retryFailedSync(); setError({ type: 'success', message: 'تمت المزامنة.' }); }
    catch { setError({ type: 'error', message: 'فشل.' }); }
    finally { setIsRetrying(false); }
  };

  const getLatrineCode = useCallback((id) => {
    if (latrineId && latrine) return latrine.latrine_id;
    const l = allLatrines?.find(x => x.id === id);
    return l ? l.latrine_id : `ID:${id}`;
  }, [latrineId, latrine, allLatrines]);

  if (latrineId && !latrine) return <LoadingSkeleton />;

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2 style={{ color: '#1A3A5C', margin: 0 }}>
          {!latrineId ? 'منصة إدارة العيوب' : boqCode ? `ملاحظات البند ${boqCode} - ${latrine.latrine_id}` : `ملاحظات ${latrine.latrine_id}`}
        </h2>
        <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer' }}>← العودة</button>
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {editingRemark && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', border: '2px solid #3498db' }}>
          <SmartRemarkForm initialData={editingRemark} boqCode={boqCode || editingRemark.boq_code} isSaving={isSaving} onSubmit={handleAddOrEditRemark} onCancel={() => setEditingRemark(null)} templates={templates} />
        </div>
      )}
      {!editingRemark && latrineId && (
        <SmartRemarkForm boqCode={boqCode} isSaving={isSaving} onSubmit={handleAddOrEditRemark} templates={templates} />
      )}

      {!latrineId && <ViewModeTabs active={viewMode} onChange={setViewMode} />}

      {/* Context-sensitive filters */}
      {viewMode !== 'analytics' && (
        <div style={{ background: 'white', padding: '10px', borderRadius: '8px', marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="🔍 بحث..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ flex: 2, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="">الشدة</option><option value="critical">حرجة</option><option value="major">كبيرة</option><option value="minor">طفيفة</option>
          </select>
          {viewMode === 'raw' && (
            <>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
                <option value="">الحالة</option><option value="open">مفتوحة</option><option value="closed">مغلقة</option>
              </select>
              <select value={syncFilter} onChange={e => setSyncFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
                <option value="">المزامنة</option><option value="local">محلي</option><option value="synced">مُزامن</option><option value="failed">فشل</option>
              </select>
            </>
          )}
        </div>
      )}

      {counters.failed > 0 && (
        <button onClick={handleRetrySync} disabled={isRetrying} style={{ marginBottom: '15px', padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          🔄 إعادة إرسال ({counters.failed})
        </button>
      )}

      {/* Content */}
      {!rawRemarks ? <LoadingSkeleton /> : filteredRemarks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '8px' }}>📭 لا توجد ملاحظات</div>
      ) : (
        <>
          {viewMode === 'contractor' && (
            <div>
              {['critical', 'major', 'minor'].map(sev => {
                const items = aggregatedGroups.filter(g => (g.template?.default_severity || g.remarks[0].severity) === sev);
                if (items.length === 0) return null;
                return (
                  <div key={sev}>
                    <h3 style={{ color: UI_COLORS.severity[sev], marginBottom: '10px' }}>
                      {sev === 'critical' ? '🔴 أولوية عاجلة (حرجة)' : sev === 'major' ? '🟠 أولوية متوسطة (كبيرة)' : '🟡 أولوية عادية (طفيفة)'}
                    </h3>
                    {items.map((issue, idx) => (
                      <ContractorActionCard key={idx} issue={issue} getLatrineCode={getLatrineCode} onClose={handleBulkClose} processingIds={processingIds} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === 'inspection' && (
            <div>
              {Object.entries(filteredRemarks.reduce((acc, r) => {
                if (!acc[r.latrine_id]) acc[r.latrine_id] = [];
                acc[r.latrine_id].push(r);
                return acc;
              }, {})).map(([lid, remarks]) => (
                <InspectionCard key={lid} latrineId={parseInt(lid)} remarks={remarks} getLatrineCode={getLatrineCode} onClose={handleBulkClose} onEdit={setEditingRemark} onSaveAsTemplate={handleSaveAsTemplateFromCard} processingIds={processingIds} />
              ))}
            </div>
          )}

          {viewMode === 'analytics' && (
            <AnalyticsPanel aggregatedGroups={aggregatedGroups} counters={counters} />
          )}

          {viewMode === 'raw' && (
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
        </>
      )}
    </div>
  );
};

export default RemarksManager;