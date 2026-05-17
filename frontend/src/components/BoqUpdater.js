import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { pushToSyncQueue } from '../syncEngine';

const BoqUpdater = ({ latrineId, onBack }) => {
  const latrine = useLiveQuery(() => db.latrines.get(latrineId), [latrineId]);
  const boqItems = useLiveQuery(() => db.boq_items.where({ latrine_id: latrineId }).toArray(), [latrineId]);

  const [updatingId, setUpdatingId] = useState(null);

  const handleUpdateQty = async (item, newQty) => {
    setUpdatingId(item.id);
    try {
      const achieved = parseFloat(newQty);
      if (isNaN(achieved) || achieved < 0 || achieved > item.planned_qty) {
        alert("كمية غير صالحة");
        return;
      }

      // 1. تحديث قاعدة البيانات المحلية فوراً (استجابة سريعة للمستخدم)
      await db.boq_items.update(item.id, { achieved_qty: achieved });

      // 2. إضافة التعديل إلى طابور المزامنة (للإرسال للخادم لاحقاً)
      await pushToSyncQueue('UPDATE_BOQ', {
        id: item.id,
        achieved_qty: achieved,
        latrine_id: latrineId // مهم للخادم لإعادة حساب النسبة
      });

    } catch (error) {
      console.error("Failed to update BOQ:", error);
      alert("حدث خطأ أثناء الحفظ المحلي.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (!latrine || !boqItems) return <div style={{ padding: '20px' }}>جاري التحميل...</div>;

  return (
    <div style={{ padding: '20px', direction: 'rtl' }}>
      <button onClick={onBack} style={{ marginBottom: '20px', padding: '8px 16px' }}>&larr; العودة للقائمة</button>
      
      <h2>تحديث كميات الحمام: {latrine.latrine_id}</h2>
      
      <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white' }}>
        <thead>
          <tr style={{ backgroundColor: '#ecf0f1', textAlign: 'right' }}>
            <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>الكود</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>الوصف</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>الكمية المخططة</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>الكمية المنفذة</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>تحديث</th>
          </tr>
        </thead>
        <tbody>
          {boqItems.map(item => (
            <tr key={item.id} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '12px' }}>{item.boq_code}</td>
              <td style={{ padding: '12px' }}>{item.description_ar}</td>
              <td style={{ padding: '12px' }}>{item.planned_qty} {item.unit}</td>
              <td style={{ padding: '12px' }}>{item.achieved_qty}</td>
              <td style={{ padding: '12px' }}>
                <input 
                  type="number" 
                  step="0.01"
                  defaultValue={item.achieved_qty}
                  id={`input-${item.id}`}
                  style={{ width: '80px', padding: '5px' }}
                />
                <button 
                  disabled={updatingId === item.id}
                  onClick={() => {
                    const val = document.getElementById(`input-${item.id}`).value;
                    handleUpdateQty(item, val);
                  }}
                  style={{ marginLeft: '10px', padding: '6px 12px', cursor: 'pointer' }}
                >
                  حفظ
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default BoqUpdater;