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
  return (
    <div style={{ background: error.type === 'success' ? '#d4edda' : '#f8d7da', color: error.type === 'success' ? '#155724' : '#721c24', padding: '12px 16px', borderRadius: '6px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
      <span>{error.type === 'success' ? '✅' : '⚠️'} {error.message}</span>
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

// --- 🌟 Smart Remark Form (Autocomplete + Auto-Populate) ---
const SmartRemarkForm = ({ boqCode, isSaving, onSubmit, onCancel, templates }) => {
  const [desc, setDesc] = useState('');
  const [suffix, setSuffix] = useState('');
  const [sev, setSev] = useState('minor');
  const [action, setAction] = useState('');
  const [dead, setDead] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const wrapperRef = useRef(null);

  // إغلاق القائمة المنسدلة عند النقر خارجها
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  // 🌟 الفلترة السياقية (Contextual Filtering)
  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    let filtered = templates;
    
    // فلترة حسب البند (إذا كان محدداً)
    if (boqCode) {
      filtered = filtered.filter(t => 
        !t.boq_tags || t.boq_tags.length === 0 || t.boq_tags.includes('ALL') || t.boq_tags.includes(boqCode)
      );
    }
    
    // فلترة حسب النص المدخل (Search-As-You-Type)
    if (desc.trim()) {
      const q = desc.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    return filtered;
  }, [templates, boqCode, desc]);

  const handleSelectTemplate = (tpl) => {
    setSelectedTemplate(tpl);
    setDesc(tpl.title);
    setSev(tpl.default_severity || 'minor');
    setAction(tpl.default_action || '');
    setShowSuggestions(false);
  };

  const handleDescChange = (e) => {
    setDesc(e.target.value);
    setSelectedTemplate(null); // إذا غير النص يدوياً، نلغي القالب
    setShowSuggestions(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!desc.trim()) return;
    
    onSubmit({ 
      template_id: selectedTemplate ? selectedTemplate.id : null,
      description: selectedTemplate ? null : desc.trim(), // Legacy mode if no template
      suffix_note: selectedTemplate ? suffix.trim() : null, // Smart mode suffix
      severity: sev, 
      action_required: action.trim(), 
      deadline: dead 
    });
    
    setDesc(''); setSuffix(''); setAction(''); setDead(''); setSev('minor'); setSelectedTemplate(null);
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: '#fff9e6', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #ffeaa7', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        
        {/* حقل البحث الذكي */}
        <div ref={wrapperRef} style={{ flex: 2, minWidth: '250px', position: 'relative' }}>
          <input 
            type="text" 
            placeholder={boqCode ? `ابحث عن مشكلة في البند ${boqCode}...` : "ابحث في مكتبة المشاكل..."}
            value={desc} 
            onChange={handleDescChange}
            onFocus={() => setShowSuggestions(true)}
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box', background: selectedTemplate ? '#e8f8f5' : 'white' }}
            required 
            disabled={isSaving} 
          />
          
          {/* القائمة المنسدلة للقوالب */}
          {showSuggestions && filteredTemplates.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #ccc', borderRadius: '4px', zIndex: 100, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {filteredTemplates.map(tpl => (
                <div 
                  key={tpl.id} 
                  onClick={() => handleSelectTemplate(tpl)}
                  style={{ padding: '10px', borderBottom: '1px solid #eee', cursor: 'pointer', transition: 'background 0.2s' }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#f8f9fa'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                >
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

      {/* حقل الملاحظة الإضافية (يظهر فقط إذا تم اختيار قالب) */}
      {selectedTemplate && (
        <div style={{ marginBottom: '10px' }}>
          <input 
            type="text" 
            placeholder="تفاصيل إضافية خاصة بهذه الحالة (اختياري)..." 
            value={suffix} 
            onChange={(e) => setSuffix(e.target.value)} 
            style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px dashed #3498db', boxSizing: 'border-box', background: '#f4f6f6' }} 
            disabled={isSaving} 
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="الإجراء المطلوب..." value={action} onChange={(e) => setAction(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '200px' }} disabled={isSaving} />
        <input type="date" value={dead} onChange={(e) => setDead(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} disabled={isSaving} />
        
        <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={isSaving} style={{ padding: '10px 20px', background: '#ecf0f1', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>إلغاء</button>
          )}
          <button type="submit" disabled={isSaving || !desc.trim()} style={{ padding: '10px 20px', background: isSaving ? '#bdc3c7' : '#e67e22', color: 'white', border: 'none', borderRadius: '4px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            {isSaving ? '⏳ جاري الحفظ...' : '+ تسجيل الملاحظة'}
          </button>
        </div>
      </div>
    </form>
  );
};

// --- 🌟 Smart Aggregated Card (البطاقة المجمعة) ---
const AggregatedRemarkCard = ({ group, getLatrineCode, isProcessing, onClose }) => {
  const tpl = group.template;
  const remarks = group.remarks;
  const severity = tpl ? tpl.default_severity : remarks[0].severity;
  const title = tpl ? tpl.title : remarks[0].description;
  const action = tpl ? tpl.default_action : remarks[0].action_required;

  return (
    <div style={{ background: 'white', borderRadius: '8px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderRight: `4px solid ${UI_COLORS.severity[severity]}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'flex-start', flexWrap: 'wrap', gap: '5px' }}>
          <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#2c3e50' }}>
            {tpl ? `📋 ${title}` : `📝 ${title}`}
          </span>
          <span style={{ background: UI_COLORS.severity[severity], color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
            {severity}
          </span>
        </div>
        
        {tpl && (
          <div style={{ fontSize: '13px', color: '#666', marginBottom: '12px', lineHeight: '1.5' }}>
            {tpl.description}
          </div>
        )}

        {action && (
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px', background: '#e8f4f8', padding: '8px', borderRadius: '4px', borderRight: '2px solid #3498db' }}>
            <strong>الإجراء القياسي:</strong> {action}
          </div>
        )}

        {/* 🌟 Location Chips (مؤشر الانتشار) */}
        <div style={{ marginTop: '10px' }}>
          <div style={{ fontSize: '11px', color: '#7f8c8d', marginBottom: '5px', fontWeight: 'bold' }}>
            موجودة في ({remarks.length}) حمامات:
          </div>
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
        <button onClick={() => onClose(remarks)} disabled={isProcessing} style={{ padding: '6px 16px', background: isProcessing ? '#95a5a6' : '#70AD47', color: 'white', border: 'none', borderRadius: '4px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold', transition: 'background 0.2s' }}>
          {isProcessing ? '⏳' : '✓ إغلاق المجموعة (Bulk Close)'}
        </button>
      </div>
    </div>
  );
};

// --- Legacy Single Card (للملاحظات القديمة أو عرض الحمام الفردي) ---
const SingleRemarkCard = ({ r, getLatrineCode, isProcessing, onClose }) => (
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
          <button onClick={() => onClose([r])} disabled={isProcessing} style={{ padding: '6px 16px', background: isProcessing ? '#95a5a6' : '#70AD47', color: 'white', border: 'none', borderRadius: '4px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold', transition: 'background 0.2s' }}>
            {isProcessing ? '⏳' : '✓ إغلاق'}
          </button>
        )}
      </div>
    </div>
  </div>
);

// ==========================================
// 3. Main Enterprise Component
// ==========================================
const RemarksManager = ({ latrineId, boqCode, initialFilter = '', onBack }) => {
  const [filter, setFilter] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [processingIds, setProcessingIds] = useState(new Set());

  // --- Live Queries ---
  const latrine = useLiveQuery(() => latrineId ? db.latrines.get(latrineId) : null, [latrineId]);
  const allLatrines = useLiveQuery(() => !latrineId ? db.latrines.toArray() : [], [latrineId]); 
  const templates = useLiveQuery(() => db.remark_templates.toArray(), []);
  
  const rawRemarks = useLiveQuery(async () => {
    let query;
    if (!latrineId) query = db.remarks.toArray();
    else if (boqCode) query = db.remarks.where({ latrine_id: latrineId, boq_code: boqCode }).toArray();
    else query = db.remarks.where({ latrine_id: latrineId }).toArray();

    const raw = await query;
    // 🌟 دمج القالب مع الملاحظة إذا وجد
    const enriched = await Promise.all(raw.map(async r => {
      const tpl = r.template_id ? await db.remark_templates.get(r.template_id) : null;
      return { ...r, template: tpl };
    }));
    return enriched;
  }, [latrineId, boqCode]);

  // --- Sync Auto-Healing ---
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

  // --- Memoized Data Processing ---
  const { processedRemarks, counters, aggregatedGroups } = useMemo(() => {
    if (!rawRemarks) return { processedRemarks: [], counters: { total: 0, open: 0, closed: 0, failed: 0 }, aggregatedGroups: [] };

    let filtered = rawRemarks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        (r.remark_id && r.remark_id.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.template && r.template.title.toLowerCase().includes(q))
      );
    }

    if (filter) {
      if (['open', 'closed', 'overdue'].includes(filter)) filtered = filtered.filter(r => r.status === filter);
      else if (['minor', 'major', 'critical'].includes(filter)) filtered = filtered.filter(r => r.severity === filter);
      else if (['local', 'pending', 'synced', 'failed'].includes(filter)) filtered = filtered.filter(r => r.sync_status === filter);
    }

    const counts = rawRemarks.reduce((acc, r) => {
      acc.total++;
      if (r.status === 'open') acc.open++;
      if (r.status === 'closed') acc.closed++;
      if (r.sync_status === 'failed') acc.failed++;
      return acc;
    }, { total: 0, open: 0, closed: 0, failed: 0 });

    // 🌟 محرك التجميع (Aggregation Engine) - يعمل فقط في العرض الشامل
    let groups = [];
    if (!latrineId) {
      const groupMap = {};
      filtered.forEach(r => {
        // نجمع بناءً على Template ID، وإذا لم يوجد نجمع بناءً على النص (Legacy)
        const key = r.template_id ? `TPL_${r.template_id}` : `TXT_${r.description}`;
        if (!groupMap[key]) {
          groupMap[key] = { template: r.template, remarks: [] };
        }
        groupMap[key].remarks.push(r);
      });
      groups = Object.values(groupMap).sort((a, b) => b.remarks.length - a.remarks.length); // الأكثر تكراراً أولاً
    }

    return { processedRemarks: filtered, counters: counts, aggregatedGroups: groups };
  }, [rawRemarks, filter, searchQuery, latrineId]);

  // --- Handlers ---
  const handleAddRemark = async (formData) => {
    setIsSaving(true);
    setError(null);
    try {
      const localUuid = uuidv4();
      const newRemark = {
        local_uuid: localUuid,
        latrine_id: latrineId,
        boq_code: boqCode || null,
        template_id: formData.template_id,
        description: formData.description, // سيكون null إذا استخدمنا القالب
        suffix_note: formData.suffix_note,
        severity: formData.severity,
        action_required: formData.action_required || null,
        deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
        status: 'open',
        sync_status: 'local',
        date_logged: new Date().toISOString(),
        closed_date: null
      };

      await db.remarks.add(newRemark);
      await pushToSyncQueue('CREATE_REMARK', newRemark);
      setError({ type: 'success', message: 'تم تسجيل الملاحظة محلياً وإضافتها لطابور المزامنة.' });
    } catch (err) {
      console.error('Add remark error:', err);
      setError({ type: 'error', message: 'فشل حفظ الملاحظة في قاعدة البيانات المحلية.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkClose = async (remarksToClose) => {
    const ids = remarksToClose.map(r => r.id);
    setProcessingIds(prev => new Set([...prev, ...ids]));
    setError(null);
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
      console.error('Close remark error:', err);
      setError({ type: 'error', message: 'فشل إغلاق الملاحظات.' });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
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

  // --- Render ---
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

      {/* 🌟 نموذج الإدخال الذكي (يظهر فقط داخل الحمام) */}
      {latrineId && (
        <SmartRemarkForm boqCode={boqCode} isSaving={isSaving} onSubmit={handleAddRemark} templates={templates} />
      )}

      {/* شريط الفلاتر */}
      <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
          <input type="text" placeholder="🔍 بحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '150px', flex: 1 }} />
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="">الكل ({counters.total})</option>
            <option value="open">مفتوحة ({counters.open})</option>
            <option value="closed">مغلقة ({counters.closed})</option>
            <option value="failed">فشل الإرسال ({counters.failed})</option>
          </select>
        </div>
        {counters.failed > 0 && (
          <button onClick={handleRetrySync} disabled={isRetrying || !navigator.onLine} style={{ padding: '8px 16px', background: navigator.onLine ? '#e74c3c' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: navigator.onLine ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
            {isRetrying ? '⏳...' : `🔄 إعادة إرسال (${counters.failed})`}
          </button>
        )}
      </div>

      {/* عرض البيانات */}
      {!rawRemarks ? (
        <LoadingSkeleton />
      ) : processedRemarks.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#7f8c8d', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>📭</div>
          <h3 style={{ margin: 0 }}>لا توجد ملاحظات مطابقة للبحث أو الفلتر.</h3>
        </div>
      ) : latrineId ? (
        // 🌟 العرض الفردي (داخل الحمام)
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {processedRemarks.map(r => (
            <SingleRemarkCard key={r.id} r={r} getLatrineCode={getLatrineCode} isProcessing={processingIds.has(r.id)} onClose={handleBulkClose} />
          ))}
        </div>
      ) : (
        // 🌟 العرض المجمع (في الشاشة الشاملة للمشروع)
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {aggregatedGroups.map((group, idx) => (
            <AggregatedRemarkCard key={idx} group={group} getLatrineCode={getLatrineCode} isProcessing={group.remarks.some(r => processingIds.has(r.id))} onClose={handleBulkClose} />
          ))}
        </div>
      )}
    </div>
  );
};

export default RemarksManager;