import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { pushToSyncQueue } from '../syncEngine';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// ✅ توحيد الألوان
const severityColors = { minor: '#FFC000', major: '#FF6600', critical: '#C00000' };
const statusColors = { open: '#FFEB9C', closed: '#C6EFCE', overdue: '#FFC7CE' };
const statusLabels = { open: 'مفتوحة', closed: 'مغلقة', overdue: 'متأخرة' };

const RemarksManager = ({ latrineId, boqCode, onBack }) => {
  const latrine = useLiveQuery(() => db.latrines.get(latrineId), [latrineId]);
  const [filter, setFilter] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [actionRequired, setActionRequired] = useState('');
  const [deadline, setDeadline] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [closingId, setClosingId] = useState(null);

  // ✅ جلب الملاحظات من IndexedDB (offline-first)
  const remarks = useLiveQuery(() => {
    if (boqCode) {
      return db.remarks.where({ latrine_id: latrineId, boq_code: boqCode }).toArray();
    }
    return db.remarks.where({ latrine_id: latrineId }).toArray();
  }, [latrineId, boqCode]);

  // ✅ فلترة محلية (بدون انتظار الخادم)
  const filtered = remarks?.filter(r => 
    filter === '' || r.status === filter || r.severity === filter
  ) || [];

  const handleAddRemark = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSaving(true);
    try {
      const newRemark = {
        latrine_id: latrineId,
        boq_code: boqCode || null,
        description: description,
        severity: severity,
        action_required: actionRequired || null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        status: 'open',
        date_logged: new Date().toISOString()
      };

      // إضافة للـ sync queue
      await pushToSyncQueue('CREATE_REMARK', newRemark);

      // حفظ محلي فوري
      const localId = -Math.floor(Math.random() * 1000000);
      await db.remarks.add({ ...newRemark, id: localId });

      // تنظيف النموذج
      setDescription('');
      setActionRequired('');
      setDeadline('');
    } catch (error) {
      console.error('Add remark error:', error);
      alert("خطأ في حفظ الملاحظة.");
    } finally {
      setIsSaving(false);
    }
  };

  // ✅ إغلاق الملاحظة (offline-first مع sync)
  const handleCloseRemark = async (remark) => {
    setClosingId(remark.id);
    try {
      const updateData = {
        id: remark.id,
        status: 'closed',
        closed_date: new Date().toISOString()
      };

      // إذا كان معرفاً محلياً (سلبي)، نُنشئ remark أولاً ثم نُغلق
      if (remark.id < 0) {
        alert('لا يمكن إغلاق ملاحظة غير مُرسلة للخادم. قم بالمزامنة أولاً.');
        return;
      }

      await pushToSyncQueue('UPDATE_REMARK', updateData);
      await db.remarks.update(remark.id, { status: 'closed', closed_date: updateData.closed_date });
    } catch (error) {
      console.error('Close remark error:', error);
      alert('خطأ في إغلاق الملاحظة.');
    } finally {
      setClosingId(null);
    }
  };

  if (!latrine || !remarks) {
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

      {/* ✅ فلترة (من Remarks.js) */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', color: '#7f8c8d' }}>فلترة:</span>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
          <option value="">الكل</option>
          <option value="open">مفتوحة</option>
          <option value="closed">مغلقة</option>
          <option value="overdue">متأخرة</option>
          <option value="critical">حرجة</option>
          <option value="major">كبيرة</option>
          <option value="minor">بسيطة</option>
        </select>
        <span style={{ color: '#7f8c8d', fontSize: '14px' }}>{filtered.length} ملاحظة</span>
      </div>

      {/* ✅ عرض شبكي محسّن (من Remarks.js) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '14px', color: '#1F4E78' }}>
                  {r.remark_id || `REM-${Math.abs(r.id)}`}
                </span>
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
              </div>
              
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
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <span style={{ 
                  background: statusColors[r.status], 
                  padding: '4px 8px', 
                  borderRadius: '4px', 
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: r.status === 'open' ? '#856404' : r.status === 'overdue' ? '#721c24' : '#155724'
                }}>
                  {statusLabels[r.status] || r.status}
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
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RemarksManager;
