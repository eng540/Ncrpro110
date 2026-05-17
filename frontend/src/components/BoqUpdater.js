import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { pushToSyncQueue } from '../syncEngine';

const qualityColors = {
  pass: '#C6EFCE',    // أخضر
  fail: '#FFC7CE',    // أحمر
  pending: '#FFF2CC'  // أصفر
};

const qualityLabels = {
  pass: 'مقبول',
  fail: 'مرفوض',
  pending: 'قيد الفحص'
};

const BoqUpdater = ({ latrineId, onBack }) => {
  const latrine = useLiveQuery(() => db.latrines.get(latrineId), [latrineId]);
  const boqItems = useLiveQuery(() => db.boq_items.where({ latrine_id: latrineId }).toArray(), [latrineId]);

  const [updatingId, setUpdatingId] = useState(null);

  const handleUpdate = async (item, newQty, newQuality) => {
    setUpdatingId(item.id);
    try {
      const achieved = parseFloat(newQty);
      if (isNaN(achieved) || achieved < 0 || achieved > item.planned_qty) {
        alert("الكمية غير صالحة. يجب أن تكون بين 0 والكمية المخططة.");
        return;
      }

      // 1. تحديث قاعدة البيانات المحلية فوراً
      await db.boq_items.update(item.id, { 
        achieved_qty: achieved,
        quality_pass: newQuality,
        status: achieved >= item.planned_qty ? 'completed' : (achieved > 0 ? 'in_progress' : 'not_started')
      });

      // 2. إضافة التعديل إلى طابور المزامنة
      await pushToSyncQueue('UPDATE_BOQ', {
        id: item.id,
        achieved_qty: achieved,
        quality_pass: newQuality,
        status: achieved >= item.planned_qty ? 'completed' : (achieved > 0 ? 'in_progress' : 'not_started'),
        latrine_id: latrineId
      });

    } catch (error) {
      console.error("Failed to update BOQ:", error);
      alert("حدث خطأ أثناء الحفظ المحلي.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (!latrine || !boqItems) return <div style={{ padding: '40px', textAlign: 'center' }}>جاري تحميل جداول الكميات...</div>;

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#1F4E78', margin: 0 }}>تحديث كميات الحمام: {latrine.latrine_id}</h2>
        <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer' }}>
          &larr; العودة للقائمة
        </button>
      </div>
      
      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'right' }}>الكود</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الوصف</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الكمية المخططة</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الكمية المنفذة</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>فحص الجودة</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>إجراء</th>
            </tr>
          </thead>
          <tbody>
            {boqItems.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px', fontWeight: 'bold' }}>{item.boq_code}</td>
                <td style={{ padding: '12px' }}>{item.description_ar}</td>
                <td style={{ padding: '12px', color: '#7f8c8d' }}>{item.planned_qty} {item.unit}</td>
                <td style={{ padding: '12px' }}>
                  <input 
                    type="number" 
                    step="0.01"
                    defaultValue={item.achieved_qty}
                    id={`qty-${item.id}`}
                    style={{ width: '80px', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                </td>
                <td style={{ padding: '12px' }}>
                  <select 
                    id={`quality-${item.id}`}
                    defaultValue={item.quality_pass || 'pending'}
                    style={{ 
                      padding: '6px', 
                      borderRadius: '4px', 
                      border: '1px solid #ccc',
                      backgroundColor: qualityColors[item.quality_pass || 'pending'] 
                    }}
                    onChange={(e) => e.target.style.backgroundColor = qualityColors[e.target.value]}
                  >
                    <option value="pending">قيد الفحص</option>
                    <option value="pass">مقبول</option>
                    <option value="fail">مرفوض</option>
                  </select>
                </td>
                <td style={{ padding: '12px' }}>
                  <button 
                    disabled={updatingId === item.id}
                    onClick={() => {
                      const qty = document.getElementById(`qty-${item.id}`).value;
                      const quality = document.getElementById(`quality-${item.id}`).value;
                      handleUpdate(item, qty, quality);
                    }}
                    style={{ 
                      padding: '6px 16px', 
                      background: '#27ae60', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '4px', 
                      cursor: updatingId === item.id ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    {updatingId === item.id ? 'جاري...' : 'حفظ التعديل'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BoqUpdater;