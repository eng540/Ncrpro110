import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index.js';
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
  const [selectedItems, setSelectedItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    setSelectedItems([]);
  }, [latrineId]);

  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  const showError = (msg) => setErrorMsg(msg);

  const handleUpdate = async (item, newQty, newStatus, newQuality) => {
    setUpdatingId(item.id);
    try {
      const achieved = parseFloat(newQty);
      if (isNaN(achieved) || achieved < 0 || achieved > item.planned_qty) {
        showError(`الكمية غير صالحة للبند ${item.boq_code}. الحد الأقصى: ${item.planned_qty}`);
        return false;
      }

      await db.transaction('rw', db.boq_items, db.sync_queue, async () => {
        await db.boq_items.update(item.id, {
          achieved_qty: achieved,
          status: newStatus,
          quality_pass: newQuality
        });
        await pushToSyncQueue('UPDATE_BOQ', {
          id: item.id,
          achieved_qty: achieved,
          status: newStatus,
          quality_pass: newQuality,
          latrine_id: latrineId
        });
      });
      return true;
    } catch (error) {
      console.error('BoqUpdater update error:', error);
      showError('خطأ أثناء الحفظ المحلي. يرجى المحاولة مجدداً.');
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked && boqItems?.length) {
      setSelectedItems(boqItems.map(i => i.id));
    } else {
      setSelectedItems([]);
    }
  };

  const toggleSelect = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkComplete = async () => {
    if (!selectedItems.length) return;
    if (!window.confirm(`هل أنت متأكد من إكمال ${selectedItems.length} بند محدد بنسبة 100% كمقبول؟`)) return;

    const itemsToProcess = boqItems.filter(i => selectedItems.includes(i.id));
    let success = false;

    try {
      await db.transaction('rw', db.boq_items, db.sync_queue, async () => {
        for (const item of itemsToProcess) {
          await db.boq_items.update(item.id, {
            achieved_qty: item.planned_qty,
            status: 'completed',
            quality_pass: 'pass'
          });
          await pushToSyncQueue('UPDATE_BOQ', {
            id: item.id,
            achieved_qty: item.planned_qty,
            status: 'completed',
            quality_pass: 'pass',
            latrine_id: latrineId
          });
        }
      });
      success = true;
    } catch (error) {
      console.error('Bulk complete error:', error);
      showError('خطأ في التحديث الجماعي.');
    }

    if (success) {
      for (const item of itemsToProcess) {
        const qtyInput = document.getElementById(`qty-${item.id}`);
        const statusSelect = document.getElementById(`status-${item.id}`);
        const qualitySelect = document.getElementById(`quality-${item.id}`);

        if (qtyInput) qtyInput.value = item.planned_qty;
        if (statusSelect) statusSelect.value = 'completed';
        if (qualitySelect) {
          qualitySelect.value = 'pass';
          qualitySelect.style.backgroundColor = qualityColors.pass;
        }
      }
      setSelectedItems([]);
    }
  };

  const handleQuickPercent = async (item, percent) => {
    const qty = (item.planned_qty * percent).toFixed(2);
    const status = percent === 1 ? 'completed' : (percent === 0 ? 'not_started' : 'in_progress');

    const success = await handleUpdate(item, qty, status, 'pass');
    if (success) {
      const qtyInput = document.getElementById(`qty-${item.id}`);
      const statusSelect = document.getElementById(`status-${item.id}`);
      const qualitySelect = document.getElementById(`quality-${item.id}`);

      if (qtyInput) qtyInput.value = qty;
      if (statusSelect) statusSelect.value = status;
      if (qualitySelect) {
        qualitySelect.value = 'pass';
        qualitySelect.style.backgroundColor = qualityColors.pass;
      }
    }
  };

  if (!latrine || !boqItems) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>جاري التحميل...</div>;
  }

  const allSelected = boqItems.length > 0 && selectedItems.length === boqItems.length;

  return (
    <div style={{ direction: 'rtl' }}>
      {errorMsg && (
        <div style={{ background: '#ffebee', color: '#c62828', padding: '12px 16px', borderRadius: '6px', marginBottom: '15px', border: '1px solid #ef9a9a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>⚠️</span> {errorMsg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: '#1F4E78', margin: 0 }}>جدول كميات حمام: {latrine.latrine_id}</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => onOpenRemarks?.(latrineId, null)} style={{ padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            الملاحظات العامة للحمام
          </button>
          <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer' }}>
            &larr; العودة للقائمة
          </button>
        </div>
      </div>

      {selectedItems.length > 0 && (
        <div style={{ background: '#dff9fb', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #c7ecee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>تم تحديد {selectedItems.length} بنود</strong>
          <button onClick={handleBulkComplete} style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            ✓ اعتماد الكل كمكتمل ومقبول (100%)
          </button>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'center' }}>
                <input type="checkbox" onChange={toggleSelectAll} checked={allSelected} aria-label="تحديد كل البنود" title="تحديد الكل" />
              </th>
              <th style={{ padding: '12px', textAlign: 'right' }}>البند</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>المخطط</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>إدخال سريع</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>المنفذ يدوياً</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الحالة</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>فحص الجودة</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {boqItems.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #eee', backgroundColor: selectedItems.includes(item.id) ? '#f1f8ff' : 'transparent' }}>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedItems.includes(item.id)} onChange={() => toggleSelect(item.id)} aria-label={`تحديد بند ${item.boq_code}`} />
                </td>
                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                  <strong>{item.boq_code}</strong><br/>
                  <small style={{ color: '#666' }}>{item.description_ar}</small>
                </td>
                <td style={{ padding: '12px', color: '#7f8c8d', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{item.planned_qty} {item.unit}</td>
                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <button onClick={() => handleQuickPercent(item, 0.25)} aria-label="25% من الكمية" style={{ padding: '4px 8px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontSize:'11px' }}>25%</button>
                    <button onClick={() => handleQuickPercent(item, 0.50)} aria-label="50% من الكمية" style={{ padding: '4px 8px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontSize:'11px' }}>50%</button>
                    <button onClick={() => handleQuickPercent(item, 0.75)} aria-label="75% من الكمية" style={{ padding: '4px 8px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontSize:'11px' }}>75%</button>
                    <button onClick={() => handleQuickPercent(item, 1.00)} aria-label="100% من الكمية مكتمل" style={{ padding: '4px 8px', background: '#3498db', color:'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize:'11px', fontWeight:'bold' }}>100%</button>
                  </div>
                </td>
                <td style={{ padding: '12px' }}>
                  <input type="number" step="0.01" defaultValue={item.achieved_qty} id={`qty-${item.id}`} style={{ width: '70px', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }} />
                </td>
                <td style={{ padding: '12px' }}>
                  <select id={`status-${item.id}`} defaultValue={item.status || 'not_started'} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}>
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
                      aria-label={`حفظ بند ${item.boq_code}`}
                      style={{ padding: '6px 10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: updatingId === item.id ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                    >
                      {updatingId === item.id ? '...' : 'حفظ'}
                    </button>
                    <button onClick={() => onOpenRemarks?.(latrineId, item.boq_code)} aria-label={`ملاحظة لبند ${item.boq_code}`} style={{ padding: '4px 8px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
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