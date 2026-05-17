import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { pushToSyncQueue } from '../syncEngine';

const severityColors = { minor: '#f1c40f', major: '#e67e22', critical: '#e74c3c' };

const RemarksManager = ({ latrineId, onBack }) => {
  const latrine = useLiveQuery(() => db.latrines.get(latrineId), [latrineId]);
  const remarks = useLiveQuery(() => db.remarks.where({ latrine_id: latrineId }).toArray(), [latrineId]);
  
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('minor');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddRemark = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsSaving(true);
    try {
      const newRemark = {
        latrine_id: latrineId,
        description: description,
        severity: severity,
        status: 'open',
        date_logged: new Date().toISOString()
      };

      // 1. إضافة إلى الـ Sync Queue ليرسلها للخادم
      await pushToSyncQueue('CREATE_REMARK', newRemark);

      // 2. الحفظ في IndexedDB (مع توليد ID مؤقت سالب لتمييزها محلياً)
      const localId = -Math.floor(Math.random() * 1000000);
      await db.remarks.add({ ...newRemark, id: localId });

      setDescription('');
    } catch (error) {
      alert("خطأ في حفظ الملاحظة.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!latrine || !remarks) return <div style={{ textAlign: 'center', padding: '40px' }}>جاري التحميل...</div>;

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#1F4E78', margin: 0 }}>ملاحظات الجودة - حمام: {latrine.latrine_id}</h2>
        <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer' }}>&larr; العودة</button>
      </div>

      {/* نموذج إضافة ملاحظة جديدة */}
      <form onSubmit={handleAddRemark} style={{ background: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="اكتب تفاصيل الملاحظة أو العيب..." 
            value={description} onChange={(e) => setDescription(e.target.value)}
            style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '250px' }}
            required
          />
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}>
            <option value="minor">طفيفة (Minor)</option>
            <option value="major">كبيرة (Major)</option>
            <option value="critical">حرجة (Critical)</option>
          </select>
          <button type="submit" disabled={isSaving} style={{ padding: '10px 20px', background: '#1F4E78', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {isSaving ? 'جاري الحفظ...' : '+ إضافة الملاحظة'}
          </button>
        </div>
      </form>

      {/* قائمة الملاحظات */}
      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
        {remarks.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>لا توجد ملاحظات مسجلة على هذا الحمام.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#ecf0f1' }}>
              <tr>
                <th style={{ padding: '12px', textAlign: 'right' }}>التفاصيل</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>الخطورة</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {remarks.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px' }}>{r.description}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ background: severityColors[r.severity], color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                      {r.severity}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: r.status === 'open' ? '#e74c3c' : '#27ae60' }}>
                    {r.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default RemarksManager;