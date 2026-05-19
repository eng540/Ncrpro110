import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { pushToSyncQueue, retryFailedSync } from '../syncEngine';
import { v4 as uuidv4 } from 'uuid';

// ==========================================
// 1. Constants & Utilities (Helpers)
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
// 2. Sub-Components (Architectural Split)
// ==========================================

// --- Error Banner ---
const ErrorBanner = ({ error, onDismiss }) => {
  if (!error) return null;
  return (
    <div style={{ background: error.type === 'success' ? '#d4edda' : '#f8d7da', color: error.type === 'success' ? '#155724' : '#721c24', padding: '12px 16px', borderRadius: '6px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
      <span>{error.type === 'success' ? '✅' : '⚠️'} {error.message}</span>
      <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'inherit' }}>✖</button>
    </div>
  );
};

// --- Loading Skeleton ---
const LoadingSkeleton = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
    {[1, 2, 3].map(i => (
      <div key={i} style={{ background: '#f0f2f5', borderRadius: '8px', height: '180px', animation: 'pulse 1.5s infinite' }}>
        <style>{`@keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }`}</style>
      </div>
    ))}
  </div>
);

// --- Add Remark Form ---
const AddRemarkForm = ({ boqCode, isSaving, onAdd }) => {
  const [desc, setDesc] = useState('');
  const [sev, setSev] = useState('minor');
  const [action, setAction] = useState('');
  const [dead, setDead] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!desc.trim()) return;
    onAdd({ description: desc, severity: sev, action_required: action, deadline: dead });
    setDesc(''); setAction(''); setDead(''); setSev('minor');
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: '#fff9e6', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #ffeaa7', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <input type="text" placeholder={boqCode ? `ملاحظة حول البند ${boqCode}...` : "ملاحظة عامة للحمام..."} value={desc} onChange={(e) => setDesc(e.target.value)} style={{ flex: 2, padding: '10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '250px' }} required disabled={isSaving} />
        <select value={sev} onChange={(e) => setSev(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} disabled={isSaving}>
          <option value="minor">طفيفة</option><option value="major">كبيرة</option><option value="critical">حرجة</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="الإجراء المطلوب..." value={action} onChange={(e) => setAction(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '200px' }} disabled={isSaving} />
        <input type="date" value={dead} onChange={(e) => setDead(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} disabled={isSaving} />
        <button type="submit" disabled={isSaving || !desc.trim()} style={{ padding: '10px 20px', background: isSaving ? '#bdc3c7' : '#e67e22', color: 'white', border: 'none', borderRadius: '4px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
          {isSaving ? '⏳ جاري الحفظ...' : '+ تسجيل الملاحظة'}
        </button>
      </div>
    </form>
  );
};

// --- Filters & Controls Bar ---
const FiltersBar = ({ filter, setFilter, searchQuery, setSearchQuery, sortBy, setSortBy, counters, onRetrySync, isRetrying }) => (
  <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'center', justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', flex: 1 }}>
      <input type="text" placeholder="🔍 بحث برقم الملاحظة أو الوصف..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '200px', flex: 1 }} />
      <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
        <option value="">الكل ({counters.total})</option>
        <option value="open">مفتوحة ({counters.open})</option>
        <option value="closed">مغلقة ({counters.closed})</option>
        <option value="failed">فشل الإرسال ({counters.failed})</option>
      </select>
      <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
        <option value="smart">ترتيب ذكي (الأهم أولاً)</option>
        <option value="newest">الأحدث أولاً</option>
        <option value="oldest">الأقدم أولاً</option>
      </select>
    </div>
    {counters.failed > 0 && (
      <button onClick={onRetrySync} disabled={isRetrying || !navigator.onLine} style={{ padding: '8px 16px', background: navigator.onLine ? '#e74c3c' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: navigator.onLine ? 'pointer' : 'not-allowed', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
        {isRetrying ? '⏳ جاري المحاولة...' : `🔄 إعادة إرسال الفاشلة (${counters.failed})`}
      </button>
    )}
  </div>
);

// --- Single Remark Card ---
const RemarkCard = ({ r, getLatrineCode, isClosing, onClose }) => (
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
          <button onClick={() => onClose(r)} disabled={isClosing} style={{ padding: '6px 16px', background: isClosing ? '#95a5a6' : '#70AD47', color: 'white', border: 'none', borderRadius: '4px', cursor: isClosing ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold', transition: 'background 0.2s' }}>
            {isClosing ? '⏳' : '✓ إغلاق'}
          </button>
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
  // --- State Management ---
  const [filter, setFilter] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('smart');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [closingIds, setClosingIds] = useState(new Set()); // Prevent double submission

  // --- Live Queries (Optimized) ---
  const latrine = useLiveQuery(() => latrineId ? db.latrines.get(latrineId) : null, [latrineId]);
  const allLatrines = useLiveQuery(() => !latrineId ? db.latrines.toArray() : [], [latrineId]); // Only fetch if project-wide
  
  const rawRemarks = useLiveQuery(() => {
    if (!latrineId) return db.remarks.toArray();
    if (boqCode) return db.remarks.where({ latrine_id: latrineId, boq_code: boqCode }).toArray();
    return db.remarks.where({ latrine_id: latrineId }).toArray();
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
  const { processedRemarks, counters } = useMemo(() => {
    if (!rawRemarks) return { processedRemarks: [], counters: { total: 0, open: 0, closed: 0, failed: 0 } };

    let filtered = rawRemarks;

    // 1. Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        (r.remark_id && r.remark_id.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.action_required && r.action_required.toLowerCase().includes(q))
      );
    }

    // 2. Filter
    if (filter) {
      if (['open', 'closed', 'overdue'].includes(filter)) filtered = filtered.filter(r => r.status === filter);
      else if (['minor', 'major', 'critical'].includes(filter)) filtered = filtered.filter(r => r.severity === filter);
      else if (['local', 'pending', 'synced', 'failed'].includes(filter)) filtered = filtered.filter(r => r.sync_status === filter);
    }

    // 3. Sort
    filtered.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.date_logged) - new Date(a.date_logged);
      if (sortBy === 'oldest') return new Date(a.date_logged) - new Date(b.date_logged);
      
      // Smart Sort: Open first > Critical first > Newest first
      if (a.status === 'open' && b.status !== 'open') return -1;
      if (a.status !== 'open' && b.status === 'open') return 1;
      
      const weightA = SEVERITY_WEIGHT[a.severity] || 0;
      const weightB = SEVERITY_WEIGHT[b.severity] || 0;
      if (weightA !== weightB) return weightB - weightA;
      
      return new Date(b.date_logged) - new Date(a.date_logged);
    });

    // 4. Counters
    const counts = rawRemarks.reduce((acc, r) => {
      acc.total++;
      if (r.status === 'open') acc.open++;
      if (r.status === 'closed') acc.closed++;
      if (r.sync_status === 'failed') acc.failed++;
      return acc;
    }, { total: 0, open: 0, closed: 0, failed: 0 });

    return { processedRemarks: filtered, counters: counts };
  }, [rawRemarks, filter, searchQuery, sortBy]);

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
        description: formData.description.trim(),
        severity: formData.severity,
        action_required: formData.action_required.trim() || null,
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

  const handleCloseRemark = async (remark) => {
    if (closingIds.has(remark.id)) return; // Prevent double click
    
    setClosingIds(prev => new Set(prev).add(remark.id));
    setError(null);
    try {
      const closedDate = new Date().toISOString();
      const newSyncStatus = remark.sync_status === 'synced' ? 'pending' : 'local';
      
      await db.remarks.update(remark.id, { 
        status: 'closed', 
        closed_date: closedDate,
        sync_status: newSyncStatus
      });

      await pushToSyncQueue('UPDATE_REMARK', {
        local_uuid: remark.local_uuid,
        status: 'closed',
        closed_date: closedDate
      });
    } catch (err) {
      console.error('Close remark error:', err);
      setError({ type: 'error', message: 'فشل إغلاق الملاحظة.' });
    } finally {
      setClosingIds(prev => {
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

      {latrineId && (
        <AddRemarkForm boqCode={boqCode} isSaving={isSaving} onAdd={handleAddRemark} />
      )}

      <FiltersBar 
        filter={filter} setFilter={setFilter} 
        searchQuery={searchQuery} setSearchQuery={setSearchQuery} 
        sortBy={sortBy} setSortBy={setSortBy} 
        counters={counters} 
        onRetrySync={handleRetrySync} isRetrying={isRetrying} 
      />

      {!rawRemarks ? (
        <LoadingSkeleton />
      ) : processedRemarks.length === 0 ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#7f8c8d', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>📭</div>
          <h3 style={{ margin: 0 }}>لا توجد ملاحظات مطابقة للبحث أو الفلتر.</h3>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {processedRemarks.map(r => (
            <RemarkCard 
              key={r.id} 
              r={r} 
              getLatrineCode={getLatrineCode} 
              isClosing={closingIds.has(r.id)} 
              onClose={handleCloseRemark} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default RemarksManager;