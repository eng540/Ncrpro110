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

// --- Aggregated Card (للمشروع الشامل) ---
const AggregatedRemarkCard = ({ group, getLatrineCode, isProcessing, onClose }) => {
  const tpl = group.template;
  const remarks = group.remarks;
  const severity = tpl ? tpl.default_severity : remarks[0].severity;
  const title = tpl ? tpl.title : remarks[0].description;
  const action = tpl ? tpl.default_action : remarks[0].action_required;
  const boqCode = remarks[0].boq_code;

  return (
    <div style={{ background: 'white', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderRight: `4px solid ${UI_COLORS.severity[severity]}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'flex-start', flexWrap: 'wrap', gap: '5px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#2c3e50' }}>
            {tpl ? `📋 ${title}` : `📝 ${title}`}
          </span>
          <div style={{ display: 'flex', gap: '5px' }}>
            {boqCode && <span style={{ background: '#ecf0f1', color: '#2c3e50', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>بند: {boqCode}</span>}
            <span style={{ background: UI_COLORS.severity[severity], color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>{severity}</span>
          </div>
        </div>
        {tpl && <div style={{ fontSize: '13px', color: '#666', marginBottom: '12px', lineHeight: '1.5' }}>{tpl.description}</div>}
        {action && <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px', background: '#e8f4f8', padding: '8px', borderRadius: '4px', borderRight: '2px solid #3498db' }}><strong>الإجراء القياسي:</strong> {action}</div>}
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '11px', color: '#7f8c8d', marginBottom: '5px', fontWeight: 'bold' }}>موجودة في ({remarks.length}) حمامات:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
            {remarks.map(r => (
              <span key={r.id} style={{ background: '#f8f9fa', border: '1px solid #dee2e6', color: '#495057', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {getLatrineCode(r.latrine_id)}
                {r.suffix_note && <span title={r.suffix_note}>💬</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => onClose(remarks)} disabled={isProcessing} style={{ padding: '6px 16px', background: isProcessing ? '#95a5a6' : '#70AD47', color: 'white', border: 'none', borderRadius: '4px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
          {isProcessing ? '⏳' : '✓ إغلاق المجموعة (Bulk Close)'}
        </button>
      </div>
    </div>
  );
};

// --- Single Card (مع أزرار تعديل وإغلاق وحفظ كقالب) ---
const SingleRemarkCard = ({ r, getLatrineCode, isProcessing, onClose, onEdit, onSaveAsTemplate }) => {
  // زر حفظ كقالب يظهر فقط للملاحظات اليدوية المفتوحة التي لا ترتبط بقالب
  const showSaveAsTemplate = r.status === 'open' && !r.template_id && r.description;

  return (
    <div style={{ background: 'white', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderRight: `4px solid ${UI_COLORS.severity[r.severity]}`, opacity: r.status === 'closed' ? 0.7 : 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'flex-start', flexWrap: 'wrap', gap: '5px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1F4E78' }}>
            {r.remark_id || `REM-${r.local_uuid?.slice(0, 8) || r.id}`}
          </span>
          <div style={{ display: 'flex', gap: '5px' }}>
            <span style={{ background: UI_COLORS.severity[r.severity], color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>{r.severity}</span>
            <span style={{ background: UI_COLORS.sync[r.sync_status || 'local'], color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>{UI_LABELS.sync[r.sync_status || 'local']}</span>
          </div>
        </div>
        <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px', background: '#f8f9fa', padding: '4px 8px', borderRadius: '4px' }}>
          الحمام: <strong style={{color: '#2c3e50'}}>{getLatrineCode(r.latrine_id)}</strong> {r.boq_code ? `| البند: ${r.boq_code}` : '| عام'}
        </div>
        <div style={{ marginBottom: '12px', fontWeight: r.status === 'open' ? 'bold' : 'normal', fontSize: '14px', lineHeight: '1.5' }}>
          {r.template ? `📋 ${r.template.title}` : r.description}
          {r.suffix_note && <div style={{ fontSize: '12px', color: '#e67e22', marginTop: '4px' }}>💬 {r.suffix_note}</div>}
        </div>
        {(r.action_required || r.template?.default_action) && (
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px', background: '#e8f4f8', padding: '8px', borderRadius: '4px', borderRight: '2px solid #3498db' }}>
            <strong>الإجراء:</strong> {r.action_required || r.template?.default_action}
          </div>
        )}
      </div>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
          <span style={{ background: UI_COLORS.status[r.status] || UI_COLORS.sync.local, padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', color: r.status === 'open' ? '#856404' : r.status === 'overdue' ? '#721c24' : '#155724' }}>
            {UI_LABELS.status[r.status] || r.status}
          </span>
          {r.status === 'open' && (
            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
              <button onClick={() => onEdit(r)} disabled={isProcessing} style={{ padding: '6px 12px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                ✏️ تعديل
              </button>
              {showSaveAsTemplate && (
                <button onClick={() => onSaveAsTemplate(r)} disabled={isProcessing} style={{ padding: '6px 12px', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                  📋 حفظ كقالب
                </button>
              )}
              <button onClick={() => onClose([r])} disabled={isProcessing} style={{ padding: '6px 12px', background: isProcessing ? '#95a5a6' : '#70AD47', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                {isProcessing ? '⏳' : '✓ إغلاق'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. Main Component
// ==========================================
const RemarksManager = ({ latrineId, boqCode, initialFilter = '', onBack }) => {
  const [statusFilter, setStatusFilter] = useState(initialFilter);
  const [severityFilter, setSeverityFilter] = useState('');
  const [syncFilter, setSyncFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('smart');
  const [groupBy, setGroupBy] = useState('none');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
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
    const enriched = await Promise.all(raw.map(async r => {
      const tpl = r.template_id ? await db.remark_templates.get(r.template_id) : null;
      return { ...r, template: tpl };
    }));
    return enriched;
  }, [latrineId, boqCode]);

  useEffect(() => {
    const handleOnline = async () => {
      const failedCount = await db.remarks.where('sync_status').equals('failed').count();
      if (failedCount > 0) {
        setError({ type: 'warning', message: 'عاد الاتصال بالإنترنت. جاري محاولة إرسال الملاحظات الفاشلة تلقائياً...' });
        handleRetrySync();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const { processedRemarks, counters, aggregatedGroups } = useMemo(() => {
    if (!rawRemarks) return { processedRemarks: [], counters: { total: 0, open: 0, closed: 0, failed: 0 }, aggregatedGroups: [] };

    let filtered = rawRemarks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        (r.remark_id && r.remark_id.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.template && r.template.title.toLowerCase().includes(q)) ||
        (r.suffix_note && r.suffix_note.toLowerCase().includes(q))
      );
    }

    if (statusFilter) filtered = filtered.filter(r => r.status === statusFilter);
    if (severityFilter) filtered = filtered.filter(r => r.severity === severityFilter);
    if (syncFilter) filtered = filtered.filter(r => r.sync_status === syncFilter);

    // Sorting
    if (sortBy === 'newest') filtered.sort((a, b) => new Date(b.date_logged) - new Date(a.date_logged));
    else if (sortBy === 'oldest') filtered.sort((a, b) => new Date(a.date_logged) - new Date(b.date_logged));
    else if (sortBy === 'severity') filtered.sort((a, b) => (SEVERITY_WEIGHT[b.severity] || 0) - (SEVERITY_WEIGHT[a.severity] || 0));
    else if (sortBy === 'frequency') {
      const countMap = {};
      filtered.forEach(r => { const key = r.template_id || r.description; countMap[key] = (countMap[key] || 0) + 1; });
      filtered.sort((a, b) => (countMap[b.template_id || b.description] || 0) - (countMap[a.template_id || a.description] || 0));
    } else {
      filtered.sort((a, b) => {
        if (a.status === 'open' && b.status !== 'open') return -1;
        if (a.status !== 'open' && b.status === 'open') return 1;
        const wA = SEVERITY_WEIGHT[a.severity] || 0, wB = SEVERITY_WEIGHT[b.severity] || 0;
        if (wA !== wB) return wB - wA;
        return new Date(b.date_logged) - new Date(a.date_logged);
      });
    }

    const counts = rawRemarks.reduce((acc, r) => {
      acc.total++;
      if (r.status === 'open') acc.open++;
      if (r.status === 'closed') acc.closed++;
      if (r.sync_status === 'failed') acc.failed++;
      return acc;
    }, { total: 0, open: 0, closed: 0, failed: 0 });

    let groups = [];
    if (!latrineId) {
      const groupMap = {};
      filtered.forEach(r => {
        let key;
        if (groupBy === 'latrine') {
          const l = allLatrines?.find(x => x.id === r.latrine_id);
          key = l ? l.latrine_id : `حمام ${r.latrine_id}`;
        } else if (groupBy === 'boq') {
          key = r.boq_code ? `بند ${r.boq_code}` : 'ملاحظات عامة';
        } else {
          key = r.template_id ? `TPL_${r.template_id}` : `TXT_${r.description}`;
        }

        if (!groupMap[key]) {
          groupMap[key] = { template: r.template, remarks: [], groupName: key };
        }
        groupMap[key].remarks.push(r);
      });
      groups = Object.values(groupMap).sort((a, b) => b.remarks.length - a.remarks.length);
    }

    return { processedRemarks: filtered, counters: counts, aggregatedGroups: groups };
  }, [rawRemarks, statusFilter, severityFilter, syncFilter, searchQuery, sortBy, groupBy, allLatrines, latrineId]);

  // --- حفظ القالب مع ربط الملاحظة ---
  const createAndLinkTemplate = async (templateData, remarkId) => {
    const existing = await db.remark_templates.where('title').equals(templateData.description).first();
    if (existing) {
      // إذا كان القالب موجوداً مسبقاً، نربط الملاحظة به مباشرة
      await db.remarks.update(remarkId, {
        template_id: existing.id,
        description: null,
        suffix_note: templateData.suffix_note || '',
        action_required: existing.default_action,
        severity: existing.default_severity,
        sync_status: 'local'
      });
      return existing.id;
    }

    const newTemplate = {
      template_code: `TPL-${uuidv4().slice(0, 8).toUpperCase()}`,
      title: templateData.description,
      description: templateData.description,
      default_action: templateData.action_required || '',
      default_severity: templateData.severity,
      boq_tags: templateData.boq_code ? [templateData.boq_code] : ['ALL'],
      is_active: true,
      version: 1,
      created_by: 'field_engineer',
      created_at: new Date().toISOString()
    };

    const templateId = await db.remark_templates.add(newTemplate);

    // ربط الملاحظة بالقالب الجديد
    await db.remarks.update(remarkId, {
      template_id: templateId,
      description: null,
      suffix_note: templateData.suffix_note || '',
      action_required: newTemplate.default_action,
      severity: newTemplate.default_severity,
      sync_status: 'local'
    });

    try {
      await pushToSyncQueue('CREATE_TEMPLATE', newTemplate);
      await pushToSyncQueue('UPDATE_REMARK', {
        id: remarkId,
        local_uuid: '', // سنتركه فارغًا أو نأخذه من الملاحظة الأصلية
        template_id: templateId,
        description: null,
        suffix_note: templateData.suffix_note || '',
        severity: newTemplate.default_severity,
        action_required: newTemplate.default_action
      });
    } catch (syncErr) {
      console.warn('فشل دفع التحديثات للطابور:', syncErr);
    }

    return templateId;
  };

  const handleAddOrEditRemark = async (formData) => {
    setIsSaving(true);
    setError(null);
    try {
      if (formData.id) {
        // تعديل ملاحظة موجودة (دعم ربط القالب واستبدال الوصف)
        const updatedFields = {
          template_id: formData.template_id,
          description: formData.template_id ? null : formData.description,
          suffix_note: formData.template_id ? formData.suffix_note : null,
          severity: formData.severity,
          action_required: formData.action_required || null,
          deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
          sync_status: 'local'
        };

        await db.remarks.update(formData.id, updatedFields);
        await pushToSyncQueue('UPDATE_REMARK', {
          id: formData.id,
          local_uuid: formData.local_uuid,
          ...updatedFields
        });

        setEditingRemark(null);
        setError({ type: 'success', message: 'تم تحديث الملاحظة وربطها بالقالب بنجاح.' });
      } else {
        // إضافة جديدة
        const localUuid = uuidv4();
        const newRemark = {
          local_uuid: localUuid,
          latrine_id: latrineId,
          boq_code: boqCode || null,
          template_id: null, // مؤقتاً
          description: formData.description,
          suffix_note: formData.suffix_note,
          severity: formData.severity,
          action_required: formData.action_required || null,
          deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
          status: 'open',
          sync_status: 'local',
          date_logged: new Date().toISOString(),
          closed_date: null
        };

        const remarkId = await db.remarks.add(newRemark);

        if (formData.save_as_template) {
          try {
            await createAndLinkTemplate({
              description: formData.description,
              severity: formData.severity,
              action_required: formData.action_required,
              boq_code: boqCode,
              suffix_note: formData.suffix_note || ''
            }, remarkId);
            setError({ type: 'success', message: '✅ تم تسجيل الملاحظة وحفظها كقالب جديد.' });
          } catch (templateErr) {
            console.error('Template save failed:', templateErr);
            setError({ type: 'warning', message: '⚠️ تم تسجيل الملاحظة ولكن فشل حفظ القالب.' });
          }
        } else {
          // بدون قالب، فقط نضيف للطابور
          await pushToSyncQueue('CREATE_REMARK', newRemark);
          setError({ type: 'success', message: '✅ تم تسجيل الملاحظة.' });
        }
      }
    } catch (err) {
      console.error('Add/Edit remark error:', err);
      setError({ type: 'error', message: 'فشل حفظ الملاحظة: ' + err.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAsTemplateFromCard = async (remark) => {
    setProcessingIds(prev => new Set(prev).add(remark.id));
    try {
      await createAndLinkTemplate({
        description: remark.description,
        severity: remark.severity,
        action_required: remark.action_required,
        boq_code: remark.boq_code,
        suffix_note: remark.suffix_note || ''
      }, remark.id);
      setError({ type: 'success', message: 'تم حفظ الملاحظة كقالب جديد وربطها به.' });
    } catch (err) {
      setError({ type: 'error', message: 'فشل حفظ القالب.' });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(remark.id);
        return next;
      });
    }
  };

  const handleBulkClose = async (remarksToClose) => {
    const ids = remarksToClose.map(r => r.id);
    setProcessingIds(prev => new Set([...prev, ...ids]));
    try {
      const closedDate = new Date().toISOString();
      await db.transaction('rw', db.remarks, db.sync_queue, async () => {
        for (const remark of remarksToClose) {
          const newSyncStatus = remark.sync_status === 'synced' ? 'pending' : 'local';
          await db.remarks.update(remark.id, { status: 'closed', closed_date: closedDate, sync_status: newSyncStatus });
          await pushToSyncQueue('UPDATE_REMARK', { id: remark.id, local_uuid: remark.local_uuid, status: 'closed', closed_date: closedDate });
        }
      });
    } catch (err) {
      setError({ type: 'error', message: 'فشل إغلاق الملاحظات.' });
    } finally {
      setProcessingIds(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
    }
  };

  const handleRetrySync = async () => {
    if (!navigator.onLine) {
      setError({ type: 'error', message: 'لا يوجد اتصال بالإنترنت لإعادة المحاولة.' });
      return;
    }
    setIsRetrying(true);
    setError(null);
    try {
      const result = await retryFailedSync();
      if (result.failed > 0) setError({ type: 'error', message: `تمت المزامنة جزئياً. فشل إرسال ${result.failed} ملاحظة.` });
      else setError({ type: 'success', message: 'تمت إعادة مزامنة جميع الملاحظات الفاشلة بنجاح.' });
    } catch (err) {
      setError({ type: 'error', message: 'فشلت محاولة إعادة المزامنة: ' + err.message });
    } finally {
      setIsRetrying(false);
    }
  };

  const getLatrineCode = useCallback((id) => {
    if (latrineId && latrine) return latrine.latrine_id;
    const l = allLatrines?.find(x => x.id === id);
    return l ? l.latrine_id : `ID:${id}`;
  }, [latrineId, latrine, allLatrines]);

  if (latrineId && !latrine) return <div style={{ padding: '40px' }}><LoadingSkeleton /></div>;

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: '#1F4E78', margin: 0 }}>
          {!latrineId ? 'سجل الملاحظات الشامل للمشروع' : boqCode ? `ملاحظات البند (${boqCode}) - حمام ${latrine.latrine_id}` : `الملاحظات العامة - حمام ${latrine.latrine_id}`}
        </h2>
        <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          &larr; العودة
        </button>
      </div>

      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {editingRemark ? (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', border: '2px solid #3498db' }}>
          <SmartRemarkForm initialData={editingRemark} boqCode={boqCode || editingRemark.boq_code} isSaving={isSaving} onSubmit={handleAddOrEditRemark} onCancel={() => setEditingRemark(null)} templates={templates} />
        </div>
      ) : latrineId && (
        <SmartRemarkForm boqCode={boqCode} isSaving={isSaving} onSubmit={handleAddOrEditRemark} templates={templates} />
      )}

      {/* فلاتر متكاملة */}
      <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
          <input type="text" placeholder="🔍 بحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '150px', flex: 1 }} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="">الحالة (الكل)</option>
            <option value="open">مفتوحة ({counters.open})</option>
            <option value="closed">مغلقة ({counters.closed})</option>
            <option value="overdue">متأخرة</option>
          </select>
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="">الشدة (الكل)</option>
            <option value="minor">طفيفة</option>
            <option value="major">كبيرة</option>
            <option value="critical">حرجة</option>
          </select>
          <select value={syncFilter} onChange={e => setSyncFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="">المزامنة (الكل)</option>
            <option value="local">محلي</option>
            <option value="pending">قيد الإرسال</option>
            <option value="synced">مُزامن</option>
            <option value="failed">فشل الإرسال</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '2px solid #3498db', fontWeight: 'bold', color: '#2c3e50' }}>
            <option value="smart">ترتيب ذكي</option>
            <option value="newest">الأحدث</option>
            <option value="oldest">الأقدم</option>
            <option value="severity">حسب الخطورة</option>
            <option value="frequency">حسب التكرار</option>
          </select>
          {!latrineId && (
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '2px solid #8e44ad', fontWeight: 'bold', color: '#2c3e50' }}>
              <option value="none">تجميع حسب المشكلة</option>
              <option value="latrine">تجميع حسب الحمام</option>
              <option value="boq">تجميع حسب البند</option>
            </select>
          )}
        </div>
        {counters.failed > 0 && (
          <button onClick={handleRetrySync} disabled={isRetrying || !navigator.onLine} style={{ padding: '8px 16px', background: navigator.onLine ? '#e74c3c' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: navigator.onLine ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
            {isRetrying ? '⏳...' : `🔄 إعادة إرسال (${counters.failed})`}
          </button>
        )}
      </div>

      {/* عرض المحتوى */}
      {!rawRemarks ? (
        <LoadingSkeleton />
      ) : processedRemarks.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#7f8c8d', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>📭</div>
          <h3 style={{ margin: 0 }}>لا توجد ملاحظات مطابقة للبحث أو الفلتر.</h3>
        </div>
      ) : latrineId || groupBy !== 'none' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {latrineId 
            ? processedRemarks.map(r => <SingleRemarkCard key={r.id} r={r} getLatrineCode={getLatrineCode} isProcessing={processingIds.has(r.id)} onClose={handleBulkClose} onEdit={setEditingRemark} onSaveAsTemplate={handleSaveAsTemplateFromCard} />)
            : aggregatedGroups.map((group, idx) => <AggregatedRemarkCard key={idx} group={group} getLatrineCode={getLatrineCode} isProcessing={group.remarks.some(r => processingIds.has(r.id))} onClose={handleBulkClose} />)
          }
        </div>
      ) : (
        <div>
          {aggregatedGroups.map((group, idx) => (
            <div key={idx} style={{ marginBottom: '30px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div style={{ background: '#1F4E78', color: 'white', padding: '12px 20px', fontWeight: 'bold', fontSize: '16px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{group.groupName}</span>
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{group.remarks.length} ملاحظة</span>
              </div>
              <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px', background: '#f8f9fa' }}>
                {group.remarks.map(r => (
                  <SingleRemarkCard key={r.id} r={r} getLatrineCode={getLatrineCode} isProcessing={processingIds.has(r.id)} onClose={handleBulkClose} onEdit={setEditingRemark} onSaveAsTemplate={handleSaveAsTemplateFromCard} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RemarksManager;