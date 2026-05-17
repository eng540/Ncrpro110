import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { pushToSyncQueue } from '../syncEngine';

const qualityColors = { pass: '#C6EFCE', fail: '#FFC7CE', pending: '#FFF2CC' };

// خيارات حالة البند (Item Status)
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
  const [selectedItems, setSelectedItems] = useState([]); // لحفظ العناصر المحددة

  // دالة الحفظ الفردي
  const handleUpdate = async (item, newQty, newStatus, newQuality) => {
    setUpdatingId(item.id);
    try {
      const achieved = parseFloat(newQty);
      if (isNaN(achieved) || achieved < 0 || achieved > item.planned_qty) {
        alert("الكمية غير صالحة. تأكد أنها لا تتجاوز المخطط.");
        return;
      }

      await db.boq_items.update(item.id, { 
        achieved_qty: achieved, status: newStatus, quality_pass: newQuality 
      });

      await pushToSyncQueue('UPDATE_BOQ', {
        id: item.id, achieved_qty: achieved, status: newStatus, quality_pass: newQuality, latrine_id: latrineId
      });

    } catch (error) {
      alert("خطأ أثناء الحفظ المحلي.");
    } finally {
      setUpdatingId(null);
    }
  };

  // دوال التحديد المتعدد (Bulk Selection)
  const toggleSelectAll = (e) => {
    if (e.target.checked) setSelectedItems(boqItems.map(i => i.id));
    else setSelectedItems([]);
  };

  const toggleSelect = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // دوال الإجراءات الجماعية (Bulk Actions)
  const handleBulkComplete = async () => {
    if (!window.confirm(`هل أنت متأكد من إكمال ${selectedItems.length} بنود محددة بنسبة 100% كمقبولة؟`)) return;
    
    for (const id of selectedItems) {
      const item = boqItems.find(i => i.id === id);
      if (item) {
        document.getElementById(`qty-${item.id}`).value = item.planned_qty;
        document.getElementById(`status-${item.id}`).value = 'completed';
        document.getElementById(`quality-${item.id}`).value = 'pass';
        await handleUpdate(item, item.planned_qty, 'completed', 'pass');
      }
    }
    setSelectedItems([]); // إلغاء التحديد بعد الإنجاز
  };

  if (!latrine || !boqItems) return <div style={{ padding: '40px', textAlign: 'center' }}>جاري التحميل...</div>;

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: '#1F4E78', margin: 0 }}>جدول كميات حمام: {latrine.latrine_id}</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          {/* زر يفتح الملاحظات العامة للحمام (بدون تخصيص بند) */}
          <button onClick={() => onOpenRemarks(latrineId, null)} style={{ padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            الملاحظات العامة للحمام
          </button>
          <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer' }}>
            &larr; العودة للقائمة
          </button>
        </div>
      </div>

      {/* شريط الإجراءات الجماعية يظهر فقط عند تحديد عناصر */}
      {selectedItems.length > 0 && (
        <div style={{ background: '#dff9fb', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #c7ecee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>تم تحديد {selectedItems.length} بنود</strong>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleBulkComplete} style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              ✓ اعتماد الكل كمكتمل ومقبول (100%)
            </button>
          </div>
        </div>
      )}
      
      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'center' }}>
                <input type="checkbox" onChange={toggleSelectAll} checked={boqItems.length > 0 && selectedItems.length === boqItems.length} />
              </th>
              <th style={{ padding: '12px', textAlign: 'right' }}>البند</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الكمية المخططة</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الكمية المنفذة</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>حالة البند</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>فحص الجودة</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {boqItems.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #eee', backgroundColor: selectedItems.includes(item.id) ? '#f1f8ff' : 'transparent' }}>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedItems.includes(item.id)} onChange={() => toggleSelect(item.id)} />
                </td>
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
                    id={`status-${item.id}`} defaultValue={item.status || 'not_started'}
                    style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}
                  >
                    {itemStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
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
                  <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', flexDirection: 'column' }}>
                    <button 
                      disabled={updatingId === item.id}
                      onClick={() => {
                        const qty = document.getElementById(`qty-${item.id}`).value;
                        const status = document.getElementById(`status-${item.id}`).value;
                        const quality = document.getElementById(`quality-${item.id}`).value;
                        handleUpdate(item, qty, status, quality);
                      }}
                      style={{ padding: '6px 10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: updatingId === item.id ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                    >
                      حفظ
                    </button>
                    {/* الزر السحري لفتح ملاحظة مخصصة لهذا البند فقط */}
                    <button 
                      onClick={() => onOpenRemarks(latrineId, item.boq_code)}
                      style={{ padding: '4px 8px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                    >
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