import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { pushToSyncQueue } from '../syncEngine';

const qualityColors = {
  pass: '#C6EFCE',
  fail: '#FFC7CE',
  pending: '#FFF2CC'
};

const BoqUpdater = ({ latrineId, onBack, onOpenRemarks }) => {
  const latrine = useLiveQuery(() => db.latrines.get(latrineId), [latrineId]);
  const boqItems = useLiveQuery(() => db.boq_items.where({ latrine_id: latrineId }).toArray(), [latrineId]);

  const [updatingId, setUpdatingId] = useState(null);

  const handleUpdate = async (item, newQty, newQuality) => {
    setUpdatingId(item.id);
    try {
      const achieved = parseFloat(newQty);
      if (isNaN(achieved) || achieved < 0) {
        alert("الكمية غير صالحة.");
        return;
      }
      if (achieved > item.planned_qty) {
        alert(`لا يمكن إدخال كمية (${achieved}) أكبر من الكمية المخططة (${item.planned_qty})`);
        return;
      }

      await db.boq_items.update(item.id, { 
        achieved_qty: achieved,
        quality_pass: newQuality,
        status: achieved >= item.planned_qty ? 'completed' : (achieved > 0 ? 'in_progress' : 'not_started')
      });

      await pushToSyncQueue('UPDATE_BOQ', {
        id: item.id,
        achieved_qty: achieved,
        quality_pass: newQuality,
        status: achieved >= item.planned_qty ? 'completed' : (achieved > 0 ? 'in_progress' : 'not_started'),
        latrine_id: latrineId
      });

    } catch (error) {
      alert("حدث خطأ أثناء الحفظ المحلي.");
    } finally {
      setUpdatingId(null);
    }
  };

  // UX Feature: زر الإدخال السريع (إكمال كلي)
  const handleQuickFill = (item) => {
    document.getElementById(`qty-${item.id}`).value = item.planned_qty;
    document.getElementById(`quality-${item.id}`).value = 'pass';
    handleUpdate(item, item.planned_qty, 'pass');
  };

  if (!latrine || !boqItems) return <div style={{ padding: '40px', textAlign: 'center' }}>جاري تحميل جداول الكميات...</div>;

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: '#1F4E78', margin: 0 }}>تحديث كميات الحمام: {latrine.latrine_id}</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => onOpenRemarks(latrineId)} style={{ padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            الملاحظات والعيوب
          </button>
          <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer' }}>
            &larr; العودة
          </button>
        </div>
      </div>
      
      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'right' }}>البند</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الكمية المخططة</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الكمية المنفذة</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الجودة</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>إجراءات الإدخال</th>
            </tr>
          </thead>
          <tbody>
            {boqItems.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '12px' }}>
                  <strong>{item.boq_code}</strong><br/>
                  <small style={{ color: '#666' }}>{item.description_ar}</small>
                </td>
                <td style={{ padding: '12px', color: '#7f8c8d', fontWeight: 'bold' }}>{item.planned_qty} {item.unit}</td>
                <td style={{ padding: '12px' }}>
                  <input 
                    type="number" step="0.01" defaultValue={item.achieved_qty} id={`qty-${item.id}`}
                    style={{ width: '70px', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                </td>
                <td style={{ padding: '12px' }}>
                  <select 
                    id={`quality-${item.id}`} defaultValue={item.quality_pass || 'pending'}
                    style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: qualityColors[item.quality_pass || 'pending'] }}
                    onChange={(e) => e.target.style.backgroundColor = qualityColors[e.target.value]}
                  >
                    <option value="pending">قيد الفحص</option>
                    <option value="pass">مقبول</option>
                    <option value="fail">مرفوض</option>
                  </select>
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                    <button 
                      onClick={() => handleQuickFill(item)}
                      style={{ padding: '6px 10px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                      title="إكمال الكمية بالكامل (إدخال سريع)"
                    >
                      إنجاز 100%
                    </button>
                    <button 
                      disabled={updatingId === item.id}
                      onClick={() => {
                        const qty = document.getElementById(`qty-${item.id}`).value;
                        const quality = document.getElementById(`quality-${item.id}`).value;
                        handleUpdate(item, qty, quality);
                      }}
                      style={{ padding: '6px 10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: updatingId === item.id ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                    >
                      حفظ
                    </button>
                  </div>
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