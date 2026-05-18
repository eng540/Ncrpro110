import React, { useState, useEffect, useMemo } from 'react';
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

const boqDictionary = [
  { code: 'A1', name: 'حفر وتسوية + أساس حجر' }, { code: 'A2', name: 'جدران بلك مفرغ 15سم' },
  { code: 'A3', name: 'لياسة داخلية وخارجية' }, { code: 'A4', name: 'سقف خرسانة مسلحة' },
  { code: 'A5', name: 'كرسي عربي + كوع ريحة' }, { code: 'A6', name: 'بلاط موزايكو' },
  { code: 'B1', name: 'حفر بيارة قطر 1م' }, { code: 'B2', name: 'تمديد UPVC 4 انش + تهوية' },
  { code: 'B3', name: 'غطاء بيارة خرساني' }, { code: 'C1', name: 'باب حديد صاج' },
  { code: 'C2', name: 'نافذة ألمنيوم' }, { code: 'C3', name: 'إضاءة شمسية 10واط' }, { code: 'C4', name: 'لوحة معدنية + شعار' }
];

const BulkUpdate = ({ onOpenRemarks }) => {
  const [selectedBoqCode, setSelectedBoqCode] = useState('A1');
  const [selectedLatrines, setSelectedLatrines] = useState([]);
  const [bulkQty, setBulkQty] = useState('');
  const [bulkStatus, setBulkStatus] = useState('completed');
  const [bulkQuality, setBulkQuality] = useState('pass');
  const [isSaving, setIsSaving] = useState(false);
  const [savingRowId, setSavingRowId] = useState(null);

  const latrines = useLiveQuery(() => db.latrines.toArray(), []);
  const boqItems = useLiveQuery(() => db.boq_items.where('boq_code').equals(selectedBoqCode).toArray(), [selectedBoqCode]);

  useEffect(() => {
    setSelectedLatrines([]);
  }, [selectedBoqCode]);

  // ✅ التنفيذ: استخدام useMemo لمنع إعادة الحساب غير الضرورية ع كل ريندر
  const tableData = useMemo(() => {
    if (!latrines || !boqItems) return [];
    return latrines.map(latrine => {
      const item = boqItems.find(i => i.latrine_id === latrine.id);
      return { ...latrine, boqItem: item };
    }).filter(data => data.boqItem !== undefined);
  }, [latrines, boqItems]);

  const toggleSelectAll = (e) => {
    if (e.target.checked && tableData.length) setSelectedLatrines(tableData.map(d => d.id));
    else setSelectedLatrines([]);
  };

  const toggleSelect = (id) => {
    setSelectedLatrines(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // ✅ التنفيذ: إزالة useCallback الغير ضروري + لف العمليات بـ Transaction
  const handleSingleUpdate = async (item, latrineId) => {
    setSavingRowId(item.id);
    try {
      const qtyInput = document.getElementById(`bulk-qty-${item.id}`);
      const statusSelect = document.getElementById(`bulk-status-${item.id}`);
      const qualitySelect = document.getElementById(`bulk-quality-${item.id}`);
      
      const qty = parseFloat(qtyInput?.value);
      const status = statusSelect?.value;
      const quality = qualitySelect?.value;

      if (isNaN(qty) || qty < 0 || qty > item.planned_qty) {
        alert(`الكمية غير صالحة. الحد الأقصى: ${item.planned_qty}`);
        return;
      }

      await db.transaction('rw', db.boq_items, db.sync_queue, async () => {
        await db.boq_items.update(item.id, { achieved_qty: qty, status, quality_pass: quality });
        await pushToSyncQueue('UPDATE_BOQ', { 
          id: item.id, achieved_qty: qty, status, quality_pass: quality, latrine_id: latrineId 
        });
      });
      // تم إزالة alert المزعج هنا لتسريع العمل
    } catch (error) {
      console.error('Single update error:', error);
      alert('خطأ أثناء الحفظ المحلي.');
    } finally {
      setSavingRowId(null);
    }
  };

  const handleApplyBulkUpdate = async () => {
    if (selectedLatrines.length === 0) return alert('يرجى تحديد حمام واحد على الأقل.');
    if (bulkQty === '' || isNaN(parseFloat(bulkQty))) return alert('يرجى إدخال الكمية المنفذة.');

    if (!window.confirm(`تطبيق التحديث على ${selectedLatrines.length} حمامات؟`)) return;

    setIsSaving(true);
    try {
      const qty = parseFloat(bulkQty);
      const itemsToProcess = boqItems.filter(i => selectedLatrines.includes(i.latrine_id));

      await db.transaction('rw', db.boq_items, db.sync_queue, async () => {
        for (const item of itemsToProcess) {
          if (qty > item.planned_qty) {
            console.warn(`تخطي ${item.id}: الكمية تتجاوز المخطط`);
            continue;
          }

          const qtyInput = document.getElementById(`bulk-qty-${item.id}`);
          const statusSelect = document.getElementById(`bulk-status-${item.id}`);
          const qualitySelect = document.getElementById(`bulk-quality-${item.id}`);
          
          if (qtyInput) qtyInput.value = qty;
          if (statusSelect) statusSelect.value = bulkStatus;
          if (qualitySelect) {
            qualitySelect.value = bulkQuality;
            qualitySelect.style.backgroundColor = qualityColors[bulkQuality];
          }

          await db.boq_items.update(item.id, { achieved_qty: qty, status: bulkStatus, quality_pass: bulkQuality });
          await pushToSyncQueue('UPDATE_BOQ', { 
            id: item.id, achieved_qty: qty, status: bulkStatus, quality_pass: bulkQuality, latrine_id: item.latrine_id 
          });
        }
      });

      setSelectedLatrines([]);
      setBulkQty('');
    } catch (error) {
      console.error('Bulk update error:', error);
      alert('حدث خطأ أثناء التحديث الجماعي.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!latrines || !boqItems) return <div style={{ textAlign: 'center', padding: '40px' }}>جاري التحميل...</div>;

  const targetBoqInfo = boqDictionary.find(b => b.code === selectedBoqCode);
  const allSelected = tableData.length > 0 && selectedLatrines.length === tableData.length;

  return (
    <div style={{ direction: 'rtl' }}>
      <h2 style={{ color: '#1F4E78', marginBottom: '20px' }}>إدارة البند {selectedBoqCode} جماعياً</h2>

      <div style={{ background: '#e8f4f8', border: '1px solid #bdc3c7', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#2980b9' }}>وحدة التحكم الجماعية</h4>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>البند المستهدف:</label>
            <select value={selectedBoqCode} onChange={(e) => setSelectedBoqCode(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '250px' }}>
              {boqDictionary.map(b => <option key={b.code} value={b.code}>{b.code} - {b.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>الكمية المنفذة:</label>
            <input type="number" step="0.01" value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '100px' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>حالة البند:</label>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
              {itemStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>فحص الجودة:</label>
            <select value={bulkQuality} onChange={(e) => setBulkQuality(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: qualityColors[bulkQuality] }}>
              <option value="pending">قيد الفحص</option><option value="pass">مقبول</option><option value="fail">مرفوض</option>
            </select>
          </div>

          <button onClick={handleApplyBulkUpdate} disabled={isSaving || selectedLatrines.length === 0} style={{ padding: '10px 20px', background: selectedLatrines.length > 0 ? '#16a085' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: selectedLatrines.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
            {isSaving ? 'جاري التطبيق...' : `تطبيق على (${selectedLatrines.length})`}
          </button>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'center', width: '50px' }}>
                <input type="checkbox" onChange={toggleSelectAll} checked={allSelected} />
              </th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الحمام والمربع</th>
              <th style={{ padding: '12px', textAlign: 'center', color: '#f1c40f', whiteSpace: 'nowrap' }}>المخطط ({targetBoqInfo?.name})</th>
              <th style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>المنفذ حالياً</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>تعديل الكمية</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الحالة والجودة</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>إجراءات السطر</th>
            </tr>
          </thead>
          <tbody>
            {tableData.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center' }}>لا توجد بيانات. يرجى المزامنة.</td></tr>
            ) : (
              tableData.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #eee', backgroundColor: selectedLatrines.includes(row.id) ? '#f1f8ff' : 'transparent' }}>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedLatrines.includes(row.id)} onChange={() => toggleSelect(row.id)} />
                  </td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#1F4E78', whiteSpace: 'nowrap' }}>
                    {row.latrine_id} <br/><small style={{color:'#7f8c8d'}}>{row.block_no}</small>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {row.boqItem.planned_qty} {row.boqItem.unit}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#7f8c8d', whiteSpace: 'nowrap' }}>
                    {row.boqItem.achieved_qty} / {row.boqItem.planned_qty}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <input type="number" step="0.01" defaultValue={row.boqItem.achieved_qty} id={`bulk-qty-${row.boqItem.id}`} style={{ width: '70px', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }} />
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <select id={`bulk-status-${row.boqItem.id}`} defaultValue={row.boqItem.status || 'not_started'} style={{ padding: '4px', borderRadius: '4px', fontSize: '12px' }}>
                        {itemStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <select id={`bulk-quality-${row.boqItem.id}`} defaultValue={row.boqItem.quality_pass || 'pending'} style={{ padding: '4px', borderRadius: '4px', fontSize: '12px', backgroundColor: qualityColors[row.boqItem.quality_pass || 'pending'] }} onChange={(e) => e.target.style.backgroundColor = qualityColors[e.target.value]}>
                        <option value="pending">قيد الفحص</option><option value="pass">مقبول</option><option value="fail">مرفوض</option>
                      </select>
                    </div>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', flexDirection: 'column' }}>
                      <button 
                        onClick={() => handleSingleUpdate(row.boqItem, row.id)} disabled={savingRowId === row.boqItem.id}
                        style={{ padding: '4px 8px', background: savingRowId === row.boqItem.id ? '#95a5a6' : '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: savingRowId === row.boqItem.id ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '11px' }}
                      >
                        {savingRowId === row.boqItem.id ? '...' : 'حفظ السطر'}
                      </button>
                      <button onClick={() => onOpenRemarks?.(row.id, selectedBoqCode)} style={{ padding: '4px 8px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                        + ملاحظة
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BulkUpdate;