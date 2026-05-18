import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { pushToSyncQueue } from '../syncEngine';

const qualityColors = { pass: '#C6EFCE', fail: '#FFC7CE', pending: '#FFF2CC' };
const itemStatuses = [
  { value: 'not_started', label: 'لم يبدأ' },
  { value: 'in_progress', label: 'قيد العمل' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'pending_inspection', label: 'بانتظار الفحص' },
  { value: 'rework_required', label: 'يحتاج إعادة عمل' },
  { value: 'rejected', label: 'مرفوض نهائياً' }
];

const BoqUpdater = ({ latrineId, onBack, onOpenRemarks }) => {
  const latrine = useLiveQuery(() => db.latrines.get(latrineId), [latrineId]);
  const boqItems = useLiveQuery(() => db.boq_items.where({ latrine_id: latrineId }).toArray(), [latrineId]);
  const [updatingId, setUpdatingId] = useState(null);

  const handleUpdate = async (item, newQty, newStatus, newQuality) => {
    setUpdatingId(item.id);
    try {
      const achieved = parseFloat(newQty);
      if (isNaN(achieved) || achieved < 0 || achieved > item.planned_qty) {
        alert("الكمية غير صالحة. تأكد أنها لا تتجاوز المخطط.");
        return;
      }
      await db.boq_items.update(item.id, { achieved_qty: achieved, status: newStatus, quality_pass: newQuality });
      await pushToSyncQueue('UPDATE_BOQ', { id: item.id, achieved_qty: achieved, status: newStatus, quality_pass: newQuality, latrine_id: latrineId });
    } catch (error) {
      alert("خطأ أثناء الحفظ المحلي.");
    } finally {
      setUpdatingId(null);
    }
  };

  // ميزة الإدخال بالنسب المئوية (استعادة ميزة مطلوبة)
  const handleQuickPercent = (item, percent) => {
    const qty = (item.planned_qty * percent).toFixed(2);
    const status = percent === 1 ? 'completed' : (percent === 0 ? 'not_started' : 'in_progress');
    document.getElementById(`qty-${item.id}`).value = qty;
    document.getElementById(`status-${item.id}`).value = status;
    document.getElementById(`quality-${item.id}`).value = 'pass';
    handleUpdate(item, qty, status, 'pass');
  };

  if (!latrine || !boqItems) return <div style={{ padding: '40px', textAlign: 'center' }}>جاري التحميل...</div>;

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: '#1F4E78', margin: 0 }}>جدول كميات حمام: {latrine.latrine_id}</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => onOpenRemarks(latrineId, null)} style={{ padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            الملاحظات العامة للحمام
          </button>
          <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer' }}>
            &larr; العودة للقائمة
          </button>
        </div>
      </div>
      
      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'right' }}>البند</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>المخطط</th>
              <th style={{ padding: '12px', textAlign: 'right', width: '220px' }}>إدخال سريع (نسب)</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>المنفذ يدوياً</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الحالة والجودة</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>إجراءات</th>
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
                
                {/* أزرار الإدخال السريع بالنسب */}
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => handleQuickPercent(item, 0.25)} style={{ padding: '4px 8px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontSize:'11px' }}>25%</button>
                    <button onClick={() => handleQuickPercent(item, 0.50)} style={{ padding: '4px 8px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontSize:'11px' }}>50%</button>
                    <button onClick={() => handleQuickPercent(item, 0.75)} style={{ padding: '4px 8px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontSize:'11px' }}>75%</button>
                    <button onClick={() => handleQuickPercent(item, 1.00)} style={{ padding: '4px 8px', background: '#3498db', color:'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize:'11px', fontWeight:'bold' }}>100%</button>
                  </div>
                </td>

                <td style={{ padding: '12px' }}>
                  <input type="number" step="0.01" defaultValue={item.achieved_qty} id={`qty-${item.id}`} style={{ width: '60px', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }} />
                </td>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <select id={`status-${item.id}`} defaultValue={item.status || 'not_started'} style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ccc', fontSize:'12px' }}>
                      {itemStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <select id={`quality-${item.id}`} defaultValue={item.quality_pass || 'pending'} style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ccc', fontSize:'12px', backgroundColor: qualityColors[item.quality_pass || 'pending'] }} onChange={(e) => e.target.style.backgroundColor = qualityColors[e.target.value]}>
                      <option value="pending">قيد الفحص</option><option value="pass">مقبول</option><option value="fail">مرفوض</option>
                    </select>
                  </div>
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', flexDirection: 'column' }}>
                    <button disabled={updatingId === item.id} onClick={() => { handleUpdate(item, document.getElementById(`qty-${item.id}`).value, document.getElementById(`status-${item.id}`).value, document.getElementById(`quality-${item.id}`).value); }} style={{ padding: '6px 10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: updatingId === item.id ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                      حفظ التعديل
                    </button>
                    <button onClick={() => onOpenRemarks(latrineId, item.boq_code)} style={{ padding: '4px 8px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                      + ملاحظة للبند
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