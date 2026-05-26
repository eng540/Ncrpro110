import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

// --- RemarkForm (Used for Add & Edit) ---
const RemarkForm = ({ initialData, boqCode, isSaving, onSubmit, onCancel }) => {
  const [desc, setDesc] = useState(initialData?.description || '');
  const [sev, setSev] = useState(initialData?.severity || 'minor');
  const [action, setAction] = useState(initialData?.action_required || '');
  const [dead, setDead] = useState(initialData?.deadline ? initialData.deadline.split('T')[0] : '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!desc.trim()) return;
    onSubmit({ description: desc, severity: sev, action_required: action, deadline: dead });
    if (!initialData) {
      setDesc(''); setAction(''); setDead(''); setSev('minor');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: initialData ? 'white' : '#fff9e6', padding: '20px', borderRadius: '8px', marginBottom: initialData ? '0' : '20px', border: initialData ? 'none' : '1px solid #ffeaa7', boxShadow: initialData ? 'none' : '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <input type="text" placeholder={boqCode ? `ملاحظة حول البند ${boqCode}...` : "ملاحظة عامة للحمام..."} value={desc} onChange={(e) => setDesc(e.target.value)} style={{ flex: 2, padding: '10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '250px' }} required disabled={isSaving} />
        <select value={sev} onChange={(e) => setSev(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} disabled={isSaving}>
          <option value="minor">طفيفة</option><option value="major">كبيرة</option><option value="critical">حرجة</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="الإجراء المطلوب..." value={action} onChange={(e) => setAction(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '200px' }} disabled={isSaving} />
        <input type="date" value={dead} onChange={(e) => setDead(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} disabled={isSaving} />

        <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={isSaving} style={{ padding: '10px 20px', background: '#ecf0f1', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              إلغاء
            </button>
          )}
          <button type="submit" disabled={isSaving || !desc.trim()} style={{ padding: '10px 20px', background: isSaving ? '#bdc3c7' : (initialData ? '#3498db' : '#e67e22'), color: 'white', border: 'none', borderRadius: '4px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            {isSaving ? '⏳ جاري الحفظ...' : (initialData ? '💾 تحديث الملاحظة' : '+ تسجيل الملاحظة')}
          </button>
        </div>
      </div>
    </form>
  );
};

// --- Single Remark Card ---
const RemarkCard = ({ r, getLatrineCode, isProcessing, onClose, onEdit }) => (
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
        {r.description}
      </div>
      {r.action_required && (
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '12px', background: '#e8f4f8', padding: '8px', borderRadius: '4px', borderRight: '2px solid #3498db' }}>
          <strong>الإجراء المطلوب:</strong> {r.action_required}
        </div>
      )}
    </div>
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
        <span style={{ background: UI_COLORS.status[r.status] || UI_COLORS.sync.local, padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', color: r.status === 'open' ? '#856404' : r.status === 'overdue' ? '#721c24' : '#155724' }}>
          {UI_LABELS.status[r.status] || r.status}
        </span>

        {r.status === 'open' && (
          <div style={{ display: 'flex', gap: '5px' }}>
            <button onClick={() => onEdit(r)} disabled={isProcessing} style={{ padding: '6px 12px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
              ✏️ تعديل
            </button>
            <button onClick={() => onClose(r)} disabled={isProcessing} style={{ padding: '6px 12px', background: isProcessing ? '#95a5a6' : '#70AD47', color: 'white', border: 'none', borderRadius: '4px', cursor: isProcessing ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
              {isProcessing ? '⏳' : '✓ إغلاق'}
            </button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '11px', color: '#95a5a6' }}>
        <span>تاريخ التسجيل: {formatDate(r.date_logged)}</span>
        {r.deadline && r.status === 'open' && <span style={{ color: '#C00000', fontWeight: 'bold' }}>المهلة: {formatDate(r.deadline)}</span>}
        {r.closed_date && <span style={{ color: '#27ae60' }}>أُغلقت: {formatDate(r.closed_date)}</span>}
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
  const [sortBy, setSortBy] = useState('smart');
  const [groupBy, setGroupBy] = useState('none');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [processingIds, setProcessingIds] = useState(new Set());

  const [editingRemark, setEditingRemark] = useState(null);

  // --- Live Queries (Direct Dexie, No Encryption) ---
  const latrine = useLiveQuery(async () => {
    if (!latrineId) return null;
    return await db.latrines.get(latrineId);
  }, [latrineId]);

  const allLatrines = useLiveQuery(async () => {
    if (latrineId) return [];
    return await db.latrines.toArray();
  }, [latrineId]); 

  const rawRemarks = useLiveQuery(async () => {
    let query;
    if (!latrineId) query = db.remarks.toArray();
    else if (boqCode) query = db.remarks.where({ latrine_id: latrineId, boq_code: boqCode }).toArray();
    else query = db.remarks.where({ latrine_id: latrineId }).toArray();

    // البيانات جاهزة مباشرة
    const raw = await query;
    return raw;
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
  const { processedRemarks, counters, groupedRemarks } = useMemo(() => {
    if (!rawRemarks) return { processedRemarks: [], counters: { total: 0, open: 0, closed: 0, failed: 0 }, groupedRemarks: {} };

    let filtered = rawRemarks;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        (r.remark_id && r.remark_id.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.action_required && r.action_required.toLowerCase().includes(q))
      );
    }

    if (filter) {
      if (['open', 'closed', 'overdue'].includes(filter)) filtered = filtered.filter(r => r.status === filter);
      else if (['minor', 'major', 'critical'].includes(filter)) filtered = filtered.filter(r => r.severity === filter);
      else if (['local', 'pending', 'synced', 'failed'].includes(filter)) filtered = filtered.filter(r => r.sync_status === filter);
    }

    filtered.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.date_logged) - new Date(a.date_logged);
      if (sortBy === 'oldest') return new Date(a.date_logged) - new Date(b.date_logged);

      if (a.status === 'open' && b.status !== 'open') return -1;
      if (a.status !== 'open' && b.status === 'open') return 1;

      const weightA = SEVERITY_WEIGHT[a.severity] || 0;
      const weightB = SEVERITY_WEIGHT[b.severity] || 0;
      if (weightA !== weightB) return weightB - weightA;

      return new Date(b.date_logged) - new Date(a.date_logged);
    });

    const counts = rawRemarks.reduce((acc, r) => {
      acc.total++;
      if (r.status === 'open') acc.open++;
      if (r.status === 'closed') acc.closed++;
      if (r.sync_status === 'failed') acc.failed++;
      return acc;
    }, { total: 0, open: 0, closed: 0, failed: 0 });

    const grouped = {};
    if (groupBy !== 'none') {
      filtered.forEach(r => {
        let key = 'أخرى';
        if (groupBy === 'latrine') {
          const l = allLatrines?.find(x => x.id === r.latrine_id);
          key = l ? l.latrine_id : `حمام ${r.latrine_id}`;
        } else if (groupBy === 'boq') {
          key = r.boq_code ? `بند ${r.boq_code}` : 'ملاحظات عامة';
        }
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(r);
      });
    }

    return { processedRemarks: filtered, counters: counts, groupedRemarks: grouped };
  }, [rawRemarks, filter, searchQuery, sortBy, groupBy, allLatrines]);

  // --- Handlers (Direct DB Operations) ---
  const handleAddRemark = async (formData) => {
    setIsSaving(true);
    setError(null);
    try {
      const localUuid = uuidv4();
      const newRemark = {
        local_uuid: localUuid,
        latrine_id: latrineId,
        boq_code: boqCode || null,
        description: formData.description.trim(),
        severity: formData.severity,
        action_required: formData.action_required.trim() || null,
        deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
        status: 'open',
        sync_status: 'local',
        date_logged: new Date().toISOString(),
        closed_date: null
      };

      // ✅ حفظ مباشر في IndexedDB
      await db.remarks.add(newRemark);
      // إضافة إلى طابور المزامنة
      await pushToSyncQueue('CREATE_REMARK', newRemark);

      setError({ type: 'success', message: 'تم تسجيل الملاحظة محلياً وإضافتها لطابور المزامنة.' });
    } catch (err) {
      console.error('Add remark error:', err);
      setError({ type: 'error', message: 'فشل حفظ الملاحظة في قاعدة البيانات المحلية.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRemark = async (formData) => {
    if (!editingRemark) return;
    setIsSaving(true);
    setError(null);
    try {
      const updatedFields = {
        description: formData.description.trim(),
        severity: formData.severity,
        action_required: formData.action_required.trim() || null,
        deadline: formData.deadline ? new Date(formData.deadline).toISOString() : null,
        sync_status: editingRemark.sync_status === 'synced' ? 'pending' : 'local'
      };

      // ✅ تحديث مباشر في قاعدة البيانات
      await db.remarks.update(editingRemark.id, updatedFields);

      // إرسال التحديث للخادم عبر طابور المزامنة
      await pushToSyncQueue('UPDATE_REMARK', {
        id: editingRemark.id,
        local_uuid: editingRemark.local_uuid,
        ...updatedFields
      });

      setEditingRemark(null);
      setError({ type: 'success', message: 'تم تحديث الملاحظة بنجاح.' });
    } catch (err) {
      console.error('Edit remark error:', err);
      setError({ type: 'error', message: 'فشل تحديث الملاحظة.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCloseRemark = async (remark) => {
    if (processingIds.has(remark.id)) return;

    setProcessingIds(prev => new Set(prev).add(remark.id));
    setError(null);
    try {
      const closedDate = new Date().toISOString();
      const newSyncStatus = remark.sync_status === 'synced' ? 'pending' : 'local';

      await db.remarks.update(remark.id, { status: 'closed', closed_date: closedDate, sync_status: newSyncStatus });

      await pushToSyncQueue('UPDATE_REMARK', {
        id: remark.id,
        local_uuid: remark.local_uuid,
        status: 'closed',
        closed_date: closedDate
      });
    } catch (err) {
      console.error('Close remark error:', err);
      setError({ type: 'error', message: 'فشل إغلاق الملاحظة.' });
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(remark.id);
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
      if (result.failed > 0) {
        setError({ type: 'error', message: `تمت المزامنة جزئياً. فشل إرسال ${result.failed} ملاحظة.` });
      } else {
        setError({ type: 'success', message: 'تمت إعادة مزامنة جميع الملاحظات الفاشلة بنجاح.' });
      }
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

      {/* نموذج الإضافة / التعديل */}
      {editingRemark ? (
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', border: '2px solid #3498db' }}>
          <h3 style={{ marginTop: 0, color: '#3498db' }}>✏️ تعديل الملاحظة</h3>
          <RemarkForm
            initialData={editingRemark}
            isSaving={isSaving}
            onSubmit={handleEditRemark}
            onCancel={() => setEditingRemark(null)}
          />
        </div>
      ) : latrineId && (
        <RemarkForm
          boqCode={boqCode}
          isSaving={isSaving}
          onSubmit={handleAddRemark}
        />
      )}

      {/* شريط الفلاتر وطريقة العرض */}
      <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
          <input type="text" placeholder="🔍 بحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '150px', flex: 1 }} />
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="">الكل ({counters.total})</option>
            <option value="open">مفتوحة ({counters.open})</option>
            <option value="closed">مغلقة ({counters.closed})</option>
            <option value="failed">فشل الإرسال ({counters.failed})</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="smart">ترتيب ذكي</option>
            <option value="newest">الأحدث</option>
            <option value="oldest">الأقدم</option>
          </select>
          {!latrineId && (
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '2px solid #3498db', fontWeight: 'bold', color: '#2c3e50' }}>
              <option value="none">عرض كقائمة (بدون تجميع)</option>
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

      {/* عرض البيانات */}
      {!rawRemarks ? (
        <LoadingSkeleton />
      ) : processedRemarks.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#7f8c8d', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>📭</div>
          <h3 style={{ margin: 0 }}>لا توجد ملاحظات مطابقة للبحث أو الفلتر.</h3>
        </div>
      ) : groupBy === 'none' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {processedRemarks.map(r => (
            <RemarkCard key={r.id} r={r} getLatrineCode={getLatrineCode} isProcessing={processingIds.has(r.id)} onClose={handleCloseRemark} onEdit={setEditingRemark} />
          ))}
        </div>
      ) : (
        <div>
          {Object.entries(groupedRemarks).map(([groupName, groupItems]) => (
            <div key={groupName} style={{ marginBottom: '30px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <div style={{ background: '#1F4E78', color: 'white', padding: '12px 20px', fontWeight: 'bold', fontSize: '16px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{groupName}</span>
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '12px' }}>{groupItems.length} ملاحظة</span>
              </div>
              <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px', background: '#f8f9fa' }}>
                {groupItems.map(r => (
                  <RemarkCard key={r.id} r={r} getLatrineCode={getLatrineCode} isProcessing={processingIds.has(r.id)} onClose={handleCloseRemark} onEdit={setEditingRemark} />
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