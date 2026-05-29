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

// --- Sub-Components (ErrorBanner, LoadingSkeleton, SmartRemarkForm تبقى كما هي) ---
const ErrorBanner = ({ error, onDismiss }) => {
  if (!error) return null;
  const bg = error.type === 'success' ? '#d4edda' : error.type === 'warning' ? '#fff3cd' : '#f8d7da';
  const color = error.type === 'success' ? '#155724' : error.type === 'warning' ? '#856404' : '#721c24';
  return (
    <div style={{ background: bg, color, padding: '12px 16px', borderRadius: '6px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}>
      <span>{error.type === 'success' ? '✅' : error.type === 'warning' ? '⚠️' : '❌'} {error.message}</span>
      <button onClick={onDismiss} style={{ background: 'transparent', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'inherit' }}>✖</button>
    </div>
  );
};
const LoadingSkeleton = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
    {[1,2,3].map(i => <div key={i} style={{ background: '#f0f2f5', borderRadius: '8px', height: '180px', animation: 'pulse 1.5s infinite' }} />)}
  </div>
);

// --- NEW: View Mode Tabs ---
const VIEW_MODES = [
  { key: 'contractor', label: '📋 تعليمات المقاول', icon: '📋' },
  { key: 'inspection', label: '🚻 فحص الحمامات', icon: '🚻' },
  { key: 'analytics', label: '📊 تحليلات الجودة', icon: '📊' },
  { key: 'raw', label: '📝 السجل الخام', icon: '📝' }
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
const ContractorActionCard = ({ issue, getLatrineCode, onClose }) => {
  const severity = issue.template?.default_severity || issue.remarks[0].severity;
  const title = issue.template?.title || issue.remarks[0].description;
  const action = issue.template?.default_action || issue.remarks[0].action_required;
  const boqCode = issue.remarks[0].boq_code;
  const latrineCodes = [...new Set(issue.remarks.map(r => getLatrineCode(r.latrine_id)))];
  
  return (
    <div style={{ background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '10px', borderRight: `4px solid ${UI_COLORS.severity[severity]}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
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
        <button onClick={() => onClose(issue.remarks)} style={{ padding: '6px 12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
          ✓ إغلاق الكل
        </button>
      </div>
    </div>
  );
};

// --- Inspection Card (حمام) ---
const InspectionCard = ({ latrineId, remarks, getLatrineCode, onClose, onEdit, onSaveAsTemplate }) => {
  const sorted = [...remarks].sort((a, b) => (SEVERITY_WEIGHT[b.severity]||0) - (SEVERITY_WEIGHT[a.severity]||0));
  const openCount = remarks.filter(r => r.status === 'open').length;
  return (
    <div style={{ background: 'white', borderRadius: '8px', padding: '16px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#1A3A5C', marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
        <span>🚻 {getLatrineCode(latrineId)}</span>
        <span style={{ fontSize: '12px', color: '#7f8c8d' }}>{openCount} مفتوحة</span>
      </div>
      {sorted.map(r => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ background: UI_COLORS.severity[r.severity], color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>{r.severity}</span>
          <span style={{ fontSize: '12px', color: '#666', minWidth: '60px' }}>بند {r.boq_code || 'عام'}</span>
          <span style={{ flex: 1, fontSize: '13px' }}>{r.template ? `📋 ${r.template.title}` : r.description}</span>
          <span style={{ color: '#e67e22', fontSize: '11px' }}>{r.action_required || r.template?.default_action}</span>
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
      counts[r.boq_code||'عام'] = (counts[r.boq_code||'عام']||0) + 1;
    }));
    return Object.entries(counts).sort((a,b) => b[1] - a[1]).slice(0,5);
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
      </div>
      <div style={{ background: 'white', borderRadius: '8px', padding: '20px' }}>
        <h3 style={{ color: '#1A3A5C', marginBottom: '15px' }}>🔴 الأكثر تكراراً (حسب المشكلة)</h3>
        {topIssues.map((issue, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span>{issue.template?.title || issue.remarks[0].description}</span>
            <span style={{ fontWeight: 'bold', color: '#C00000' }}>{issue.remarks.length} حالة</span>
          </div>
        ))}
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

  const { filteredRemarks, counters, aggregatedGroups } = useMemo(() => {
    if (!rawRemarks) return { filteredRemarks: [], counters: { total:0, open:0, closed:0, failed:0 }, aggregatedGroups: [] };
    let filtered = rawRemarks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => (r.description&&r.description.toLowerCase().includes(q)) || (r.template&&r.template.title.toLowerCase().includes(q)));
    }
    if (statusFilter) filtered = filtered.filter(r => r.status === statusFilter);
    if (severityFilter) filtered = filtered.filter(r => r.severity === severityFilter);
    if (syncFilter) filtered = filtered.filter(r => r.sync_status === syncFilter);

    const counts = rawRemarks.reduce((acc, r) => {
      acc.total++; if(r.status==='open')acc.open++; if(r.status==='closed')acc.closed++; if(r.sync_status==='failed')acc.failed++;
      return acc;
    }, { total:0, open:0, closed:0, failed:0 });

    // Aggregation for contractor view & analytics (group by template_id or text)
    const groupMap = {};
    filtered.forEach(r => {
      const key = r.template_id ? `TPL_${r.template_id}` : `TXT_${r.description}`;
      if(!groupMap[key]) groupMap[key] = { template: r.template, remarks: [] };
      groupMap[key].remarks.push(r);
    });
    const groups = Object.values(groupMap).sort((a,b) => b.remarks.length - a.remarks.length);

    return { filteredRemarks: filtered, counters, aggregatedGroups: groups };
  }, [rawRemarks, statusFilter, severityFilter, syncFilter, searchQuery]);

  // Handlers (keep same logic)
  const handleBulkClose = async (remarksToClose) => {
    const ids = remarksToClose.map(r => r.id);
    setProcessingIds(prev => new Set([...prev, ...ids]));
    try {
      const closedDate = new Date().toISOString();
      await db.transaction('rw', db.remarks, db.sync_queue, async () => {
        for (const remark of remarksToClose) {
          await db.remarks.update(remark.id, { status: 'closed', closed_date: closedDate, sync_status: remark.sync_status==='synced'?'pending':'local' });
          await pushToSyncQueue('UPDATE_REMARK', { id: remark.id, local_uuid: remark.local_uuid, status: 'closed', closed_date: closedDate });
        }
      });
    } catch (err) { setError({ type: 'error', message: 'فشل الإغلاق' }); }
    finally { setProcessingIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; }); }
  };

  const getLatrineCode = useCallback((id) => {
    if (latrineId && latrine) return latrine.latrine_id;
    const l = allLatrines?.find(x => x.id === id);
    return l ? l.latrine_id : `ID:${id}`;
  }, [latrineId, latrine, allLatrines]);

  if (latrineId && !latrine) return <LoadingSkeleton />;

  // Inspection view grouping (by latrine)
  const inspectionGroups = useMemo(() => {
    if (viewMode !== 'inspection') return {};
    const map = {};
    filteredRemarks.forEach(r => {
      if(!map[r.latrine_id]) map[r.latrine_id] = [];
      map[r.latrine_id].push(r);
    });
    return map;
  }, [filteredRemarks, viewMode]);

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
          <SmartRemarkForm initialData={editingRemark} boqCode={boqCode || editingRemark.boq_code} isSaving={isSaving} onSubmit={async (fd) => {
            setIsSaving(true);
            try {
              const original = await db.remarks.get(fd.id);
              await db.remarks.update(fd.id, { ...fd, boq_code: original.boq_code, sync_status: 'local' });
              await pushToSyncQueue('UPDATE_REMARK', { id: fd.id, local_uuid: fd.local_uuid, ...fd, boq_code: original.boq_code });
              setEditingRemark(null);
              setError({ type: 'success', message: 'تم التحديث' });
            } catch(e) { setError({ type: 'error', message: 'فشل' }); }
            finally { setIsSaving(false); }
          }} onCancel={() => setEditingRemark(null)} templates={templates} />
        </div>
      )}
      {!editingRemark && latrineId && (
        <SmartRemarkForm boqCode={boqCode} isSaving={isSaving} onSubmit={async (fd) => {
          setIsSaving(true);
          try {
            const localUuid = uuidv4();
            const remarkId = await db.remarks.add({ ...fd, local_uuid: localUuid, latrine_id: latrineId, boq_code: boqCode, status: 'open', sync_status: 'local', date_logged: new Date().toISOString() });
            await pushToSyncQueue('CREATE_REMARK', { local_uuid: localUuid, ...fd, latrine_id: latrineId, boq_code: boqCode });
            setError({ type: 'success', message: 'تم التسجيل' });
          } catch(e) { setError({ type: 'error', message: 'فشل' }); }
          finally { setIsSaving(false); }
        }} templates={templates} />
      )}

      {!latrineId && <ViewModeTabs active={viewMode} onChange={setViewMode} />}

      {/* Filters (context-sensitive) */}
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

      {/* Content based on viewMode */}
      {!rawRemarks ? <LoadingSkeleton /> : filteredRemarks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '8px' }}>📭 لا توجد ملاحظات</div>
      ) : (
        <>
          {viewMode === 'contractor' && (
            <div>
              {['critical','major','minor'].map(sev => {
                const items = aggregatedGroups.filter(g => (g.template?.default_severity || g.remarks[0].severity) === sev);
                if (items.length === 0) return null;
                return (
                  <div key={sev}>
                    <h3 style={{ color: UI_COLORS.severity[sev], marginBottom: '10px' }}>
                      {sev === 'critical' ? '🔴 أولوية عاجلة (حرجة)' : sev === 'major' ? '🟠 أولوية متوسطة (كبيرة)' : '🟡 أولوية عادية (طفيفة)'}
                    </h3>
                    {items.map((issue, idx) => <ContractorActionCard key={idx} issue={issue} getLatrineCode={getLatrineCode} onClose={handleBulkClose} />)}
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === 'inspection' && (
            <div>
              {Object.entries(inspectionGroups).map(([lid, remarks]) => (
                <InspectionCard key={lid} latrineId={parseInt(lid)} remarks={remarks} getLatrineCode={getLatrineCode} onClose={handleBulkClose} onEdit={setEditingRemark} onSaveAsTemplate={() => {}} />
              ))}
            </div>
          )}

          {viewMode === 'analytics' && (
            <AnalyticsPanel aggregatedGroups={aggregatedGroups} counters={counters} />
          )}

          {viewMode === 'raw' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredRemarks.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'white', padding: '12px', borderRadius: '8px', borderRight: `3px solid ${UI_COLORS.severity[r.severity]}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 'bold' }}>{getLatrineCode(r.latrine_id)}</span>
                      <span style={{ color: '#666' }}>{r.boq_code || 'عام'}</span>
                      <span style={{ background: UI_COLORS.severity[r.severity], color: 'white', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>{r.severity}</span>
                    </div>
                    <div>{r.template ? `📋 ${r.template.title}` : r.description}</div>
                  </div>
                  {r.status === 'open' && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => setEditingRemark(r)} style={{ padding: '4px 8px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✏️</button>
                      <button onClick={() => handleBulkClose([r])} style={{ padding: '4px 8px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✓</button>
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