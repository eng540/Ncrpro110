import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { pushToSyncQueue } from '../syncEngine';
import { v4 as uuidv4 } from 'uuid';

// ✅ توحيد الألوان
const severityColors = { minor: '#FFC000', major: '#FF6600', critical: '#C00000' };
const statusColors = { open: '#FFEB9C', closed: '#C6EFCE', overdue: '#FFC7CE' };
const statusLabels = { open: 'مفتوحة', closed: 'مغلقة', overdue: 'متأخرة' };

// ألوان حالة المزامنة ← جديد
const syncStatusColors = {
  local: '#9E9E9E',    // رمادي: لم يُرسل
  pending: '#FFC107',  // أصفر: في الطابور
  synced: '#4CAF50',   // أخضر: في الخادم
  failed: '#F44336'    // أحمر: فشل الإرسال
};
const syncStatusLabels = {
  local: 'محلي',
  pending: 'قيد الإرسال',
  synced: 'مُزامن',
  failed: 'فشل'
};

const RemarksManager = ({ latrineId, boqCode, onBack }) => {
  const latrine = useLiveQuery(() => db.latrines.get(latrineId), [latrineId]);
  const [filter, setFilter] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [actionRequired, setActionRequired] = useState('');
  const [deadline, setDeadline] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [closingId, setClosingId] = useState(null);
  const [syncError, setSyncError] = useState(null);  // ← جديد: خطأ المزامنة

  // ✅ جلب الملاحظات من IndexedDB (offline-first)
  const remarks = useLiveQuery(() => {
    if (boqCode) {
      return db.remarks.where({ latrine_id: latrineId, boq_code: boqCode }).toArray();
    }
    return db.remarks.where({ latrine_id: latrineId }).toArray();
  }, [latrineId, boqCode]);

  // ✅ فلترة محلية (بدون انتظار الخادم)
  const filtered = remarks?.filter(r => {
    if (filter === '') return true;
    if (['open', 'closed', 'overdue'].includes(filter)) return r.status === filter;
    if (['minor', 'major', 'critical'].includes(filter)) return r.severity === filter;
    if (['local', 'pending', 'synced', 'failed'].includes(filter)) return r.sync_status === filter;
    return true;
  }) || [];

  const handleAddRemark = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSaving(true);
    setSyncError(null);  // ← مسح الخطأ السابق
    try {
      const localUuid = uuidv4();
      const newRemark = {
        local_uuid: localUuid,
        latrine_id: latrineId,
        boq_code: boqCode || null,
        description: description.trim(),
        severity: severity,
        action_required: actionRequired.trim() || null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        status: 'open',
        sync_status: 'local', // ← جديد: تمييز المحلي
        date_logged: new Date().toISOString(),
        closed_date: null
      };

      // حفظ محلي فوري
      await db.remarks.add(newRemark);

      // إضافة للـ sync queue
      await pushToSyncQueue('CREATE_REMARK', newRemark);

      // تنظيف النموذج
      setDescription('');
      setActionRequired('');
      setDeadline('');
      setSeverity('minor');
    } catch (error) {
      console.error('Add remark error:', error);
      setSyncError('فشل حفظ الملاحظة محلياً: ' + error.message);  // ← عرض الخطأ
    } finally {
      setIsSaving(false);
    }
  };

  // ✅ إغلاق الملاحظة — يعمل Offline وOnline
  const handleCloseRemark = async (remark) => {
    setClosingId(remark.id);
    setSyncError(null);
    try {
      const closedDate = new Date().toISOString();
      
      // تحديث محلي فوري — لا يهم إذا كان local أم synced
      const newSyncStatus = remark.sync_status === 'synced' ? 'pending' : 'local';
      
      await db.remarks.update(remark.id, { 
        status: 'closed', 
        closed_date: closedDate,
        sync_status: newSyncStatus
      });

      // إضافة للـ sync queue
      await pushToSyncQueue('UPDATE_REMARK', {
        local_uuid: remark.local_uuid,
        status: 'closed',
        closed_date: closedDate
      });

    } catch (error) {
      console.error('Close remark error:', error);
      setSyncError('فشل إغلاق الملاحظة: ' + error.message);
    } finally {
      setClosingId(null);
    }
  };

  if (!latrine) {
    return <div style={{ textAlign: 'center', padding: '40px' }}>جاري التحميل...</div>;
  }

  return (
    <div style={{ direction: 'rtl' }}>
      {/* العنوان */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: '#1F4E78', margin: 0 }}>
          {boqCode ? `ملاحظات البند (${boqCode}) - حمام ${latrine.latrine_id}` : `الملاحظات العامة - حمام ${latrine.latrine_id}`}
        </h2>
        <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer' }}>
          &larr; العودة
        </button>
      </div>

      {/* ✅ عرض أخطاء المزامنة */}
      {syncError && (
        <div style={{ 
          background: '#ffebee', 
          color: '#c62828', 
          padding: '12px 16px', 
          borderRadius: '6px', 
          marginBottom: '15px', 
          border: '1px solid #ef9a9a', 
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⚠️</span> {syncError}
        </div>
      )}

      {/* ✅ نموذج الإنشاء المُحسّن */}
      <form onSubmit={handleAddRemark} style={{ background: '#fff9e6', padding: '20px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #ffeaa7' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <input 
            type="text" 
            placeholder={boqCode ? `ملاحظة حول البند ${boqCode}...` : "ملاحظة عامة للحمام..."}
            value={description} 
            onChange={(e) => setDescription(e.target.value)}
            style={{ flex: 2, padding: '10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '250px' }}
            required
          />
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="minor">طفيفة</option>
            <option value="major">كبيرة</option>
            <option value="critical">حرجة</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="الإجراء المطلوب..." 
            value={actionRequired} 
            onChange={(e) => setActionRequired(e.target.value)}
            style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '200px' }}
          />
          <input 
            type="date" 
            value={deadline} 
            onChange={(e) => setDeadline(e.target.value)}
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
          <button type="submit" disabled={isSaving} style={{ padding: '10px 20px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            {isSaving ? '...' : '+ تسجيل'}
          </button>
        </div>
      </form>

      {/* ✅ فلترة محسّنة */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 'bold', color: '#7f8c8d' }}>فلترة:</span>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
          <option value="">الكل</option>
          <option value="open">مفتوحة</option>
          <option value="closed">مغلقة</option>
          <option value="overdue">متأخرة</option>
          <option value="critical">حرجة</option>
          <option value="major">كبيرة</option>
          <option value="minor">بسيطة</option>
          <option value="local">محلية (غير مُرسلة)</option>
          <option value="pending">قيد الإرسال</option>
          <option value="synced">مُزامنة</option>
          <option value="failed">فشل الإرسال</option>
        </select>
        <span style={{ color: '#7f8c8d', fontSize: '14px' }}>{filtered.length} ملاحظة</span>
      </div>

      {/* ✅ عرض شبكي محسّن مع حالة المزامنة */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
        {filtered.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#666', background: 'white', borderRadius: '8px' }}>
            لا توجد ملاحظات مسجلة.
          </div>
        ) : (
          filtered.map(r => (
            <div key={r.id} style={{
              background: 'white', 
              borderRadius: '8px', 
              padding: '16px', 
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)', 
              borderRight: `4px solid ${severityColors[r.severity]}`,
              opacity: r.status === 'closed' ? 0.7 : 1
            }}>
              {/* رأس البطاقة */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center', flexWrap: 'wrap', gap: '5px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1F4E78' }}>
                  {r.remark_id || `REM-${r.local_uuid?.slice(0, 8) || r.id}`}
                </span>
                <div style={{ display: 'flex', gap: '5px' }}>
                  {/* شارة الخطورة */}
                  <span style={{ 
                    background: severityColors[r.severity], 
                    color: 'white', 
                    padding: '2px 8px', 
                    borderRadius: '4px', 
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    {r.severity}
                  </span>
                  {/* شارة حالة المزامنة ← جديد */}
                  <span style={{ 
                    background: syncStatusColors[r.sync_status || 'local'], 
                    color: 'white', 
                    padding: '2px 8px', 
                    borderRadius: '4px', 
                    fontSize: '11px'
                  }}>
                    {syncStatusLabels[r.sync_status || 'local']}
                  </span>
                </div>
              </div>
              
              {/* المحتوى */}
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                الحمام: {latrine.latrine_id} {r.boq_code ? `| البند: ${r.boq_code}` : '| عام'}
              </div>
              
              <div style={{ marginBottom: '8px', fontWeight: r.status === 'open' ? 'bold' : 'normal' }}>
                {r.description}
              </div>
              
              {r.action_required && (
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px', background: '#f8f9fa', padding: '6px', borderRadius: '4px' }}>
                  <strong>الإجراء:</strong> {r.action_required}
                </div>
              )}
              
              {/* الإجراءات */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap', gap: '5px' }}>
                <span style={{ 
                  background: statusColors[r.status] || statusColors.local, 
                  padding: '4px 8px', 
                  borderRadius: '4px', 
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: r.status === 'open' ? '#856404' : r.status === 'overdue' ? '#721c24' : '#155724'
                }}>
                  {r.status === 'open' ? 'مفتوحة' : r.status === 'closed' ? 'مغلقة' : r.status}
                </span>
                
                {r.status === 'open' && (
                  <button 
                    onClick={() => handleCloseRemark(r)}
                    disabled={closingId === r.id}
                    style={{ 
                      padding: '4px 12px', 
                      background: closingId === r.id ? '#95a5a6' : '#70AD47', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px', 
                      cursor: closingId === r.id ? 'not-allowed' : 'pointer', 
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                  >
                    {closingId === r.id ? '...' : 'إغلاق'}
                  </button>
                )}
              </div>
              
              {/* تواريخ */}
              {r.deadline && (
                <div style={{ 
                  fontSize: '11px', 
                  color: r.status === 'overdue' ? '#C00000' : '#7f8c8d', 
                  marginTop: '8px',
                  fontWeight: r.status === 'overdue' ? 'bold' : 'normal'
                }}>
                  الموعد النهائي: {new Date(r.deadline).toLocaleDateString('ar-SA')}
                  {r.status === 'overdue' && ' ⚠️ متأخرة!'}
                </div>
              )}
              
              {r.closed_date && (
                <div style={{ fontSize: '11px', color: '#27ae60', marginTop: '8px' }}>
                  تم الإغلاق: {new Date(r.closed_date).toLocaleDateString('ar-SA')}
                </div>
              )}
              
              {r.date_logged && (
                <div style={{ fontSize: '11px', color: '#95a5a6', marginTop: '4px' }}>
                  تسجيل: {new Date(r.date_logged).toLocaleDateString('ar-SA')}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RemarksManager;
